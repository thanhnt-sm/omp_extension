import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { detectUIVisualEvidence, type TaskEvidenceRecord } from "../src/task-evidence-runtime";
import { buildJudgeEvidencePacketSet, type JudgeEvidencePacketSetResult } from "../src/judge-evidence-packet";
import { taskRecoveryProgress, stateProgressDigest } from "../src/task-verification-state";
import { buildJpeg, buildPng, createUiRepo, type UiRepo } from "./helpers/visual-evidence-fixture";

const PACKET_LIMIT = 32_768;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const repos: UiRepo[] = [];
afterEach(async () => { await Promise.all(repos.splice(0).map((repo) => repo.dispose())); });
async function repoWith(binaries: Record<string, Buffer>): Promise<UiRepo> { const repo = await createUiRepo(binaries); repos.push(repo); return repo; }
/** Same sequence as TaskEvidenceRuntime.collect: collect -> detect (read-scope aware) -> packet set with curated selection. */
function pipeline(repo: UiRepo): { visual: ReturnType<typeof detectUIVisualEvidence>; set: JudgeEvidencePacketSetResult } {
  const { evidence, contract } = repo;
  const visual = detectUIVisualEvidence(evidence.changedFiles, evidence.sourceEvidence, evidence.snapshot, contract.allowedMutationScope.paths);
  const set = buildJudgeEvidencePacketSet({ contract, evidence, selections: [repo.selection], visualEvidence: visual });
  return { visual, set };
}

describe("real git-tree visual evidence: collect -> detect -> packet set", () => {
  for (const [label, bytes, mime, format] of [
    ["PNG 100 KB", () => buildPng({ padToBytes: 100_000, redSquare: true }), "image/png", "png"],
    ["PNG ~900 KB", () => buildPng({ padToBytes: 900_000, redSquare: true }), "image/png", "png"],
    ["JPEG 100 KB", () => buildJpeg(100_000), "image/jpeg", "jpeg"],
  ] as const) {
    test(`${label}: sha256 metadata matches bytes, assetPayload present, packet stays within ${PACKET_LIMIT} bytes`, async () => {
      const image = bytes();
      const repo = await repoWith({ [`assets/ui.${format === "jpeg" ? "jpg" : "png"}`]: image });
      expect(repo.evidence.changedFiles).toContain("src/button.tsx");
      const { visual, set } = pipeline(repo);
      expect(visual?.mimeType).toBe(mime);
      expect(set.reasons).toEqual([]);
      expect(set.ok).toBe(true);
      const asset = set.assetPayload?.ui_visual_evidence;
      expect(asset).toEqual({ type: "image", format, data_base64: image.toString("base64") });
      const packet = set.packets[0].packet;
      expect(packet.visualAssets).toEqual([{ key: "ui_visual_evidence", format, bytes: image.length, sha256: sha256(image) }]);
      expect(Buffer.byteLength(JSON.stringify(packet), "utf8")).toBeLessThanOrEqual(PACKET_LIMIT);
      expect(JSON.stringify(packet)).not.toContain(image.toString("base64").slice(100, 400));
      // The image is an asset, never packet source: no binary source reaches the judge-visible packet.
      expect(packet.source.map((item) => item.path)).toEqual(["src/button.tsx"]);
    });
  }

  test("PNG over 1 MiB gives EVIDENCE_REQUIRED and no asset is ever sent", async () => {
    const repo = await repoWith({ "assets/huge.png": buildPng({ padToBytes: 1_048_576 + 4096 }) });
    expect(repo.evidence.evidenceStatus).toBe("EVIDENCE_REQUIRED");
    const { set } = pipeline(repo);
    expect(set.ok).toBe(false);
    expect(set.status).toBe("EVIDENCE_REQUIRED");
    expect(set.assetPayload).toBeUndefined();
    expect(set.packets).toEqual([]);
  });

  test("image exhausting the cumulative 1 MiB source budget gives EVIDENCE_REQUIRED and no asset", async () => {
    const repo = await repoWith({ "assets/a.png": buildPng({ padToBytes: 600_000 }), "assets/b.png": buildPng({ padToBytes: 600_000, redSquare: true }) });
    expect(repo.evidence.omissions?.some((item) => item.reason === "FULL_SOURCE_BYTE_LIMIT" && item.required)).toBe(true);
    const { set } = pipeline(repo);
    expect(set.ok).toBe(false);
    expect(set.status).toBe("EVIDENCE_REQUIRED");
    expect(set.reasons).toContain("FULL_SOURCE_BYTE_LIMIT");
    expect(set.assetPayload).toBeUndefined();
  });

  test("an image at a private evidence path is never selected, even when it sorts first and is in read scope", async () => {
    const privateImage = buildPng({ padToBytes: 50_000 });
    const publicImage = buildPng({ padToBytes: 60_000, redSquare: true });
    const repo = await repoWith({ "assets/history/a.png": privateImage, "assets/ui.png": publicImage });
    const { visual, set } = pipeline(repo);
    expect(repo.evidence.sourceEvidence?.map((item) => item.path)).toContain("assets/history/a.png");
    expect(visual?.imageBase64).toBe(publicImage.toString("base64"));
    expect(set.assetPayload?.ui_visual_evidence.data_base64).toBe(publicImage.toString("base64"));
    const onlyPrivate = await repoWith({ "assets/history/a.png": privateImage });
    expect(pipeline(onlyPrivate).visual).toBeUndefined();
    expect(pipeline(onlyPrivate).set.assetPayload).toBeUndefined();
  });

  test("an image outside the approved read scope is never selected", async () => {
    const repo = await repoWith({ "assets/ui.png": buildPng({ padToBytes: 50_000 }) });
    const { evidence } = repo;
    expect(detectUIVisualEvidence(evidence.changedFiles, evidence.sourceEvidence, evidence.snapshot, ["src/**"])).toBeUndefined();
    expect(detectUIVisualEvidence(evidence.changedFiles, evidence.sourceEvidence, evidence.snapshot, ["assets/**", "src/**"])).toBeDefined();
  });
});

describe("persistence boundary and retry-gate digest", () => {
  const stubRecord = (repo: UiRepo, set: JudgeEvidencePacketSetResult) => ({ contract: repo.contract, packetSet: set, provenance: { cwd: repo.cwd }, sourceContext: { taskSource: { text: "" } }, verificationReceipt: undefined }) as unknown as TaskEvidenceRecord;

  test("base64 is absent from every serializable projection (manifest, packets, recovery progress); only assetPayload holds it", async () => {
    const image = buildPng({ padToBytes: 80_000, redSquare: true });
    const repo = await repoWith({ "assets/ui.png": image });
    const { set } = pipeline(repo);
    const probe = image.toString("base64").slice(200, 400);
    expect(set.assetPayload?.ui_visual_evidence.data_base64).toContain(probe);
    for (const projection of [set.manifest, set.packets, taskRecoveryProgress(stubRecord(repo, set)), set.reasons]) expect(JSON.stringify(projection)).not.toContain(probe);
  });

  test("the unchanged-evidence retry gate changes when image bytes change, and stays stable when they do not", async () => {
    const make = async (image: Buffer) => { const repo = await repoWith({ "assets/ui.png": image }); return stubRecord(repo, pipeline(repo).set); };
    const red = buildPng({ redSquare: true }); const plain = buildPng();
    const [a, a2, b] = [await make(red), await make(red), await make(plain)];
    expect(stateProgressDigest(a)).toBe(stateProgressDigest(a2));
    expect(stateProgressDigest(a)).not.toBe(stateProgressDigest(b));
  }, 30_000); // builds three real git repos; the 5s default is too tight for Windows git spawn

  test("only allow-listed modules handle the raw image payload (nothing that persists or serializes sessions)", () => {
    const root = path.resolve(import.meta.dir, "..");
    const files = [...readdirSync(path.join(root, "src")).filter((name) => /\.(?:ts|cjs)$/.test(name)).map((name) => path.join("src", name)), "typesafe-planner.ts"];
    const holders = files.filter((file) => /\b(?:assetPayload|imageBase64|data_base64)\b/.test(readFileSync(path.join(root, file), "utf8"))).map((file) => file.replace(/\\/g, "/")).sort();
    // Evidence build/detect, macro send path and its guard, the HTTP transport, and the planner's param type. None writes session entries.
    // The M question builder (cook-expert-judge.ts) no longer reads the bytes: the wire key is the fixed `ui_visual_evidence`, not a content hash.
    expect(holders).toEqual(["src/judge-evidence-packet.ts", "src/task-evidence-runtime.ts", "src/task-verification-macro.ts", "src/typesafe-api-client.cjs", "src/visual-evidence-send-guard.ts", "typesafe-planner.ts"]);
  });
});
