---
title: "Bàn giao Vận hành: Độc lập .claude, Quản trị ExcludeProjects và Tiến trình Quyết toán"
status: completed
---
# Bàn giao Vận hành: Độc lập .claude, Quản trị ExcludeProjects và Tiến trình Quyết toán

## Kết quả Thực thi Đã Đạt được (Verified Outcomes)

1. **Hoàn tất Tách rời Hoàn toàn khỏi `.claude` (Full Independence from `.claude`)**:
   - Bộ phân giải `src/typesafe-enabled-resolver.cjs` chỉ đọc nguồn cấu hình OMP tại `~/.omp/agent/typesafe.json`. Không đọc, không nạp, không ghi và không sao chép dữ liệu từ `.claude`.
   - Manifest Schema được nâng cấp lên **Version 2**. Chỉ quản lý 2 gốc hợp lệ: `target` (`C:/Users/thant/Projects/omp_extension`) và `global_omp_agents` (`~/.omp/agent/agents`). Loại bỏ toàn bộ việc kiểm tra hay copy vào `global_claude`.
   - Quá trình chuyển đổi (migration) từ Schema 1 sang Schema 2 diễn ra an toàn: kiểm tra hợp lệ siêu dữ liệu cũ theo danh sách trắng 5 tệp rồi loại bỏ quyền quản lý mà tuyệt đối không đọc, ghi hoặc xóa tệp Claude nào trên ổ đĩa.
   - Hậu kiểm sau triển khai: **513/513 tệp khớp 100% SHA-256**, `overallOk: true`, không còn hành động nào chờ xử lý (`nonNoopActions: []`).

2. **Cơ chế Loại trừ Dự án (`excludeProjects`) Hoạt động Toàn diện & Ổn định**:
   - Khi một dự án nằm trong `excludeProjects` (kể cả khi bật wildcard `"projects": ["*"]`):
     - Lớp bảo vệ `handleExcludedMutationGuard` trong `typesafe-planner.ts` vẫn bảo vệ Bất biến Vàng (cấm ghi đè proxy bất biến và cấm sửa trực tiếp `todo.json`).
     - Toàn bộ 16 công cụ `typesafe_*` và lệnh gọi ngữ nghĩa TypeSafe đều bị chặn tại chỗ (`DISABLED`, `global-excluded`), không phát sinh bất kỳ yêu cầu HTTP nào ra ngoài.
     - Lệnh `todo` native (`init`, `done`, `drop`, `rm`, `view`) và tiến trình con Cố vấn (`Advisor`) chạy mượt mà, chuyển tiếp trực tiếp sang Core OMP mà không bị chặn bởi cổng kiểm duyệt TypeSafe Preflight hay đòi hỏi biểu điểm `M`.
     - Quyết định công việc trên dự án loại trừ hoàn toàn do Agent, Advisor gốc và người dùng tự quyết định.
   - Khi không có API Key, bộ phân giải vẫn nhận diện chính xác trạng thái loại trừ mà không fail-closed nhầm.
   - Chính sách loại trừ được khóa theo phiên (session-latched) và kế thừa chính xác cho tiến trình con.

3. **Tối ưu hóa Hiệu năng & Rút ngắn Thời gian Kiểm thử**:
   - Tối ưu hóa chuỗi thư mục cha (`captureParents`/`assertParents`) giúp giảm hàng chục nghìn lời gọi syscall không cần thiết.
   - Toàn bộ bộ kiểm thử 67 tệp (960 bài kiểm thử) chạy hoàn tất trong **225.26 giây** (vượt chuẩn an toàn dưới 300 giây).
   - Triển khai thành công: `DEPLOYED_VERIFIED`.

## Ranh giới Kỹ thuật và Giới hạn Cần Ghi nhận

- **Ranh giới Native Judge của OMP**:
  - `modelRoles.judge` hiện đã được cấu hình thành công với `typesafe/jev-1.14.0`.
  - OMP 18.13.3 quản lý trực tiếp luồng native judge trong `ChainJudge` độc lập với extension. Cơ chế `excludeProjects` của extension chặn toàn bộ các cuộc gọi TypeSafe ngữ nghĩa và cổng kiểm duyệt do extension sở hữu; extension không can thiệp vào bộ định tuyến native judge của chính OMP.

## Hướng dẫn Vận hành và Tiếp tục Phiên

- Để OMP nạp lại toàn bộ mã nguồn vừa được triển khai sang thư mục đích, vui lòng khởi động lại phiên OMP hoặc tiếp tục phiên làm việc bằng lệnh:
  ```bash
  omp --resume 01a18249-c2c6-72ef-be79-cb182d2ae8d8
  ```
- Danh sách 7 mục todo gốc và các mục theo dõi hiện trạng đang được lưu trữ an toàn trong lịch sử phiên Core và sẵn sàng để quyết toán khi chuỗi thẩm định M/Advisor hoàn tất trên runtime mới.
