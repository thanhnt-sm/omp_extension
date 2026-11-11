import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { captureWorkspaceSnapshot, collectTaskEvidence, type TaskEvidenceResult } from "../src/evidence-collector";
import { buildJudgeEvidencePacket } from "../src/judge-evidence-packet";
import { digestBytes } from "../src/evidence-workspace";
import type { TaskContract } from "../src/types/verification";
import { buildPng } from "./helpers/visual-evidence-fixture";
import { isUIFrontendPath, detectUIVisualEvidence } from "../src/task-evidence-runtime";

const apiClient = require("../src/typesafe-api-client.cjs");
describe("Phase 02: Box Primitive (BoxQuestion) and Visual UI Evidence", () => {
  describe("1. Question Validation for type 'box'", () => {
    test("validates box question with valid non-negative integer image index", () => {
      const valid = apiClient.validateInput({
        state: "UI Screenshot with Login Button",
        questions: {
          q_box: {
            type: "box",
            instructions: "Locate the primary Submit button",
            image: 0,
          },
        },
      });
      expect(valid.ok).toBe(true);
    });

    test("rejects box question when image property is missing", () => {
      const invalid = apiClient.validateInput({
        state: "UI Screenshot",
        questions: {
          q_box: {
            type: "box",
            instructions: "Locate Submit button",
            // image missing
          },
        },
      });
      expect(invalid.ok).toBe(false);
      expect(invalid.code).toBe("invalid_input");
    });

    test("rejects box question when image index is negative or not an integer", () => {
      const negative = apiClient.validateInput({
        state: "UI Screenshot",
        questions: {
          q_box: {
            type: "box",
            instructions: "Locate button",
            image: -1,
          },
        },
      });
      expect(negative.ok).toBe(false);

      const floatIdx = apiClient.validateInput({
        state: "UI Screenshot",
        questions: {
          q_box: {
            type: "box",
            instructions: "Locate button",
            image: 1.5,
          },
        },
      });
      expect(floatIdx.ok).toBe(false);
    });

    test("rejects box question with empty instructions", () => {
      const emptyInst = apiClient.validateInput({
        state: "UI Screenshot",
        questions: {
          q_box: {
            type: "box",
            instructions: "   ",
            image: 0,
          },
        },
      });
      expect(emptyInst.ok).toBe(false);
    });
  });

  describe("2. sanitizeAnswers for type 'box'", () => {
    const questions = {
      target_elem: {
        type: "box",
        instructions: "Locate Submit button",
        image: 0,
      },
    };

    test("sanitizes valid normalized bounding box coordinates and confidence", () => {
      const rawAnswers = {
        target_elem: {
          box: { top: 0.1, bottom: 0.25, left: 0.3, right: 0.6 },
          confidence: 0.98,
        },
      };

      const sanitized = apiClient.sanitizeAnswers(questions, rawAnswers);
      expect(sanitized).not.toBeNull();
      expect(sanitized.target_elem.box).toEqual({
        top: 0.1,
        bottom: 0.25,
        left: 0.3,
        right: 0.6,
      });
      expect(sanitized.target_elem.confidence).toBe(0.98);
    });

    test("rejects inverted bounding box coordinates where top > bottom", () => {
      const invertedY = {
        target_elem: {
          box: { top: 0.8, bottom: 0.2, left: 0.1, right: 0.5 },
          confidence: 0.95,
        },
      };

      const sanitized = apiClient.sanitizeAnswers(questions, invertedY);
      expect(sanitized).toBeNull();
    });

    test("rejects inverted bounding box coordinates where left > right", () => {
      const invertedX = {
        target_elem: {
          box: { top: 0.1, bottom: 0.5, left: 0.9, right: 0.2 },
          confidence: 0.95,
        },
      };

      const sanitized = apiClient.sanitizeAnswers(questions, invertedX);
      expect(sanitized).toBeNull();
    });

    test("rejects coordinates outside normalized unit interval [0, 1]", () => {
      const outOfBounds = {
        target_elem: {
          box: { top: -0.05, bottom: 0.5, left: 0.0, right: 1.2 },
          confidence: 0.9,
        },
      };

      const sanitized = apiClient.sanitizeAnswers(questions, outOfBounds);
      expect(sanitized).toBeNull();
    });

    test("rejects when confidence is missing or not a unit interval", () => {
      const missingConf = {
        target_elem: {
          box: { top: 0.1, bottom: 0.2, left: 0.1, right: 0.2 },
        },
      };
      expect(apiClient.sanitizeAnswers(questions, missingConf)).toBeNull();

      const invalidConf = {
        target_elem: {
          box: { top: 0.1, bottom: 0.2, left: 0.1, right: 0.2 },
          confidence: 1.5,
        },
      };
      expect(apiClient.sanitizeAnswers(questions, invalidConf)).toBeNull();
    });
  });

  describe("3. judgeTypeSafe End-to-End Execution with BoxQuestion", () => {
    test("successfully processes BoxQuestion and parses bounding box response", async () => {
      const mockFetch = async () => {
        return new Response(JSON.stringify({
          answers: {
            button_box: {
              box: { top: 0.42, bottom: 0.48, left: 0.65, right: 0.85 },
              confidence: 0.97,
            },
          },
          model: "jev-latest",
          usage: { total_tokens: 45 },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      };

      const result = await apiClient.judgeTypeSafe({
        apiKey: "ts-box-test-key-1",
        args: {
          model: "jev-latest",
          state: "Screenshot of Settings page",
          questions: {
            button_box: {
              type: "box",
              instructions: "Locate Save Settings button",
              image: 0,
            },
          },
        },
        fetchImpl: mockFetch,
        nowImpl: () => 0,
        wallNowImpl: () => 0,
      });

      expect(result.ok).toBe(true);
      expect(result.answers.button_box.box).toEqual({
        top: 0.42,
        bottom: 0.48,
        left: 0.65,
        right: 0.85,
      });
      expect(result.answers.button_box.confidence).toBe(0.97);
    });
  });

  describe("4. System One Wire Protocol for Assets & BoxQuestion", () => {
    const samplePngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    test("adds 'TypeSafe-Danger-Zone-Images: true' header when assets is non-empty", () => {
      const payload = apiClient.buildSystemOneWirePayload("typesafe", {
        apiKey: "ts-img-key",
        model: "jev-latest",
        state: "Inspect button UI",
        questions: {
          btn_box: { type: "box", instructions: "Locate button", image: 0 },
        },
        assets: {
          img_0: { type: "image", format: "png", data_base64: samplePngBase64 },
        },
      });

      expect(payload.headers["TypeSafe-Danger-Zone-Images"]).toBe("true");
      const parsed = JSON.parse(payload.body);
      expect(parsed.assets).toBeDefined();
      expect(parsed.assets.img_0.type).toBe("image");
      expect(parsed.assets.img_0.format).toBe("png");
      expect(parsed.assets.img_0.data_base64).toBe(samplePngBase64);
    });

    test("strips 'image' index from wire questions for System One BoxQuestion compatibility", () => {
      const payload = apiClient.buildSystemOneWirePayload("typesafe", {
        apiKey: "ts-img-key",
        model: "jev-latest",
        state: "Inspect button UI",
        questions: {
          btn_box: { type: "box", instructions: "Locate button", image: 0 },
          status_noul: { type: "noul", instructions: "Is button clickable?" },
        },
      });

      const parsed = JSON.parse(payload.body);
      expect(parsed.questions.btn_box.type).toBe("box");
      expect(parsed.questions.btn_box.instructions).toBe("Locate button");
      expect(parsed.questions.btn_box.image).toBeUndefined();
      expect(parsed.questions.status_noul.type).toBe("noul");
    });

    test("validateInput accepts valid image assets in arguments", () => {
      const valid = apiClient.validateInput({
        state: "UI state with image",
        questions: {
          btn: { type: "box", instructions: "Locate button", image: 0 },
        },
        assets: {
          img_0: { type: "image", format: "png", data_base64: samplePngBase64 },
        },
      });
      expect(valid.ok).toBe(true);
    });

    test("validateInput rejects malformed assets", () => {
      const invalid1 = apiClient.validateInput({
        state: "UI state",
        questions: { q: { type: "noul", instructions: "Valid" } },
        assets: "invalid-string-assets",
      });
      expect(invalid1.ok).toBe(false);

      const invalid2 = apiClient.validateInput({
        state: "UI state",
        questions: { q: { type: "noul", instructions: "Valid" } },
        assets: {
          img_bad: { type: "audio", format: "mp3", data_base64: "bad" },
        },
      });
      expect(invalid2.ok).toBe(false);

      const invalid3 = apiClient.validateInput({
        state: "UI state",
        questions: { q: { type: "noul", instructions: "Valid" } },
        assets: {
          img_bad_magic: { type: "image", format: "png", data_base64: "QUJDRA==" },
        },
      });
      expect(invalid3.ok).toBe(false);
    });

    test("prepareRequest preserves assets in prepared payload", () => {
      const prepared = apiClient.prepareRequest({
        model: "jev-latest",
        state: "UI state with asset",
        questions: {
          box_q: { type: "box", instructions: "Locate button", image: 0 },
        },
        assets: {
          asset_1: { type: "image", format: "png", data_base64: samplePngBase64 },
        },
      });
      expect(prepared.ok).toBe(true);
      const parsedBody = JSON.parse(prepared.body);
      expect(parsedBody.assets).toBeDefined();
      expect(parsedBody.assets.asset_1.data_base64).toBe(samplePngBase64);
    });
  });

  describe("5. Visual Evidence Embedding in JudgeEvidencePacket & AC3 Safe Budget", () => {
    // Valid image above the System One dimension floor (the dimension pre-check rejects a 1x1 PNG).
    const samplePngBase64 = buildPng().toString("base64");

    async function packetFixture(run: (input: { contract: TaskContract; evidence: TaskEvidenceResult; cwd: string }) => Promise<void>): Promise<void> {
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-box-packet-"));
      try {
        const git = (args: string[]) => execFileSync("git", args, { cwd, stdio: "ignore" });
        git(["init"]); git(["config", "user.name", "Test"]); git(["config", "user.email", "test@example.com"]);
        await fs.writeFile(path.join(cwd, "seed.txt"), "baseline"); git(["add", "."]); git(["commit", "-qm", "baseline"]);
        const user = { sessionId: "session-1", entryId: "user-1", digest: "req-1", kind: "user_request" as const };
        const source = { path: "src/button.tsx", digest: "approved-source", startLine: 1, endLine: 10, text: "export const Button = () => <button>Click</button>;" };
        const contract: TaskContract = {
          schemaVersion: 1, contractId: "contract-ui-1", revision: 1, revisionId: "rev-1", incarnationId: "inc-1",
          creation: { sessionId: "session-1", branchId: "branch-1", entryId: "entry-1", callId: "call-1" },
          target: { phase: "UI Phase", phaseOrdinal: 0, content: "Deliver Button Component", ordinal: 0 }, taskKind: "implementation",
          allowedMutationScope: { paths: ["src/button.tsx"], operations: ["read", "create", "modify"] },
          approvedSource: { kind: "plan", path: "phase-02.md", digest: "approved-plan", approval: user, spans: [source] },
          originalUserRequest: user, amendments: [], criteria: [{ id: "criterion-ui-box", kind: "acceptance", text: "Button rendered with bounding box verification.", source }],
          approvedCommandIds: [], parentRequirements: [], policyDigest: "policy-ui",
        };
        const baseline = await captureWorkspaceSnapshot(cwd, { contract });
        await fs.mkdir(path.join(cwd, "src"), { recursive: true });
        await fs.writeFile(path.join(cwd, "src", "button.tsx"), source.text);
        const evidence = await collectTaskEvidence({ cwd, contract, baseline });
        await run({ contract, evidence, cwd });
      } finally {
        await fs.rm(cwd, { recursive: true, force: true });
      }
    }

    test("embeds visualAssets metadata into packet and returns assetPayload separately", async () => {
      await packetFixture(async ({ contract, evidence }) => {
        const result = buildJudgeEvidencePacket({
          contract,
          evidence,
          visualEvidence: {
            imageBase64: samplePngBase64,
            mimeType: "image/png",
          },
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.assetPayload).toBeDefined();
          expect(result.assetPayload?.["ui_visual_evidence"]).toEqual({
            type: "image",
            format: "png",
            data_base64: samplePngBase64,
          });
          expect(result.packet.visualAssets).toBeDefined();
          expect(result.packet.visualAssets?.[0]).toEqual({
            key: "ui_visual_evidence",
            format: "png",
            bytes: Buffer.from(samplePngBase64, "base64").length,
            sha256: digestBytes(Buffer.from(samplePngBase64, "base64")),
          });
          // Invariant: base64 image data is NOT duplicated on the packet root
          expect(Object.prototype.hasOwnProperty.call(result.packet, "visualEvidence")).toBe(false);
          expect(Object.prototype.hasOwnProperty.call(result.packet, "assets")).toBe(false);
        }
      });
    });

    test("rejects unsupported mime types in visual evidence without coercive downcasting", async () => {
      await packetFixture(async ({ contract, evidence }) => {
        const result = buildJudgeEvidencePacket({
          contract,
          evidence,
          visualEvidence: {
            imageBase64: samplePngBase64,
            mimeType: "image/svg+xml",
          },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reasons).toContain("UNSUPPORTED_IMAGE_MIME_TYPE");
        }
      });
    });

    test("AC3: packet carries metadata only so real screenshots fit within maxBytes, while budget overflow fails closed", async () => {
      await packetFixture(async ({ contract, evidence }) => {
        const png = buildPng({ padToBytes: 100_000 });
        const largeBase64 = png.toString("base64");
        const result = buildJudgeEvidencePacket({
          contract,
          evidence,
          maxBytes: 32768,
          visualEvidence: {
            imageBase64: largeBase64,
            mimeType: "image/png",
          },
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(Buffer.byteLength(JSON.stringify(result.packet), "utf8")).toBeLessThan(32768);
          expect(result.packet.visualAssets?.[0].bytes).toBe(png.length);
          expect(result.assetPayload?.["ui_visual_evidence"].data_base64).toBe(largeBase64);
        }
        // But if packet policy maxBytes is constrained (e.g. 500 bytes), it fails closed
        const tightResult = buildJudgeEvidencePacket({
          contract,
          evidence,
          maxBytes: 500,
          visualEvidence: {
            imageBase64: samplePngBase64,
            mimeType: "image/png",
          },
        });

        expect(tightResult.ok).toBe(false);
        if (!tightResult.ok) {
          expect(tightResult.status).toBe("EVIDENCE_REQUIRED");
          expect(tightResult.reasons).toContain("MANDATORY_PACKET_PROOF_EXCEEDS_BUDGET");
        }
      });
    });
  });

  describe("6. Frontend UI Change Detection in Task Evidence Runtime", () => {
    test("identifies UI frontend paths for .css, .tsx, .vue, .html, .svg files", () => {
      expect(isUIFrontendPath("src/components/Header.tsx")).toBe(true);
      expect(isUIFrontendPath("styles/global.css")).toBe(true);
      expect(isUIFrontendPath("ui/App.vue")).toBe(true);
      expect(isUIFrontendPath("public/index.html")).toBe(true);
      expect(isUIFrontendPath("assets/logo.svg")).toBe(true);

      expect(isUIFrontendPath("src/server.ts")).toBe(false);
      expect(isUIFrontendPath("package.json")).toBe(false);
      expect(isUIFrontendPath("README.md")).toBe(false);
    });

    test("detects UI visual evidence from verified base64 source evidence when UI files are modified", () => {
      const samplePngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const uiFiles = ["src/styles.css", "src/Button.tsx"];
      const verifiedSources = [
        { path: "test/screenshot.png", sha256: "sha-test-png", content: samplePngBase64, encoding: "base64" as const },
      ];
      const detected = detectUIVisualEvidence(uiFiles, verifiedSources);
      expect(detected).toBeDefined();
      expect(detected?.mimeType).toBe("image/png");
      expect(detected?.imageBase64).toBe(samplePngBase64);

      const withoutImage = detectUIVisualEvidence(uiFiles, []);
      expect(withoutImage).toBeUndefined();

      const nonUiFiles = ["src/backend.ts", "config.json"];
      const notDetected = detectUIVisualEvidence(nonUiFiles, verifiedSources);
      expect(notDetected).toBeUndefined();
    });
  });
});
