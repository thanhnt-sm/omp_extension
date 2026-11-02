---
phase: 2
title: "Thẩm phán Jev Nguyên tử Từng bước"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Thẩm phán Jev Nguyên tử Từng bước (Atomic TypeSafe Jev Judge Incremental Verification)

## Tổng quan (Overview)
Kích hoạt cơ chế Thẩm phán Nguyên tử (Atomic Judge) sử dụng mô hình `typesafe/jev-1.14.0` đã đăng ký trong `modelRoles.judge` của OMP. Cung cấp API đánh giá vi mô (micro-evaluations) để kiểm chứng ngay từ các thay đổi nhỏ (micro-diffs, AST patches, test assertions), đảm bảo chất lượng từ gốc và tránh hiện tượng dồn lỗi tích lũy ở cuối phiên.

## Yêu cầu (Requirements)
1. **Đánh giá Nguyên tử Đa chiều (Atomic Multi-Question Judgments)**:
   - Hỗ trợ các câu hỏi nguyên tử:
     - `bool`: Kiểm tra tính toàn vẹn chức năng, không xóa bài kiểm thử, không evasion.
     - `choice`: Xác định mức độ trôi dạt kiến trúc (`no_drift`, `minor_drift`, `severe_drift`) và tuân thủ ranh giới (`safe`, `boundary_violation`).
     - `score`: Chấm điểm độ tin cậy và bao phủ (0.00 - 3.00).
2. **Cầu nối Thẩm phán Native (Native Judge Bridge Integration)**:
   - Tận dụng `typesafe_judge` và `typesafe_evaluate_multi` để thực thi phán đoán qua cấu trúc câu hỏi chuẩn mực.
   - Khi có thay đổi mã nguồn trong phiên, tự động kích hoạt đánh giá nhanh (`<200ms`) để thông báo tình trạng chất lượng cho tác tử.
3. **Phản hồi Tức thì & Đóng băng An toàn (Fail-Closed Fast Feedback)**:
   - Nếu phát hiện vi phạm ranh giới hoặc xóa bỏ assertion kiểm thử, lập tức phát cờ cảnh báo kèm lý do vi phạm chi tiết mà không làm gián đoạn tiến trình chung.

## Tệp mã nguồn liên quan (Related Code Files)
- Sửa đổi: `src/cook-expert-judge.ts`
- Sửa đổi: `src/verification-gate.ts`
- Sửa đổi: `src/semantic-judge-client.ts`
- Tạo mới: `tests/atomic-jev-judge.test.ts`

## Các bước triển khai (Implementation Steps)
1. Viết kiểm thử `tests/atomic-jev-judge.test.ts` cho các trường hợp:
   - Đánh giá diff hợp lệ: trả về `no_drift`, score cao, pass.
   - Đánh giá diff có hành vi xóa test/assertion: trả về `severe_drift` / fail với lý do vi phạm.
2. Cập nhật `src/cook-expert-judge.ts` và `src/verification-gate.ts` để tối ưu hóa việc phân tích câu hỏi nguyên tử.
3. Kiểm thử tích hợp chạy qua `bun test tests/atomic-jev-judge.test.ts`.

## Tiêu chí chấp thuận (Success Criteria)
- [ ] Mọi phán đoán vi mô trả về đúng định dạng có kiểu (`bool`, `choice`, `score`)
- [ ] Phát hiện ngay lập tức các vi phạm kiến trúc hoặc sửa test tiêu cực
- [ ] Toàn bộ bài kiểm thử trong `tests/atomic-jev-judge.test.ts` vượt qua với exit code 0
