---
phase: 3
title: "Cố vấn Chữa lành Chủ động & Tái lập Kế hoạch"
status: completed
priority: P1
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Cố vấn Chữa lành Chủ động & Tái lập Kế hoạch (Proactive Advisor Remediation & Re-planning Loop)

## Tổng quan (Overview)
Hoàn thiện vòng lặp tự động triệu hồi Cố vấn Độc lập (`agents/advisor.md`) khi Thẩm phán Jev từ chối hoặc khi kiểm thử thất bại. Advisor chịu trách nhiệm phân tích nguyên nhân gốc rễ, đưa ra các phương án kỹ thuật xếp hạng và xây dựng kế hoạch sửa chữa theo thứ tự phụ thuộc (dependency-ordered action items) để đẩy lại cho AI Agent thực thi triệt để.

## Yêu cầu (Requirements)
1. **Triệu hồi Tự động khi Judge Không Đạt (Automatic Trigger on Rejection)**:
   - Khi `typesafe_review_task` hoặc `verification-gate` trả về `REJECTED`, `EVIDENCE_REQUIRED` do lỗi mã, hệ thống chuẩn bị sẵn mô tả Advisor `typesafe_prepare_advisor` với `decision: "stuck"`.
2. **Hợp đồng 6 Mục Bắt buộc của Advisor (`agents/advisor.md`)**:
   - Cập nhật và bảo đảm prompt của Advisor luôn trả về đủ 6 phần cố định:
     1. `## Verdict` (`proceed` | `revise` | `block`)
     2. `## Recommendation` (phân tích nguyên nhân gốc rễ & kế hoạch sửa chữa cụ thể)
     3. `## Ranked options` (các phương án kỹ thuật xếp hạng kèm rủi ro)
     4. `## Findings` (danh sách lỗi chính xác tại `file:line`)
     5. `## Confidence` (độ tin cậy từ `0.00` đến `1.00`)
     6. `## Open questions` (`None` nếu đủ bằng chứng)
3. **Cơ chế Tái lập Kế hoạch & Chuyển giao Thực thi (Re-planning & Execution Handshake)**:
   - AI Agent tiếp nhận trực tiếp `Recommendation` từ Advisor, cập nhật lại danh sách công việc cần làm, thực hiện sửa đổi mã nguồn và chạy lại kiểm thử đến khi vượt qua hoàn toàn.

## Tệp mã nguồn liên quan (Related Code Files)
- Sửa đổi: `src/advisor-host-dispatch.ts`
- Sửa đổi: `src/task-verification-advisor.ts`
- Sửa đổi: `agents/advisor.md`
- Sửa đổi: `.omp/agents/advisor.md`
- Tạo mới: `tests/proactive-advisor-dispatch.test.ts`

## Các bước triển khai (Implementation Steps)
1. Viết bài kiểm thử `tests/proactive-advisor-dispatch.test.ts` mô phỏng luồng:
   - Thất bại kiểm thử hoặc Judge trả về REJECT.
   - `typesafe_prepare_advisor` được kích hoạt tự động với đầy đủ ngữ cảnh lỗi.
   - Kết quả trả về của Advisor tuân thủ nghiêm ngặt cấu trúc 6 phần cố định và chứa kế hoạch hành động cụ thể.
2. Sửa `src/advisor-host-dispatch.ts` và `src/task-verification-advisor.ts` để đồng bộ hoá việc tạo descriptor phục hồi.
3. Đồng bộ nội dung `agents/advisor.md` sang `.omp/agents/advisor.md` và `.omp/agents/ck-advisor.md`.
4. Chạy kiểm thử đơn vị `bun test tests/proactive-advisor-dispatch.test.ts`.

## Tiêu chí chấp thuận (Success Criteria)
- [ ] Advisor tự động được chuẩn bị khi có sự cố kỹ thuật hoặc Judge từ chối
- [ ] Đầu ra của Advisor luôn chứa kế hoạch hành động chi tiết có thứ tự phụ thuộc
- [ ] Toàn bộ bài kiểm thử trong `tests/proactive-advisor-dispatch.test.ts` vượt qua với exit code 0
