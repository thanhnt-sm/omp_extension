/**
 * Anti-blocking & anti-spam middleware guards.
 * Prevents AI agents from endlessly asking humans about solvable technical problems,
 * and prevents agents from parking tasks into blocked state instead of consulting Advisor.
 */

export function isTechnicalImplementationQuestion(text: string, _options?: Array<unknown>): boolean {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();

  // Patterns indicating debugging, test failure, code fixing, or implementation choices
  const techPatterns = [
    /\b(test|tests|assertion|failed|failing|exit code|exitcode)\b/i,
    /\b(syntax error|type error|typecheck|traceback|stack trace|compil|lint)\b/i,
    /\b(how to fix|how should i fix|fix this|repair|debug|troubleshoot)\b/i,
    /\b(how should i implement|how to implement|which function|what code to write)\b/i,
    /\b(bun test|npm test|vitest|jest|pytest)\b/i,
    /\b(todo blocked|blocked todo|why blocked|unblock)\b/i,
    /(lỗi|thất bại|sửa lỗi|viết mã|cú pháp|chạy test|test hỏng|test tạch|lỗi type|kiểm thử)/i,
  ];

  return techPatterns.some(pattern => pattern.test(lower));
}

export function isSolvableTechnicalFailure(reason?: string): boolean {
  if (!reason || typeof reason !== "string") return false;
  const lower = reason.toLowerCase();
  const solvable = [
    /\b(test|tests|assertion|failed|failing|exit code|exitcode)\b/i,
    /\b(syntax|type error|typecheck|lint|compile|compilation)\b/i,
    /\b(missing implementation|stub|todo|not implemented|unimplemented)\b/i,
    /\b(evidence required|evidence_required|review required|review_required)\b/i,
    /(lỗi|thất bại|hỏng test|chưa xong|chưa đạt|kiểm thử hỏng|hỏng)/i,
  ];
  return solvable.some(pat => pat.test(lower));
}

/**
 * Whether a failed `todo done` preflight should carry the Advisor auto-remediation hint.
 * Only actionable repair/evidence outcomes qualify. The "no review exists yet" answer is
 * discriminated explicitly by `reviewMissing` (set by task-verification-runtime preflight): its own
 * reasons already name the next tool, and an Advisor consultation cannot help before a review exists.
 * An EVIDENCE_REQUIRED outcome with an empty missing list but no `reviewMissing` is a post-review
 * disposition whose recovery is Advisor-owned (task-recovery), so the hint applies. UNAVAILABLE /
 * HUMAN_REQUIRED are owned by a service operator or a human, not by an Advisor diagnosis loop.
 */
export function shouldAppendAdvisorRemediation(result: { status: string; reviewMissing?: boolean }): boolean {
  if (result.status === "REJECTED") return true;
  return result.status === "EVIDENCE_REQUIRED" && result.reviewMissing !== true;
}

export function formatAdvisorAutoRemediation(task: string, phase?: string, reasons?: string[]): string {
  // `purpose: "consultation"` is mandatory: without it typesafe_prepare_advisor selects task mode,
  // which the runtime refuses until complete task proof exists (task-verification-advisor.ts).
  const params = JSON.stringify({
    purpose: "consultation",
    decision: "stuck",
    task,
    ...(phase ? { phase } : {}),
    question: "Diagnose root cause of failure, provide ranked technical options and dependency-ordered re-plan.",
  });
  const reasonText = reasons && reasons.length ? ` Nguyên nhân từ chối: ${reasons.join("; ")}.` : "";
  return `[TỰ ĐỘNG CHỮA LÀNH / AUTO-REMEDIATION]: CẤM đóng băng hoặc bỏ cuộc khi gặp lỗi kiểm thử!${reasonText}\nHãy triệu hồi ngay Cố vấn Độc lập bằng lệnh:\ntypesafe_prepare_advisor ${params}\nsau đó thực thi task native được trả về để nhận kế hoạch sửa chữa toàn diện từ Advisor, sửa mã nguồn và chạy lại bun test.`;
}

export const TECHNICAL_ASK_BLOCK_REASON =
  "BLOCKED: Câu hỏi liên quan đến lỗi kỹ thuật, gỡ lỗi hoặc chi tiết triển khai mã nguồn. Tác tử BẮT BUỘC phải tự động triệu hồi Advisor (typesafe_prepare_advisor) và Thẩm phán TypeSafe Jev Judge để tự phân tích và lập giải pháp, KHÔNG ĐƯỢC tra khảo người dùng.";

/**
 * Single live `ask` gate (called by typesafe-planner). A technical question is blocked and the
 * agent is redirected to the Advisor, unless the current task's verification recovery is already
 * owned by a human (HUMAN_REQUIRED / unchanged rejection): then asking the human is the only
 * legitimate path and blocking it would deadlock. `humanOwned` must come from host-validated
 * recovery state, never from the ask payload.
 */
export function interceptAskCall(input: Record<string, unknown>, options?: { humanOwned?: boolean }): { blocked: boolean; reason?: string } {
  // Every question is inspected: a harmless first question must not shield a technical later one.
  const questionTexts: string[] = [];
  if (Array.isArray(input.questions)) {
    for (const entry of input.questions) {
      if (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).question === "string") {
        questionTexts.push((entry as Record<string, string>).question);
      }
    }
  }
  if (typeof input.question === "string") questionTexts.push(input.question);
  if (typeof input.i === "string") questionTexts.push(input.i);

  if (options?.humanOwned !== true && questionTexts.some(text => isTechnicalImplementationQuestion(text))) {
    return { blocked: true, reason: TECHNICAL_ASK_BLOCK_REASON };
  }
  return { blocked: false };
}
