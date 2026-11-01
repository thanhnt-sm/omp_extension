---
title: "ADR-20261014: Kiểm toán Đối kháng Đa Tác tử, Gỡ lỗi, Rà soát Mã nguồn & Dự báo 5 Phiên oh-my-pi Gần nhất (Multi-Agent Red-Team, Debug, Code Review & Predict Audit: TypeSafe, Judge, JEV & Advisor)"
date: 2026-10-14
type: redteam-audit-and-predict-report
status: completed
skills_used:
  - ck:team
  - ck:scout
  - ck:research
  - ck:docs-seeker
  - ck:debug
  - ck:code-review
  - ck:advisor
  - ck:council
  - ck:predict
  - ck:journal
  - ck:project-organization
---

# ADR-20261014-typesafe-jev-advisor-overhaul: Kiểm toán Pháp y & Đối kháng Toàn diện (Comprehensive Red-Team & Forensic Audit) và Đại tu TypeSafe, Judge, JEV (`jev-1.13.0`) & Cố vấn (Advisor) qua 5 Phiên `oh-my-pi`

- **Trạng thái (Status):** Đã hoàn thành & Đã quyết định (Completed & Decided)
- **Ngày (Date):** 2026-10-14
- **Loại hồ sơ (Record Type):** Báo cáo Kiểm toán Đối kháng, Dự báo Kiến trúc & Hồ sơ Quyết định Kiến trúc (Red-Team Audit, Predict Report & Architecture Decision Record)

---

## 1. Bối cảnh & Tóm tắt Điều hành (Context & Executive Summary)

Toàn bộ các nghi vấn kỹ thuật do người dùng nêu ra đều được **xác nhận 100% bằng bằng chứng mã nguồn (source-code evidence) và dữ liệu đo đạc từ xa trên phiên chạy thực tế (live session telemetry evidence)**:

### 1.1. Tại sao hộp thoại `Bicameral Consensus Escalation (Lobe 2: ESCALATE | 3 consecutive failed revision attem)` bật lên làm phiền người dùng?
Hiện tượng này gây ra bởi một **chuỗi khiếm khuyết 3 mắt xích (3-part defect chain)** tại `typesafe-planner.ts:1797, 2036`, `src/cook-expert-judge.ts:185-191`, và `src/bicameral-consensus.ts:448, 613, 712`:
1. **Lần thử 1 (Attempt 1 — `currentFailures=0, attemptCount=1`):** Thất bại tại Cổng 2 Kiểm tra Vĩ mô (Gate 2 Macro-Check với `meets_criteria=0.45`, `NEXT_ACTION_REQUIRED`) bởi vì hàm `sanitizeStateForTypeSafe` (`typesafe-planner.ts:533`) cắt đầu (head-clamp) trường `deliverable_artifacts` xuống còn 2.000 ký tự và câu hỏi `deliverables_verdict` lại chấm điểm một nhiệm vụ con đơn lẻ (single sub-task) so với toàn bộ yêu cầu người dùng của cả phiên (`user_request`). Biến đếm `consecutiveFailuresByTask` tăng lên `1`.
2. **Lần thử 2 (Attempt 2 — `currentFailures=1, attemptCount=2`):** Khi công cụ `write` và `todo(op="done")` được gọi gom lô trong cùng một lượt phản hồi của trợ lý (batched in the same assistant turn), bộ bắt sự kiện `pi.on("tool_call", handleTodoInterception)` kích hoạt trước khi lệnh `write` kịp ghi xuống đĩa cứng (flush to disk), dẫn đến mã băm `currentDiffHash === prevRemediation.diffHash`. Chốt chặn Khắc phục Cổng 0 (Gate 0 Remediation Ratchet) lập tức từ chối mà không gọi JEV và cộng dồn `consecutiveFailuresByTask` lên `2`.
3. **Lần thử 3 (Attempt 3 — `currentFailures=2, attemptCount=3`) — Ngắt mạch Lệch Một Đơn vị (Off-by-One Short-Circuit):** Tệp `typesafe-planner.ts:2036` truyền `attemptCount: currentFailures + 1` (tức bằng `3`). Dòng 185 của `src/cook-expert-judge.ts` kiểm tra điều kiện `if (ctx.attemptCount >= 3)` **ngay ở đầu hàm `runPhaseMacroCheck` TRƯỚC KHI gọi JEV**, trả về ngay lập tức `{ approved: false, escalateToUser: true, reasons: ["3 consecutive failed revision attempts reached..."] }` với `verdict: undefined`. Hàm `runBicameralMacroCheck` ánh xạ `verdict: undefined` thành `jev.verdict = "ESCALATE"`, trong khi biểu thức chính quy (regex) của Thùy 1 (Lobe 1) khớp chuỗi `[toolCall:` và trả về `ALLOW (0.90)`. Tiếp đó, `arbitrateConsensus` trả về `HUMAN_ESCALATION`, và `typesafe-planner.ts:2055` bật hộp thoại xác nhận `ui.confirm()` với hàm `formatConsensusEscalation` cắt ngắn lý do xuống đúng 35 ký tự (`"3 consecutive failed revision attem"`).

### 1.2. Tại sao phán quyết `REJECT` của JEV bị ghi đè ngầm thành `Decision: APPROVED (by: human)` trong khi phán quyết nhẹ hơn là `NEXT_ACTION_REQUIRED` lại chặn tác tử?
- Thùy 1 (`evaluateAdvisorIntent` trong `src/bicameral-consensus.ts:443-525`) thực chất chỉ là một bộ khớp biểu thức chính quy cục bộ (local regex matcher) tìm mẫu `/\[toolCall:|\[toolResult:/i` bên trong `agentWorkLog` (vốn luôn được tiêm vào bởi `collectConversationContext` ở mọi lượt chạy) và **không bao giờ trả về `DISALLOW` đối với thao tác `operation === "done"`**.
- Hệ quả là nhánh Tự động Từ chối `AUTO_REJECT` (`advisor === "DISALLOW" && jev === "REJECT"` tại dòng `592`) trở thành **mã chết 100% không bao giờ chạm tới được (100% unreachable dead code)**. Mọi phán quyết `REJECT` từ JEV (với $P=0.00, 0.09, 0.13, 0.35, 0.52$) đều rơi vào tổ hợp `ALLOW + REJECT -> HUMAN_ESCALATION` (dòng `607`), bật hộp thoại `ui.confirm` ngay ở Lần thử số 1 và ghi nhật ký thành `Decision: APPROVED (by: human)`.

### 1.3. Tại sao nội dung sai lệch hoặc bị cắt hỏng lại được gửi tới JEV?
- Hàm `sanitizeStateForTypeSafe` (`typesafe-planner.ts:510-555`) thực hiện cắt đầu (head-clamp) đối với `agent_work_log` và `test_summary` (vốn trước đó đã được `runPhaseMacroCheck` cắt đuôi — tail-clamp — xuống 3.000 ký tự) xuống chỉ còn 2.000 hoặc 950 ký tự tính từ đầu chuỗi (`"head"`), **xóa sổ hoàn toàn phần đuôi chứa 1.000–2.050 ký tự mới nhất của nhật ký công việc và kết quả kiểm thử**!
- Hàm `collectTaskEvidence` (`src/evidence-collector.ts:346-356, 370-405`) bỏ sót các khác biệt của tệp chưa được theo dõi (untracked `??` file diffs) khi không có mốc cơ sở (`baseline`), khiến `gitDiff: ""` bị gửi rỗng trong `xd://typesafe_verify_completion`, hoặc ngược lại đổ toàn bộ cây làm việc đang bẩn (dirty working tree) của cả dự án khi một nhiệm vụ không tạo ra thay đổi trên các tệp đã theo dõi.
- Hàm `collectConversationContext` (`typesafe-planner.ts:654`) cắt kẹp các mục `toolResult` xuống 400 ký tự tính từ cuối (`"tail"`), vứt bỏ 100% nội dung báo cáo `<task-result>` của tác tử con (subagent outputs) và chỉ giữ lại dòng chân trang `"is now idle"` của OMP.

### 1.4. Tại sao cách sử dụng Nguyên hàm (Primitive Usage) & Cố vấn (Advisor) bị lỗi thiết kế?
- Hàm `evaluateAdvisorDecision` (`src/bicameral-consensus.ts:162-359`) là một bộ chấm điểm túi từ bằng regex (bag-of-words regex scorer: cộng `+0.25` cho bất kỳ từ 4 chữ cái nào trùng trong `userRequest`, `+0.15` trong `workLog`, `+0.25` cho chuỗi `(Recommended)`, `+0.12` cho các từ khóa thời thượng) rồi tự nhận độ tự tin `confidence: 0.98` và đè bẹp lựa chọn khuyến nghị `recommended_option` của JEV bất cứ khi nào `advisor.confidence > 0.75` (dòng `967`).
- Hàm `runDropJustificationCheck` (`src/cook-expert-judge.ts:673`) gán nhầm độ tự tin `drop_verdict.confidence` của một lựa chọn từ chối (`REJECT`) vào biến `dropJustifiedNoul`, in ra thông báo mâuthuẫn `Judge: drop_justified=0.58 (reject < 0.30)` ngay khi JEV vừa từ chối lệnh hủy bỏ nhiệm vụ.
- Thao tác khởi tạo theo pha `todo(op="init", list=[...])` (`typesafe-planner.ts:1532, 1724`) bỏ qua trường `op.list`, khiến tập hợp `activeContractedTasks` bị rỗng và làm cho lệnh `todo(op="rm")` lọt qua cổng kiểm soát hủy bỏ (drop gate) hoàn toàn.

---

## 2. Phương án thay thế đã cân nhắc (Alternatives Considered)

| Phương án (Option) | Mô tả chi tiết (Description) | Đánh giá (Evaluation) |
|---|---|---|
| **Phương án 1: Vá cục bộ giới hạn ký tự và giữ nguyên bộ khớp regex ở Thùy 1 (Patch Character Limits Only)** | Chỉ nâng giới hạn ký tự trong `sanitizeStateForTypeSafe` nhưng giữ nguyên logic regex `ALLOW (0.90)` và cách tính `attemptCount >= 3`. | **Loại bỏ (Rejected):** Không giải quyết được mã chết `AUTO_REJECT`, lỗi lệch một đơn vị ở lần thử thứ 3, hay lỗi chấm điểm túi từ giả hiệu của Cố vấn. |
| **Phương án 2: Vô hiệu hóa Thùy 1 (Advisor) và quay về cổng chặn đơn lẻ (Disable Lobe 1 Advisor Completely)** | Xóa bỏ hoàn toàn mô-đun `src/bicameral-consensus.ts` và chỉ dùng kết quả đơn lẻ từ `src/cook-expert-judge.ts`. | **Loại bỏ (Rejected):** Đánh mất cơ chế đối sánh ý định – bằng chứng (intent-vs-evidence cross-check) và phá vỡ kiến trúc đồng thuận lưỡng viện. |
| **Phương án 3: Đại tu Toàn diện Chuỗi Thu thập Bằng chứng, Khắc phục Ngắt mạch Lần thử, Chuẩn hóa Chiều Cắt Chuỗi và Tái thiết Cố vấn – JEV (Comprehensive Evidence, Ratchet, Clamping & Bicameral Overhaul — Được chọn)** | Sửa chữa toàn bộ 4 nhóm lỗi gốc rễ: bảo toàn phần đuôi nhật ký (`tail`), sửa điều kiện ngắt mạch `attemptCount`, thu thập đầy đủ tệp chưa theo dõi (`??`) và `op.list`, đồng thời loại bỏ việc đóng dấu cao su `ALLOW (0.90)` của Cố vấn. | **Chấp thuận (Accepted):** Giải quyết tận gốc toàn bộ các lỗi được phát hiện qua kiểm toán pháp y trên 5 phiên chạy thực tế. |

---

## 3. Quyết định (Decision)

1. **Sửa lỗi Ngắt mạch Sớm và Cắt chuỗi Thông báo Leo thang (Fix Early Short-Circuit & Escalation Truncation):**
   - Không ngắt mạch trả về `verdict: undefined` trước khi gọi JEV ở lần thử thứ 3; đảm bảo JEV luôn được đánh giá bằng chứng mới nhất trước khi quyết định leo thang.
   - Bỏ giới hạn cắt cụt 35 ký tự trong `formatConsensusEscalation` để hiển thị đầy đủ lý do leo thang cho người dùng.
2. **Bảo toàn Dữ liệu Đuôi và Bằng chứng Tệp Mới (Preserve Tail Context & Untracked File Evidence):**
   - Đồng bộ hóa chiều cắt chuỗi (clamping direction) giữa `runPhaseMacroCheck` và `sanitizeStateForTypeSafe`: giữ phần đuôi (`"tail"`) cho `agent_work_log` và `test_summary` để không bao giờ xóa mất kết quả kiểm thử và hành động vừa thực hiện.
   - Mở rộng giới hạn trích xuất kết quả công cụ trong `collectConversationContext` và thu thập đầy đủ nội dung tệp mới chưa theo dõi (`??`) trong `collectTaskEvidence`.
3. **Khôi phục Nhánh `AUTO_REJECT` Thực chất và Quản lý Hợp đồng `op.list` (Restore Real `AUTO_REJECT` & `op.list` Contract Tracking):**
   - Loại bỏ cơ chế tự động trả về `ALLOW (0.90)` vô điều kiện khi thấy chuỗi `[toolCall:`; bổ sung các nhánh kiểm tra bằng chứng âm tính (`DISALLOW`) thực chất khi kiểm thử thất bại hoặc thiếu bằng chứng sản phẩm bàn giao.
   - Sửa lỗi gán nhầm `drop_verdict.confidence` khi `choice === "REJECT"` trong `runDropJustificationCheck`.
   - Phân giải đầy đủ các mục nhiệm vụ trong `op.list` khi gọi `todo(op="init", list=[...])` để đăng ký vào `activeContractedTasks`.

---

## 4. Hệ quả (Consequences)

- **Tích cực (Positive):**
  - Chấm dứt hoàn toàn hiện tượng bật hộp thoại leo thang giả tạo ở lần thử thứ 3 với dòng chữ bị cắt cụt `"3 consecutive failed revision attem"`.
  - JEV nhận được trọn vẹn kết quả kiểm thử mới nhất ở cuối nhật ký và nội dung các tệp tạo mới, xóa bỏ các phán quyết từ chối oan do mất ngữ cảnh.
  - Mọi nhiệm vụ khởi tạo qua cấu trúc phân pha `list` đều được giám sát chặt chẽ bởi cổng kiểm soát hủy bỏ (drop gate).
- **Ràng buộc Tiếp nối (Follow-up Constraints):**
  - Đặt nền tảng trực tiếp cho bản hiệu chuẩn toàn diện Cố vấn dựa trên JEV và xóa bỏ triệt để tàn dư ngưỡng `0.80`/`0.30` trong `ADR-20261015-advisor-judge-jev-true-calibration.md`.

---

## 5. Bằng chứng kiểm chứng (Verification Evidence)

- **Vị trí Mã nguồn được Kiểm toán & Khắc phục (Audited & Patched Source Locations):**
  - `typesafe-planner.ts` (các dòng xử lý `sanitizeStateForTypeSafe`, `collectConversationContext`, `op.list`, và `handleTodoInterception`).
  - `src/cook-expert-judge.ts` (xử lý `attemptCount`, `runPhaseMacroCheck`, và `runDropJustificationCheck`).
  - `src/bicameral-consensus.ts` (xử lý `evaluateAdvisorIntent`, `evaluateAdvisorDecision`, `arbitrateConsensus`, và `formatConsensusEscalation`).
  - `src/evidence-collector.ts` (thu thập khác biệt cho tệp chưa theo dõi `??` và cô lập theo mốc cơ sở `baseline`).
- **Kiểm thử Xác nhận (Verification Tests):** Được kiểm chứng qua bộ kiểm thử hồi quy trong `tests/typesafe-planner.test.ts`, `tests/cook-expert-judge.test.ts`, và `tests/todo-drop-gate.test.ts`.
