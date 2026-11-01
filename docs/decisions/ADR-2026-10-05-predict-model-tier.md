# ADR-2026-10-05-predict-model-tier: Định tuyến Mô hình Phân tầng Nhanh (Fast-Tier Model Routing) & Phân tích Tiền trạm Đa nhân cách (Multi-Persona Pre-Analysis — `ck:predict`)

- **Trạng thái (Status):** Đã chấp thuận — Đã triển khai trong Cơ sở Không gian làm việc (Accepted — Implemented in Workspace Baseline)
- **Ngày (Date):** 2026-10-05

---

## 1. Bối cảnh (Context)

Kế hoạch `plans/261005-predict-recommendations` giới thiệu cơ chế Phân tích Tiền trạm Đa nhân cách (Multi-Persona Pre-Analysis — `ck:predict`) trước khi sinh mã nguồn (code generation). Cơ chế này cần đánh giá đồng thời 5 góc nhìn chuyên gia (Kiến trúc sư (Architect), Bảo mật (Security), Hiệu năng (Performance), Trải nghiệm người dùng (UX), và Người phản biện (Devil's Advocate)) thông qua nền tảng TypeSafe System One.

Trong quá trình thiết kế và tích hợp, hệ thống đối mặt với 3 thách thức kỹ thuật cốt lõi (Core Technical Problems):
1. **Thiếu định danh `jev-fast` ở hệ thống thượng nguồn (Missing Upstream `jev-fast` Identifier):** Giao diện lập trình ứng dụng (API) chính thức của TypeSafe hỗ trợ `jev-latest` và `jev-1.13`, nhưng chưa công bố công khai điểm cuối (endpoint) hoặc định danh mô hình `jev-fast`.
2. **Khác biệt về chi phí và độ trễ (Cost & Latency Trade-offs):** Chạy 5 câu hỏi đánh giá liên tục qua mô hình `jev-latest` trên mỗi lần lập kế hoạch có thể làm tăng độ trễ phản hồi (response latency) và tiêu tốn hạn mức cuộc gọi (API quota) nếu không có cơ chế phân tầng mô hình (model tiering).
3. **Nguy cơ Vượt rào khi Chuyển đổi dự phòng (Fallback Bypass Risk):** Nếu phía máy khách (client) tự động giả lập (mock) điểm số tối đa `3/3` khi cuộc gọi API thất bại hoặc khi bí danh mô hình (model alias) không tồn tại, tính toàn vẹn của TypeSafe sẽ bị xâm phạm, vi phạm trực tiếp Bất biến Chỉ Thắt chặt (Tighten-Only Invariant).

---

## 2. Phương án thay thế đã cân nhắc (Alternatives Considered)

| Phương án (Option) | Mô tả chi tiết (Description) | Đánh giá (Evaluation) |
|---|---|---|
| **Phương án A: Nhúng trực tiếp logic 5 góc nhìn vào `typesafe-planner.ts` và ép cứng `jev-latest` (Inline Monolithic Evaluation)** | Đặt toàn bộ câu hỏi và bộ tính điểm đồng thuận (consensus scoring) ngay trong tệp máy chủ tiện ích mở rộng (extension host) và chỉ gọi duy nhất mô hình `jev-latest`. | **Loại bỏ (Rejected):** Làm phình to tệp điều phối chính, khó kiểm thử đơn vị (unit testing) độc lập và không linh hoạt khi TypeSafe mở rộng phân tầng mô hình tốc độ cao (`jev-fast`). |
| **Phương án B: Chuyển đổi dự phòng Mở — Tự động gán điểm `3/3` khi lỗi mô hình (Fail-Open Mock Fallback)** | Gửi yêu cầu tới `jev-fast`; nếu máy chủ trả về lỗi không tìm thấy mô hình hoặc lỗi mạng, tự động điền điểm đồng thuận `3/3` để không chặn luồng lập kế hoạch. | **Loại bỏ (Rejected):** Vi phạm nghiêm trọng nguyên tắc Đóng băng An toàn khi Lỗi (Fail-Closed) và Bất biến Chỉ Thắt chặt (Tighten-Only Invariant). |
| **Phương án C: Tách rời Mô-đun Tranh biện Độc lập, Định tuyến Phân tầng Linh hoạt kèm Khiên Bảo vệ Toàn vẹn (Decoupled Debate Evaluator + Safe Tier Fallback + Integrity Shield — Được chọn)** | Tách riêng mô-đun `src/debate-evaluator.ts`, hỗ trợ tham số `model` với cơ chế chuyển đổi dự phòng an toàn (safe fallback) từ `jev-fast` về `jev-latest`, đồng thời khóa bảo vệ tệp trong danh sách toàn vẹn. | **Chấp thuận (Accepted):** Đảm bảo tính mô-đun hóa (modularity), an toàn bảo mật và sẵn sàng tương thích ngược lẫn tương thích tiến. |

---

## 3. Quyết định (Decision)

1. **Tách rời Mô-đun Tranh biện Độc lập (Decoupled Debate Evaluator Module — `src/debate-evaluator.ts`):**
   - Toàn bộ logic của 5 nhân cách đánh giá (5 personas), cấu trúc câu hỏi (question schema) và thuật toán tính điểm đồng thuận (consensus scoring) được tách biệt hoàn toàn khỏi tiến trình máy chủ tiện ích mở rộng (extension host).
2. **Cấu hình Phân tầng Mô hình Linh hoạt (Flexible Model Tier Configuration):**
   - Hỗ trợ tham số `model` tùy chọn trong hàm thực thi `executeTypeSafe`.
   - Phía máy khách (client) cho phép gửi `model: "jev-fast"`, đồng thời thực hiện chuyển đổi dự phòng an toàn (safe fallback) về `jev-latest` nếu máy chủ chưa hỗ trợ mà không làm đứt gãy luồng thực thi (execution flow) và tuyệt đối không giả lập điểm số ảo.
3. **Khiên Bảo vệ Toàn vẹn (Integrity Shield):**
   - Đưa đường dẫn `src/debate-evaluator.ts` vào danh sách mẫu bảo vệ toàn vẹn `PROTECTED_INTEGRITY_PATTERNS` bên trong `typesafe-planner.ts` nhằm ngăn chặn tác tử (agent) tự ý sửa đổi logic chấm điểm trong lúc chạy.
4. **Quy trình Đồng bộ và Triển khai An toàn (Safe Baseline Synchronization Workflow):**
   - Cung cấp bộ công cụ sao lưu và triển khai tự động `tools/sync-baseline.bat` và `tools/sync-baseline.cjs` để người dùng chủ động đồng bộ từ không gian làm việc nguồn (source workspace) `D:\100.Software\Github\omp_extension` sang thư mục đích (target runtime) `C:\Users\thant\Projects\omp_extension`.

---

## 4. Hệ quả (Consequences)

- **Tích cực (Positive):**
  - Kiến trúc tách bạch rõ ràng giữa tầng điều phối (orchestration layer) trong `typesafe-planner.ts` và tầng đánh giá đa nhân cách (multi-persona evaluation layer) trong `src/debate-evaluator.ts`.
  - Bảo toàn tuyệt đối Bất biến Chỉ Thắt chặt (Tighten-Only Invariant) và bảo vệ chống ghi đè trái phép thông qua `PROTECTED_INTEGRITY_PATTERNS`.
  - Quá trình triển khai sang môi trường chạy thực tế có bản sao lưu tự động (automated backup) và kiểm tra tính toàn vẹn.
- **Đánh đổi & Ràng buộc (Trade-offs & Constraints):**
  - Khi định danh `jev-fast` chưa được bật riêng ở phía máy chủ thượng nguồn, các yêu cầu sẽ chuyển tiếp về `jev-latest`, do đó độ trễ thực tế phụ thuộc vào tốc độ xử lý theo lô (batch processing) của `jev-latest`.

---

## 5. Bằng chứng kiểm chứng (Verification Evidence)

- **Mô-đun thực thi (Implementation Module):** `src/debate-evaluator.ts` định nghĩa đầy đủ 5 góc nhìn chuyên gia và hàm tổng hợp điểm đồng thuận.
- **Bảo vệ toàn vẹn (Integrity Protection):** `typesafe-planner.ts` đăng ký `src/debate-evaluator.ts` trong hằng số `PROTECTED_INTEGRITY_PATTERNS`.
- **Công cụ triển khai (Deployment Tooling):** `tools/sync-baseline.bat` và `tools/sync-baseline.cjs` thực thi sao lưu có gắn dấu thời gian (timestamped backup) trước khi đồng bộ sang thư mục đích.
