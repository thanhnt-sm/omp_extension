import { expect, test, describe, beforeEach } from "bun:test";
import { AuthManager } from "../src/auth-manager";

describe("Auth Rotation & In-Memory Resiliency", () => {
  let authManager: AuthManager;

  beforeEach(() => {
    authManager = new AuthManager();
  });

  test("hashes token correctly and securely", () => {
    const token = "secret-token-123";
    const hash = authManager.hashToken(token);
    
    expect(hash.length).toBe(16);
    expect(hash).not.toContain(token);
    expect(authManager.hashToken(token)).toBe(hash);
  });

  test("allows initial attempt", () => {
    expect(authManager.canAttempt("token-a")).toBe(true);
  });

  test("records 401 failure and blocks subsequent attempts with same token", () => {
    const token = "token-a";
    authManager.recordFailure(token, 401);
    
    expect(authManager.canAttempt(token)).toBe(false);
    expect(authManager.getState(token).status).toBe("revoked");
  });

  test("does not block on non-auth failures (e.g., 500)", () => {
    const token = "token-a";
    authManager.recordFailure(token, 500);
    
    expect(authManager.canAttempt(token)).toBe(true);
  });

  test("recovers immediately on key rotation", () => {
    const tokenA = "token-a";
    const tokenB = "token-b";
    
    authManager.recordFailure(tokenA, 401);
    expect(authManager.canAttempt(tokenA)).toBe(false);
    
    expect(authManager.canAttempt(tokenB)).toBe(true);
    
    const state = authManager.getState(tokenB);
    expect(state.status).toBe("authenticated");
    expect(state.retryCount).toBe(0);
  });

  test("recordSuccess clears failures", () => {
    const token = "token-a";
    authManager.recordFailure(token, 401);
    
    authManager.recordSuccess(token);
    expect(authManager.canAttempt(token)).toBe(true);
  });
});
