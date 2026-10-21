import { describe, expect, test } from "bun:test";
import { fileMutationTargets, requestsPlanCompletion } from "../src/file-mutation-targets";
import { parsePlanCliCheck } from "../src/plan-closure";

describe("actual file-mutation security surface", () => {
  test("checks every hashline file, both rename endpoints and removals without interpreting added text as headers", () => {
    const patch = ["*** Begin Patch", "[src/a.ts#ABCD]", "PUT >1:", "+[not-a-target.ts#1234]", "[src/b.ts#1234]", 'MV "src/protected target.ts"', "[src/c.ts#EEEE]", "REM", "*** End Patch"].join("\n");
    expect(fileMutationTargets("edit", { input: patch }).map(target => [target.path, target.operation]).sort()).toEqual([
      ["src/a.ts", "modify"], ["src/b.ts", "delete"], ["src/c.ts", "delete"], ["src/protected target.ts", "create"],
    ]);
  });
  test("arbitrary path flags cannot turn malformed editor input into a recognized mutation", () => {
    expect(fileMutationTargets("edit", { path: "src/guard.ts", allowJudgeModification: true })).toEqual([]);
    expect(fileMutationTargets("write", { path: "src/guard.ts", content: "actual new source", authorized: true }).map(target => target.path)).toEqual(["src/guard.ts"]);
  });
  test("recognizes real quoted frontmatter/partial patch closure, not fenced documentation or a later body example", () => {
    expect(requestsPlanCompletion('---\nstatus: "completed"\n---\n# Plan')).toBe(true);
    expect(requestsPlanCompletion('PUT 5.=5:\n+status: completed')).toBe(true);
    expect(requestsPlanCompletion('---\nstatus: pending\n---\n```yaml\nstatus: completed\n```')).toBe(false);
    expect(requestsPlanCompletion('PUT >1:\n+```yaml\n+status: completed\n+```')).toBe(false);
  });
  test("distinguishes phase start from closure in quoted CLI argv and refuses compound closure commands", () => {
    expect(parsePlanCliCheck('"C:/Program Files/nodejs/node.exe" "C:/skills/plan-cli.cjs" check 03 --start')).toEqual({ kind: "start", phase: 3 });
    expect(parsePlanCliCheck('node "C:/skills/plan-cli.cjs" check 3')).toEqual({ kind: "complete", phase: 3 });
    expect(parsePlanCliCheck('node "C:/skills/plan-cli.cjs" check 3 --start && node "C:/skills/plan-cli.cjs" check 3')).toEqual({ kind: "unsupported" });
    expect(parsePlanCliCheck('node tools/unrelated.cjs check 3')).toEqual({ kind: "other" });
  });
});
