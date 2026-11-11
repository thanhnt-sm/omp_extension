import { createHash } from "node:crypto";
import { afterEach, describe, expect, test } from "bun:test";
import { buildJudgeEvidencePacketSet, type JudgeEvidencePacket, type SystemOneImageAsset } from "../src/judge-evidence-packet";
import { readImageDimensions, SYSTEM_ONE_IMAGE_LIMITS, verifyVisualAssetsForSend } from "../src/visual-evidence-send-guard";
import { buildJpeg, buildJpegWithoutSof, buildPng, createUiRepo, type UiRepo } from "./helpers/visual-evidence-fixture";

const repos: UiRepo[] = [];
afterEach(async () => { await Promise.all(repos.splice(0).map((repo) => repo.dispose())); });
const OUT_OF_RANGE = "VISUAL_EVIDENCE_DIMENSIONS_OUT_OF_RANGE";
const UNREADABLE = "VISUAL_EVIDENCE_DIMENSIONS_UNREADABLE";

async function packetSetFor(image: Buffer, mimeType: string) {
  const repo = await createUiRepo({}); repos.push(repo);
  const { contract, evidence } = repo;
  return buildJudgeEvidencePacketSet({ contract, evidence, selections: [repo.selection], visualEvidence: { imageBase64: image.toString("base64"), mimeType } });
}

describe("readImageDimensions: dependency-free PNG/JPEG header parsing", () => {
  test("PNG IHDR and JPEG SOF carry the declared width and height", () => {
    expect(readImageDimensions(buildPng({ width: 300, height: 400 }), "png")).toEqual({ width: 300, height: 400 });
    expect(readImageDimensions(buildJpeg(undefined, 640, 480), "jpeg")).toEqual({ width: 640, height: 480 });
  });
  test("JPEG scan skips DHT (C4) and padding segments before the SOF", () => {
    expect(readImageDimensions(buildJpeg(100_000, 500, 300), "jpeg")).toEqual({ width: 500, height: 300 });
  });
  test("truncated PNG, wrong signature, format mismatch and SOF-less JPEG are unreadable", () => {
    const png = buildPng();
    expect(readImageDimensions(png.subarray(0, 20), "png")).toBeUndefined();
    expect(readImageDimensions(Buffer.concat([Buffer.from("not-a-png-at-all-1234567"), png.subarray(24)]), "png")).toBeUndefined();
    expect(readImageDimensions(png, "jpeg")).toBeUndefined();
    expect(readImageDimensions(buildJpeg(), "png")).toBeUndefined();
    expect(readImageDimensions(buildJpegWithoutSof(), "jpeg")).toBeUndefined();
    expect(readImageDimensions(buildJpeg().subarray(0, 95), "jpeg")).toBeUndefined();
    expect(readImageDimensions(Buffer.alloc(0), "png")).toBeUndefined();
  });
  test("limits constant matches the provider observation", () => {
    expect(SYSTEM_ONE_IMAGE_LIMITS).toEqual({ minSide: 280, maxSide: 1568, minPixels: 78_400, maxPixels: 2_458_624 });
  });
});

describe("packet build: in-range images pass", () => {
  const cases: Array<[string, () => Buffer, string, string]> = [
    ["PNG 280x280 (exact floor)", () => buildPng(), "image/png", "png"],
    ["PNG 1568x300 (exact max side)", () => buildPng({ width: 1568, height: 300 }), "image/png", "png"],
    ["JPEG 640x480", () => buildJpeg(undefined, 640, 480), "image/jpeg", "jpeg"],
    ["JPEG 280x280 (exact floor)", () => buildJpeg(), "image/jpeg", "jpeg"],
  ];
  for (const [label, make, mime, format] of cases) test(`${label}: asset is built and no dimension reason appears`, async () => {
    const image = make();
    const set = await packetSetFor(image, mime);
    expect(set.reasons).toEqual([]);
    expect(set.ok).toBe(true);
    expect(set.assetPayload?.ui_visual_evidence).toEqual({ type: "image", format: format as "png" | "jpeg", data_base64: image.toString("base64") });
  });
});

describe("packet build: out-of-range or unreadable images give EVIDENCE_REQUIRED and no asset", () => {
  const cases: Array<[string, () => Buffer, string, string, string]> = [
    ["256x256 PNG (under the 78,400 px floor)", () => buildPng({ size: 256 }), "image/png", OUT_OF_RANGE, "256x256"],
    ["279 px wide PNG", () => buildPng({ width: 279, height: 400 }), "image/png", OUT_OF_RANGE, "279x400"],
    ["1569 px tall PNG", () => buildPng({ width: 300, height: 1569 }), "image/png", OUT_OF_RANGE, "300x1569"],
    ["JPEG 1569 px wide", () => buildJpeg(undefined, 1569, 300), "image/jpeg", OUT_OF_RANGE, "1569x300"],
    ["256x256 JPEG", () => buildJpeg(undefined, 256, 256), "image/jpeg", OUT_OF_RANGE, "256x256"],
    ["truncated PNG header", () => buildPng().subarray(0, 20), "image/png", UNREADABLE, ""],
    ["JPEG with no SOF", () => buildJpegWithoutSof(), "image/jpeg", UNREADABLE, ""],
    ["JPEG bytes declared as PNG", () => buildJpeg(), "image/png", UNREADABLE, ""],
  ];
  for (const [label, make, mime, code, observed] of cases) test(`${label}: ${code}${observed ? ` with observed ${observed}` : ""}`, async () => {
    const set = await packetSetFor(make(), mime);
    expect(set.ok).toBe(false);
    expect(set.status).toBe("EVIDENCE_REQUIRED");
    const reason = set.reasons.find((item) => item.startsWith(code));
    expect(reason, JSON.stringify(set.reasons)).toBeDefined();
    if (observed) expect(reason).toContain(observed);
    expect(set.assetPayload).toBeUndefined();
  });
});

describe("send guard: re-checks dimensions on the bytes that would be sent", () => {
  const packetFor = (bytes: Buffer, format: "png" | "jpeg"): Pick<JudgeEvidencePacket, "visualAssets"> => ({ visualAssets: [{ key: "ui_visual_evidence", format, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }] });
  const payloadFor = (bytes: Buffer, format: "png" | "jpeg"): Record<string, SystemOneImageAsset> => ({ ui_visual_evidence: { type: "image", format, data_base64: bytes.toString("base64") } });

  test("metadata and bytes agree but the size is out of range: rejected, no assets returned", () => {
    const small = buildPng({ size: 256 });
    const check = verifyVisualAssetsForSend(packetFor(small, "png"), payloadFor(small, "png"));
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reasons.join(" ")).toContain(`${OUT_OF_RANGE}:ui_visual_evidence:256x256`);
  });
  test("truncated header with matching digest: rejected as unreadable", () => {
    const truncated = buildPng().subarray(0, 20);
    const check = verifyVisualAssetsForSend(packetFor(truncated, "png"), payloadFor(truncated, "png"));
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reasons.join(" ")).toContain(`${UNREADABLE}:ui_visual_evidence`);
  });
  test("in-range PNG and JPEG pass and return a private copy", () => {
    for (const [bytes, format] of [[buildPng(), "png"], [buildJpeg(), "jpeg"]] as const) {
      const payload = payloadFor(bytes, format);
      const check = verifyVisualAssetsForSend(packetFor(bytes, format), payload);
      expect(check.ok).toBe(true);
      if (check.ok) { expect(check.assets).toEqual(payload); expect(check.assets).not.toBe(payload); }
    }
  });
});
