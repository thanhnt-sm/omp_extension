import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChildProcess } from "node:child_process";
import { createVerificationHome } from "../src/typesafe-child-env.cjs";

// Actual SDK/CLI boundary-control smoke. The loopback scripted provider is NOT reasoning, JEV or model-quality proof.
const root = mkdtempSync(path.join(tmpdir(), "omp-native-boundary-"));
const home = createVerificationHome();
const workspace = path.join(root, "workspace");
mkdirSync(workspace);
let turns = 0;
const calls = [
  { id: "owned-scratch-init", args: { i: "Initializing isolated scratch obligation", op: "init", list: [{ phase: "Isolated SDK smoke", items: ["Preserve this scratch obligation without approved proof"] }] } },
  { id: "owned-scratch-done", args: { i: "Exercising unapproved completion rejection", op: "done", task: "Preserve this scratch obligation without approved proof" } },
  { id: "owned-scratch-view", args: { i: "Observing preserved scratch obligation", op: "view" } },
];
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
  if (new URL(request.url).pathname !== "/v1/chat/completions") return new Response("not found", { status: 404 });
  const body: unknown = await request.json();
  if (!body || typeof body !== "object") return new Response("invalid", { status: 400 });
  const call = calls[turns++];
  if (turns > 5) return new Response("unexpected additional inference", { status: 500 });
  const delta = call ? { role: "assistant", tool_calls: [{ index: 0, id: call.id, type: "function", function: { name: "todo", arguments: JSON.stringify(call.args) } }] }
    : { role: "assistant", content: "SOURCE_NATIVE_SMOKE_FINISHED" };
  const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
  const base = { id: `owned-response-${turns}`, object: "chat.completion.chunk", created: 1, model: "native-boundary-control" };
  return new Response(frame({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })
    + frame({ ...base, choices: [{ index: 0, delta: {}, finish_reason: call ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) + "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
} });
const extension = path.join(root, "owned-smoke-extension.js");
writeFileSync(extension, `export default function(pi) {
  pi.registerProvider("owned-sdk-smoke", { baseUrl: "http://127.0.0.1:${server.port}/v1", apiKey: "nonsecret-local-smoke", api: "openai-completions", models: [{ id: "native-boundary-control", name: "Native boundary control", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32768, maxTokens: 4096 }] });
  pi.on("session_shutdown", (_event, ctx) => {
    const entries = ctx.sessionManager.getBranch();
    const calls = entries.filter(entry => entry.type === "message" && entry.message?.role === "assistant").flatMap(entry =>
      Array.isArray(entry.message?.content) ? entry.message.content : []).filter(content => content?.type === "toolCall" && content.name === "todo").map(content => content.id);
    const results = entries.filter(entry => entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolName === "todo").map(entry => ({ id: entry.message.toolCallId, isError: entry.message.isError, details: entry.message.details }));
    console.log("SDK_NATIVE_SMOKE_PROOF " + JSON.stringify({ calls, results, activeTodo: pi.getActiveTools().includes("todo"), registered: pi.getAllTools().filter(tool => ["todo", "typesafe_bind_task", "typesafe_review_task", "typesafe_eval_host"].includes(tool.name)).map(tool => ({ name: tool.name, sourceInfo: tool.sourceInfo })) }));
  });
}\n`, "utf8");
let child: ChildProcess | undefined;
try {
  const executable = process.argv[2] ?? "omp";
  const version = home.execFileSync("verification", executable, ["--version"], { encoding: "utf8" }).trim();
  assert.equal(version, "omp/18.12.3", "this smoke exercises the source-verified SDK version");
  const entrypoint = fileURLToPath(new URL("../typesafe-planner.ts", import.meta.url));
  child = home.spawn("verification", executable, ["--cwd", workspace, "--no-session", "--no-extensions", "-e", entrypoint, "-e", extension,
    "--no-skills", "--no-rules", "--mode", "json", "--model", "owned-sdk-smoke/native-boundary-control", "-p",
    "Exercise only the isolated scratch todo boundary, do not write project files or call external services."], { cwd: workspace, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout?.on("data", chunk => { stdout += chunk; });
  child.stderr?.on("data", chunk => { stderr += chunk; });
  const timer = setTimeout(() => child?.kill(), 90_000);
  timer.unref();
  const exit = await new Promise<number | null>((resolve, reject) => { child!.once("error", reject); child!.once("close", resolve); });
  clearTimeout(timer);
  const raw = stdout.split(/\r?\n/).find(line => line.startsWith("SDK_NATIVE_SMOKE_PROOF "));
  if (!raw) throw new Error(`Actual CLI smoke produced no final SDK proof (exit ${exit}, turns ${turns}). Diagnostics: ${stderr.slice(-6000)}\n${stdout.slice(-10000)}`);
  const proof: { calls: string[]; results: Array<{ id: string; isError?: boolean; details?: { status?: string; phases?: Array<{ tasks: Array<{ content: string; status: string }> }> } }>; activeTodo: boolean; registered: unknown[] } = JSON.parse(raw.slice("SDK_NATIVE_SMOKE_PROOF ".length));
  assert.equal(exit, 0, "actual CLI process must exit successfully");
  const init = proof.results.find(result => result.id === calls[0].id);
  const rejected = proof.results.find(result => result.id === calls[1].id);
  const view = proof.results.find(result => result.id === calls[2].id);
  assert.ok(turns >= 3 && !proof.calls.includes(calls[1].id), `the scripted provider attempted completion but the native gate omitted it from host history: ${JSON.stringify(proof)}`);
  assert.ok(init && init.isError !== true && init.details?.phases?.[0]?.tasks[0]?.status === "in_progress", `actual native initialization must execute: ${JSON.stringify(proof)}`);
  assert.equal(rejected, undefined, `unbound completion must be blocked before Core emits a result: ${JSON.stringify(proof)}`);
  assert.equal(view?.details?.phases?.[0]?.tasks[0]?.status, "in_progress", `denial must preserve the actual Core obligation: ${JSON.stringify(proof)}`);
  assert.equal(proof.activeTodo, true);
  console.log(JSON.stringify({ status: "PASS", version, surface: "actual omp CLI and same-native todo wrapper", provider: "owned loopback scripted boundary control, not reasoning", initExecuted: true, unboundCompletionRejected: true, actualGoalPreserved: true, turns, nativeScratchSessions: 1, originalSessionMutations: 0, realProviderCalls: 0, registered: proof.registered }));
} finally {
  child?.kill();
  server.stop(true);
  home.cleanup();
  rmSync(root, { recursive: true, force: true });
}
