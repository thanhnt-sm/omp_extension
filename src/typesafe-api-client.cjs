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

const { preparePayload } = require('./typesafe-redact.cjs');

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

// Process-wide cool-down state (one MCP server process = one key). `until` is
// on the MONOTONIC clock; `status` is the retryable status to replay.
const defaultRateLimitState = { until: 0, status: 0 };

function monotonicNow() {
  return performance.now();
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

/**
 * Race a promise against a hard timeout that fires regardless of whether the
 * underlying implementation honors the AbortSignal (important for test
 * mocks that never resolve). The AbortController is still passed through so
 * a real fetch() can abort the in-flight request instead of leaking it.
 */
function withTimeout(promise, controller, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      const err = new Error('timeout');
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Parse a Retry-After header value into a delay in ms, or null if absent /
 * unparseable. Accepts delta-seconds ("120") or an HTTP-date (relative to the
 * injected WALL clock; a date in the past => 0). An all-digit value longer
 * than 9 digits is Infinity ("give up"), not null ("ignore"). Never throws.
 */
function parseRetryAfter(value, wallNowMs) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return v.length > 9 ? Infinity : parseInt(v, 10) * 1000;
  if (v.length <= 64 && /[A-Za-z]{3}/.test(v)) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return Math.max(0, t - wallNowMs);
  }
  return null;
}

/**
 * Delay before the next attempt, or null to stop retrying: the server's
 * Retry-After + a small jitter if given (null when Retry-After exceeds the cap
 * — we never retry earlier than asked), else exponential backoff with full
 * jitter.
 */
function nextRetryDelayMs(attemptsMade, retryAfterMs, randomImpl) {
  if (typeof retryAfterMs === 'number') {
    if (retryAfterMs > MAX_RETRY_AFTER_MS) return null; // also covers Infinity
    return retryAfterMs + Math.floor(randomImpl() * RETRY_AFTER_JITTER_MS);
  }
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attemptsMade - 1));
  return Math.floor(randomImpl() * ceiling);
}

/**
 * Run performRequest with bounded retry on 429/529. Throws only what a single
 * attempt throws (timeout/network) — those are never retried. Returns the
 * final outcome (a retryable http_error once attempts/budget run out, which
 * also arms the cool-down). While a cool-down is active it returns that
 * http_error immediately WITHOUT touching the network.
 * `debugLog` (optional) receives `typesafe: attempts=N last=STATUS` — numbers only.
 */
async function requestWithRetry(o) {
  const { fetchImpl, apiKey, body, timeoutMs, maxAttempts, totalBudgetMs, nowImpl, wallNowImpl, sleepImpl, randomImpl, rateLimitState } = o;
  const debug = (attempts, last) => {
    if (typeof o.debugLog !== 'function') return;
    try { o.debugLog(`typesafe: attempts=${attempts} last=${last}`); } catch (_) { /* diagnostics must never affect the call */ }
  };

  // L-B: a cool-down can never legitimately lie further ahead than cooldownMs.
  // If it does, the state was armed with a different clock (e.g. a Date.now()
  // caller sharing the module-level state) — treat it as expired and reset it
  // instead of failing closed forever.
  if (rateLimitState.until - nowImpl() > RATE_LIMIT_COOLDOWN_MS) {
    rateLimitState.until = 0;
    rateLimitState.status = 0;
  }
  if (rateLimitState.until > nowImpl()) {
    debug(0, rateLimitState.status);
    return { kind: 'http_error', status: rateLimitState.status };
  }

  const deadline = nowImpl() + totalBudgetMs;
  let outcome;
  let attempts = 0;
  let last = 0;
  try {
    for (;;) {
      const remaining = deadline - nowImpl();
      if (attempts > 0 && remaining < MIN_USEFUL_ATTEMPT_MS) break; // L3: a sleep may overshoot; never send with <1 s left
      // L-A: another concurrent call may have exhausted its retries (arming the shared cool-down)
      // while this one slept — stop and fail closed instead of piling more requests on.
      if (attempts > 0 && rateLimitState.until > nowImpl()) break;
      attempts++;
      last = 0;
      const controller = new AbortController(); // one per attempt: an aborted controller cannot be reused
      outcome = await withTimeout(
        performRequest(fetchImpl, apiKey, body, controller.signal, wallNowImpl),
        controller,
        Math.max(1, Math.min(timeoutMs, remaining)),
      );
      last = outcome.status === undefined ? 200 : outcome.status;
      if (outcome.kind !== 'http_error' || !RETRYABLE_STATUS.has(outcome.status) || attempts >= maxAttempts) break;
      const delay = nextRetryDelayMs(attempts, outcome.retryAfterMs, randomImpl);
      // Fail closed NOW (no pointless sleep) if the wait + a useful attempt cannot fit the budget.
      if (delay === null || nowImpl() + delay + MIN_USEFUL_ATTEMPT_MS > deadline) break;
      await sleepImpl(delay);
    }
  } finally {
    debug(attempts, last);
  }

  // Arm only if not already active: a call that stopped because of someone else's cool-down must not extend it.
  if (outcome.kind === 'http_error' && RETRYABLE_STATUS.has(outcome.status) && rateLimitState.until <= nowImpl()) {
    rateLimitState.until = nowImpl() + RATE_LIMIT_COOLDOWN_MS;
    rateLimitState.status = outcome.status;
  }
  return outcome;
}

/**
 * Fetch + read the response body as one timed unit, so a stalled body read
 * (headers arrive, bytes never do) is bounded by the same timeout as the
 * connection itself. Returns a tagged outcome instead of throwing for
 * expected HTTP/parse failures; only truly unexpected errors (network,
 * abort) propagate to the caller's try/catch.
 */
async function performRequest(fetchImpl, apiKey, body, signal, wallNowImpl) {
  const res = await fetchImpl(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body,
    signal,
  });
  if (res.status === 401 || res.status === 403) return { kind: 'auth', status: res.status };
  if (!res.ok) {
    if (!RETRYABLE_STATUS.has(res.status)) return { kind: 'http_error', status: res.status };
    // Retryable: read Retry-After defensively (mocks / odd responses may lack
    // headers) and release the unread body so the connection is not held.
    const header = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
    try {
      if (res.body && typeof res.body.cancel === 'function') await res.body.cancel();
    } catch (_) { /* best-effort cleanup only */ }
    return { kind: 'http_error', status: res.status, retryAfterMs: parseRetryAfter(header, wallNowImpl()) };
  }
  try {
    return { kind: 'ok', data: await res.json() };
  } catch (_) {
    return { kind: 'bad_response' };
  }
}

/**
 * Validate, redact+cap, POST to TypeSafe System One, and sanitize the
 * response. Never throws. `homeDir` is injected (not read from os.homedir())
 * so callers/tests control what gets redacted to `~`.
 */
async function judgeTypeSafe({
  fetchImpl, apiKey, args, homeDir, timeoutMs = 10000,
  // Retry knobs (all optional; defaults are real clock/timers). Injectable for tests.
  // nowImpl is MONOTONIC (budget, cool-down); wallNowImpl only converts an
  // HTTP-date Retry-After into a delay. debugLog gets numbers-only lines.
  maxAttempts = DEFAULT_MAX_ATTEMPTS, totalBudgetMs = DEFAULT_TOTAL_BUDGET_MS,
  nowImpl = monotonicNow, wallNowImpl = Date.now,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), randomImpl = Math.random,
  rateLimitState = defaultRateLimitState, debugLog,
}) {
  const validation = validateInput(args);
  if (!validation.ok) return { ok: false, code: validation.message, authError: false };

  // `model` must be part of the SAME object preparePayload sees, so its bytes
  // are accounted for by the cap pass rather than added after the fact.
  // `apiKey` is threaded through so a literal occurrence of the actual key
  // value anywhere in state/instructions/criteria is always redacted, even
  // if it doesn't match any known token pattern (H2).
  let payload;
  try {
    payload = preparePayload(
      { state: args.state, model: MODEL, questions: args.questions },
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
      fetchImpl, apiKey, body, timeoutMs, maxAttempts: attempts, totalBudgetMs: budget,
      nowImpl, wallNowImpl, sleepImpl, randomImpl, rateLimitState, debugLog,
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

module.exports = { validateInput, sanitizeAnswers, getChoiceOptions, judgeTypeSafe, parseRetryAfter, RETRY_POLICY };
