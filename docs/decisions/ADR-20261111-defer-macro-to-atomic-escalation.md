# ADR-20261111-defer-macro-to-atomic-escalation: Hoãn Tầng 3 (Tự động Leo thang Thẩm phán Vĩ mô M sang Thẩm phán Nguyên tử H) và Giữ H ở Chế độ Chạy Bóng (Shadow-Only)

Status: Decided (Đã Quyết định)  
Date: 2026-11-11  
Phạm vi (Scope): `plans/261103-unified-judge-jev-standardization/phase-03-unified-triad-runtime-escalation.md` (Tầng 3), `src/task-verification-runtime.ts`, `src/atomic-judge.ts`, `typesafe-planner.ts`  
Thay đổi một phần (Amends): [ADR-20261103](ADR-20261103-unified-judge-jev-architectural-standardization.md), mục Tầng 3 của Phương án D

---

## Question (Câu hỏi Quyết định)

Kế hoạch 261103 (giai đoạn 3) yêu cầu: khi biểu điểm `M` không phân giải được do mâu thuẫn tiêu chí con, tự động leo thang sang Thẩm phán Nguyên tử `H`, và nếu đồ thị vị từ của `H` đạt thì **chấp thuận hoàn thành**. Có nên triển khai đúng như vậy không?

---

## Context (Bối cảnh)

1. **Tighten-only (`CLAUDE.md`)**: phán quyết AI chỉ được thắt chặt chính sách, không được nới lỏng. Để `H` chấp thuận sau khi `M` đã không phê duyệt nghĩa là `H` lật ngược một phán quyết chặt hơn, tức là nới lỏng.
2. **Bất biến 5 (`docs/decisions/README.md` mục 7)**: `Bounded Hybrid-H` giữ tư cách phi thẩm quyền, chỉ chạy bóng, cho tới khi `tools/jev-paired-eval.ts decide` xác nhận vượt qua toàn bộ cổng thống trị trên tập giữ lại. Điều kiện này chưa đạt.
3. **Sai lệch đặc tả**: kế hoạch dùng trạng thái `CONCERNS`, nhưng trạng thái này không tồn tại trong `src/`. Phán quyết sản phẩm (`DeliverablesVerdict`) của `M` chỉ có `APPROVE` / `REJECT` / `NEXT_ACTION_REQUIRED` (`JevVerdict` có thêm `ESCALATE`); không có tín hiệu "mâu thuẫn tiêu chí con" để kích hoạt leo thang.
4. **Phân biệt với bộ đánh giá nguyên tử tất định**: `src/atomic-jev-evaluator.ts` chạy trong sản xuất (`src/cook-expert-judge.ts`) nhưng là bộ đánh giá tất định, chỉ bổ sung lý do; nó không phải Thẩm phán Nguyên tử `H` và không thuộc phạm vi ADR này.

---

## Options Considered (Các Phương án Được Xem xét)

| Phương án (Option) | Mô tả (Description) | Đánh giá (Assessment) |
|---|---|---|
| **A — Triển khai đúng kế hoạch** | `M` không phê duyệt → `H` chạy → `H` đạt thì chấp thuận | **Loại**: vi phạm tighten-only và bất biến 5. |
| **B — `H` chỉ bổ sung / phủ quyết** | `H` chỉ chạy trong `typesafe_review_task`, chỉ được thêm lý do hoặc phủ quyết; trạng thái gộp là trạng thái chặt hơn của `M` và `H` | Hợp lệ về chính sách, nhưng cần dữ liệu đối sánh và ADR riêng khi `jev-paired-eval decide` đạt. |
| **C — Hoãn Tầng 3, giữ `H` chạy bóng** *(được chọn)* | Không thêm đường leo thang; khóa ranh giới quyền hạn của `H` bằng test | Chọn: không đổi hành vi sản xuất, giữ nguyên các bất biến. |

---

## Decision (Quyết định)

**Chọn Phương án C.** Tầng 3 như viết trong kế hoạch bị loại. Giai đoạn 3 thu hẹp còn gia cố tighten-only cho Tầng 1 (preflight) và Tầng 4 (chốt chặn `ask`/`todo`). Kịch bản SC-07 của giai đoạn 4 được thay bằng `tests/h-authority-boundary.test.ts`, khẳng định `H` không thể tạo trạng thái `APPROVED_PENDING_COMMIT`.

Cách ra quyết định: cổng quyết định §10 ngày 2026-11-11 (advisor tổng hợp: `PROCEED_WITH_CHANGES`, độ tin cậy 0.85; không có biên nhận judge nguyên tử).

---

## Consequences (Hệ quả)

- Hiện không có đường mã nào cho phép `H` nới lỏng phán quyết của `M`: `APPROVED_PENDING_COMMIT` chỉ phát sinh ở `src/bicameral-consensus.ts` và `src/task-verification-runtime.ts`, không ở module nào của `H`. `tests/h-authority-boundary.test.ts` là chốt kiểm tĩnh (static tripwire) cho các điểm vào được liệt kê (bộ quét import theo `import`, `require` và `createRequire(...)`); nó **không** bắt được một module mới do `typesafe-planner.ts` nạp, hay việc nối `evaluationHost` vào đường `todo done`. Các thay đổi như vậy phải qua cổng quyết định §10.
- Các bước Tầng 3 trong `phase-03-unified-triad-runtime-escalation.md` được đánh dấu `[bỏ — thay thế bởi quyết định 2026-11-11]` và không tính vào tiến độ.
- Các mục tiêu độ trễ của Tầng 2 (`<400ms`, 1 request) không được đo trong phạm vi này.

---

## Reopen Triggers (Điều kiện Mở lại)

1. `tools/jev-paired-eval.ts decide` xác nhận `H` vượt qua cổng thống trị trên tập giữ lại (gỡ bất biến 5) → xem xét Phương án B qua cổng quyết định §10 hoặc `ck:council`.
2. `M` bổ sung tín hiệu tường minh cho mâu thuẫn tiêu chí con.
