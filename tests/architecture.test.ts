import { expect, test, describe } from "bun:test";
import { TypeSafeError } from "../src/errors/TypeSafeError";
import type {
  ASTAnalysisResult,
  XMLEnclosureSchema,
  AuthState,
  RemediationDirective,
} from "../src/types/security";

describe("Security Architecture & Foundation", () => {
  test("TypeSafeError extends Error and has correct properties", () => {
    const error = new TypeSafeError("Test error message", "TEST_ERR_CODE", { foo: "bar" });
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TypeSafeError);
    expect(error.name).toBe("TypeSafeError");
    expect(error.message).toBe("Test error message");
    expect(error.code).toBe("TEST_ERR_CODE");
    expect(error.details).toEqual({ foo: "bar" });
    
    // Stack trace verification
    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe("string");
  });

  test("Security interfaces are properly typed (compile-time check)", () => {
    const astResult: ASTAnalysisResult = {
      isSafe: true,
      issues: [],
      deletedAssertions: [],
      modifiedSuites: [],
    };
    expect(astResult.isSafe).toBe(true);

    const xmlSchema: XMLEnclosureSchema = {
      boundary: "plan_content",
      validTags: ["plan_title", "user_prompt"],
      sanitized: true,
    };
    expect(xmlSchema.sanitized).toBe(true);

    const authState: AuthState = {
      status: "authenticated",
      tokenHash: "hash123",
      retryCount: 0,
    };
    expect(authState.status).toBe("authenticated");

    const remediation: RemediationDirective = {
      instruction: "Fix it",
      immutableConstraints: ["Must not change X"],
      failureReasons: ["Failed Y"],
      actionItems: ["Do Z"],
    };
    expect(remediation.instruction).toBe("Fix it");
  });
});
