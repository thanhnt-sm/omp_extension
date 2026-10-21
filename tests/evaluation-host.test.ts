import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { resolve } from "node:path";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createEvaluationHost } from "../src/evaluation-host";
import { createPairedReviewDriver } from "../src/atomic-evaluation";
import type { AdvisorHostExecuteContext } from "../src/advisor-host-types";
import { createSemanticApprovalPolicy } from "../src/semantic-approval-policy";
import { canonicalDigest } from "../src/task-contract-source";
import { loadBundle } from "../tools/jev-paired-files";
import { fixtureManifest, fixtureObservations } from "./fixtures/jev-paired-evaluation/control";
import { EVALUATION_HOST_PROTOCOL, publicKeyDigest, verifyNativeHostEnvelope, hostFileId, type NativeArmRequest, type NativeHostDescriptor, type NativeHostEnvelope, type NativeHostPayload } from "../tools/jev-paired-host-protocol";
import { checkBenchmarkApprovalPolicy, checkBoundBenchmarkPolicy } from "../tools/jev-paired-workspace";
import { projectNativeArmRequest, projectNativeHostPayload } from "../tools/jev-paired-inputs";
import { readNativeReceiptJournal } from "../tools/jev-paired-host-journal";
import { computeMetrics } from "../tools/jev-paired-metrics";
import { ownsAdvisorHostReview } from "../src/advisor-host";
const context:AdvisorHostExecuteContext = {cwd:resolve(import.meta.dir,".."),agent:{kind:"main",id:"fixture-parent",name:"fixture",depth:0},abort:() => {},sessionManager:{getSessionId:() => "fixture-session",getSessionFile:() => undefined,getHeader:() => null,getBranch:() => []}};
function unavailableHost() {
  let uiCalls = 0,entries = 0;
  const host = createEvaluationHost({createDriver:createPairedReviewDriver,getRegistration:() => undefined,facts:() => ({branchId:"fixture-branch",requestEntryId:"fixture-user",policyDigest:"a".repeat(64),privacyDigest:"b".repeat(64),candidateSourceManifestDigest:"c".repeat(64)}),driverOptions:() => ({approvalPolicy:createSemanticApprovalPolicy({})}),requestHumanApproval:async () => {uiCalls++;return false;},appendEntry:() => {entries++;},projectPublic:value => value});
  return {host,counts:() => ({uiCalls,entries})};
}
describe("native evaluation bridge controls — zero model/native benchmark observations",() => {
  test("a callback-shaped context cannot mint actual host identity or trigger UI/model work without protected registration",async () => {
    const {host,counts} = unavailableHost(); await expect(host.identity(context)).rejects.toThrow("actual_current_native_host_identity_required");
    expect(counts()).toEqual({uiCalls:0,entries:0});
    const result = await host.collect({run:"unprepared",requestId:"invented"},context); expect(result.details).toMatchObject({status:"UNAVAILABLE"}); expect(counts()).toEqual({uiCalls:0,entries:0});
  });
  test("frozen JSON M policy is data, not the actual Root-owned policy or a matched live policy",() => {
    const actual = createSemanticApprovalPolicy({TYPESAFE_AUTO_APPROVAL_THRESHOLD:"80"});
    expect(checkBenchmarkApprovalPolicy(actual,{threshold:.8,comparator:"gte"}).ok).toBe(true);
    expect(checkBenchmarkApprovalPolicy({threshold:.8,comparator:"gte"},{threshold:.8,comparator:"gte"}).ok).toBe(false);
    expect(checkBenchmarkApprovalPolicy(actual,{threshold:.5,comparator:"gt"}).ok).toBe(false);
    expect(checkBoundBenchmarkPolicy(undefined,"not-the-actual-policy").ok).toBe(false);
  });
  test("RPC request schema drops injected tool/result/credential fields instead of treating JSON as native authority",() => {
    const raw = {schemaVersion:1,requestId:"fixture-request",nonce:"fixture-nonce",runId:"fixture-run",bundleDigest:"a".repeat(64),caseId:"fixture-case",arm:"H",inputDigest:"b".repeat(64),protocolPath:"fixture",run:"fixture",createdAt:"2026-10-20T00:00:00.000Z",hostId:"fixture-host",hostKeyDigest:"c".repeat(64),invokeTool:"arbitrary",nativeReceipt:{authority:"task_bound"},apiKey:"PRIVATE_CONTROL"};
    const parsed = projectNativeArmRequest(raw); expect(JSON.stringify(parsed)).not.toContain("PRIVATE_CONTROL"); expect("nativeReceipt" in parsed).toBe(false); expect("invokeTool" in parsed).toBe(false);
  });
  test("signature transport binds nonce/arm/frozen session and detects modifications; synthetic signatures are NOT native proof",async () => {
    const bundle = await loadBundle(resolve(import.meta.dir,"fixtures/jev-paired-evaluation/protocol.json")),manifest = fixtureManifest(bundle),data = fixtureObservations(manifest),episode = data.episodes[0];
    const keys = generateKeyPairSync("ed25519"),publicKey = keys.publicKey.export({format:"pem",type:"spki"}).toString();
    const descriptor:NativeHostDescriptor = {schemaVersion:1,protocolIdentity:EVALUATION_HOST_PROTOCOL,hostId:"synthetic-crypto-host-not-native",publicKey,publicKeyDigest:publicKeyDigest(publicKey),sessionId:"fixture-session",branchId:"fixture-branch",sessionEpoch:"fixture-epoch",loadedFactoryIdentity:"synthetic-crypto-control",candidateSourceManifestDigest:"c".repeat(64)};
    manifest.frozen.protocol.nativeHost = descriptor; episode.advisorReceiptId = "synthetic-transport-record-not-native";
    const request:NativeArmRequest = {schemaVersion:1,requestId:"fixture-request",nonce:"nonce-one",runId:manifest.runId,bundleDigest:manifest.frozen.digest,caseId:episode.caseId,arm:episode.arm,inputDigest:bundle.cases[0].input.sha256,protocolPath:"fixture",run:"fixture",createdAt:episode.admittedAt,hostId:descriptor.hostId,hostKeyDigest:descriptor.publicKeyDigest};
    const payload:NativeHostPayload = {schemaVersion:1,kind:"shadow_evaluation",host:descriptor,requestDigest:canonicalDigest(request),requestId:request.requestId,runId:manifest.runId,bundleDigest:manifest.frozen.digest,freezeCreatedAt:manifest.createdAt,caseId:episode.caseId,arm:episode.arm,episode,attempts:data.attempts.filter(a => episode.attemptIds.includes(a.receiptId)),native:{status:"accepted",requestDigest:"synthetic-only",parentToolCallId:"synthetic-parent",itemIndex:0,childId:"synthetic-child",reportedChildId:null,sessionEpoch:descriptor.sessionEpoch,terminalDigest:"d".repeat(64),terminalEntryIds:["synthetic-terminal"],nativeInvocationObserved:null,sdkAccounting:null,reasonCodes:[]},mutationAllowed:false,authorityReusable:false};
    const bytes = Buffer.from(JSON.stringify(payload)),envelope:NativeHostEnvelope = {schemaVersion:1,payloadBase64:bytes.toString("base64"),signatureBase64:sign(null,bytes,keys.privateKey).toString("base64")};
    expect(verifyNativeHostEnvelope(envelope,request,manifest).episode.id).toBe(episode.id);
    expect(() => verifyNativeHostEnvelope(envelope,{...request,nonce:"different"},manifest)).toThrow("binding_mismatch");
    const changed = {...payload,arm:payload.arm === "M" ? "H" : "M"}; expect(() => verifyNativeHostEnvelope({...envelope,payloadBase64:Buffer.from(JSON.stringify(changed)).toString("base64")},request,manifest)).toThrow("signature_invalid");
    expect(projectNativeHostPayload({...payload,thinking:"PRIVATE_CONTROL"})).not.toHaveProperty("thinking");
    expect(manifest.kind).toBe("deterministic_fixture");
    expect(ownsAdvisorHostReview({request,receipt:payload.native})).toBe(false);
    const directory = await mkdtemp(resolve(tmpdir(),"jev-native-transport-"));
    try {
      const localRequest = {...request,run:directory},localPayload = {...payload,requestDigest:canonicalDigest(localRequest)},localBytes = Buffer.from(JSON.stringify(localPayload));
      const localEnvelope = {schemaVersion:1 as const,payloadBase64:localBytes.toString("base64"),signatureBase64:sign(null,localBytes,keys.privateKey).toString("base64")},id = hostFileId(episode.id);
      await mkdir(resolve(directory,"native-host")); await writeFile(resolve(directory,`native-host/${id}.request.json`),JSON.stringify(localRequest)); await writeFile(resolve(directory,`native-host/${id}.response.json`),JSON.stringify(localEnvelope));
      await writeFile(resolve(directory,"receipts.jsonl"),JSON.stringify({episode:{...episode,disposition:"APPROVE"},attempts:[]})+"\n");
      const original = await readNativeReceiptJournal(directory,manifest); expect(original.episodes[0].disposition).toBe("REJECT");
      expect(computeMetrics(manifest,original.episodes,original.attempts).modelQualitySuccessfulArmExecutions).toBe(0);
      const modified = {...localPayload,episode:{...episode,disposition:"APPROVE"}};
      await writeFile(resolve(directory,`native-host/${id}.response.json`),JSON.stringify({...localEnvelope,payloadBase64:Buffer.from(JSON.stringify(modified)).toString("base64")}));
      await expect(readNativeReceiptJournal(directory,manifest)).rejects.toThrow("signature_invalid");
    } finally {await rm(directory,{recursive:true,force:true});}
  });
});
