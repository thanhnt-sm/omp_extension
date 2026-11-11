import { describe, expect, test } from "bun:test";
import { CORE_VERIFICATION_TESTS, selectVerificationTestAssets } from "../src/test-asset-selector";

describe("Deterministic Verification Test Asset Selector", () => {
  const mockAllTests = [
    "tests/multi-dialect-wire.test.ts",
    "tests/typesafe-transport-retry.test.ts",
    "tests/typesafe-resolver.test.ts",
    "tests/payload-safety.test.ts",
    "tests/trusted-tool-policy.test.ts",
    "tests/anti-blocking-middleware.test.ts",
    "tests/atomic-jev-judge.test.ts",
    "tests/evidence-collector.test.ts",
    "tests/sync-baseline.test.ts",
    "tests/unrelated-dummy.test.ts",
  ];

  test("always includes existing core verification tests regardless of input", () => {
    const selected = selectVerificationTestAssets("/mock/cwd", mockAllTests, []);
    for (const coreTest of CORE_VERIFICATION_TESTS) {
      expect(selected).toContain(coreTest);
    }
  });

  test("never accepts todo prose or arbitrary strings to steer selection", () => {
    // Calling with empty or arbitrary changed files retains deterministic core tests
    const selectedWithProse = selectVerificationTestAssets("/mock/cwd", mockAllTests, [
      "some random todo wording about evasion",
    ]);
    expect(selectedWithProse).not.toContain("tests/sync-baseline.test.ts");
    expect(selectedWithProse).not.toContain("tests/unrelated-dummy.test.ts");
  });

  test("matches test files corresponding to changed modules", () => {
    const selected = selectVerificationTestAssets("/mock/cwd", mockAllTests, [
      "src/typesafe-api-client.cjs",
      "src/evidence-collector.ts",
    ]);

    expect(selected).toContain("tests/evidence-collector.test.ts");
    expect(selected).toContain("tests/multi-dialect-wire.test.ts");
  });

  test("returns deterministically sorted and deduplicated paths", () => {
    const selected1 = selectVerificationTestAssets("/mock/cwd", mockAllTests, ["src/typesafe-api-client.cjs"]);
    const selected2 = selectVerificationTestAssets("/mock/cwd", mockAllTests, ["src/typesafe-api-client.cjs"]);

    expect(selected1).toEqual(selected2);
    expect(selected1).toEqual([...new Set(selected1)].sort());
  });

  test("retains all matched tests without silent dropping when more than 10 match", () => {
    const manyTests = [
      ...CORE_VERIFICATION_TESTS,
      "tests/mod-1.test.ts",
      "tests/mod-2.test.ts",
      "tests/mod-3.test.ts",
      "tests/mod-4.test.ts",
      "tests/mod-5.test.ts",
    ];

    const changed = [
      "src/mod.ts",
    ];

    const selected = selectVerificationTestAssets("/mock/cwd", manyTests, changed);
    // Core has 7 tests, plus 5 matched mod-* tests = 12 tests total
    expect(selected.length).toBe(12);
    expect(selected).toContain("tests/mod-1.test.ts");
    expect(selected).toContain("tests/mod-5.test.ts");
  });

  test("avoids accidental substring false positives for short module names", () => {
    const candidateTests = [
      ...CORE_VERIFICATION_TESTS,
      "tests/egc.test.ts",
      "tests/unrelated-egc-something.test.ts",
      "tests/something-else.test.ts",
    ];

    // Changed file is egc.ts
    const selected = selectVerificationTestAssets("/mock/cwd", candidateTests, ["src/egc.ts"]);
    expect(selected).toContain("tests/egc.test.ts");
    // unrelated-egc-something should NOT match because changedBase is 'egc', and testBase is 'unrelated-egc-something'
    // which neither startsWith('egc-') nor endsWith('-egc') nor equals 'egc'
    expect(selected).not.toContain("tests/unrelated-egc-something.test.ts");
  });

  test("directly selects changed test files when a test file itself is modified", () => {
    const candidateTests = [
      ...CORE_VERIFICATION_TESTS,
      "tests/macro-evidence-fields.test.ts",
    ];

    const selected = selectVerificationTestAssets("/mock/cwd", candidateTests, ["tests/macro-evidence-fields.test.ts"]);
    expect(selected).toContain("tests/macro-evidence-fields.test.ts");
  });
});
