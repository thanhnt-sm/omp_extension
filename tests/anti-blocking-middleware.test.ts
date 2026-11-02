import { describe, expect, test } from "bun:test";
import {
  isTechnicalImplementationQuestion,
  isSolvableTechnicalFailure,
  formatAdvisorAutoRemediation,
  interceptAskCall,
  interceptTodoCall,
} from "../src/anti-blocking-guards";

describe("Anti-Blocking & Anti-Spam Middleware Guards", () => {
  describe("isTechnicalImplementationQuestion", () => {
    test("detects technical debugging, test failures, and implementation questions", () => {
      expect(isTechnicalImplementationQuestion("Tests are failing with exit code 1. How should I fix this?")).toBe(true);
      expect(isTechnicalImplementationQuestion("How should I implement the database connector?")).toBe(true);
      expect(isTechnicalImplementationQuestion("Which function should I modify to repair this syntax error?")).toBe(true);
      expect(isTechnicalImplementationQuestion("bun test failed on 3 assertions. What code should I write?")).toBe(true);
      expect(isTechnicalImplementationQuestion("Lỗi kiểm thử thất bại, tôi cần sửa code thế nào?")).toBe(true);
      expect(isTechnicalImplementationQuestion("Làm sao để sửa type error trong typesafe-planner.ts?")).toBe(true);
    });

    test("permits genuine business requirements and high-level human scope decisions", () => {
      expect(isTechnicalImplementationQuestion("Do you prefer dark mode or light mode as the default theme?")).toBe(false);
      expect(isTechnicalImplementationQuestion("Should we bill customers monthly or annually?")).toBe(false);
      expect(isTechnicalImplementationQuestion("Which third-party provider do you want to integrate: Stripe or PayPal?")).toBe(false);
      expect(isTechnicalImplementationQuestion("Bạn muốn sử dụng tên miền nào cho sản phẩm?")).toBe(false);
    });
  });

  describe("isSolvableTechnicalFailure", () => {
    test("identifies solvable technical failures in blocking reasons", () => {
      expect(isSolvableTechnicalFailure("bun test failed with exit code 1")).toBe(true);
      expect(isSolvableTechnicalFailure("Missing implementation of auth handler")).toBe(true);
      expect(isSolvableTechnicalFailure("EVIDENCE_REQUIRED: test suite not passing")).toBe(true);
      expect(isSolvableTechnicalFailure("Syntax error in handler.ts")).toBe(true);
      expect(isSolvableTechnicalFailure("Kiểm thử hỏng chưa giải quyết được")).toBe(true);
    });

    test("allows legitimate external blockers or human authorization requirements", () => {
      expect(isSolvableTechnicalFailure("Waiting for Stripe production API credentials from client")).toBe(false);
      expect(isSolvableTechnicalFailure("Third-party server is down (HTTP 503 Service Unavailable)")).toBe(false);
      expect(isSolvableTechnicalFailure("Chờ phê duyệt pháp lý từ bộ phận tuân thủ")).toBe(false);
    });
  });

  describe("interceptAskCall", () => {
    test("blocks technical questions from reaching the user", () => {
      const result = interceptAskCall({
        questions: [{ question: "Tests are failing in auth.ts. How should I fix this?" }],
      });
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("BLOCKED: Câu hỏi liên quan đến lỗi kỹ thuật");
    });

    test("allows non-technical domain questions to proceed", () => {
      const result = interceptAskCall({
        questions: [{ question: "Which logo design do you prefer: Option A or Option B?" }],
      });
      expect(result.blocked).toBe(false);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("interceptTodoCall", () => {
    test("blocks todo block operation on solvable test failures and embeds remediation descriptor", () => {
      const result = interceptTodoCall({
        op: "block",
        task: "Sửa lỗi kiểm thử",
        phase: "Pha 1",
        reason: "bun test failed with exit code 1: 2 assertions failed",
      });
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("CẤM đóng băng todo vì lỗi kiểm thử");
      expect(result.reason).toContain("typesafe_prepare_advisor");
      expect(result.reason).toContain("Sửa lỗi kiểm thử");
    });

    test("allows todo block operation on genuine external blockers", () => {
      const result = interceptTodoCall({
        op: "block",
        task: "Tích hợp cổng thanh toán",
        phase: "Pha 2",
        reason: "Chờ khách hàng bàn giao production API key",
      });
      expect(result.blocked).toBe(false);
    });
  });

  describe("formatAdvisorAutoRemediation", () => {
    test("formats valid typesafe_prepare_advisor invocation string", () => {
      const formatted = formatAdvisorAutoRemediation("Xây dựng module xác thực", "Pha 1", ["Thiếu hàm hash"]);
      expect(formatted).toContain("typesafe_prepare_advisor");
      expect(formatted).toContain("Xây dựng module xác thực");
      expect(formatted).toContain("decision\":\"stuck\"");
    });
  });
});
