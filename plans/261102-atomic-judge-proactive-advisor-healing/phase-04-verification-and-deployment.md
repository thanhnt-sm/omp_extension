---
phase: 4
title: "Kiểm thử Đơn vị, Đồng bộ Giao dịch & Xác minh Toàn cầu"
status: completed
priority: P1
effort: "1h"
dependencies: [1, 2, 3]
---

# Phase 4: Kiểm thử Đơn vị, Đồng bộ Giao dịch & Xác minh Toàn cầu (Unit Testing, Transactional Sync & Global Verification)

## Tổng quan (Overview)
Thực thi kiểm thử toàn diện toàn bộ kho mã nguồn (`bun test`), bảo đảm 100% kiểm thử vượt qua mà không có hồi quy (regression). Thực hiện quy trình triển khai giao dịch tự động một chạm (`tools/sync-baseline.cjs` / `oneclick-omp.bat`) sang môi trường đích `C:/Users/thant/Projects/omp_extension`, bảo toàn con trỏ nạp OMP (`proxy trampoline`) và đối chiếu mã băm SHA-256 qua `tools/verify-omp-global.cjs`.

## Yêu cầu (Requirements)
1. **Kiểm thử Đơn vị Toàn bộ (Full Suite Execution)**:
   - Chạy toàn bộ test suite cục bộ (`bun test`) trong không gian làm việc `D:/100.Software/Github/omp_extension`.
   - Tất cả các bài kiểm thử phải đạt trạng thái `pass`, 0 lỗi, không hồi quy.
2. **Đồng bộ Giao dịch Một chạm (Transactional One-Click Sync)**:
   - Thực thi kịch bản `tools/sync-baseline.cjs` (hoặc `bun run oneclick`).
   - Tự động tạo bản sao lưu có gắn nhãn thời gian (`timestamped backup`) tại `C:\Users\thant\Projects\omp_extension_backup_<timestamp>`.
   - Triển khai giao dịch sang `C:/Users/thant/Projects/omp_extension` và gốc toàn cục theo Bản kê Schema v2.
3. **Đối chiếu Mã băm Toàn diện (6-Layer Global Parity Check)**:
   - Chạy `node tools/verify-omp-global.cjs --json` để xác minh:
     - Con trỏ nạp OMP tại `C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts` nguyên vẹn bất biến.
     - 100% tệp trong bản kê khớp mã băm SHA-256.
     - Không có sai lệch hoặc hành động chờ xử lý.

## Tệp mã nguồn liên quan (Related Code Files)
- Kiểm thử: Toàn bộ `tests/*.test.ts`
- Kịch bản triển khai: `tools/sync-baseline.cjs`, `tools/verify-omp-global.cjs`
- Nhật ký: `docs/journals/`

## Các bước triển khai (Implementation Steps)
1. Chạy `bun test` trong kho phát triển và ghi nhận kết quả.
2. Chạy `node tools/sync-baseline.cjs`.
3. Chạy `node tools/verify-omp-global.cjs --json` để kiểm chứng 6 lớp.
4. Ghi nhận nhật ký kỹ thuật qua `ck:journal`.

## Tiêu chí chấp thuận (Success Criteria)
- [x] 100% bài kiểm thử trong kho mã nguồn vượt qua (`bun test` exit code 0)
- [x] Kịch bản đồng bộ hoàn tất thành công với trạng thái `DEPLOYED_VERIFIED`
- [x] Kịch bản xác minh toàn cầu `verify-omp-global.cjs` đạt 100% khớp nối
