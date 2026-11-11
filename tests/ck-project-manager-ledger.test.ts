import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  scanAllPlans,
  generateLedger,
  classifyCheckboxLine,
  countCheckboxes,
  reconcilePlan,
} from "../tools/ck-project-manager.cjs";

const planMd = (status: string, body = "") =>
  `---\ntitle: "T"\nstatus: ${status}\n---\n# T\n${body}`;

describe("ck-project-manager ledger scoping and checkbox counting", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-pm-ledger-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  async function write(rel: string, content: string) {
    const full = path.join(tmpDir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
  }

  test("plan id is the directory name under plans/, never the workspace name", async () => {
    await write("plans/261101-alpha/plan.md", planMd("completed", "- [x] a\n"));
    await write("plans/261102-beta/plan.md", planMd("in-progress", "- [ ] b\n"));

    const plans = scanAllPlans(tmpDir);
    expect(plans.map((p: { id: string }) => p.id)).toEqual(["261101-alpha", "261102-beta"]);
    expect(plans[0].path).toBe("plans/261101-alpha/plan.md");
    expect(plans[0].directory).toBe("plans/261101-alpha");
  });

  test("ignores plans/reports, nested plan.md, loose plans/*.md and out-of-tree plan files", async () => {
    await write("plans/261101-real/plan.md", planMd("pending", "- [ ] x\n"));
    await write("plans/reports/plan.md", planMd("pending", "- [ ] report\n"));
    await write("plans/261101-real/reports/plan.md", planMd("pending", "- [ ] nested\n"));
    await write("plans/261101-real/sub/plan.md", planMd("pending", "- [ ] nested\n"));
    await write("plans/loose-plan.md", planMd("pending", "- [ ] loose\n"));
    await write("plans/no-plan-file/notes.md", "# nothing\n");
    await write("JUDGE_BASELINE_COOK_PLAN.md", planMd("pending", "- [ ] root\n"));
    await write("something-plan.md", planMd("pending", "- [ ] root\n"));
    await write("other-copy/plan.md", planMd("pending", "- [ ] outside\n"));

    const ledger = generateLedger(tmpDir);
    expect(ledger.totalPlans).toBe(1);
    expect(ledger.plans.map((p: { id: string }) => p.id)).toEqual(["261101-real"]);
    // A workspace-named id (the old root-plan bug) must never appear.
    expect(JSON.stringify(ledger.plans)).not.toContain(path.basename(tmpDir));
  });

  test("returns an empty list when plans/ does not exist", () => {
    expect(scanAllPlans(tmpDir)).toEqual([]);
  });

  test("superseded [bỏ ...] markers and malformed boxes count as neither checked nor unchecked", () => {
    expect(classifyCheckboxLine("- [ ] open")).toBe("unchecked");
    expect(classifyCheckboxLine("  - [x] done")).toBe("checked");
    expect(classifyCheckboxLine("- [X] done")).toBe("checked");
    expect(classifyCheckboxLine("- [bỏ — thay bằng phase 3] old item")).toBeNull();
    expect(classifyCheckboxLine("- [] empty")).toBeNull();
    expect(classifyCheckboxLine("- [x]no-space")).toBeNull();
    expect(classifyCheckboxLine("plain text")).toBeNull();

    const counts = countCheckboxes(
      ["- [x] a", "- [ ] b", "- [bỏ — superseded] c", "- [bỏ] d"].join("\n"),
    );
    expect(counts).toEqual({ checked: 1, unchecked: 1 });
  });

  test("ledger counts exclude superseded items in plan.md and phase files", async () => {
    await write(
      "plans/261103-sup/plan.md",
      planMd("in-progress", "- [x] a\n- [bỏ — superseded] b\n"),
    );
    await write("plans/261103-sup/phase-01-x.md", "- [ ] p1\n- [bỏ — superseded] p2\n- [x] p3\n");

    const [plan] = scanAllPlans(tmpDir);
    expect(plan.planCheckboxes).toEqual({ checked: 1, unchecked: 0 });
    expect(plan.phaseCheckboxes).toEqual({ checked: 1, unchecked: 1 });
    expect(plan.isCompleted).toBe(false);
  });

  test("reconcilePlan leaves [bỏ ...] markers untouched while backfilling real boxes", async () => {
    await write("plans/261104-rec/plan.md", planMd("pending", "- [ ] a\n- [bỏ — superseded] b\n"));
    reconcilePlan(path.join(tmpDir, "plans/261104-rec/plan.md"), { status: "completed" });
    const out = await fs.readFile(path.join(tmpDir, "plans/261104-rec/plan.md"), "utf8");
    expect(out).toContain("- [x] a");
    expect(out).toContain("- [bỏ — superseded] b");
  });
});
