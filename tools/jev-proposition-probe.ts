/**
 * tools/jev-proposition-probe.ts
 *
 * Live empirical probe measuring TypeSafe JEV discrimination on atomic propositions
 * with paired negative controls (True vs False with identical code evidence in state).
 */

import { prepareRequest } from "../src/typesafe-api-client.cjs";

const API_KEY = process.env.TYPESAFE_API_KEY;

if (!API_KEY) {
  console.log("[SKIP] TYPESAFE_API_KEY is not set in environment.");
  process.exit(0);
}

const API_URL = "https://api.typesafe.ai/v1/systemone";

interface PropositionTestCase {
  id: string;
  claim: string;
  truth: boolean;
  codeSnippet: string;
}

const TEST_CASES: PropositionTestCase[] = [
  // Pair 1: Remote HTTP URL rejection in resolver
  {
    id: "url_safety_true",
    claim: "The isValidWireUrl function returns false (rejects) for remote non-loopback HTTP URL 'http://example.com/decisions'.",
    truth: true,
    codeSnippet: `function isValidWireUrl(rawUrl) {
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
}`,
  },
  {
    id: "url_safety_false_control",
    claim: "The isValidWireUrl function returns true (accepts) for remote non-loopback HTTP URL 'http://example.com/decisions'.",
    truth: false,
    codeSnippet: `function isValidWireUrl(rawUrl) {
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
}`,
  },

  // Pair 2: Authorization header override prevention
  {
    id: "header_integrity_true",
    claim: "In buildSystemOneWirePayload, Authorization is assigned after spreading extraHeaders, so extraHeaders cannot overwrite Authorization.",
    truth: true,
    codeSnippet: `  const headers = {
    ...(isPlainObject(extraHeaders) ? extraHeaders : {}),
    'Content-Type': 'application/json',
    ...(isNonEmptyString(apiKey) ? { Authorization: \`Bearer \${apiKey.trim()}\` } : {}),
  };`,
  },
  {
    id: "header_integrity_false_control",
    claim: "In buildSystemOneWirePayload, extraHeaders is spread after Authorization, allowing extraHeaders to overwrite Authorization.",
    truth: false,
    codeSnippet: `  const headers = {
    ...(isPlainObject(extraHeaders) ? extraHeaders : {}),
    'Content-Type': 'application/json',
    ...(isNonEmptyString(apiKey) ? { Authorization: \`Bearer \${apiKey.trim()}\` } : {}),
  };`,
  },

  // Pair 3: Task classification for read and analyze
  {
    id: "task_classifier_true",
    claim: "trustedNativeTaskKind classifies goal 'Đọc và phân tích yêu cầu Phase 01 từ file kế hoạch' as 'research'.",
    truth: true,
    codeSnippet: `  if (/^(?:read|read and analy[sz]e|map|research|investigate|analy[sz]e|trace|reproduce|diagnose|document|write (?:a )?(?:report|analysis))\\b/i.test(goal)
    || /^(?:đọc|đọc và phân tích|xác định|nghiên cứu|tìm kiếm|điều tra|phân tích|chẩn đoán|tái hiện|viết báo cáo|tài liệu hóa)\\b/i.test(goal)) return "research";`,
  },
  {
    id: "task_classifier_false_control",
    claim: "trustedNativeTaskKind classifies goal 'Đọc và phân tích yêu cầu Phase 01 từ file kế hoạch' as 'implementation'.",
    truth: false,
    codeSnippet: `  if (/^(?:read|read and analy[sz]e|map|research|investigate|analy[sz]e|trace|reproduce|diagnose|document|write (?:a )?(?:report|analysis))\\b/i.test(goal)
    || /^(?:đọc|đọc và phân tích|xác định|nghiên cứu|tìm kiếm|điều tra|phân tích|chẩn đoán|tái hiện|viết báo cáo|tài liệu hóa)\\b/i.test(goal)) return "research";`,
  },

  // Pair 4: Adversarial implementation verb guard
  {
    id: "adversarial_guard_true",
    claim: "trustedNativeTaskKind classifies 'Đọc và sửa lỗi mã nguồn' as 'implementation' because it contains a code modification verb.",
    truth: true,
    codeSnippet: `  const hasCodeMutationVerb = /\\b(?:fix|repair|refactor|patch|sửa|sửa lỗi|khắc phục|cập nhật)\\b/i.test(goal)
    || (/\\btriển khai\\b/i.test(goal) && !/\\btriển khai giao dịch\\b/i.test(goal));
  if (hasCodeMutationVerb) return "implementation";`,
  },
  {
    id: "adversarial_guard_false_control",
    claim: "trustedNativeTaskKind classifies 'Đọc và sửa lỗi mã nguồn' as 'research' because it begins with 'Đọc'.",
    truth: false,
    codeSnippet: `  const hasCodeMutationVerb = /\\b(?:fix|repair|refactor|patch|sửa|sửa lỗi|khắc phục|cập nhật)\\b/i.test(goal)
    || (/\\btriển khai\\b/i.test(goal) && !/\\btriển khai giao dịch\\b/i.test(goal));
  if (hasCodeMutationVerb) return "implementation";`,
  },
  // Pair 5: Subtle protocol distinction in loopback
  {
    id: "subtle_protocol_true",
    claim: "In isValidWireUrl, loopback hostname localhost is permitted when protocol is http.",
    truth: true,
    codeSnippet: `function isValidWireUrl(rawUrl) {
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
}`,
  },
  {
    id: "subtle_protocol_false_control",
    claim: "In isValidWireUrl, loopback hostname localhost is permitted when protocol is ftp.",
    truth: false,
    codeSnippet: `function isValidWireUrl(rawUrl) {
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
}`,
  },

  // Pair 6: Subtle hostname allowlist distinction
  {
    id: "subtle_hostname_true",
    claim: "In isValidWireUrl, loopback hostnames for http are strictly restricted to localhost, 127.0.0.1, ::1, and [::1].",
    truth: true,
    codeSnippet: `    if (u.protocol === 'http:' && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname)) return false;`,
  },
  {
    id: "subtle_hostname_false_control",
    claim: "In isValidWireUrl, any domain ending in .local is permitted when using http.",
    truth: false,
    codeSnippet: `    if (u.protocol === 'http:' && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname)) return false;`,
  },

];
async function runProbe() {
  console.log("==========================================================================");
  console.log(" Live Empirical TypeSafe JEV Proposition & Negative Control Probe");
  console.log(" Endpoint: " + API_URL + " | Model: jev-latest");
  console.log("==========================================================================\n");

  const results: Array<{
    id: string;
    expectedTruth: boolean;
    noul: number;
    latencyMs: number;
    bytes: number;
    passedDiscrimination: boolean;
  }> = [];

  for (const testCase of TEST_CASES) {
    const rawState = {
      code_evidence: testCase.codeSnippet,
      assertion_target: testCase.claim,
    };

    const questions = {
      assertion_holds: {
        type: "noul",
        instructions: `Based strictly on the code_evidence snippet, does the following assertion hold true: "${testCase.claim}"?`,
      },
    };

    const prepared = prepareRequest({
      model: "jev-latest",
      state: JSON.stringify(rawState),
      questions,
    });

    if (!prepared.ok) {
      console.error(`[FAIL] prepareRequest failed for ${testCase.id}: ${prepared.code}`);
      continue;
    }

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
      console.error(`[FAIL] HTTP error ${response.status} for ${testCase.id}`);
      continue;
    }

    const data = (await response.json()) as {
      answers?: { assertion_holds?: { noul?: number } };
      model?: string;
    };

    const noul = data.answers?.assertion_holds?.noul ?? -1;
    const latencyMs = Math.round(t1 - t0);
    const bytes = Buffer.byteLength(prepared.body, "utf8");

    // Discrimination test: True items should have noul >= 0.70; False controls should have noul <= 0.30
    const passedDiscrimination = testCase.truth ? noul >= 0.70 : noul <= 0.30;

    results.push({
      id: testCase.id,
      expectedTruth: testCase.truth,
      noul,
      latencyMs,
      bytes,
      passedDiscrimination,
    });

    const statusMark = passedDiscrimination ? "[PASS]" : "[DISCRIMINATION_FAIL]";
    console.log(
      `${statusMark} ${testCase.id.padEnd(32)} Expected: ${String(testCase.truth).padEnd(5)} | JEV P(noul): ${noul.toFixed(2)} | Latency: ${latencyMs}ms | Size: ${bytes}B`
    );
  }

  console.log("\n==========================================================================");
  console.log(" Discrimination Summary:");
  const total = results.length;
  const passed = results.filter((r) => r.passedDiscrimination).length;
  console.log(` Rate: ${passed}/${total} passed discrimination threshold (P>=0.70 for True, P<=0.30 for False)`);
  console.log("==========================================================================");

  return results;
}

runProbe().catch(console.error);
