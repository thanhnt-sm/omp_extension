import { expect, test } from "bun:test";
import { createAdvisorNativeBudget } from "../src/advisor-native-budget";
import { advisorFixture } from "./advisor-fixtures";

// Integration/drain test exercising real bounded post-abort drain timeout against an uncooperative operation.
test("RT#9: createAdvisorNativeBudget bounds post-scheduler drain when operation ignores abort signal", async () => {
  const { request } = advisorFixture("task_review");
  const fakeClient = {
    resolveTrustedToolPolicy() {
      return {
        ok: true,
        semanticReviewLimits: { deadlineMs: 50 },
      } as never;
    },
    createSemanticReviewScheduler() {
      return {
        run(_manifest: unknown, worker: (job: { signal: AbortSignal; admitPacket: () => { ok: boolean }; beforeDispatch: () => { ok: boolean }; markCovered: () => void }) => Promise<{ ok: boolean }>, options: { signal: AbortSignal }) {
          const { promise, resolve } = Promise.withResolvers<{ ok: boolean; code?: string }>();
          void worker({
            signal: options.signal,
            admitPacket: () => ({ ok: true }),
            beforeDispatch: () => ({ ok: true }),
            markCovered: () => {},
          });
          if (options.signal.aborted) {
            resolve({ ok: false, code: "aborted" });
            return promise;
          }
          options.signal.addEventListener("abort", () => {
            resolve({ ok: false, code: "aborted" });
          }, { once: true });
          return promise;
        },
      };
    },
  };

  const budget = createAdvisorNativeBudget(undefined, fakeClient as never);
  const startedAt = Date.now();
  const neverResolves = Promise.withResolvers<unknown>();
  const guard = Promise.withResolvers<"hung">();
  const guardTimer = setTimeout(() => guard.resolve("hung"), 1000);
  const race = await Promise.race([
    budget.run(request, Date.now() + 80, undefined, () => neverResolves.promise),
    guard.promise,
  ]);
  clearTimeout(guardTimer);
  const elapsed = Date.now() - startedAt;
  expect(race).not.toBe("hung");
  if (race !== "hung") {
    expect(race.ok).toBe(false);
    expect(race.started).toBe(true);
    if (!race.ok) {
      expect(["advisor_native_drain_timeout", "aborted"]).toContain(race.code);
    }
  }
  expect(elapsed).toBeLessThan(1000);
});
