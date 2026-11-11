# Giai đoạn 4: Bộ Kiểm thử TDD Hồi quy Toàn diện & Xác thực Đa kịch bản Ma trận Biên

> **Mục tiêu**: Xây dựng bộ kịch bản kiểm thử biên (`tests/unified-triad-architecture.test.ts`) kiểm chứng 100% các tình huống tấn công, rớt mạng, rò rỉ khóa, và trốn tránh kiểm thử theo tiêu chuẩn `ck:scenario`.

> **Điều chỉnh (2026-11-11)**: SC-07 (tự động leo thang M→H dẫn tới chấp thuận) bị loại theo quyết định thu hẹp phạm vi ở giai đoạn 3; thay bằng kiểm thử biên quyền hạn H (`tests/h-authority-boundary.test.ts`). Trước khi viết SC-01..SC-06, đối chiếu với các test hiện có (`ast-analyzer`, `typesafe-evidence-file`, `typesafe-redact`, `anti-blocking-middleware`, retry 429/503) để tránh trùng lặp.

---

## 1. Ma trận Kịch bản Biên (`ck:scenario` Edge Case Matrix)

| Mã Kịch bản (Scenario ID) | Tên Kịch bản & Điều kiện Biên (Edge Scenario) | Hành vi Dự kiến (Expected Invariant) |
|---|---|---|
| **SC-01** | **Rớt Mạng Ngoại tuyến (Network Drop / 503)** | Thử lại lũy thừa qua `RETRY_POLICY`; nếu kiệt sức, chuyển sang cơ chế fail-closed an toàn và kích hoạt Cố vấn Độc lập chẩn đoán, không crash tiến trình. |
| **SC-02** | **Quá tải API (429 Rate Limit + Retry-After)** | Giãn cách chính xác theo tiêu đề `Retry-After` và cooldown 45s; bảo toàn thế hệ khóa API trong bộ nhớ. |
| **SC-03** | **Tấn công Gian lận Test AST (Test Evasion Attack)** | `ast-analyzer.ts` phát hiện hành vi xóa `expect`, sửa thành `expect(1).toBe(1)`, hoặc thêm `.skip` $\rightarrow$ chặn đứng ngay lập tức tại Cổng 1. |
| **SC-04** | **Tấn công Đường dẫn TOCTOU & Symlink** | `typesafe-evidence-file.cjs` từ chối liên kết tượng trưng (symlink), Windows junction, và hardlink $\rightarrow$ ngăn chặn rò rỉ dữ liệu ngoài workspace. |
| **SC-05** | **Rò rỉ Khóa Bí mật trong State hoặc Câu hỏi** | `typesafe-redact.cjs` khử bỏ 100% token nhạy cảm trước khi gửi đi; bảo toàn các số nguyên đếm token viễn trắc (`TELEMETRY_COUNT_KEYS`). |
| **SC-06** | **Tác tử Cố tình Spam `ask` hoặc Gọi `todo block`** | `anti-blocking-middleware.ts` dập tắt hoàn toàn `ask` spam về lỗi code; chặn `todo block` bừa bãi và tự động nhúng mô tả Cố vấn tự chữa lành. |
| **SC-07** | **Leo thang Tự động từ Macro M sang Atomic H** | Khi biểu điểm `M` không thể phân giải do mâu thuẫn tiêu chí con $\rightarrow$ Tầng 3 tự động phân tách đồ thị DAG vị từ vi hạt mà không cần can thiệp thủ công. |

---

## 2. Các Bước Thực thi Cụ thể (Implementation Steps)

- [ ] Tạo tệp kiểm thử `tests/unified-triad-architecture.test.ts`.
- [ ] Triển khai 7 bài kiểm thử đơn vị tương ứng với 7 kịch bản ma trận biên trên.
- [ ] Đảm bảo toàn bộ các ca kiểm thử chạy độc lập, cách ly môi trường và dọn dẹp sạch sẽ tài nguyên sau khi kết thúc.
- [ ] Chạy kiểm thử tự động bằng `bun test tests/unified-triad-architecture.test.ts`.

---

## 3. Tiêu chí Chấp thuận (Acceptance Criteria)

- [ ] 7/7 bài kiểm thử trong `tests/unified-triad-architecture.test.ts` đạt kết quả PASS.
- [ ] Không có bài kiểm thử nào bị timeout hoặc gây ô nhiễm môi trường chạy của các bộ kiểm thử khác.
