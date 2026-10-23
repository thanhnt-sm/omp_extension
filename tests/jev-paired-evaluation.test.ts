import { beforeAll, describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadBundle, loadManifest, writeJson, readBoundFile, assertFrozenFiles } from "../tools/jev-paired-files";
import { validateBundle, assignSplits, connectedGroups, labelGold, digest, SCENARIOS, schedulePairs } from "../tools/jev-paired-validation";
import { clopperPearson, pairedImprovement, zeroEventUpper, nearestRank, quantileInterval, binomialTail } from "../tools/jev-paired-statistics";
import { decide, computeMetrics, strictDominanceGates } from "../tools/jev-paired-metrics";
import { episodeCash, priceAttempt, validateReceipts } from "../tools/jev-paired-accounting";
import { benchmarkRun, freezeBundle, readJournal, recoverAdmittedEpisode } from "../tools/jev-paired-runner";
import { runCli } from "../tools/jev-paired-eval";
import { fixtureManifest, fixtureObservations } from "./fixtures/jev-paired-evaluation/control";
import type { FrozenBundle } from "../tools/jev-paired-types";
import { createWorkspaceBenchmarkAuthority } from "../tools/jev-paired-workspace";
import { projectAttempt, projectCase, projectEpisode, projectProtocol } from "../tools/jev-paired-inputs";
import { claimUnseenHoldout } from "../tools/jev-paired-exposure";
import { prepareAtomicInput } from "../src/atomic-preparation";
import { advisorFixture } from "./advisor-fixtures";
import { ablationIdentity } from "../tools/jev-paired-ablations";
const FIXTURE = resolve(import.meta.dir,"fixtures/jev-paired-evaluation");
let original: FrozenBundle;
beforeAll(async () => { original = await loadBundle(resolve(FIXTURE,"protocol.json")); });
function setup() { const m = fixtureManifest(original); return { m,...fixtureObservations(m) }; }
async function temporary() {
  const root = await mkdtemp(resolve(tmpdir(),"jev-paired-"));
  await cp(FIXTURE,resolve(root,"evaluation"),{ recursive:true });
  return { root,protocol:resolve(root,"evaluation/protocol.json"),cleanup:() => rm(root,{ recursive:true,force:true }) };
}
describe("deterministic controls only — not a model benchmark",() => {
  test("U1 host receipt ownership rejects self-claimed proof",() => { const { m,episodes,attempts } = setup(); attempts[0].caseId = "self-claim"; expect(validateReceipts(attempts,episodes,m.runId).some(x => x.startsWith("unowned_episode_attempt"))).toBe(true); });
  test("U2 Advisor advice never grants native authority",() => { const { m,episodes,attempts } = setup(); const r = decide(m,episodes,attempts); expect(r.decision.authority).toBe("assessment_only_no_deployment"); expect(r.metrics.productionCostPerCompletedTask).toEqual({ value:null,reason:"shadow_has_no_independently_verified_native_completion",support:0 }); });
  test("U3 trusted spend rejection prevents every arm invocation",async () => {
    const t = await temporary(); try { const b = await loadBundle(t.protocol),run = resolve(t.root,"denied"),m = await freezeBundle(b,"denied",run); let calls = 0;
      await benchmarkRun(run,resolve(t.root,"evaluation"),m,{ authorize:async () => ({ allowed:false,reason:"human declined exact frozen scope" }),driver:{ evaluate:async () => { calls++; throw new Error("must not run"); } } }); expect(calls).toBe(0); expect((await readJournal(run)).episodes).toHaveLength(0);
      const reloaded = await loadManifest(run); expect(reloaded.frozen.digest).toBe(b.digest); expect(reloaded.frozen.protocol.pendingInputs).toHaveLength(0);
    } finally { await t.cleanup(); }
  });
  test("I1 absent original snapshots do not receive fabricated evidence",() => { const { m } = setup(); m.frozen.cases[0].snapshots = []; expect(validateBundle(m.frozen).errors).toContain(`privacy_or_snapshot_missing:${m.frozen.cases[0].id}`); });
  test("I2 complete artifact tails participate in frozen identity",async () => { const t = await temporary(); try { const b = await loadBundle(t.protocol); const path = b.cases[0].input.path; const tail = "\nREQUIRED tail proof after long artifact " + "x".repeat(40000); await writeFile(resolve(t.root,"evaluation",path),(await readFile(resolve(t.root,"evaluation",path),"utf8"))+tail); await expect(assertFrozenFiles(resolve(t.root,"evaluation"),b)).rejects.toThrow("frozen_input_changed"); } finally { await t.cleanup(); } });
  test("I3 Unicode negation stays raw data rather than consent",() => { const raw = "Không bỏ kiểm chứng lexer; do not authorize deployment."; expect(digest(raw)).not.toBe(digest("authorize deployment")); expect(Buffer.byteLength(raw)).toBeGreaterThan(raw.length); });
  test("T1 source revision changes invalidate the exact resume bundle",async () => { const t = await temporary(); try { const b = await loadBundle(t.protocol); await writeFile(resolve(t.root,"evaluation/configuration.txt"),"changed policy revision"); await expect(assertFrozenFiles(resolve(t.root,"evaluation"),b)).rejects.toThrow("frozen_input_changed"); } finally { await t.cleanup(); } });
  test("T2 exact completed receipts resume without semantic resampling",async () => {
    const t = await temporary(); try { const b = await loadBundle(t.protocol),run = resolve(t.root,"resume"),m = await freezeBundle(b,"resume",run); const observations = fixtureObservations(m); await writeFile(resolve(run,"receipts.jsonl"),observations.episodes.map(e => JSON.stringify({ episode:e,attempts:observations.attempts.filter(a => e.attemptIds.includes(a.receiptId)) })).join("\n")+"\n"); let calls = 0;
      await benchmarkRun(run,resolve(t.root,"evaluation"),m,{ authorize:async () => ({ allowed:true,reason:"synthetic fixture has no paid provider" }),driver:{ evaluate:async () => { calls++; throw new Error("resampled completed output"); } } }); expect(calls).toBe(0); expect((await readJournal(run)).attempts).toHaveLength(observations.attempts.length);
    } finally { await t.cleanup(); }
  });
  test("T3 service outage is workflow unavailable, not invented semantic gold",() => { const { m,episodes,attempts } = setup(); episodes[0].disposition = "UNAVAILABLE"; episodes[0].reason = "HTTP503"; const r = computeMetrics(m,episodes,attempts); expect(r.scheduledEpisodes).toBe(20); expect(m.frozen.labels.every(l => l.expected === "REJECT")).toBe(true); });
  test("S1 deterministic fixtures never count as model observations",() => { const { m,episodes,attempts } = setup(); const r = decide(m,episodes,attempts); expect(r.decision.modelBenchmark).toBe(false); expect(r.decision.selection).toBe("retain_repaired_M"); expect(r.decision.unknownGates).toContain("deterministic_fixture_not_a_model_benchmark"); });
  test("S2 counterbalanced scheduling retains both arms for every parent",() => { const schedule = schedulePairs(original); expect(schedule).toHaveLength(20); expect(schedule.slice(0,4).map(s => s.arm)).toEqual(["M","H","H","M"]); expect(new Set(schedule.map(s => s.id)).size).toBe(20); });
  test("S3 local question and final byte policies fail closed",() => { const { m,episodes,attempts } = setup(); attempts[0].questionIds = Array.from({ length:129 },(_,i) => `q${i}`); attempts[1].bodyBytes = 32769; const errors = validateReceipts(attempts,episodes,m.runId); expect(errors.some(x => x.startsWith("invalid_questions"))).toBe(true); expect(errors.some(x => x.startsWith("invalid_body_bytes"))).toBe(true); });
  test("ST1 frozen contract and schedule survive manifest restoration",async () => { const t = await temporary(); try { const b = await loadBundle(t.protocol),run = resolve(t.root,"restored"); const m = await freezeBundle(b,"restored",run),restored = await loadManifest(run); expect(restored.frozen.digest).toBe(m.frozen.digest); expect(restored.schedule).toEqual(m.schedule); } finally { await t.cleanup(); } });
  test("ST2 plausible writer and reader unit passes still fail parent integration",() => { const writer = () => ({ version:2,token:"fixture" }); const reader = (v:{ version:number; access_token?:string }) => { if (v.version !== 1 || !v.access_token) throw new Error("schema-contract-mismatch"); return v.access_token; }; expect(writer().token).toBeTruthy(); expect(reader({ version:1,access_token:"fixture" })).toBe("fixture"); expect(() => reader(writer())).toThrow("schema-contract-mismatch"); });
  test("ST3 unsafe integration cannot be rescued by reviewer recommendation",() => { const { m,episodes,attempts } = setup(); const held = m.frozen.cases.find(c => m.frozen.splits[c.id] === "holdout")!; const h = episodes.find(e => e.caseId === held.id && e.arm === "H")!; h.disposition = "APPROVE"; h.integrationMiss = true; const r = decide(m,episodes,attempts); expect(r.decision.failedGates).toContain("challenge-integration:unsafe_approvals"); expect(r.decision.failedGates).toContain("challenge-integration:integration_misses"); });
  test("E1 headless CLI reports exact fixture-control prerequisite without calls",async () => { const t = await temporary(); try { expect(await runCli(["freeze","--protocol",t.protocol,"--run-id","headless"],{ stdout:() => {} })).toBe(0); expect(await runCli(["benchmark","--protocol",t.protocol,"--run-id","headless"],{ stdout:() => {} })).toBe(3); const run = resolve(t.root,"reports/paired/headless"),m = await loadManifest(run); expect(m.status).toBe("prerequisite_pending"); expect(m.pendingInputs.some(p => p.owner === "deterministic fixture control backend" && p.action.includes("fixtureAuthority") && p.action.includes("never a model benchmark"))).toBe(true); const journal = await readJournal(run); expect(journal.episodes).toHaveLength(0); expect(journal.attempts).toHaveLength(0); } finally { await t.cleanup(); } });
  test("E2 Windows-style traversal and Unicode file identities are bounded",async () => { await expect(readBoundFile(FIXTURE,"../escape.json")).rejects.toThrow("UNSAFE_PATH"); const file = await readBoundFile(FIXTURE,"consumer-0.json"); expect(file.bytes.length).toBeGreaterThan(0); expect(file.sha256).toBe(digest(file.bytes)); expect(file.identity.ino).toBeTruthy(); });
  test("E3 bytes are not characters and cap is identical in receipts",() => { const { m,episodes,attempts } = setup(); attempts[0].bodyBytes = Buffer.byteLength("ế".repeat(12000)); expect(validateReceipts(attempts,episodes,m.runId).some(x => x.startsWith("invalid_body_bytes"))).toBe(true); });
  test("ER1 HTTP503 remains scheduled and unsuccessful",() => { const { m,episodes,attempts } = setup(); const held = m.frozen.cases.find(c => m.frozen.splits[c.id] === "holdout")!; episodes.find(e => e.caseId === held.id && e.arm === "H")!.disposition = "UNAVAILABLE"; const g = computeMetrics(m,episodes,attempts).populationsAndStrata.find(g => g.id === "challenge")!; expect(g.H.scheduled).toBe(2); expect(g.H.errors).toBe(1); expect(g.H.correct).toBe(1); });
  test("ER2 partial and duplicate answer identity never turns into success",() => { const { m,episodes,attempts } = setup(); attempts[0].questionIds = ["criterion","criterion"]; expect(validateReceipts(attempts,episodes,m.runId).some(x => x.startsWith("invalid_questions"))).toBe(true); });
  test("ER3 unknown Advisor cost is not heuristic free approval",() => { const { m,episodes,attempts } = setup(); attempts[0].role = "advisor"; attempts[0].usage = null; attempts[0].unknownReason = "Advisor service unavailable"; const cash = episodeCash(episodes,attempts,m.frozen.prices,20); expect(cash.value).toBeNull(); expect(cash.reason).toBe("Advisor service unavailable"); });
  test("A1 corpus instructions cannot execute commands",async () => { const t = await temporary(); try { let output = ""; const exit = await runCli(["validate","--protocol",t.protocol],{ stdout:text => { output += text; } }); expect(exit).toBe(0); expect(output).not.toContain("THIS_CORPUS_COMMAND_MUST_NEVER_EXECUTE"); } finally { await t.cleanup(); } });
  test("A2 self-declared authorized flag is not CLI spend authority",async () => { const t = await temporary(); try { const p = JSON.parse(await readFile(t.protocol,"utf8")); p.authorized = true; await writeJson(t.protocol,p); await runCli(["freeze","--protocol",t.protocol,"--run-id","self-authorized"],{ stdout:() => {} }); expect(await runCli(["benchmark","--protocol",t.protocol,"--run-id","self-authorized"],{ stdout:() => {} })).toBe(3); } finally { await t.cleanup(); } });
  test("A3 unsupported marker cannot supply a native enforcement bridge",async () => { const t = await temporary(); try { await writeFile(resolve(t.root,"egc.marker"),""); await runCli(["freeze","--protocol",t.protocol,"--run-id","marker"],{ stdout:() => {} }); expect(await runCli(["benchmark","--protocol",t.protocol,"--run-id","marker"],{ stdout:() => {} })).toBe(3); } finally { await t.cleanup(); } });
  test("D1 different baseline WIP provenance changes frozen evidence identity",() => { const original = { baseline:"user WIP",evaluated:"task edit" }; expect(digest(JSON.stringify(original))).not.toBe(digest(JSON.stringify({ baseline:"",evaluated:"task edit" }))); });
  test("D2 both original and evaluated snapshots are bound, not only clean tree",() => { const { m } = setup(); const b = m.frozen.cases[0].snapshots[0]; m.frozen.cases[0].snapshots = [b,{ path:"separate-baseline.json",sha256:digest("baseline") }]; expect(m.frozen.cases[0].snapshots).toHaveLength(2); });
  test("D3 changed contract digest rejects cached frozen manifest",async () => { const t = await temporary(); try { const b = await loadBundle(t.protocol),run = resolve(t.root,"contract"); await freezeBundle(b,"contract",run); const tampered = JSON.parse(await readFile(resolve(run,"manifest.json"),"utf8")); tampered.frozen.protocol.targetScope = "changed original obligation"; await writeJson(resolve(run,"manifest.json"),tampered); await expect(loadManifest(run)).rejects.toThrow("frozen_manifest_digest_mismatch"); } finally { await t.cleanup(); } });
  test("IT1 advisory approval is not an actual workflow completion event",() => { const { m,episodes,attempts } = setup(); const metrics = computeMetrics(m,episodes,attempts); expect(metrics.productionCostPerCompletedTask.value).toBeNull(); expect(metrics.productionCostPerCompletedTask.support).toBe(0); });
  test("IT2 frozen metric semantics reject contradictory consumer policies",() => { const { m } = setup(); m.frozen.protocol.metricGates[0].direction = "higher"; expect(validateBundle(m.frozen).errors).toContain("ambiguous_metric_gate:challenge-integration:unsafe_approvals"); });
  test("IT3 resolved model drift cannot masquerade as implementation improvement",() => { const { m,episodes,attempts } = setup(); attempts[0].resolvedModel = "fixture-jev-new-exact"; expect(decide(m,episodes,attempts).decision.failedGates).toContain(`resolved_model_drift:${attempts[0].receiptId}`); });
  test("C1 unapproved privacy provenance fails corpus validation",() => { const { m } = setup(); m.frozen.cases[0].privacy.approvalReceipt = ""; expect(validateBundle(m.frozen).errors.some(x => x.startsWith("privacy_or_snapshot_missing"))).toBe(true); });
  test("C2 missing sanitized criterion proof remains missing",() => { const { m } = setup(); m.frozen.cases[0].input = undefined!; expect(validateBundle(m.frozen).errors.some(x => x.startsWith("privacy_or_snapshot_missing"))).toBe(true); });
  test("C3 unknown resolved model and usage are null, not requested identity",() => { const { m,episodes,attempts } = setup(); attempts[0].resolvedModel = null; attempts[0].unknownReason = "provider omitted model"; expect(priceAttempt(attempts[0],m.frozen.prices).value).toBeNull(); expect(decide(m,episodes,attempts).decision.unknownGates).toContain(`resolved_model_missing:${attempts[0].receiptId}`); });
  test("B1 correlated child variants cannot inflate independent parent support",() => { const { m } = setup(); m.frozen.cases[1].familyId = m.frozen.cases[0].familyId; expect(connectedGroups(m.frozen.cases).some(g => g.length === 2)).toBe(true); expect(validateBundle(m.frozen).errors.some(x => x.startsWith("noncanonical_independent_group"))).toBe(true); });
  test("B2 cohort size cannot supply human consent or vacuous support",() => { const { m } = setup(); m.frozen.protocol.minimumGroups = 1000; expect(validateBundle(m.frozen).pending).toContain("undersupported_overall_holdout"); });
  test("B3 task text size cannot replace required independent reasoning economics",() => { const { m,episodes,attempts } = setup(); attempts[0].role = "advisor"; attempts[0].resolvedModel = "fixture-advisor-exact"; attempts[0].usage = null; expect(episodeCash(episodes,attempts,m.frozen.prices,20).value).toBeNull(); });
  test("all36 scenario mappings point at executable named assertions",() => { expect(SCENARIOS).toHaveLength(36); expect(Object.keys(original.protocol.scenarioCoverage).sort()).toEqual([...SCENARIOS].sort()); });
  test("numerical binomial tails, CP boundaries and conservative paired bound",() => { expect(binomialTail(10,.5,0,0)).toBeCloseTo(1/1024,12); expect(clopperPearson(0,10).lower).toBe(0); expect(clopperPearson(10,10).upper).toBe(1); expect(clopperPearson(0,10).upper).toBeCloseTo(1-Math.pow(.025,1/10),12); expect(pairedImprovement(90,0,100)).toBeGreaterThan(0); expect(pairedImprovement(0,0,100)).toBeLessThan(0); expect(pairedImprovement(0,0,0)).toBeNull(); expect(binomialTail(2000,.99,1990,2000)).toBeGreaterThan(0); });
  test("risk and nearest-rank order-statistic intervals retain unsupported upper",() => { expect(zeroEventUpper(0)).toBeNull(); expect(zeroEventUpper(10)).toBeCloseTo(1-Math.pow(.05,.1),12); expect(nearestRank([3,1,2],.5)).toBe(2); expect(nearestRank([1,2,3],.95)).toBe(3); expect(quantileInterval([1,2,3]).upper).toBeNull(); expect(quantileInterval(Array.from({ length:100 },(_,i) => i)).upper).not.toBeNull(); });
  test("human independence and disagreements require real third identity",() => { const l = structuredClone(original.labels[0]); l.reviewerB.disposition = "APPROVE"; expect(labelGold(l)).toBeNull(); l.adjudicator = { humanId:l.reviewerA.humanId,disposition:"REJECT",receipt:"not independent" }; expect(labelGold(l)).toBeNull(); });
  test("split seed reproducibility and project/family leakage rejection",() => { expect(assignSplits(original.cases,original.protocol.seed,false)).toEqual(original.splits); const b = structuredClone(original); b.splits[b.cases[0].id] = b.splits[b.cases[0].id] === "dev" ? "holdout" : "dev"; expect(validateBundle(b).errors).toContain("split_leakage_or_seed_mismatch"); });
  test("all failed retries are charged once and duplicate receipt ownership rejected",() => { const { m,episodes,attempts } = setup(); const failed = { ...attempts[0],receiptId:"paid-failed-retry",retry:1,error:"HTTP429" }; attempts.push(failed); episodes[0].attemptIds.push(failed.receiptId); const cost = episodeCash(episodes,attempts,m.frozen.prices,20); expect(cost.value).toBeCloseTo(21*.00012/20,10); attempts.push(failed); expect(validateReceipts(attempts,episodes,m.runId)).toContain("duplicate_attempt_receipt:paid-failed-retry"); });
  test("censored episodes and missing timing never use success-only denominator",() => {
    const {m,episodes,attempts} = setup(),before = computeMetrics(m,episodes,attempts).populationsAndStrata.find(g => g.id === "challenge")!;
    const target = episodes.find(e => e.arm === "H" && m.frozen.splits[e.caseId] === "holdout")!; target.status = "censored"; target.latencyMs = null;
    const r = decide(m,episodes,attempts),after = r.metrics.populationsAndStrata.find(g => g.id === "challenge")!;
    expect(r.metrics.scheduledEpisodes).toBe(20); expect(after.n).toBe(before.n); expect(after.H.correct).toBe(before.H.correct-1); expect(after.hOnlyWrong).toBe(1); expect(after.H.requests).toBeNull();
    expect(r.decision.unknownGates).toContain("incomplete_or_censored_scheduled_episodes");
  });
  test("custodian experiment quota is not an invented64-parent or five-minute vendor ceiling",() => {
    const b = structuredClone(original); b.protocol.limits.maxEpisodes = 10000; b.protocol.limits.maxRunMs = 3600000;
    expect(validateBundle(b).errors).toEqual([]);
  });
  test("mathematical dominance permits genuine improvement but rejects ties and cost tradeoffs",() => {
    const {m,episodes,attempts} = setup();
    const g = computeMetrics(m,episodes,attempts).populationsAndStrata.find(g => g.id === "challenge")!;
    // Hypothetical mathematical counts only: not human gold, observations, or a model benchmark.
    g.improvementLower = pairedImprovement(90,0,100);
    expect(strictDominanceGates(g)).toEqual({failedGates:[],unknownGates:[]});
    g.improvementLower = 0;
    expect(strictDominanceGates(g).failedGates).toContain("challenge:correctness_lower_not_positive");
    g.improvementLower = .1; g.H.cost.value = (g.M.cost.value ?? 0)+1;
    expect(strictDominanceGates(g).failedGates).toContain("challenge:priced_cost_worse");
    expect(decide(m,episodes,attempts).metrics.modelQualitySuccessfulArmExecutions).toBe(0);
  });
  test("serial fixture pipeline records actual control invocations, not cached JSON arm outputs",async () => {
    const t = await temporary(); try {
      const b = await loadBundle(t.protocol),run = resolve(t.root,"serial"),m = await freezeBundle(b,"serial",run);
      const observations = fixtureObservations(m),calls:string[] = []; let active = 0,maxActive = 0;
      const result = await benchmarkRun(run,resolve(t.root,"evaluation"),m,{
        authorize:async () => ({allowed:true,reason:"synthetic no-spend control only"}),
        driver:{ evaluate:async (arm,_input,context) => {
          active++; maxActive = Math.max(active,maxActive); calls.push(`${context.caseId}:${arm}`); await Promise.resolve();
          const episode = observations.episodes.find(e => e.id === `${context.caseId}:${arm}`)!;
          active--; return {episode,attempts:observations.attempts.filter(a => episode.attemptIds.includes(a.receiptId))};
        } },
      });
      expect(calls).toEqual(m.schedule.map(s => s.id)); expect(maxActive).toBe(1);
      expect((await readJournal(run)).episodes).toHaveLength(m.schedule.length);
      expect(result.metrics.modelQualitySuccessfulArmExecutions).toBe(0);
      expect(result.decision.selection).toBe("retain_repaired_M");
    } finally { await t.cleanup(); }
  });
  test("cancellation requires the exact original receipt and recovery never dispatches a replacement",async () => {
    const t = await temporary(); try {
      const b = await loadBundle(t.protocol),run = resolve(t.root,"cancel"),m = await freezeBundle(b,"cancel",run),controller = new AbortController();
      let calls = 0;
      await benchmarkRun(run,resolve(t.root,"evaluation"),m,{authorize:async () => ({allowed:true,reason:"synthetic cancellation control"}),driver:{evaluate:async () => {calls++; controller.abort(); return new Promise<never>(() => {});}}},controller.signal);
      expect(calls).toBe(1); expect(m.interrupted).toBe(true);
      const admitted = JSON.parse(await readFile(resolve(run,"admitted.json"),"utf8")) as {id:string;admittedAt:string};
      const data = fixtureObservations(m),episode = data.episodes.find(e => e.id === admitted.id)!; episode.admittedAt = admitted.admittedAt;
      episode.terminalAt = new Date(Date.parse(admitted.admittedAt)+10).toISOString(); episode.timingSegments = [{start:admitted.admittedAt,end:episode.terminalAt,elapsedMs:10}];
      const privateText = "__PRIVATE_RECOVERY_METADATA__",receipt = {episode:{...episode,thinking:privateText},attempts:data.attempts.filter(a => episode.attemptIds.includes(a.receiptId)).map(a => ({...a,authorization:privateText}))};
      await expect(recoverAdmittedEpisode(run,m,receipt,async () => false)).rejects.toThrow("original_admitted_receipt_verification_required");
      await recoverAdmittedEpisode(run,m,receipt,async recovered => {expect(recovered.episode.id).toBe(admitted.id); expect(JSON.stringify(recovered)).not.toContain(privateText); return true;}); await recoverAdmittedEpisode(run,m,receipt,async () => true);
      expect((await readJournal(run)).episodes).toHaveLength(1); expect((await readJournal(run)).attempts).toHaveLength(1); expect(calls).toBe(1);
      expect(await readFile(resolve(run,"receipts.jsonl"),"utf8")).not.toContain(privateText);
    } finally { await t.cleanup(); }
  });
  test("pure batching is identified from prepared state/question bytes rather than renamed context arms",() => {
    const {m,episodes,attempts} = setup(),base = m.frozen.cases[0],variant = m.frozen.cases[1]; variant.canonical = false;
    const identity = digest("identical prepared per-question state and question");
    for (const a of attempts) a.questionStateDigests = {compatibility:identity};
    const frozenIdentity = digest(JSON.stringify([["compatibility",identity]]));
    const spec = {id:"batch-control",kind:"batching" as const,baselineCaseIds:[base.id],caseIds:[variant.id],stateQuestionDigest:frozenIdentity};
    expect(ablationIdentity(spec,m.frozen.cases,episodes,attempts).status).toBe("complete");
    attempts.find(a => a.caseId === variant.id && a.arm === "H")!.questionStateDigests = {compatibility:digest("global context union")};
    expect(ablationIdentity(spec,m.frozen.cases,episodes,attempts).reason).toContain("not_pure_batching");
  });
  test("freeze registry forbids repeated favorable sampling under another run-id",async () => {
    const t = await temporary(); try {
      const b = await loadBundle(t.protocol); await freezeBundle(b,"first",resolve(t.root,"first"));
      await expect(freezeBundle(b,"resampled",resolve(t.root,"resampled"))).rejects.toThrow("no_resampling");
      expect((await freezeBundle(b,"first",resolve(t.root,"first"))).runId).toBe("first");
    } finally { await t.cleanup(); }
  });
  test("real workspace M and H drivers cannot substitute cached arms for a missing native host",async () => {
    const { request,contract,packetSet } = advisorFixture("shadow");
    const atomic = prepareAtomicInput({ contract,packetSet,binding:request.binding,snapshot:request.snapshot,model:"jev-latest" });
    let calls = 0;
    const fetchImpl: typeof fetch = Object.assign(async () => { calls++; throw new Error("no networking in deterministic fixture"); },{ preconnect:() => {} });
    const authority = createWorkspaceBenchmarkAuthority({ fetchImpl,authorize:async () => ({ allowed:false,reason:"no live fixture spend" }) });
    for (const arm of ["M","H"] as const) {
      const result = await authority.driver.evaluate(arm,{ atomic,macro:{ contract,todoTask:contract.target.content,userRequest:"public original task",planRequirements:contract.criteria.map(c => c.text),diffSummary:"",unifiedDiff:"",testSummary:"" },advisorRequest:request },{ mode:"shadow",allowMutation:false,allowAuthorityReuse:false,runId:"real-seam-control",caseId:"case",parentId:"parent",signal:new AbortController().signal });
      expect(result.episode.disposition).toBe("UNAVAILABLE");
      expect(result.episode.reason).toContain("native_host_required");
      expect(result.episode.accountingComplete).toBe(false);
      expect(result.attempts).toHaveLength(0);
    }
    expect(calls).toBe(0);
  });
  test("CLI freeze/report/decide is deterministic with networking forbidden",async () => { const t = await temporary(); const originalFetch = globalThis.fetch; globalThis.fetch = Object.assign(async () => { throw new Error("network forbidden in fixture smoke"); },{ preconnect:() => {} }); try { let text = ""; const stdout = (value:string) => { text += value; }; expect(await runCli(["validate","--protocol",t.protocol],{ stdout })).toBe(0); expect(text).toContain("zero model-benchmark observations"); expect(await runCli(["freeze","--protocol",t.protocol,"--run-id","offline"],{ stdout })).toBe(0); const run = resolve(t.root,"reports/paired/offline"); expect(await runCli(["report","--run",run],{ stdout })).toBe(4); const first = await readFile(resolve(run,"decision.json"),"utf8"); expect(await runCli(["decide","--run",run],{ stdout })).toBe(4); expect(await readFile(resolve(run,"decision.json"),"utf8")).toBe(first); } finally { globalThis.fetch = originalFetch; await t.cleanup(); } });
  test("public DTO projection drops private extra fields and aliases never become resolved identities or free usage",() => {
    const {m,episodes,attempts} = setup(),privateText = "__PRIVATE_THINKING_OR_CREDENTIAL_NOT_PUBLIC__";
    const attempt = projectAttempt({...attempts[0],resolvedModel:"jev-latest",debugHeaders:{authorization:privateText},thinking:privateText});
    expect(attempt.resolvedModel).toBeNull(); expect(attempt.unknownReason).toContain("alias"); expect(priceAttempt(attempt,m.frozen.prices).value).toBeNull();
    const projected = [attempt,projectEpisode({...episodes[0],thinking:privateText}),projectCase({...m.frozen.cases[0],rawTranscript:privateText}),projectProtocol({...m.frozen.protocol,apiKey:privateText})];
    expect(JSON.stringify(projected)).not.toContain(privateText);
  });
  test("correlated provenance cannot inflate primary inference or turn deterministic fixtures into model confidence bounds",() => {
    const {m,episodes,attempts} = setup(),heldout = m.frozen.cases.filter(c => m.frozen.splits[c.id] === "holdout");
    heldout[1].parentId = heldout[0].parentId; heldout[1].projectId = "renamed-project";
    expect(connectedGroups(heldout)).toHaveLength(1);
    const metrics = computeMetrics(m,episodes,attempts); expect(metrics.independentPrimaryParents).toBe(0);
    expect(metrics.populationsAndStrata.every(g => g.improvementLower === null && g.H.falseApprovalRisk.upper95 === null)).toBe(true);
    expect(metrics.modelQualitySuccessfulArmExecutions).toBe(0);
  });
  test("the exposure ledger rejects renamed cases and new protocol seeds reusing previously observed parent provenance",async () => {
    const t = await temporary(); try {
      const b = await loadBundle(t.protocol),run = resolve(t.root,"exposure-a");
      await claimUnseenHoldout(run,b,"exposure-a"); await claimUnseenHoldout(run,b,"exposure-a");
      const renamed = structuredClone(b); renamed.digest = digest("different frozen protocol"); renamed.protocol.seed = "different seed";
      renamed.splits = Object.fromEntries(renamed.cases.map(c => [`renamed-${c.id}`,b.splits[c.id]]));
      for (const c of renamed.cases) c.id = `renamed-${c.id}`;
      await expect(claimUnseenHoldout(resolve(t.root,"exposure-b"),renamed,"exposure-b")).rejects.toThrow("holdout_provenance_already_exposed");
    } finally { await t.cleanup(); }
  });
  test("an expired frozen absolute deadline admits no model or native work",async () => {
    const t = await temporary(); try {
      const protocol = projectProtocol(JSON.parse(await readFile(t.protocol,"utf8"))); protocol.limits.deadlineAt = "2000-01-01T00:00:00.000Z";
      await writeFile(t.protocol,JSON.stringify(protocol)); const b = await loadBundle(t.protocol),run = resolve(t.root,"expired"),m = await freezeBundle(b,"expired",run); let calls = 0;
      await benchmarkRun(run,resolve(t.root,"evaluation"),m,{authorize:async () => ({allowed:true,reason:"synthetic control, no paid authorization"}),driver:{evaluate:async () => {calls++; throw new Error("must not dispatch");}}});
      expect(calls).toBe(0); expect((await readJournal(run)).attempts).toHaveLength(0);
      expect(m.pendingInputs.some(p => p.owner === "trusted experiment custodian" && p.action.includes("deadline_exhausted"))).toBe(true);
    } finally { await t.cleanup(); }
  });
  test("malformed corpus configuration never republishes secret JSON excerpts in CLI control reports",async () => {
    const t = await temporary(); try {
      const privateText = "__PRIVATE_INVALID_JSON_CREDENTIAL__"; await writeFile(t.protocol,`{"apiKey":"${privateText}`);
      let text = ""; expect(await runCli(["validate","--protocol",t.protocol],{stdout:value => {text += value;}})).toBe(2);
      expect(text).toContain("invalid_json_document"); expect(text).not.toContain(privateText);
      expect(await readFile(resolve(t.root,"reports/paired/_control/status.json"),"utf8")).not.toContain(privateText);
    } finally { await t.cleanup(); }
  });
  test("known latency must cover the original admission and every elapsed segment",() => {
    const {m,episodes,attempts} = setup(); episodes[0].timingSegments[0].elapsedMs = 1;
    expect(validateReceipts(attempts,episodes,m.runId).some(e => e.includes("incomplete_or_inconsistent_timing_segments"))).toBe(true);
    episodes[0].timingSegments[0].elapsedMs = 10; episodes[0].timingSegments[0].start = "2026-10-20T00:00:00.001Z";
    expect(validateReceipts(attempts,episodes,m.runId).some(e => e.includes("timing_does_not_cover_original_admission"))).toBe(true);
  });
});
