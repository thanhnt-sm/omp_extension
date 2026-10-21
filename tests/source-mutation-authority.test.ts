import { describe, expect, test } from "bun:test";
import path from "node:path";
import { sourceMutationAllowed } from "../src/source-mutation-authority";
import type { NativeMutationScopeGrant } from "../src/advisor-mutation-delegation";

// Pure containment tests; this data is not a genuine host delegation and cannot supply native authority.
const cwd = path.resolve("scope-fixture");
const grant: NativeMutationScopeGrant = { workspaceRoot: cwd, policyDigest: "a".repeat(64), contractRefs: [{ contractId: "contract", revisionId: "revision", incarnationId: "incarnation" }], scope: { paths: ["src/**", "typesafe-planner.ts"], operations: ["read", "modify"] } };

describe("source mutation scope containment", () => {
  test("permits only the explicitly granted operation on an in-scope workspace target", () => {
    expect(sourceMutationAllowed(grant, cwd, "src/parser.ts", "modify")).toBe(true);
    expect(sourceMutationAllowed(grant, cwd, "src/parser.ts", "delete")).toBe(false);
    expect(sourceMutationAllowed(grant, cwd, "src/new.ts", "create")).toBe(false);
    expect(sourceMutationAllowed(grant, cwd, "docs/unrelated.md", "modify")).toBe(false);
  });
  test("normalizes traversal before scope matching and rejects a different workspace or absent grant", () => {
    expect(sourceMutationAllowed(grant, cwd, "src/../../outside.ts", "modify")).toBe(false);
    expect(sourceMutationAllowed(grant, cwd, path.resolve(cwd, "../outside.ts"), "modify")).toBe(false);
    expect(sourceMutationAllowed(grant, path.resolve(cwd, "../other-project"), "src/parser.ts", "modify")).toBe(false);
    expect(sourceMutationAllowed(undefined, cwd, "typesafe-planner.ts", "modify")).toBe(false);
  });
});
