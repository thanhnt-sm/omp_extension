# Di dời & Ổn định Mã nguồn (Source Code Relocation & Stabilization)

**Ngày (Date)**: 2026-10-03  
**Ngữ cảnh (Context)**: Mã nguồn thượng nguồn (upstream source) được lưu trữ tại `C:/Users/thant/tmp`  
**Mục tiêu (Goal)**: Ngăn ngừa mất mát dữ liệu và đồng bộ với kỳ vọng của lập trình viên bằng cách di chuyển mã nguồn sang một thư mục cố định lâu dài (permanent directory).

## Vấn đề (The Problem)
Thư mục `tmp` trên Windows, mặc dù không phải là biến môi trường `%TEMP%` của hệ thống, vẫn mang rủi ro ngữ nghĩa cố hữu (inherent semantic risk). Lập trình viên có thể vô tình xóa hoặc ghi đè lên thư mục này vì giả định rằng nội dung bên trong chỉ là tạm thời (ephemeral). Hơn nữa, vị trí này gây ra ma sát nhận thức (cognitive friction) đối với một dự án được định hướng bảo trì dài hạn.

## Giải pháp (The Solution)
Sau cuộc đánh giá rủi ro đa góc nhìn (multi-persona risk assessment — `ck:predict`), quyết định đồng thuận tuyệt đối là di dời dự án sang một không gian làm việc chính thức (formal workspace).

1. **Đích Di dời (Relocation Target)**: Tạo thư mục `C:/Users/thant/Projects/omp_extension` và sao chép toàn bộ cơ sở mã nguồn (codebase) từ `tmp` sang vị trí bền vững này bằng mô-đun `fs` của Node nhằm ngăn chặn các sự cố khóa tập tin ở cấp hệ điều hành (OS-level file lock issues) trên Windows.
2. **Cập nhật Trình trung chuyển Ủy nhiệm (Proxy Update)**: Cập nhật phần mở rộng OMP đã triển khai tại `~/.omp/agent/extensions/typesafe-planner.ts` để xuất (export) từ thư mục mới:
   ```typescript
   export { default } from "C:/Users/thant/Projects/omp_extension/typesafe-planner.ts";
   ```
3. **Quản lý Phiên bản (Version Control)**: Khởi tạo kho lưu trữ Git (`git init`, `add`, `commit`) tại thư mục mới để đảm bảo cơ sở mã nguồn được theo dõi lịch sử và bảo vệ trước nguy cơ mất mát ngoài ý muốn.

## Xác minh (Verification)
- Chạy `bun test` trong `C:/Users/thant/Projects/omp_extension` đạt 100% bài kiểm thử (83 bài kiểm thử trên 11 tập tin).
- Phần mở rộng ủy nhiệm (proxy extension) nạp hoàn hảo không lỗi.
- Thư mục `tmp` không còn là nguồn chân lý (source of truth) trọng yếu nữa.
