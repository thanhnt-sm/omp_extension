import { describe, expect, test } from "bun:test";
import { createSemanticApprovalPolicy, isSemanticApprovalPolicy, parseSemanticApprovalPolicySnapshot, passesSemanticApproval } from "../src/semantic-approval-policy";

describe("Frozen existing semantic approval policy", () => {
  test("preserves the strict existing 0.50 boundary rather than asserting universal optimality", () => {
    const policy = createSemanticApprovalPolicy({});
    expect(policy).toEqual({ threshold: 0.5, comparator: "gt" });
    expect(passesSemanticApproval(0.5, policy)).toBe(false);
    expect(passesSemanticApproval(0.500001, policy)).toBe(true);
    expect(passesSemanticApproval(0.5, createSemanticApprovalPolicy({ TYPESAFE_AUTO_APPROVAL_THRESHOLD: "50" }))).toBe(false);
  });
  test("retains configured percentage normalization, clamping and inclusive nondefault comparator", () => {
    const policy = createSemanticApprovalPolicy({ TYPESAFE_AUTO_APPROVAL_THRESHOLD: "70" });
    expect(policy).toEqual({ threshold: 0.7, comparator: "gte" });
    expect(passesSemanticApproval(0.7, policy)).toBe(true);
    expect(passesSemanticApproval(0.699, policy)).toBe(false);
    expect(createSemanticApprovalPolicy({ TYPESAFE_AUTO_APPROVAL_THRESHOLD: "200" }).threshold).toBe(1);
    expect(createSemanticApprovalPolicy({ TYPESAFE_AUTO_APPROVAL_THRESHOLD: "-3" }).threshold).toBe(0);
  });
  test.each(["", " ", "NaN", "Infinity", "not a number"])("invalid configured threshold %s retains the existing default", value => {
    expect(createSemanticApprovalPolicy({ TYPESAFE_AUTO_APPROVAL_THRESHOLD: value })).toEqual({ threshold: 0.5, comparator: "gt" });
  });
  test("changing the trusted source record later cannot lower the captured policy", () => {
    const env = { TYPESAFE_AUTO_APPROVAL_THRESHOLD: "0.90" };
    const policy = createSemanticApprovalPolicy(env);
    env.TYPESAFE_AUTO_APPROVAL_THRESHOLD = "0.01";
    expect(Object.isFrozen(policy)).toBe(true);
    expect(passesSemanticApproval(0.85, policy)).toBe(false);
    expect(isSemanticApprovalPolicy(policy)).toBe(true);
    expect(() => passesSemanticApproval(1, { threshold: 0, comparator: "gte" })).toThrow("not_factory_owned");
  });
  test.each(["0.99", null, undefined, NaN, Infinity, -0.01, 1.01, { confidence: 1 }])("never coerces probability %s", value => {
    expect(passesSemanticApproval(value, createSemanticApprovalPolicy({}))).toBe(false);
  });
  test("parses authenticated protocol data without inventing another comparator convention", () => {
    const policy = parseSemanticApprovalPolicySnapshot({ threshold: 0.9, comparator: "gte" });
    expect(policy).toEqual({ threshold: 0.9, comparator: "gte" });
    expect(isSemanticApprovalPolicy(policy)).toBe(true);
    expect(parseSemanticApprovalPolicySnapshot({ threshold: 0.5, comparator: "gte" })).toBeUndefined();
    expect(parseSemanticApprovalPolicySnapshot({ threshold: "0.9", comparator: "gte" })).toBeUndefined();
    expect(parseSemanticApprovalPolicySnapshot({ threshold: 1.1, comparator: "gte" })).toBeUndefined();
  });
});
