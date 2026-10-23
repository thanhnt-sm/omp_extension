import { describe, expect, test } from "bun:test";
import { synthesizePlanDelta } from "../src/remediation-generator";

describe("plan reconciliation guidance", () => {
  test("synthesizes reconciliation guidance independently of todo state", () => {
    expect(synthesizePlanDelta({ taskId: "A", reasons: ["missing"], nextActions: ["fix"] })).toContain("<plan_reconciliation>");
  });
});
