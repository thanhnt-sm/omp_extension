import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { collectConversationContext } from "../typesafe-planner";
import { runPhaseMacroCheck, type ExpertJudgeResponse } from "../src/cook-expert-judge";

const TASK = "Document the public evidence boundary and its verification proof.";
const PUBLIC_ASSISTANT = "Public evidence: the task-bound boundary specification is complete.";
const PUBLIC_INTENT = "Inspect public evidence boundary";
const PUBLIC_RESULT = "Public boundary verification: 7 pass, 0 fail";
const ARTIFACT = `Task: ${TASK}\nProof: only public evidence may leave the host.`;
const API_KEY = "public-egress-fixture-not-a-real-key";
const PRIVATE_MARKERS = [
  "private thinking canary",
  "alternate thinking canary",
  "nested reasoning canary",
  "redacted thinking canary",
  "internal block canary",
  "tool argument canary",
];

function privateBlocks(repetitions: number): Record<string, unknown>[] {
  return [
    { type: "thinking", thinking: `${PRIVATE_MARKERS[0]} `.repeat(repetitions) },
    { type: "thinking", text: PRIVATE_MARKERS[1] },
    { type: "reasoning", content: [{ type: "text", text: PRIVATE_MARKERS[2] }] },
    { type: "redacted_thinking", data: PRIVATE_MARKERS[3] },
    { type: "internal_debug", text: PRIVATE_MARKERS[4], content: [{ type: "text", text: PRIVATE_MARKERS[4] }] },
  ];
}

function branch(repetitions: number): Record<string, unknown>[] {
  return [
    { type: "message", id: "public-user", parentId: null, message: { role: "user", content: TASK } },
    {
      type: "message", id: "private-only", parentId: "public-user",
      message: { role: "assistant", content: privateBlocks(1) },
    },
    {
      type: "message", id: "mixed-assistant", parentId: "private-only",
      message: { role: "assistant", content: [
        { type: "text", text: PUBLIC_ASSISTANT },
        ...privateBlocks(repetitions),
        { type: "toolCall", id: "public-check", name: "bash", arguments: { i: PUBLIC_INTENT, internal: PRIVATE_MARKERS[5] } },
      ] },
    },
    {
      type: "message", id: "public-result", parentId: "mixed-assistant",
      message: { role: "toolResult", toolName: "bash", toolCallId: "public-check", isError: false,
        content: [{ type: "text", text: PUBLIC_RESULT }, ...privateBlocks(1)] },
    },
  ];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an outgoing object");
  return value as Record<string, unknown>;
}

function stateOf(packet: Record<string, unknown>): Record<string, unknown> {
  return record(typeof packet.state === "string" ? JSON.parse(packet.state) : packet.state);
}

// These answers only complete the intercepted transport; they establish no native approval.
const SYNTHETIC_APPROVAL: ExpertJudgeResponse = { answers: {
  deliverables_verdict: { choice: "APPROVE", confidence: 1 },
  meets_criteria: { noul: 1 },
  architectural_drift: { choice: "no_drift", confidence: 1 },
  scope_mode: { choice: "HOLD", confidence: 1 },
} };

function captureTransport(packets: Record<string, unknown>[], response: unknown): typeof fetch {
  const transport = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    // No branch ever forwards to the original fetch or opens a real connection.
    expect(String(input)).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init?.method).toBe("POST");
    expect(typeof init?.body).toBe("string");
    packets.push(record(JSON.parse(String(init?.body))));
    return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
  };
  return Object.assign(transport, { preconnect: () => {} });
}

function expectPublicOnly(packet: Record<string, unknown>): void {
  const encoded = JSON.stringify(packet);
  for (const marker of PRIVATE_MARKERS) expect(encoded).not.toContain(marker);
  for (const type of ["thinking", "reasoning", "redacted_thinking", "internal_debug"]) {
    expect(encoded).not.toContain(`\"type\":\"${type}\"`);
  }
  expect(encoded).toContain(TASK);
  expect(encoded).toContain(PUBLIC_ASSISTANT);
  expect(encoded).toContain(PUBLIC_INTENT);
  expect(encoded).toContain(PUBLIC_RESULT);
  expect(Buffer.byteLength(encoded, "utf8")).toBeLessThanOrEqual(32768);
}

async function captureMacroEgress(repetitions: number): Promise<Record<string, unknown>> {
  const packets: Record<string, unknown>[] = [];
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TYPESAFE_API_KEY;
  try {
    process.env.TYPESAFE_API_KEY = API_KEY;
    globalThis.fetch = captureTransport(packets, SYNTHETIC_APPROVAL);
    const conversation = collectConversationContext({ sessionManager: { getBranch: () => branch(repetitions) } });
    // Deliberately use the real default judge client: collector -> macro -> preparePayloadSafe
    // -> bundled CJS preparation -> requestWithRetry -> intercepted final request body.
    const result = await runPhaseMacroCheck({
      todoTask: TASK,
      taskType: "doc_specification",
      planRequirements: ["Retain public task-bound proof without exporting private model content."],
      diffSummary: "",
      unifiedDiff: "",
      testSummary: conversation.lastTestSummary || "",
      deliverableArtifacts: ARTIFACT,
      userRequest: conversation.userRequest,
      agentWorkLog: conversation.agentWorkLog,
    });
    expect(result.error).toBeUndefined();
    expect(packets).toHaveLength(1);
    return packets[0];
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = originalKey;
  }
}

interface CjsJudgeClient {
  judgeTypeSafe(options: {
    fetchImpl: typeof fetch;
    apiKey: string;
    args: { state: Record<string, unknown>; questions: Record<string, { type: "noul"; instructions: string }> };
    maxAttempts: number;
    rateLimitState: Record<string, unknown>;
  }): Promise<{ ok: boolean; code?: string }>;
}

describe("Public evidence at final production egress", () => {
  test("real collector and macro transport exclude private-only, mixed, nested and unknown blocks", async () => {
    const packet = await captureMacroEgress(1);
    expectPublicOnly(packet);
    const state = stateOf(packet);
    expect(state.deliverable_artifacts).toContain(ARTIFACT);
    expect(state.agent_work_log).toContain(PUBLIC_ASSISTANT);
    expect(state.agent_work_log).toContain(`[toolCall: bash (${PUBLIC_INTENT})]`);
    expect(state.agent_work_log).toContain(`[toolResult:bash]: ${PUBLIC_RESULT}`);
  });

  test("large private blocks cannot consume the public evidence budget before final preparation", async () => {
    const ordinary = await captureMacroEgress(1);
    const oversizedPrivate = await captureMacroEgress(6000);
    expectPublicOnly(oversizedPrivate);
    const state = stateOf(oversizedPrivate);
    expect(state.agent_work_log).toBe(stateOf(ordinary).agent_work_log);
    expect(state.user_request).toBe(stateOf(ordinary).user_request);
    expect(state.deliverable_artifacts).toBe(stateOf(ordinary).deliverable_artifacts);
  });

  test("real CJS judge preparation independently projects structured conversation before sending", async () => {
    const client = createRequire(import.meta.url)("../src/typesafe-api-client.cjs") as CjsJudgeClient;
    const packets: Record<string, unknown>[] = [];
    const result = await client.judgeTypeSafe({
      apiKey: API_KEY,
      fetchImpl: captureTransport(packets, { answers: { public_proof: { noul: 1 } } }),
      maxAttempts: 1,
      rateLimitState: {},
      args: {
        state: { todo_task: TASK, deliverable_artifacts: ARTIFACT, messages: branch(6000) },
        questions: { public_proof: { type: "noul", instructions: "Does the public proof satisfy the task?" } },
      },
    });
    expect(result.ok).toBe(true);
    expect(packets).toHaveLength(1);
    expectPublicOnly(packets[0]);
    expect(stateOf(packets[0]).deliverable_artifacts).toBe(ARTIFACT);
  });
});
