import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { loadBundle, loadManifest, writeJson } from "./jev-paired-files";
import { validateBundle } from "./jev-paired-validation";
import { freezeBundle, readJournal, reportRun, benchmarkRun, type BenchmarkAuthority } from "./jev-paired-runner";
import { advanceNativeBenchmark } from "./jev-paired-host-client";
export interface CliOptions { fixtureAuthority?:BenchmarkAuthority; stdout?:(text:string) => void; signal?:AbortSignal }
async function executeCli(argv: string[], options: CliOptions): Promise<number> {
  const out = options.stdout ?? console.log, command = argv[0];
  const value = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i+1] : undefined; };
  if (!["validate","freeze","benchmark","report","decide"].includes(command)) { out("Usage: bun tools/jev-paired-eval.ts validate|freeze|benchmark --protocol <file> [--run-id <id>] | report|decide --run <directory>"); return 2; }
  try {
    const seen = new Set<string>();
    for (let i = 1; i < argv.length; i += 2) {
      const flag = argv[i], argument = argv[i+1];
      if (!["--protocol","--run-id","--run"].includes(flag) || seen.has(flag) || !argument || argument.startsWith("--")) throw new Error("invalid_or_duplicate_cli_argument");
      seen.add(flag);
    }
    if (command === "report" || command === "decide") {
      const run = value("--run"); if (!run) throw new Error("--run_required");
      const manifest = await loadManifest(run), journal = await readJournal(run);
      const result = await reportRun(run,manifest,journal.episodes,journal.attempts);
      out(JSON.stringify(result.decision,null,2));
      return manifest.interrupted ? 4 : result.decision.measurementStatus === "prerequisite_pending" ? 3 : result.decision.measurementStatus === "complete" ? 0 : 4;
    }
    const protocolPath = value("--protocol"); if (!protocolPath) throw new Error("--protocol_required");
    const bundle = await loadBundle(protocolPath), validation = validateBundle(bundle);
    if (command === "validate") {
      out(JSON.stringify({ ...validation,measurementStatus:validation.errors.length ? "invalid" : validation.pending.length ? "prerequisite_pending" : "ready",modelBenchmark:bundle.protocol.kind === "model_benchmark",notice:bundle.protocol.kind === "deterministic_fixture" ? "Not a model benchmark; zero model-benchmark observations." : "Validation is not inference or authority.",pendingInputs:bundle.protocol.pendingInputs },null,2));
      return validation.errors.length ? 2 : validation.pending.length ? 3 : 0;
    }
    if (validation.errors.length) { out(JSON.stringify(validation,null,2)); return 2; }
    const runId = value("--run-id") ?? `frozen-${bundle.digest.slice(0,16)}`;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId)) throw new Error("invalid_run_id");
    const reports = resolve(dirname(protocolPath),"../reports/paired"), run = resolve(reports,runId);
    if (command === "freeze") {
      await mkdir(reports,{ recursive:true });
      const manifest = await freezeBundle(bundle,runId,run);
      out(JSON.stringify({ run,runId,bundleDigest:bundle.digest,status:manifest.status,pendingInputs:manifest.pendingInputs },null,2));
      return validation.pending.length ? 3 : 0;
    }
    if (validation.pending.length) {
      out(JSON.stringify({status:"prerequisite_pending",pending:validation.pending,pendingInputs:bundle.protocol.pendingInputs,resume:"Supply the named owner inputs, validate, freeze the approved exact cohort, then benchmark inside the trusted native host."},null,2));
      return 3;
    }
    const manifest = await loadManifest(run);
    if (manifest.frozen.digest !== bundle.digest) throw new Error("resume_requires_exact_frozen_inputs");
    if (bundle.protocol.kind === "model_benchmark") {
      const step = await advanceNativeBenchmark(run,resolve(protocolPath),manifest); out(JSON.stringify(step,null,2));
      return step.status === "complete" ? 0 : step.status === "needs_native_dispatch" || step.status === "prerequisite_pending" ? 3 : 4;
    }
    const authority = options.fixtureAuthority;
    if (!authority) {
      const pending = {owner:"deterministic fixture control backend",action:"Supply the explicit fixtureAuthority test control; this is never a model benchmark and cannot be used for actual model arms.",releaseCondition:"A deterministic isolated test control invocation, with zero live calls or model-quality observations."};
      if (!manifest.pendingInputs.some(p => p.owner === pending.owner)) manifest.pendingInputs.push(pending);
      manifest.status = "prerequisite_pending";
      await writeJson(resolve(run,"manifest.json"),manifest);
      const journal = await readJournal(run); await reportRun(run,manifest,journal.episodes,journal.attempts);
      out(JSON.stringify({ status:"prerequisite_pending",pendingInputs:manifest.pendingInputs },null,2)); return 3;
    }
    const result = await benchmarkRun(run,dirname(resolve(protocolPath)),manifest,authority,options.signal);
    out(JSON.stringify(result.decision,null,2));
    return manifest.interrupted ? 4 : result.decision.measurementStatus === "complete" ? 0 : result.decision.measurementStatus === "prerequisite_pending" ? 3 : 4;
  } catch (error) {
    out(JSON.stringify({ status:"invalid",error:error instanceof SyntaxError ? "invalid_json_document" : error instanceof Error ? error.message : String(error) })); return 2;
  }
}
/** Exits with a supplied output/input target have durable control receipts, never model observations. */
export async function runCli(argv: string[], options: CliOptions = {}): Promise<number> {
  const messages: string[] = [];
  const exitCode = await executeCli(argv,{ ...options,stdout:text => { messages.push(text); (options.stdout ?? console.log)(text); } });
  const runIndex = argv.indexOf("--run"), protocolIndex = argv.indexOf("--protocol");
  const run = runIndex >= 0 ? argv[runIndex+1] : undefined, protocol = protocolIndex >= 0 ? argv[protocolIndex+1] : undefined;
  const statusRoot = run && !run.startsWith("--") ? resolve(run)
    : protocol && !protocol.startsWith("--") ? resolve(dirname(protocol),"../reports/paired/_control") : undefined;
  if (statusRoot) {
    try { await writeJson(resolve(statusRoot,"status.json"),{ command:argv[0],exitCode,status:exitCode === 0 ? "valid_completed_command_not_necessarily_experiment" : exitCode === 2 ? "invalid" : exitCode === 3 ? "prerequisite_pending" : "incomplete",messages,recordedAt:new Date().toISOString() }); }
    catch (error) { (options.stdout ?? console.log)(JSON.stringify({ status:"control_status_persistence_failed",reason:error instanceof Error ? error.message : String(error) })); return 2; }
  }
  return exitCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const controller = new AbortController();
  process.once("SIGINT",() => controller.abort(new Error("SIGINT")));
  process.once("SIGTERM",() => controller.abort(new Error("SIGTERM")));
  process.exitCode = await runCli(process.argv.slice(2),{ signal:controller.signal });
}
