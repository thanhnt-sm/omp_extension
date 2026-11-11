# Giai đoạn 5: Đồng bộ Giao dịch, Cập nhật Sổ cái Kế hoạch & Xác minh 6 Tầng Toàn cầu

> **Mục tiêu**: Thực thi quy trình triển khai giao dịch sang môi trường đích theo Bản kê Schema v2, cập nhật Sổ cái Trung tâm (`plans/plan-ledger.json`), và đối chiếu kiểm chứng 6 tầng toàn cầu bằng `tools/verify-omp-global.cjs --live`.

---

## 1. Yêu cầu Giao dịch & Kiểm chứng (Transactional & Verification Requirements)

1. **Tuân thủ Bất biến Vàng (`AGENTS.md`)**:
   - Tuyệt đối không chỉnh sửa trực tiếp `C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts`.
   - Giữ nguyên trình trung chuyển ủy nhiệm một dòng bất biến:
     ```typescript
     export { default } from "C:/Users/thant/Projects/omp_extension/typesafe-planner.ts";
     ```
2. **Đồng bộ Giao dịch Đích (`tools/sync-baseline.cjs`)**:
   - Tự động tạo bản sao lưu gắn nhãn thời gian `omp_extension_backup_<timestamp>`.
   - Cập nhật các tệp sang 2 gốc quản lý: `target` (`C:/Users/thant/Projects/omp_extension`) và `global_omp_agents`.
   - Không đặt `OMP_SKIP_VERIFY_TESTS=1` khi deploy thật (cấm theo `CLAUDE.md`); sync chạy toàn bộ test tại đích. Chỉ `DEPLOYED_VERIFIED` là thành công.
3. **Kiểm chứng 6 Tầng Toàn cầu (`tools/verify-omp-global.cjs --live`)**:
   - `[1] Loader Proxy`: Khớp mã băm SHA-256 của proxy trampoline.
   - `[2] Manifest Parity`: Khớp 100% mã băm SHA-256 của tất cả các tệp theo Bản kê Schema v2.
   - `[3] Sync Preflight`: 0 pending actions.
   - `[4] Resolver & Redactor Self-Test`: `enabled=true`, `telemetryPreserved=true`.
   - `[5] Latest Backup`: Trạng thái backup hợp lệ.
   - `[6] Live TypeSafe JEV Probe`: Trả lời HTTP 200 từ `api.typesafe.ai/v1/systemone` với `jev-1.14.0`.

---

## 2. Các Bước Thực thi Cụ thể (Implementation Steps)

- [ ] Chạy kiểm thử toàn bộ kho mã nguồn: `bun test`.
- [ ] Chạy `bun run verify:workspace` rồi đồng bộ giao dịch: `bun run sync:global` (cần người vận hành xác nhận; ghi ra `~/Projects/omp_extension`).
- [ ] Chạy kiểm chứng 6 tầng: `bun run verify:live` (gọi HTTP thật, có thể tính phí). `node` trên máy là v14, dùng `bun`.
- [ ] Cập nhật tiến độ kế hoạch: `bun run ck:pm` (có ghi vào plan) hoặc `bun run ck:pm --ledger` (chỉ tạo lại ledger).

---

## 3. Tiêu chí Chấp thuận (Acceptance Criteria)

- [ ] Toàn bộ 6 tầng kiểm chứng đều đạt trạng thái `PASS` / `ONLINE`.
- [ ] Sổ cái kế hoạch ghi nhận 100% hoàn thành đối soát cho toàn bộ các pha.
- [ ] Không có tệp rác hoặc lock file tồn đọng trong môi trường làm việc.
