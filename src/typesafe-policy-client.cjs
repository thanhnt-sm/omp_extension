'use strict';
/**
 * typesafe-policy-client.cjs
 *
 * Enforced call-site wrapper for TypeSafe System One.
 *
 * Structural defense against Case 2 (prompt injection via state):
 * Applies a caller-defined tighten-only action lattice to ensure that
 * adversarial instructions in untrusted state payloads cannot trick
 * the judge into returning a de-escalating routing decision.
 */

const { judgeTypeSafe } = require('./typesafe-api-client.cjs');

/**
 * Evaluates whether a candidate choice conforms to a tighten-only action lattice.
 *
 * @param {string} baseline - Current escalation level
 * @param {string} choice - Proposed judge choice
 * @param {string[]} lattice - Ordered array from lowest escalation to highest
 * @returns {{ ok: boolean, reason?: string, attempted?: string, baseline?: string }}
 */
function checkPolicy(baseline, choice, lattice) {
  if (!Array.isArray(lattice) || typeof baseline !== 'string' || typeof choice !== 'string') {
    return { ok: false, reason: 'unknown-choice', attempted: choice, baseline };
  }
  const baselineIdx = lattice.indexOf(baseline);
  const choiceIdx = lattice.indexOf(choice);

  if (baselineIdx === -1 || choiceIdx === -1) {
    return {
      ok: false,
      reason: 'unknown-choice',
      attempted: choice,
      baseline,
    };
  }

  if (choiceIdx < baselineIdx) {
    return {
      ok: false,
      reason: 'lattice-violation',
      attempted: choice,
      baseline,
    };
  }

  return { ok: true, choice };
}

/**
 * Enforces action lattice at the call site for untrusted state payloads.
 *
 * @param {Object} params
 * @param {string|Object} params.state - State payload (untrusted text)
 * @param {Object} params.questions - TypeSafe questions definition
 * @param {Object} params.policy - { baseline: string, lattice: string[], questionKey?: string }
 * @param {Function} [params.judgeFn] - Optional injected judge implementation for testing
 * @param {Function} [params.fetchImpl] - Fetch implementation
 * @param {string} [params.apiKey] - TypeSafe API key
 * @param {string} [params.homeDir] - Home directory
 * @param {number} [params.timeoutMs] - Timeout in milliseconds
 * @returns {Promise<Object>}
 */
async function judgeWithPolicy({
  state,
  questions,
  policy,
  judgeFn,
  fetchImpl = globalThis.fetch,
  apiKey = process.env.TYPESAFE_API_KEY,
  homeDir,
  timeoutMs = 10000,
}) {
  if (!policy || !policy.lattice || !policy.baseline) {
    return { ok: false, reason: 'missing-policy' };
  }

  let result;
  if (typeof judgeFn === 'function') {
    result = await judgeFn({ state, questions });
    if (result && result.ok === undefined) {
      result = { ok: true, ...result };
    }
  } else {
    result = await judgeTypeSafe({
      fetchImpl,
      apiKey,
      args: { state, questions },
      homeDir,
      timeoutMs,
    });
  }

  if (!result || !result.ok) {
    return result || { ok: false, reason: 'judge-failed' };
  }

  const qKey = (policy && policy.questionKey) || 'role';
  let choice = null;
  if (result.choice) {
    choice = result.choice;
  } else if (result.answers && result.answers[qKey] && result.answers[qKey].choice) {
    choice = result.answers[qKey].choice;
  } else if (result.answers) {
    for (const k of Object.keys(result.answers)) {
      if (result.answers[k] && result.answers[k].choice) {
        choice = result.answers[k].choice;
        break;
      }
    }
  }

  if (!choice) {
    return { ok: false, reason: 'unknown-choice' };
  }

  const compliance = checkPolicy(policy.baseline, choice, policy.lattice);
  if (!compliance.ok) {
    return compliance;
  }

  return {
    ok: true,
    choice,
    result,
  };
}

module.exports = {
  checkPolicy,
  judgeWithPolicy,
};
