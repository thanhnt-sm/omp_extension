# Nhật ký Kỹ thuật: Kiểm toán Đội Đỏ trên 5 Phiên `oh-my-pi` Gần nhất & Đại tu 4 Giai đoạn TypeSafe/JEV/Advisor (Technical Journal: Red-Team Audit of 5 Recent oh-my-pi Sessions & 4-Phase TypeSafe/JEV/Advisor Overhaul)

- **Ngày (Date)**: 2026-10-14
- **Kế hoạch (Plan)**: `plans/261014-typesafe-jev-advisor-overhaul/plan.md` (`status: completed`)
- **Quyết định Kiến trúc (ADR)**: `docs/decisions/ADR-20261014-typesafe-jev-advisor-overhaul.md`
- **Báo cáo (Reports)**:
  - `plans/reports/261014-redteam-audit-5-sessions-typesafe-jev-advisor.md`
  - `plans/reports/261014-phase1-session-forensics-and-scout.md`
  - `plans/reports/261014-phase1-source-and-payload-audit.md`

## 1. Ngữ cảnh & Diễn biến Thực tế (Context & What Happened)
Đã thực hiện kiểm toán 5 phiên `oh-my-pi` gần nhất trên toàn bộ các không gian làm việc (`01a13a32`, `01a139f1`, `01a13937`, `01a13930`, `01a13909`, cộng thêm `01a138b5` và `01a13851`) bằng đội hình đa tác tử song song (parallel multi-agent team: `ScoutPayloadAndGateFlow`, `ReviewerRedTeamDefects`, `AdvisorArchitectureAudit`, `DevCookJudgeAndConsensus`, `DevEvidenceAndGates`, `DevPlannerExtension`, `ReviewerOverhaulAudit`).

## 2. Các Nguyên nhân Gốc rễ Đã Xác định & Khắc phục (Root Causes Identified & Fixed)
1. **Leo thang Trước-JEV do Lệch Một Đơn vị & Trùng lặp Hộp thoại `ui.confirm` — `typesafe-planner.ts`, `src/cook-expert-judge.ts` (Off-by-One Pre-JEV Escalation & Duplicate `ui.confirm`)**:
   - Việc truyền `attemptCount: currentFailures + 1` đã khiến Lần thử #3 (`currentFailures === 2`) kích hoạt nhánh `if (ctx.attemptCount >= 3)` ngay ở đầu hàm `runPhaseMacroCheck` *trước khi* gọi JEV, trả về `verdict: undefined` $\rightarrow$ bị ánh xạ sang `jev.verdict = "ESCALATE"` $\rightarrow$ bật hộp thoại `HUMAN_ESCALATION` với lý do bị cắt cụt còn 35 ký tự `"3 consecutive failed revision attem"`.
   - Đã sửa bằng cách truyền `attemptCount: currentFailures`, chuyển tiếp cờ `skipConfirm` khi `HUMAN_ESCALATION` bị từ chối, và mở rộng giới hạn cắt chuỗi lý do trong `formatConsensusEscalation` lên 240 ký tự.
2. **Định tuyến Từ chối Lưỡng viện Bị Đảo ngược — `src/bicameral-consensus.ts` (Inverted Bicameral Rejection Routing)**:
   - Hàm `evaluateAdvisorIntent` đã khớp với mẫu `\[toolCall:|\[toolResult:` trong `agentWorkLog` và không bao giờ trả về `DISALLOW` đối với thao tác `done`, khiến nhánh `AUTO_REJECT` không bao giờ chạm tới được và biến mọi kết quả `REJECT` của JEV thành `HUMAN_ESCALATION` (`Decision: APPROVED (by: human)`).
   - Đã sửa bằng cách loại bỏ `\[toolCall:|\[toolResult:` khỏi biểu thức chính quy của thao tác `done` và gán `advisor.verdict = "DISALLOW"` trong `runBicameralMacroCheck` cùng `evaluateBicameralDoneConsensus` bất cứ khi nào JEV trả về `REJECT` (`!jevMacro.escalateToUser`), định tuyến chính xác về `AUTO_REJECT`.
3. **Cắt cụt Bằng chứng Cuối & Mất mát `<task-result>` của Tác tử Con — `typesafe-planner.ts`, `src/evidence-collector.ts` (Tail-Evidence Amputation & Subagent `<task-result>` Loss)**:
   - Hàm `sanitizeStateForTypeSafe` trước đây đã kẹp đầu (head-clamped) các trường vốn đã được kẹp đuôi (tail-clamped) như `agent_work_log` và `test_summary` xuống còn 2,000/950 ký tự, làm xóa mất các kết quả kiểm thử và hành động mới nhất ở cuối chuỗi.
   - Đã sửa bằng cách bảo toàn chế độ kẹp đuôi (`"tail"` clamping) đối với tập khóa `TAIL_KEYS` (`agent_work_log`, `test_summary`, `testOutput`, `user_request`), kẹp đầu các kết quả `<task-result>` ở mức 1,200 ký tự trong `collectConversationContext`, và tổng hợp bản khác biệt cho các tập tin chưa được Git theo dõi (`??` — untracked file diffs) trong `collectTaskEvidence` ngay cả khi `baseline` bị lược bỏ.
4. **Hiệu chuẩn Nguyên hàm & Xếp hạng Tùy chọn của Advisor — `src/cook-expert-judge.ts`, `src/bicameral-consensus.ts`, `src/verification-gate.ts` (Primitive Calibration & Advisor Option Ranking)**:
   - Đơn giản hóa các chỉ dẫn của `deliverables_verdict` theo hướng dẫn `jev-1.13`, cưỡng chế mức sàn `meets_criteria >= 0.50` khi `deliverables_verdict === "APPROVE"`, đảo ngược `drop_verdict.confidence` (`1 - confidence`) khi kết quả là `REJECT` trong `runDropJustificationCheck`, và ưu tiên `recommended_option` của JEV trong `runBicameralDecisionCheck`.
5. **Củng cố Cổng Hủy bỏ cho `todo(op="init", list)` Theo Giai đoạn & `todo(op="rm")` Trần — `typesafe-planner.ts` (Phased `todo(op="init", list)` & Bare `todo(op="rm")` Drop-Gate Hardening)**:
   - Hiện thực hóa hàm `extractTodoItemsFromOp` (ưu tiên `op.list` hơn `op.items` nhằm ngăn chặn hành vi buôn lậu tham số kép / dual-parameter smuggling), đặt cổng kiểm soát đối với lệnh gọi trần `todo(op="rm")` khi `activeContractedTasks.size > 0`, và xóa sạch trạng thái mô-đun khi kích hoạt `session_start`.

## 3. Xác minh & Triển khai (Verification & Deployment)
- Chạy `bun test` tại không gian làm việc cục bộ (Local workspace): **310 đạt (`pass`), 0 thất bại (`fail`)** (33 bộ kiểm thử / suites).
- Triển khai sang môi trường đích qua `tools\sync-baseline.bat` (`C:\Users\thant\Projects\omp_extension`): **325 đạt (`pass`), 0 thất bại (`fail`), 1230 lệnh gọi `expect()`** trên 35 bộ kiểm thử.
- Xác minh khói trực tiếp với `jev-1.13.0` (Live `jev-1.13.0` smoke verification) trên `runBicameralMacroCheck`: trả về `verdict: "AUTO_APPROVE", approved: true, deliverablesVerdict: "APPROVE", driftChoice: "no_drift", scopeChoice: "HOLD"`.
