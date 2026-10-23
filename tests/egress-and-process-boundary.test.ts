import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { isPrivateEvidencePath } from "../src/evidence-privacy";
import { prepareAdvisorPublicContext, prepareAdvisorConsultationContext } from "../src/advisor-public-context";
import { executeTestCommand } from "../src/evidence-collector";
import type { JudgeEvidencePacket } from "../src/judge-evidence-packet";
import type { TaskContract } from "../src/types/verification";

const require_ = createRequire(import.meta.url);
const client = require_("../src/typesafe-api-client.cjs") as { redactEvidenceState(state: unknown, options: { apiKey?: string }): unknown };

const SENTINEL = "SYNTHETIC_METADATA_KEY_42";

function fakeContract(): TaskContract {
  return {
    contractId: "c1", revisionId: "r1", incarnationId: "i1",
    criteria: [{ id: "crit-1", text: "does X" }],
    originalUserRequest: { text: "do X", digest: "d1" },
    parentRequirements: [],
  } as unknown as TaskContract;
}

function fakePacket(sourcePath: string): JudgeEvidencePacket {
  return {
    binding: { contractId: "c1", revisionId: "r1", incarnationId: "i1" },
    omissions: [], criteria: [{ id: "crit-1" }],
    source: [{ path: sourcePath, sha256: "a".repeat(64) }],
    artifacts: [], obligations: [{ evidenceIds: ["ev-1"] }],
    integrationReceipts: [],
  } as unknown as JudgeEvidencePacket;
}

describe("egress and process boundary", () => {
  test("inherited-property path segments are not private", () => {
    expect(isPrivateEvidencePath("src/constructor/index.ts")).toBe(false);
    expect(isPrivateEvidencePath("src/__proto__/index.ts")).toBe(false);
    expect(isPrivateEvidencePath("src/hasOwnProperty/x.ts")).toBe(false);
    expect(isPrivateEvidencePath("src/normal/index.ts")).toBe(false);
  });

  test("declared private segments still match", () => {
    expect(isPrivateEvidencePath(".claude/settings.json")).toBe(true);
    expect(isPrivateEvidencePath("x/.env")).toBe(true);
    expect(isPrivateEvidencePath(".ssh/id_rsa")).toBe(true);
    expect(isPrivateEvidencePath("data/session.json")).toBe(true);
  });

  test("secret-bearing authorized path fails closed instead of publishing raw metadata", () => {
    const packet = fakePacket(`src/${SENTINEL}.ts`);
    expect(() => prepareAdvisorPublicContext(packet, {
      contract: fakeContract(), question: "assess", apiKey: SENTINEL,
      isAuthorizedSource: () => true,
    })).toThrow("advisor_public_reference_redaction_required");
  });

  test("clean authorized path produces a prompt free of unredacted state secrets", () => {
    const packet = fakePacket("src/clean.ts");
    const prepared = prepareAdvisorPublicContext(packet, {
      contract: fakeContract(), question: "assess",
      isAuthorizedSource: () => true,
    });
    const prompt = JSON.parse(prepared.publicPrompt);
    expect(Array.isArray(prompt.authorizedFiles)).toBe(true);
    expect(prompt.authorizedFiles[0].path).toBe("src/clean.ts");
  });

  test("consultation secret-bearing path fails closed after source authentication", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "advisor-public-path-"));
    const filename = `${SENTINEL}.ts`;
    fs.writeFileSync(path.join(workspace, filename), "export {};\n");
    const { createHash } = require_("node:crypto") as typeof import("node:crypto");
    const sha256 = createHash("sha256").update(fs.readFileSync(path.join(workspace, filename))).digest("hex");
    try {
      expect(() => prepareAdvisorConsultationContext({ question: "q" }, {
        authorizedFiles: [{ path: filename, sha256 }], workspaceRoot: workspace, apiKey: SENTINEL,
        isAuthorizedSource: () => true,
      })).toThrow("advisor_public_reference_redaction_required");
    } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
  });

  test("redaction of the outer reference envelope is real", () => {
    const out = client.redactEvidenceState(
      { authorizedFiles: [{ path: `x/${SENTINEL}`, sha256: "a".repeat(64) }], evidenceRefs: [`src/${SENTINEL}`] },
      { apiKey: SENTINEL },
    ) as { authorizedFiles: { path: string }[] };
    expect(out.authorizedFiles[0].path).not.toContain(SENTINEL);
  });
});

describe("executeTestCommand process-group boundary", () => {
  const posixOnly = process.platform === "win32" ? test.skip : test;

  posixOnly("aborting a shell command also kills descendant writers in its group", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proc-group-"));
    const marker = path.join(dir, "marker");
    try {
      const controller = new AbortController();
      const promise = executeTestCommand(
        `node -e "const c=require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{require(\\'fs\\').writeFileSync(\\'${marker.replace(/\\/g, "/")}\\',\\'x\\')},250)'],{stdio:'ignore',detached:false});setTimeout(()=>{},60000)"`,
        dir, 60_000, controller.signal, "evidence-git",
      );
      setTimeout(() => controller.abort(), 80);
      const result = await promise;
      expect(result.aborted).toBe(true);
      await new Promise((r) => setTimeout(r, 600));
      expect(fs.existsSync(marker)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  posixOnly("normal command completion still returns exit code and output", async () => {
    const result = await executeTestCommand("echo hello", os.tmpdir(), 10_000, undefined, "evidence-git");
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("hello");
  });
});
