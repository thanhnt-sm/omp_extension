# Nhật ký Kỹ thuật: Hiệu chuẩn Chân thực Advisor, Thanh lọc Triệt để Ngưỡng 0.80 & Độ Trung thực Trạng thái TypeSafe JEV (Technical Journal: True Advisor Calibration, Complete 0.80 Threshold Purge, and TypeSafe JEV State Fidelity)

- **Ngày (Date)**: 2026-10-15
- **Không gian làm việc (Workspace)**: `D:/100.Software/Github/omp_extension`
- **Kế hoạch (Plan)**: `plans/261015-advisor-judge-jev-true-calibration/plan.md`
- **Quyết định Kiến trúc (ADR)**: `docs/decisions/ADR-20261015-advisor-judge-jev-true-calibration.md`

---

## Ngữ cảnh & Các Nguyên nhân Gốc rễ Đã Giải quyết (Context & Root Causes Resolved)

1. **Bệnh lý Giá trị Cố định `0.90` của Advisor — `src/bicameral-consensus.ts` (Advisor Fixed `0.90` Pathology)**:
   - **Nguyên nhân gốc rễ (Root Cause)**: Hàm `evaluateAdvisorIntent` khi xử lý `operation === "done"` đã sử dụng một biểu thức chính quy luân phiên 36 động từ (36-verb alternation regex — `/pass|implement|...|check|...|review|plan|.../i`) khớp với ~99% nhật ký làm việc của các phiên đang hoạt động (bao gồm cả các mục `[toolCall: read (...)]`) và trả về giá trị gắn cứng `{ verdict: "ALLOW", confidence: 0.90 }`, hoàn toàn không có nhánh `DISALLOW` nào. Tương tự, `evaluateAdvisorDecision` cộng thêm các trọng số bước cố định `+0.25` và `+0.15` vào mức cơ sở `0.50` ($0.50 + 0.25 + 0.15 = 0.90$), và `runBicameralDecisionCheck` chưa bao giờ cập nhật `advisor.confidence` từ phản hồi của JEV.
   - **Bản sửa lỗi (Fix)**: Thay thế các hằng số `0.90` gắn cứng bằng cơ chế chấm điểm mật độ xác thực và độ chồng lấp token đa tín hiệu liên tục (continuous multi-signal token-overlap and verification density scoring — `extractContentTokens`, `computeTokenOverlap`), bổ sung phát hiện `DISALLOW` hạng nhất (first-class `DISALLOW` detection) khi `hasExplicitTestFailure` phát hiện mã thoát khác không hoặc các câu lệnh khẳng định kiểm thử thất bại, ràng buộc `recommended_option.confidence` và `decision_clarity.noul` đã hiệu chuẩn của JEV vào `advisor.confidence`, đồng thời định tuyến `driftChoice !== "no_drift"` / `scopeChoice === "REDUCTION"` (khi `deliverables_verdict === "APPROVE"`) sang `RECONCILE_PLAN` (`NEXT_ACTION_REQUIRED`) thay vì `HUMAN_ESCALATION` ngay ở Lần thử 1 (Attempt 1).

2. **Rò rỉ Ngưỡng Tồn dư `0.80` / `0.30` / `0.70` — `src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, `typesafe-planner.ts` (Residual Threshold Leaks)**:
   - **Nguyên nhân gốc rễ (Root Cause)**: Hàm `resolveAutoApprovalThreshold()` vẫn mặc định ở mức `0.80`, và các hàm `runPhaseMacroCheck`, `verifyTaskCompletion`, `generateVerificationScorecard`, `evaluatePlanDraft`, cùng `formatTaskReport` vẫn cưỡng chế và in ra các chuỗi `"below required threshold 0.80"`, `"Threshold >= 0.80"`, và `"(reject < 0.30)"`.
   - **Bản sửa lỗi (Fix)**: Đồng bộ giá trị mặc định của `resolveAutoApprovalThreshold()` với ranh giới Bayes tự nhiên (natural Bayesian boundary — `0.50`, nơi $P > 0.50$ mang nghĩa khẳng định và $P \le 0.50$ yêu cầu hành động/từ chối), gỡ bỏ toàn bộ các bức tường ngưỡng và chuỗi thông báo `0.80` / `0.30` / `0.70` khỏi các thông điệp từ chối, bảng điểm (scorecards), và báo cáo nhiệm vụ (task reports), đồng thời điều phối Cổng 2 (Gate 2) và Cổng Hủy bỏ (Drop Gate) bằng các phán quyết phân loại `choice` kết hợp với tính nhất quán Bayes tự nhiên.

3. **Đường ống Điểm Thấp & Từ chối Giả của TypeSafe JEV (`jev-latest`) — `src/evidence-collector.ts`, `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/payload-safety.ts`, `typesafe-planner.ts` (Low-Score & False-Rejection Pipeline)**:
   - **Nguyên nhân gốc rễ (Root Cause)**:
     - Hàm `extractCriteriaFromPlan(planContent, taskId)` đã bỏ qua `taskId`, truyền toàn bộ các ô đánh dấu (checkboxes) của cả một kế hoạch đa giai đoạn vào `task_requirements` của một nhiệm vụ con đơn lẻ (single sub-task).
     - Hàm `runPhaseMacroCheck` kẹp giới hạn (clamped) các trường ở mức `3,000`/`5,000` ký tự và bọc chúng trong thẻ `<tag>`, khiến `sanitizeStateForTypeSafe` kẹp giới hạn chúng thêm một lần thứ hai xuống còn `2,000`/`5,000` ký tự (hoặc ép phẳng xuống `950` ký tự khi `state` > 28KB).
     - Hàm `summarizeUnifiedDiff` đã tước bỏ các thẻ `<unified_diff>` và xóa sạch toàn bộ các dòng thân hàm triển khai (implementation body lines) trên các bản khác biệt > 14KB.
     - Hàm `constructGateQuestions` truyền mảng `string[]` cho `criteria` trên các câu hỏi `choice` và `noul` thay vì từ điển `Record<string, string>`.
     - Hàm `truncatePayloadState` nhận diện nhầm chuỗi con `"at "` trong văn xuôi tiếng Anh thông thường là dấu vết ngăn xếp lỗi (stack traces).
   - **Bản sửa lỗi (Fix)**: Nâng cấp `extractCriteriaFromPlan` để nhận biết đúng nhiệm vụ (task-aware), bổ sung chỉ dẫn phạm vi nhiệm vụ con tường minh trong `runPhaseMacroCheck` (để JEV không phạt các nhiệm vụ con vì những nhiệm vụ tương lai chưa bắt đầu hoặc vì `testCommand` chưa được cấu hình), loại bỏ hiện tượng kẹp kép (double-clamping) và vách đá cắt cụt 950 ký tự (950-char cliff) trong `sanitizeStateForTypeSafe`, bảo toàn thẻ `<unified_diff>` cùng các đoạn mã triển khai liền kề trong `summarizeUnifiedDiff`, chuyển đổi `criteria` của `constructGateQuestions` sang `Record<string, string>`, mở rộng nhận diện trình chạy kiểm thử (test-runner detection) trong `collectConversationContext`, và sửa lỗi `truncatePayloadState`.

---

## Xác minh (Verification)

- **Bộ Kiểm thử Không gian Làm việc (`bun test` — Workspace Test Suite)**: `319 pass, 0 fail` (`1,177 expect() calls` trên `33 files`).
- **Đồng bộ Đích Triển khai (`node tools/sync-baseline.cjs` — Deployment Target Sync)**: Đã triển khai và xác minh tại `C:/Users/thant/Projects/omp_extension`.
