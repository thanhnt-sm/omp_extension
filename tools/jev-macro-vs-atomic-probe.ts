/**
 * tools/jev-macro-vs-atomic-probe.ts
 *
 * Empirical 3-Arm Measurement: Atomic Snippet (~1KB) vs Padded Macro State (~25KB)
 * Tests whether large monolithic state packaging degrades JEV probability and discrimination.
 */

import { prepareRequest } from "../src/typesafe-api-client.cjs";

const API_KEY = process.env.TYPESAFE_API_KEY;

if (!API_KEY) {
  console.log("[SKIP] TYPESAFE_API_KEY is not set.");
  process.exit(0);
}

const API_URL = "https://api.typesafe.ai/v1/systemone";

const TARGET_SNIPPET = `function isValidWireUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const u = new URL(rawUrl.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.protocol === 'http:' && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname)) return false;
    if (u.username || u.password) return false;
    return true;
  } catch {
    return false;
  }
}`;

const TRUE_CLAIM = "The isValidWireUrl function returns false (rejects) for remote non-loopback HTTP URL 'http://example.com/decisions'.";
const FALSE_CLAIM = "The isValidWireUrl function returns true (accepts) for remote non-loopback HTTP URL 'http://example.com/decisions'.";

// Generate realistic filler diff and artifacts to reach ~22KB
const FILLER_DIFF = Array.from({ length: 40 }, (_, i) => `
diff --git a/src/module_${i}.ts b/src/module_${i}.ts
--- a/src/module_${i}.ts
+++ b/src/module_${i}.ts
@@ -1,5 +1,10 @@
 export function processRecord_${i}(record: unknown) {
+  if (!record) return null;
+  const value_${i} = String(record).trim();
+  return { id: ${i}, value: value_${i}, processed: true };
 }
`).join("\n");

const FILLER_ARTIFACTS = Array.from({ length: 25 }, (_, i) => `
Artifact ${i}:
  - Target: doc_specification_${i}
  - Status: verified
  - Hash: ${"a".repeat(64)}
  - Metrics: throughput=${100 + i}req/s, latency=42ms
`).join("\n");

async function evaluateProbe(name: string, claim: string, stateObj: Record<string, unknown>) {
  const prepared = prepareRequest({
    model: "jev-latest",
    state: JSON.stringify(stateObj),
    questions: {
      assertion_holds: {
        type: "noul",
        instructions: `Based on state, does the following assertion hold true: "${claim}"?`,
      },
    },
  });

  if (!prepared.ok) {
    console.error(`[FAIL] prepareRequest failed for ${name}: ${prepared.code}`);
    return null;
  }

  const bytes = Buffer.byteLength(prepared.body, "utf8");
  const t0 = performance.now();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY.trim()}`,
    },
    body: prepared.body,
  });
  const t1 = performance.now();

  if (!response.ok) {
    console.error(`[FAIL] HTTP ${response.status} for ${name}`);
    return null;
  }

  const data = (await response.json()) as { answers?: { assertion_holds?: { noul?: number } } };
  const noul = data.answers?.assertion_holds?.noul ?? -1;
  const latencyMs = Math.round(t1 - t0);

  return { name, claim, noul, bytes, latencyMs };
}

async function runMacroVsAtomicExperiment() {
  console.log("==========================================================================");
  console.log(" Empirical Probe: Atomic (~1KB) vs Padded Macro State (~24KB)");
  console.log(" Testing live discrimination & latency degradation on JEV System One");
  console.log("==========================================================================\n");

  // Arm (a): Atomic Snippet (~1KB) - TRUE CLAIM
  const armA = await evaluateProbe("Arm (a): Atomic Snippet (~1KB) [True]", TRUE_CLAIM, {
    code_evidence: TARGET_SNIPPET,
    assertion_target: TRUE_CLAIM,
  });

  // Arm (a_false): Atomic Snippet (~1KB) - FALSE CONTROL
  const armA_false = await evaluateProbe("Arm (a_false): Atomic Snippet (~1KB) [False Control]", FALSE_CLAIM, {
    code_evidence: TARGET_SNIPPET,
    assertion_target: FALSE_CLAIM,
  });

  // Arm (b): Padded Macro State Shape (~24KB) - TRUE CLAIM
  const armB = await evaluateProbe("Arm (b): Padded Macro State (~24KB) [True]", TRUE_CLAIM, {
    todo_task: "Phase 1: Multi-Provider Wire Support",
    task_requirements: "Support typesafe, openrouter, and workers-ai dialects per ADR-13.",
    user_request: "plans/261103-unified-judge-jev-standardization/phase-01-multi-provider-wire-support.md --tdd --auto",
    diff_scope: "Task-bound authentic endpoint evidence and retained full-source manifest.",
    diff_summary: ["src/typesafe-api-client.cjs", "src/typesafe-enabled-resolver.cjs"],
    unified_diff: FILLER_DIFF,
    deliverable_artifacts: FILLER_ARTIFACTS,
    code_evidence: TARGET_SNIPPET,
  });

  // Arm (c): Padded Macro State Shape (~24KB) - FALSE CONTROL
  const armC = await evaluateProbe("Arm (c): Padded Macro State (~24KB) [False Control]", FALSE_CLAIM, {
    todo_task: "Phase 1: Multi-Provider Wire Support",
    task_requirements: "Support typesafe, openrouter, and workers-ai dialects per ADR-13.",
    user_request: "plans/261103-unified-judge-jev-standardization/phase-01-multi-provider-wire-support.md --tdd --auto",
    diff_scope: "Task-bound authentic endpoint evidence and retained full-source manifest.",
    diff_summary: ["src/typesafe-api-client.cjs", "src/typesafe-enabled-resolver.cjs"],
    unified_diff: FILLER_DIFF,
    deliverable_artifacts: FILLER_ARTIFACTS,
    code_evidence: TARGET_SNIPPET,
  });

  const results = [armA, armA_false, armB, armC].filter(Boolean);

  console.log("\n--- EXPERIMENTAL MEASUREMENT RESULTS ---");
  for (const r of results) {
    if (!r) continue;
    console.log(
      `${r.name.padEnd(52)} | Size: ${String(r.bytes).padStart(6)}B | Latency: ${String(r.latencyMs).padStart(4)}ms | JEV P(noul): ${r.noul.toFixed(2)}`
    );
  }
}

runMacroVsAtomicExperiment().catch(console.error);
