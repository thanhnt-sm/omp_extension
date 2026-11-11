import { describe, expect, test } from "bun:test";
import { isSingleHumanOwnedRecovery } from "../src/human-owned-recovery";

const human = { kind: "human", owner: "human" };

describe("isSingleHumanOwnedRecovery (active-count logic behind the ask-gate human-owned exemption)", () => {
  test("zero active tasks: false and recovery is never consulted", () => {
    let consulted = 0;
    expect(isSingleHumanOwnedRecovery([], () => { consulted++; return human; })).toBe(false);
    expect(consulted).toBe(0);
  });

  test("exactly one active task with a human-owned recovery: true, and the task is passed through", () => {
    const seen: string[] = [];
    expect(isSingleHumanOwnedRecovery(["A"], task => { seen.push(task); return human; })).toBe(true);
    expect(seen).toEqual(["A"]);
  });

  test("two or more active tasks: false and recovery is never consulted", () => {
    let consulted = 0;
    expect(isSingleHumanOwnedRecovery(["A", "B"], () => { consulted++; return human; })).toBe(false);
    expect(isSingleHumanOwnedRecovery(["A", "B", "C"], () => { consulted++; return human; })).toBe(false);
    expect(consulted).toBe(0);
  });

  test("single active task without recovery, or with a non-human kind/owner: false", () => {
    expect(isSingleHumanOwnedRecovery(["A"], () => undefined)).toBe(false);
    for (const plan of [{ kind: "repair", owner: "advisor" }, { kind: "human", owner: "advisor" }, { kind: "service", owner: "human" }, {}]) {
      expect(isSingleHumanOwnedRecovery(["A"], () => plan), JSON.stringify(plan)).toBe(false);
    }
  });

  test("a throwing lookup fails closed", () => {
    expect(isSingleHumanOwnedRecovery(["A"], () => { throw new Error("recovery history unreadable"); })).toBe(false);
  });
});
