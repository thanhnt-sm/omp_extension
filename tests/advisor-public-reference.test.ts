import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareAdvisorConsultationContext } from "../src/advisor-public-context";

test("consultation preserves host-generated reference hashes without exposing credential prose", () => {
  const key = "fixture-only-api-credential-value";
  const result = prepareAdvisorConsultationContext({ question: `Inspect public source; never disclose ${key}.` }, { apiKey: key });
  expect(result.evidenceRefs).toEqual([`public-question:${result.questionDigest}`]);
  expect(result.publicPrompt).toContain(result.questionDigest);
  expect(result.publicPrompt).not.toContain(key);
});

test("authenticated source digest survives but secret-bearing source paths fail closed", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "advisor-public-ref-"));
  const key = "fixture-only-path-credential";
  const content = "export const answer = 42;\n";
  const sha256 = createHash("sha256").update(content).digest("hex");
  try {
    writeFileSync(path.join(root, "source.ts"), content);
    const result = prepareAdvisorConsultationContext({ question: "Inspect the authorized source." }, {
      apiKey: key, workspaceRoot: root, authorizedFiles: [{ path: "source.ts", sha256 }], isAuthorizedSource: () => true,
    });
    expect(JSON.parse(result.publicPrompt).authorizedFiles).toEqual([{ path: "source.ts", sha256 }]);
    const secretPath = `${key}.ts`;
    writeFileSync(path.join(root, secretPath), content);
    expect(() => prepareAdvisorConsultationContext({ question: "Inspect the authorized source." }, {
      apiKey: key, workspaceRoot: root, authorizedFiles: [{ path: secretPath, sha256 }], isAuthorizedSource: () => true,
    })).toThrow("advisor_public_reference_redaction_required");
    expect(() => prepareAdvisorConsultationContext({ question: "Inspect the authorized source." }, {
      apiKey: sha256, workspaceRoot: root, authorizedFiles: [{ path: "source.ts", sha256 }], isAuthorizedSource: () => true,
    })).toThrow("advisor_public_reference_redaction_required");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
