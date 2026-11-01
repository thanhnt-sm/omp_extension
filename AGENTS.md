# Hướng dẫn Quy chuẩn Agent: Không gian Làm việc Tiện ích Mở rộng TypeSafe (Agent Guidelines: TypeSafe Extension Workspace)

## 1. Bất biến Vàng: Tuyệt đối Không Sửa Trực tiếp Tiện ích Mở rộng OMP Toàn cục (Golden Invariant: Never Modify Global OMP Extensions Directly)
- **Tệp tin (File)**: `C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts`
- **Mục đích (Purpose)**: Tệp này là một **trình trung chuyển ủy nhiệm một dòng bất biến (immutable single-line proxy trampoline)**:
  ```typescript
  export { default } from "C:/Users/thant/Projects/omp_extension/typesafe-planner.ts";
  ```
- **Quy tắc (Rule)**: **TUYỆT ĐỐI KHÔNG chỉnh sửa hoặc ghi trực tiếp vào `C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts` (NEVER modify or write directly)**.
- **Lý do (Reason)**: Việc sửa trực tiếp tệp này sẽ làm gãy cơ chế phân giải mô-đun tương đối (`relative module resolution` cho `./src/*`) và phá hủy nguồn sự thật duy nhất (`single source of truth`).

---

## 2. Luồng Làm việc & Triển khai Giao dịch (Workspace & Transactional Deployment Flow)

```
[Không gian Phát triển (Development Workspace)] (D:/100.Software/Github/omp_extension)
       │
       │  (Chỉnh sửa mã nguồn, phát triển tính năng, kiểm thử đơn vị / Code edits & unit testing)
       ▼
   bun test
       │
       │  tools\oneclick-omp.bat  (hoặc / or: node tools/sync-baseline.cjs)
       ▼
[Đích Triển khai Hoạt động (Active Deployment Target)] (C:/Users/thant/Projects/omp_extension)
       ▲
       │  (Nạp qua trình trung chuyển ủy nhiệm / Loads via proxy trampoline)
[Trình Nạp Toàn cục OMP (OMP Global Loader)] (C:/Users/thant/.omp/agent/extensions/typesafe-planner.ts)
```

1. **Phát triển & Kiểm thử Cục bộ (Local Development & Testing)**:
   - Mọi chỉnh sửa mã nguồn, tài liệu và kế hoạch (`typesafe-planner.ts`, `src/*`, `tests/*`, `docs/*`, `plans/*`) BẮT BUỘC phải thực hiện trong không gian làm việc này (`D:/100.Software/Github/omp_extension`).
   - Chạy kiểm thử cục bộ bằng lệnh `bun test`.
2. **Đồng bộ hóa & Kiểm chứng Tự động Một chạm (One-Click Synchronization & Verification)**:
   - Chạy `tools\oneclick-omp.bat` (hoặc `bun run oneclick` / `node tools/sync-baseline.cjs`).
   - Kịch bản sẽ tự động tạo bản sao lưu có gắn nhãn thời gian (`timestamped backup`) tại `C:\Users\thant\Projects\omp_extension_backup_<timestamp>`, triển khai giao dịch sang 2 gốc quản lý (`target`, `global_omp_agents`) theo Bản kê Schema v2 (Manifest Schema v2 độc lập hoàn toàn khỏi `.claude`), kiểm tra con trỏ nạp OMP (`OMP loader pointer`), chạy bộ kiểm thử cô lập tại đích và đối chiếu mã băm `SHA-256` qua `tools/verify-omp-global.cjs`.
3. **Khởi động lại Phiên OMP (OMP Session Restart)**:
   - Tiến trình chủ OMP (`OMP host process`) nạp và lưu bộ nhớ đệm (`in-memory cache`) mã nguồn tiện ích mở rộng ngay khi khởi chạy.
   - Để nạp logic mới cập nhật hoặc đặt lại trạng thái chốt chặn an toàn trong bộ nhớ (`in-memory safety ratchet state`), người dùng cần khởi động lại phiên làm việc OMP.

---

## 3. Quy chuẩn Ngôn ngữ Tài liệu Bắt buộc (Mandatory Documentation Language Standard)
- **Quy tắc Cốt lõi (Core Rule)**: Khi tạo mới, cập nhật hoặc chuẩn hóa bất kỳ tài liệu nào trong kho mã nguồn (`README.md`, `AGENTS.md`, `docs/*.md`, `docs/decisions/*.md`, `docs/journals/*.md`), **BẮT BUỘC phải viết hoàn toàn bằng tiếng Việt (100% Vietnamese prose)**.
- **Chuẩn Thuật ngữ Song ngữ (Bilingual Terminology Convention)**: Bổ sung đầy đủ từ chuyên ngành, từ vựng kỹ thuật và khái niệm gốc bằng tiếng Anh vào trong ngoặc đơn ngay sau cụm từ tiếng Việt — ví dụ:
  - *Đồng thuận Lưỡng viện (Bicameral Consensus)*
  - *Xác thực Nhiệm vụ theo Giai đoạn (Staged Task Verification)*
  - *Đóng băng An toàn khi Lỗi (Fail-Closed)*
  - *Lưới Chính sách Chỉ Thắt chặt (Tighten-Only Policy Lattice)*
  - *Kiểm tra Tiền trạm Đầu phiên (Session Pre-flight Health Probe)*
  - *Cố vấn Độc lập Chỉ Đọc (Independent Read-Only Advisor)*
- **Bảo toàn Ký hiệu Mã nguồn (Code Symbol Preservation)**: Giữ nguyên tên hàm, tên biến, đường dẫn tệp, mã lỗi và câu lệnh CLI trong cặp dấu backtick (`` `...` ``).
