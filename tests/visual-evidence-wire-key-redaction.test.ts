import { createRequire } from "node:module";
import { describe, expect, test } from "bun:test";
import { runPhaseMacroCheck, VISUAL_EVIDENCE_QUESTION_KEY, VISUAL_WIRE_ASSET_KEY, type ExpertJudgeClient, type MacroCheckContext } from "../src/cook-expert-judge";
import { createSemanticApprovalPolicy } from "../src/semantic-approval-policy";
import { digestBytes } from "../src/evidence-workspace";
import { verifyVisualAssetsForSend } from "../src/visual-evidence-send-guard";
import type { SystemOneImageAsset } from "../src/judge-evidence-packet";
import type { TaskContract } from "../src/types/verification";
import { buildPng } from "./helpers/visual-evidence-fixture";

interface Api { prepareRequest(args: Record<string, unknown>, policy: unknown, options: Record<string, unknown>): { ok: boolean; code?: string; body: string } }
const require_ = createRequire(import.meta.url);
const api = require_("../src/typesafe-api-client.cjs") as Api;
const policy = (require_("../src/typesafe-policy-client.cjs") as { resolveTrustedToolPolicy(purpose: string): unknown }).resolveTrustedToolPolicy("native_done");
const approvalPolicy = createSemanticApprovalPolicy({});
const SEEDS = 64;

const contract = { target: { content: "Deliver Button", phase: "UI" }, taskKind: "implementation", criteria: [{ id: "c0", kind: "acceptance", text: "criterion 0" }] } as unknown as TaskContract;
/** Distinct pixel content per seed, so every image hashes differently. */
const imageForSeed = (seed: number): SystemOneImageAsset => ({ type: "image", format: "png", data_base64: buildPng({ background: [seed, (seed * 7) % 256, (seed * 13) % 256], redSquare: seed % 2 === 0 }).toString("base64") });
const ctxFor = (asset: SystemOneImageAsset): MacroCheckContext => ({ todoTask: "Deliver Button", planRequirements: [], diffSummary: "M src/button.tsx", unifiedDiff: "+x", testSummary: "ok", contract, visualAssets: { ui_visual_evidence: asset } });

describe("visual wire asset key survives redaction", () => {
  test("the key is the fixed low-entropy name", () => {
    expect(VISUAL_WIRE_ASSET_KEY).toBe("ui_visual_evidence");
  });

  test(`${SEEDS} distinct images: the redacted visual question still names the exact asset key, and it equals the assets-map key`, async () => {
    const hashes = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed++) {
      const asset = imageForSeed(seed);
      hashes.add(digestBytes(Buffer.from(asset.data_base64, "base64")));
      let captured: Record<string, unknown> | undefined;
      const client: ExpertJudgeClient = { async evaluate(request) { captured = request as unknown as Record<string, unknown>; return { error: "stop" }; } };
      await runPhaseMacroCheck(ctxFor(asset), client, { approvalPolicy });
      const assets = captured!.assets as Record<string, SystemOneImageAsset>;
      const [key] = Object.keys(assets);
      expect(Object.keys(assets), `seed ${seed}`).toHaveLength(1);
      expect(assets[key]).toEqual(asset);
      const prepared = api.prepareRequest(captured!, policy, { apiKey: "synthetic-private-test-key" });
      expect(prepared.ok, `seed ${seed}: ${prepared.code}`).toBe(true);
      const body = JSON.parse(prepared.body) as { assets: Record<string, unknown>; questions: Record<string, { instructions: string }> };
      const wireKey = Object.keys(body.assets)[0];
      expect(wireKey, `seed ${seed}`).toBe(key);
      const text = body.questions[VISUAL_EVIDENCE_QUESTION_KEY].instructions;
      expect(text, `seed ${seed}`).toContain(wireKey);
      expect(text, `seed ${seed}`).not.toContain("[REDACTED");
    }
    expect(hashes.size).toBe(SEEDS);
  });
});

describe("image identity stays bound by sha256 in the send guard", () => {
  const red = buildPng({ redSquare: true, padToBytes: 5000 });
  const blue = buildPng({ blueCircle: true, padToBytes: 5000 });
  const metadata = (bytes: Buffer) => [{ key: "ui_visual_evidence", format: "png" as const, bytes: bytes.length, sha256: digestBytes(bytes) }];

  test("matching bytes pass", () => {
    const result = verifyVisualAssetsForSend({ visualAssets: metadata(red) }, { ui_visual_evidence: { type: "image", format: "png", data_base64: red.toString("base64") } });
    expect(result.ok).toBe(true);
  });

  test("same-size different image (sha256 mismatch) is rejected", () => {
    expect(red.length).toBe(blue.length);
    const result = verifyVisualAssetsForSend({ visualAssets: metadata(red) }, { ui_visual_evidence: { type: "image", format: "png", data_base64: blue.toString("base64") } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toContain("VISUAL_ASSET_SHA256_MISMATCH:ui_visual_evidence");
  });
});
