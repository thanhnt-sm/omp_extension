---
phase: 1
title: "Chốt chặn Middleware Chống Tra khảo & Chống Treo Todo"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Chốt chặn Middleware Chống Tra khảo & Chống Treo Todo (Anti-Spam & Anti-Blocking Middleware Guards)

## Tổng quan (Overview)
Hiện thực hóa các chốt chặn middleware trong `typesafe-planner.ts` và `src/todo-lifecycle-authority.ts` để chấm dứt tình trạng tác tử spam công cụ `ask` khi gặp khó khăn kỹ thuật và cấm tác tử tự tiện chuyển `todo` sang trạng thái `blocked` khi kiểm thử thất bại hoặc thiếu bằng chứng.

## Yêu cầu (Requirements)
1. **Chặn `ask` về lỗi kỹ thuật (Block Technical `ask` Calls)**:
   - Trong sự kiện `tool_call` của `typesafe-planner.ts`, bắt mọi lời gọi `ask`.
   - Nếu câu hỏi chứa từ khóa hoặc ngữ nghĩa liên quan đến gỡ lỗi (debug, fix error, test fail, type error, code choice, implementation detail): Chặn cuộc gọi với thông báo lỗi rõ ràng, yêu cầu tác tử tự động tham vấn TypeSafe Judge hoặc Advisor.
   - Cho phép `ask` nếu câu hỏi thực sự liên quan đến ranh giới yêu cầu con người (domain requirements, product scope).
2. **Cấm `todo block` vì lỗi code/test (Prohibit `todo block` on Solvable Test/Code Failures)**:
   - Trong `src/todo-lifecycle-authority.ts`, kiểm tra lý do chuyển trạng thái `block` hoặc `drop`.
   - Nếu lý do là do test thất bại (`test failed`, `assertion error`, `missing implementation`, `EVIDENCE_REQUIRED` chưa giải quyết) mà chưa có xác nhận từ Cố vấn độc lập: Trả về trạng thái từ chối `EVIDENCE_REQUIRED` với thông điệp: "Không được đóng băng todo vì lỗi kiểm thử; phải tự động triệu hồi Advisor để nhận kế hoạch chữa lành".
3. **Tự động gắn mô tả phục hồi của Advisor (Auto-Attach Advisor Remediation Descriptor)**:
   - Khi `todo done` hoặc `typesafe_review_task` trả về trạng thái từ chối (`REJECTED`, `EVIDENCE_REQUIRED`), tự động chuẩn bị sẵn thông tin gọi `typesafe_prepare_advisor` để tác tử tiếp nhận và điều phối ngay trong lượt tiếp theo.

## Tệp mã nguồn liên quan (Related Code Files)
- Sửa đổi: `typesafe-planner.ts`
- Sửa đổi: `src/todo-lifecycle-authority.ts`
- Tạo mới: `tests/anti-blocking-middleware.test.ts`

## Các bước triển khai (Implementation Steps)
1. Viết kiểm thử hồi quy `tests/anti-blocking-middleware.test.ts` kiểm chứng:
   - Lời gọi `ask` kỹ thuật bị chặn.
   - Thao tác `todo(op="block")` khi kiểm thử hỏng bị từ chối với chỉ dẫn chữa lành.
   - Lời từ chối `todo done` chứa chỉ dẫn điều phối `typesafe_prepare_advisor`.
2. Sửa `typesafe-planner.ts`: Bổ sung hàm kiểm tra câu hỏi `isTechnicalImplementationQuestion(questions)` và chốt chặn `ask` trong `pi.on("tool_call")`.
3. Sửa `src/todo-lifecycle-authority.ts`: Bổ sung kiểm tra `isSolvableFailureReason(reason)` trong hàm `prepare()`.
4. Chạy kiểm thử đơn vị `bun test tests/anti-blocking-middleware.test.ts` để chứng minh vượt qua 100%.

## Tiêu chí chấp thuận (Success Criteria)
- [x] Mọi cuộc gọi `ask` liên quan đến lỗi kỹ thuật/code đều bị chặn và hướng dẫn tác tử gọi Advisor
- [x] Mọi thao tác `todo block` xuất phát từ lỗi kiểm thử hoặc thiếu bằng chứng đều bị từ chối
- [x] Toàn bộ bài kiểm thử trong `tests/anti-blocking-middleware.test.ts` vượt qua với exit code 0
