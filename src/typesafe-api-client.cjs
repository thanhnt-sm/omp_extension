'use strict';
/**
 * typesafe-api-client.cjs
 * Validates typesafe_judge tool-call arguments, redacts/caps them, calls the
 * TypeSafe System One API, and sanitizes the response down to only the
 * parsed numeric/enum fields the caller is allowed to see. Zero deps.
 *
 * Every failure path returns `{ ok: false, code, authError }` instead of
 * throwing — `code` is always a short string (never a response body, error
 * message, or the API key) so the MCP server can build an isError tool
 * result directly from it.
 */

const crypto = require('node:crypto');
let preparePayload;
function loadPreparePayload() {
  if (preparePayload) return preparePayload;
  const loaded = require('./typesafe-redact.cjs');
  if (!loaded || typeof loaded.preparePayload !== 'function') throw new Error('redact_unavailable');
  preparePayload = loaded.preparePayload;
  return preparePayload;
}

const VALID_TYPES = new Set(['noul', 'choice', 'score']);
const API_URL = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
const MAX_BODY_BYTES = 32768;

// ---- Retry policy (HTTP 429 / 529 only) -----------------------------------
// Source: docs.typesafe.ai/api.md (fetched 2026-10-07): "When you receive a
// 429 Too Many Requests or 529 Overloaded response, retry the request with
// exponential backoff instead of retrying immediately." The page does NOT
// document a Retry-After header, so honoring it below is purely defensive.
//
// Deliberate scope: ONLY 429 and 529 are retried. Network errors
// (ECONNRESET/ETIMEDOUT/...) and our own per-attempt timeout are NOT: the
// POST may already have been processed upstream, a timed-out attempt has
// already burned its whole window, and the call must stay fail-closed and
// fast. Other 4xx, 401/403 (auth kill-switch) and other 5xx are never retried.
//
// The MCP server's 10 s is a PER-ATTEMPT timeout; the kit configures no MCP
// tool-call timeout, so the whole judgment (attempts + sleeps) is bounded by
// a TOTAL budget (monotonic clock; the wall clock is only used to turn an
// HTTP-date Retry-After into a delay). Attempts or budget exhausted => the
// same fail-closed `http_429` / `http_529` result as before, AND a cool-down:
// for COOLDOWN_MS afterwards the same fail-closed result is returned
// immediately with no network call, so a rate-limited key is not hammered by
// every subsequent tool call.
// (Kept inline, not a sibling module: omp-install.cjs and the OMP parity
// tests deploy/load this file on its own. omp/typesafe-planner.ts carries its
// own copy of this policy; RETRY_POLICY below is what the parity test pins.)
const RETRYABLE_STATUS = new Set([429, 529]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_TOTAL_BUDGET_MS = 15000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 4000;
const MAX_RETRY_AFTER_MS = 5000; // longer Retry-After => give up (never retry earlier than asked)
const RETRY_AFTER_JITTER_MS = 250; // added ON TOP of Retry-After so clients don't re-synchronize
const MIN_USEFUL_ATTEMPT_MS = 1000; // never start an attempt with less budget than this
const RATE_LIMIT_COOLDOWN_MS = 45000;

const RETRY_POLICY = Object.freeze({
  retryableStatus: [...RETRYABLE_STATUS],
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
  totalBudgetMs: DEFAULT_TOTAL_BUDGET_MS,
  backoffBaseMs: BACKOFF_BASE_MS,
  backoffCapMs: BACKOFF_CAP_MS,
  maxRetryAfterMs: MAX_RETRY_AFTER_MS,
  retryAfterJitterMs: RETRY_AFTER_JITTER_MS,
  minUsefulAttemptMs: MIN_USEFUL_ATTEMPT_MS,
  cooldownMs: RATE_LIMIT_COOLDOWN_MS,
});

// State is keyed by a full SHA-256 digest, never a raw credential. A request
// captures the active generation; asynchronous completion may update state only
// if that exact credential generation remains active.
const defaultRateLimitState = {};

function monotonicNow() {
  return performance.now();
}

function hashCredential(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey)).digest('hex');
}

function credentialStore(state) {
  const store = state && typeof state === 'object' ? state : defaultRateLimitState;
  if (!(store.entries instanceof Map)) store.entries = new Map();
  if (!Number.isSafeInteger(store.generation)) store.generation = 0;
  if (typeof store.activeHash !== 'string') store.activeHash = '';
  return store;
}

function observeCredential(apiKey, state) {
  const store = credentialStore(state);
  const hash = hashCredential(apiKey);
  if (store.activeHash !== hash) {
    store.activeHash = hash;
    store.generation += 1;
  }
  const token = { hash, generation: store.generation };
  let entry = store.entries.get(hash);
  if (!entry || entry.generation !== token.generation) {
    entry = { generation: token.generation, until: 0, status: 0, authFailed: false, alerted: false };
    store.entries.set(hash, entry);
  }
  return { store, token, entry };
}

function isCurrentCredential(store, token) {
  return store.activeHash === token.hash && store.generation === token.generation;
}

function resetRateLimitState(state = defaultRateLimitState) {
  const store = credentialStore(state);
  store.entries.clear();
  store.activeHash = '';
  store.generation = 0;
}

function checkCredentialCooldown(apiKey, options = {}) {
  const now = typeof options.nowImpl === 'function' ? options.nowImpl : monotonicNow;
  const { entry } = observeCredential(apiKey, options.rateLimitState);
  if (entry.authFailed) return { status: entry.status || 401, authFailed: true };
  return entry.until > now() ? { status: entry.status, cooldown: true, until: entry.until } : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isUnitInterval(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
}

/** Allowed `choice` options: dict keys only. */
function getChoiceOptions(criteria) {
  return isPlainObject(criteria) ? Object.keys(criteria) : [];
}

/**
 * Validate raw tool-call arguments against the canonical request shape
 * (skills/shared/typesafe-integration.md section 3). Returns `{ ok: true }`
 * or `{ ok: false, message }` with a short, specific reason.
 */
function validateInput(args) {
  if (!isPlainObject(args)) return { ok: false, message: 'invalid_input: arguments must be an object' };
  const { state, questions } = args;
  if (!(isNonEmptyString(state) || isPlainObject(state))) {
    return { ok: false, message: 'invalid_input: state is required' };
  }
  if (!isPlainObject(questions) || Object.keys(questions).length === 0) {
    return { ok: false, message: 'invalid_input: questions must be a non-empty object' };
  }
  for (const key of Object.keys(questions)) {
    const q = questions[key];
    if (!isPlainObject(q)) return { ok: false, message: `invalid_input: questions.${key} must be an object` };
    if (!VALID_TYPES.has(q.type)) {
      return { ok: false, message: `invalid_input: questions.${key}.type must be noul|choice|score` };
    }
    if (!(isNonEmptyString(q.instructions) || isPlainObject(q.instructions))) {
      return { ok: false, message: `invalid_input: questions.${key}.instructions is required` };
    }
    if (q.type === 'choice') {
      if (!isPlainObject(q.criteria)) {
        return {
          ok: false,
          message: `invalid_input: questions.${key}.criteria must be a dict {option: description|null} for choice`,
        };
      }
      if (getChoiceOptions(q.criteria).length < 2) {
        return { ok: false, message: `invalid_input: questions.${key}.criteria needs >=2 options for choice` };
      }
    }
    if (q.type === 'score' && (!Array.isArray(q.criteria) || q.criteria.length < 2)) {
      return {
        ok: false,
        message: `invalid_input: questions.${key}.criteria must be an ordered array of >=2 level descriptions for score`,
      };
    }
    // Egress guard (review custom.9 #1): the redaction pass only scans STRING
    // values, so a nested object/array inside a score level or a noul
    // criteria value would travel to the API unredacted. The API accepts
    // structured criteria, but the kit deliberately restricts them to
    // strings so every byte that leaves the machine went through redact.
    if (q.type === 'score' && !q.criteria.every(isNonEmptyString)) {
      return { ok: false, message: `invalid_input: questions.${key}.criteria levels must be non-empty strings for score` };
    }
    if (q.type === 'noul' && q.criteria !== undefined) {
      const c = q.criteria;
      const stringOrAbsent = (v) => v === undefined || isNonEmptyString(v);
      if (!isPlainObject(c) || !stringOrAbsent(c.true) || !stringOrAbsent(c.false)) {
        return { ok: false, message: `invalid_input: questions.${key}.criteria must be {"true": desc, "false": desc} strings for noul` };
      }
    }
  }
  return { ok: true };
}

/**
 * Parse+validate the upstream `answers` object down to only the numeric/enum
 * fields per question type. Returns `null` (whole call treated as errored)
 * if ANY key is missing, malformed, out of range, or (for choice) not one of
 * the options actually sent — never partial results.
 */
function sanitizeAnswers(questions, rawAnswers) {
  if (!isPlainObject(rawAnswers)) return null;
  const answers = {};
  for (const key of Object.keys(questions)) {
    const q = questions[key];
    const raw = rawAnswers[key];
    if (!isPlainObject(raw)) return null;

    if (q.type === 'noul') {
      if (!isUnitInterval(raw.noul)) return null;
      answers[key] = { noul: raw.noul };
    } else if (q.type === 'choice') {
      const options = getChoiceOptions(q.criteria);
      if (typeof raw.choice !== 'string' || !options.includes(raw.choice)) return null;
      if (!isUnitInterval(raw.confidence)) return null;
      answers[key] = { choice: raw.choice, confidence: raw.confidence };
    } else if (q.type === 'score') {
      // score = probability-weighted expected position (float) in [0, N-1]
      // (docs.typesafe.ai/api.md, verified jev-1.13.0 2026-09-28); round
      // only where a discrete level is needed (skills/shared/typesafe-integration.md §5).
      if (!Array.isArray(q.criteria)) return null;
      if (typeof raw.score !== 'number' || !Number.isFinite(raw.score)) return null;
      if (raw.score < 0 || raw.score > q.criteria.length - 1) return null;
      if (!isUnitInterval(raw.confidence)) return null;
      answers[key] = { score: raw.score, confidence: raw.confidence };
    } else {
      return null; // unreachable: validateInput already restricted q.type
    }
  }
  return answers;
}

function abortError(name = 'AbortError') {
  const err = new Error(name === 'TimeoutError' ? 'timeout' : 'aborted');
  err.name = name;
  return err;
}

function withTimeout(promise, controller, timeoutMs, options = {}) {
  const setTimer = options.setTimeoutImpl || setTimeout;
  const clearTimer = options.clearTimeoutImpl || clearTimeout;
  const signal = options.signal;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      fn(value);
    };
    const onAbort = () => {
      controller.abort();
      finish(reject, abortError());
    };
    const timer = setTimer(() => {
      controller.abort();
      finish(reject, abortError('TimeoutError'));
    }, Math.max(1, timeoutMs));
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
    promise.then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

function defaultSleep(ms, signal, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeoutImpl(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      fn(value);
    };
    const onAbort = () => finish(reject, abortError());
    const timer = setTimeoutImpl(() => finish(resolve), Math.max(0, ms));
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

async function cancelBodyBounded(response, options = {}) {
  const body = response && response.body;
  if (!body || typeof body.cancel !== 'function') return;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs) : 250;
  const setTimer = options.setTimeoutImpl || setTimeout;
  const clearTimer = options.clearTimeoutImpl || clearTimeout;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        clearTimer(timer);
        resolve();
      }
    };
    const timer = setTimer(finish, timeoutMs);
    Promise.resolve().then(() => body.cancel()).then(finish, finish);
  });
}

/**
 * Parse a Retry-After header value into a delay in ms, or null if absent /
 * unparseable. An oversized delta is Infinity: it is not a retry delay.
 */
function parseRetryAfter(value, wallNowMs) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return v.length > 9 ? Infinity : parseInt(v, 10) * 1000;
  if (v.length <= 64 && /[A-Za-z]{3}/.test(v)) {
    const time = Date.parse(v);
    const now = Number.isFinite(wallNowMs) ? wallNowMs : Date.now();
    if (Number.isFinite(time)) return Math.max(0, time - now);
  }
  return null;
}

function nextRetryDelayMs(attemptsMade, retryAfterMs, randomImpl) {
  if (typeof retryAfterMs === 'number') {
    if (!Number.isFinite(retryAfterMs) || retryAfterMs > MAX_RETRY_AFTER_MS) return null;
    return retryAfterMs + Math.floor(randomImpl() * RETRY_AFTER_JITTER_MS);
  }
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attemptsMade - 1));
  return Math.floor(randomImpl() * ceiling);
}

async function requestWithRetry(options) {
  const o = options || {};
  const fetchImpl = o.fetchImpl || globalThis.fetch;
  const apiKey = o.apiKey;
  const body = o.body;
  const timeoutMs = Number.isFinite(o.timeoutMs) && o.timeoutMs > 0 ? o.timeoutMs : 10000;
  const maxAttempts = Number.isInteger(o.maxAttempts) && o.maxAttempts > 0 ? o.maxAttempts : DEFAULT_MAX_ATTEMPTS;
  const totalBudgetMs = Number.isFinite(o.totalBudgetMs) && o.totalBudgetMs > 0 ? o.totalBudgetMs : DEFAULT_TOTAL_BUDGET_MS;
  const now = typeof o.nowImpl === 'function' ? o.nowImpl : monotonicNow;
  const wallNow = typeof o.wallNowImpl === 'function' ? o.wallNowImpl : Date.now;
  const sleep = typeof o.sleepImpl === 'function' ? o.sleepImpl : defaultSleep;
  const random = typeof o.randomImpl === 'function' ? o.randomImpl : Math.random;
  const setTimer = o.setTimeoutImpl || setTimeout;
  const clearTimer = o.clearTimeoutImpl || clearTimeout;
  const { store, token, entry } = observeCredential(apiKey, o.rateLimitState);
  const debug = (attempts, last) => {
    if (typeof o.debugLog !== 'function') return;
    try { o.debugLog(`typesafe: attempts=${attempts} last=${last}`); } catch (_) {}
  };
  if (o.signal && o.signal.aborted) throw abortError();
  if (entry.authFailed) {
    debug(0, entry.status || 401);
    return { kind: 'auth', status: entry.status || 401, authFailed: true };
  }
  if (entry.until > now()) {
    debug(0, entry.status);
    return { kind: 'http_error', status: entry.status, cooldown: true };
  }

  const deadline = now() + totalBudgetMs;
  let outcome = { kind: 'http_error', status: 529 };
  let attempts = 0;
  let last = 0;
  try {
    while (attempts < maxAttempts) {
      const remaining = deadline - now();
      if (remaining < MIN_USEFUL_ATTEMPT_MS) throw abortError('TimeoutError');
      if (o.signal && o.signal.aborted) throw abortError();
      const current = checkCredentialCooldown(apiKey, { rateLimitState: store, nowImpl: now });
      if (attempts > 0 && current) {
        outcome = { kind: 'http_error', status: current.status, cooldown: true };
        break;
      }
      attempts += 1;
      const controller = new AbortController();
      outcome = await withTimeout(
        performRequest(fetchImpl, apiKey, body, controller.signal, wallNow, {
          timeoutMs: Math.min(250, Math.max(0, remaining)),
          setTimeoutImpl: setTimer,
          clearTimeoutImpl: clearTimer,
        }),
        controller,
        Math.min(timeoutMs, remaining),
        { signal: o.signal, setTimeoutImpl: setTimer, clearTimeoutImpl: clearTimer },
      );
      last = outcome.status === undefined ? 200 : outcome.status;
      if (outcome.kind !== 'http_error' || !RETRYABLE_STATUS.has(outcome.status)) break;
      const delay = nextRetryDelayMs(attempts, outcome.retryAfterMs, random);
      if (delay === null || now() + delay + MIN_USEFUL_ATTEMPT_MS > deadline) break;
      const sleepController = new AbortController();
      await withTimeout(
        Promise.resolve(sleep(delay, sleepController.signal)),
        sleepController,
        Math.max(1, deadline - now()),
        { signal: o.signal, setTimeoutImpl: setTimer, clearTimeoutImpl: clearTimer },
      );
    }
  } finally {
    debug(attempts, last);
  }

  if (isCurrentCredential(store, token) && outcome.kind === 'auth') {
    entry.authFailed = true;
    entry.status = outcome.status;
  }
  if (outcome.kind === 'http_error' && RETRYABLE_STATUS.has(outcome.status) && isCurrentCredential(store, token)) {
    const receivedAt = now();
    const retryAfterMs = outcome.retryAfterMs;
    const serverUntil = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? receivedAt + retryAfterMs : 0;
    const cooldownUntil = Math.max(receivedAt + RATE_LIMIT_COOLDOWN_MS, serverUntil);
    if (cooldownUntil > entry.until) {
      entry.until = cooldownUntil;
      entry.status = outcome.status;
    }
  }
  return outcome;
}

async function performRequest(fetchImpl, apiKey, body, signal, wallNowImpl, cleanupOptions) {
  let response;
  const cancelOnAbort = () => {
    void cancelBodyBounded(response, cleanupOptions);
  };
  signal.addEventListener('abort', cancelOnAbort, { once: true });
  try {
    response = await fetchImpl(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body,
      signal,
    });
    if (signal.aborted) {
      await cancelBodyBounded(response, cleanupOptions);
      throw abortError();
    }
    if (response.status === 401 || response.status === 403) {
      await cancelBodyBounded(response, cleanupOptions);
      return { kind: 'auth', status: response.status };
    }
    if (!response.ok) {
      const header = response.headers && typeof response.headers.get === 'function' ? response.headers.get('retry-after') : null;
      const retryAfterMs = parseRetryAfter(header, wallNowImpl());
      await cancelBodyBounded(response, cleanupOptions);
      return { kind: 'http_error', status: response.status, retryAfterMs };
    }
    try {
      return { kind: 'ok', data: await response.json() };
    } catch (_) {
      await cancelBodyBounded(response, cleanupOptions);
      return { kind: 'bad_response' };
    }
  } finally {
    signal.removeEventListener('abort', cancelOnAbort);
  }
}

/**
 * Validate, redact+cap, POST to TypeSafe System One, and sanitize the
 * response. Never throws. `homeDir` is injected (not read from os.homedir())
 * so callers/tests control what gets redacted to `~`.
 */
async function judgeTypeSafe({
  fetchImpl, apiKey, args, homeDir, timeoutMs = 10000,
  maxAttempts = DEFAULT_MAX_ATTEMPTS, totalBudgetMs = DEFAULT_TOTAL_BUDGET_MS,
  nowImpl = monotonicNow, wallNowImpl = Date.now,
  sleepImpl, randomImpl = Math.random, rateLimitState, debugLog, signal,
  setTimeoutImpl, clearTimeoutImpl,
}) {
  const validation = validateInput(args);
  if (!validation.ok) return { ok: false, code: validation.message, authError: false };
  const cooldown = checkCredentialCooldown(apiKey, { rateLimitState, nowImpl });
  if (cooldown) return { ok: false, code: `http_${cooldown.status}`, authError: cooldown.authFailed === true };

  // `model` must be part of the SAME object preparePayload sees, so its bytes
  // are accounted for by the cap pass rather than added after the fact.
  // `apiKey` is threaded through so a literal occurrence of the actual key
  // value anywhere in state/instructions/criteria is always redacted, even
  // if it doesn't match any known token pattern (H2).
  let payload;
  try {
    payload = loadPreparePayload()(
      {
        state: args.state,
        model: isNonEmptyString(args.model) ? args.model.trim() : MODEL,
        questions: args.questions,
      },
      { maxBytes: MAX_BODY_BYTES, homeDirs: homeDir ? [homeDir] : undefined, apiKey },
    );
  } catch (err) {
    // preparePayload throws only for the round-trip-key-secret rejection
    // (question name / choice option identifier contains a detected
    // secret) — surfaced verbatim, never as a request (no fetch below).
    const code = err && err.message === 'payload rejected: secret in key' ? err.message : 'redact_failed';
    return { ok: false, code, authError: false };
  }
  const body = JSON.stringify(payload);

  // Hard final check: preparePayload caps state/instructions/criteria
  // STRING VALUES (dict values for noul/choice, array items for score), but
  // never option IDENTIFIERS — dict keys — since those are matched against
  // the response and must survive byte-for-byte. A criteria set dominated
  // by large identifiers (not values) can still push the assembled body
  // over budget. Reject rather than send an oversized/uncapped body.
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, code: 'payload too large', authError: false };
  }

  if (typeof fetchImpl !== 'function') {
    return { ok: false, code: 'no_fetch', authError: false };
  }

  const attempts = Number.isInteger(maxAttempts) && maxAttempts >= 1 ? maxAttempts : DEFAULT_MAX_ATTEMPTS;
  const budget = Number.isFinite(totalBudgetMs) && totalBudgetMs > 0 ? totalBudgetMs : DEFAULT_TOTAL_BUDGET_MS;
  let outcome;
  try {
    outcome = await requestWithRetry({
      fetchImpl, apiKey, body, signal, timeoutMs, maxAttempts: attempts, totalBudgetMs: budget,
      nowImpl, wallNowImpl, sleepImpl, randomImpl, rateLimitState, debugLog,
      setTimeoutImpl, clearTimeoutImpl,
    });
  } catch (err) {
    const isAbort = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
    return { ok: false, code: isAbort ? 'timeout' : 'network_error', authError: false };
  }

  if (outcome.kind === 'auth') return { ok: false, code: `http_${outcome.status}`, authError: true };
  if (outcome.kind === 'http_error') return { ok: false, code: `http_${outcome.status}`, authError: false };
  if (outcome.kind === 'bad_response') return { ok: false, code: 'bad_response', authError: false };

  // Validate `choice` against the options actually SENT — dict keys are
  // never redacted, so this always matches the raw input's option set.
  const answers = sanitizeAnswers(payload.questions, outcome.data && outcome.data.answers);
  if (!answers) return { ok: false, code: 'bad_response', authError: false };

  return { ok: true, answers };
}

module.exports = {
  validateInput,
  sanitizeAnswers,
  getChoiceOptions,
  judgeTypeSafe,
  requestWithRetry,
  checkCredentialCooldown,
  cancelBodyBounded,
  resetRateLimitState,
  parseRetryAfter,
  RETRY_POLICY,
};
