# ADR: Fast-Tier Model Routing & Multi-Persona Pre-Analysis (`ck:predict`)

- **Status:** Accepted (Implemented in Workspace Baseline)
- **Date:** 2026-10-05

## Context
Kế hoạch `plans/261005-predict-recommendations` giới thiệu cơ chế Multi-Persona Pre-Analysis (`ck:predict`) trước khi tạo code. Cơ chế này cần đánh giá đồng thời 5 khía cạnh (Architect, Security, Performance, UX, Devil's Advocate) thông qua TypeSafe System One.

## Problem
1. **Thiếu định danh `jev-fast` ở upstream:** TypeSafe API chính thức hỗ trợ `jev-latest` và `jev-1.13`, chưa công bố công khai endpoint `jev-fast`.
2. **Khác biệt về chi phí và độ trễ:** Chạy 5 câu hỏi liên tục qua `jev-latest` trên mỗi lần lập kế hoạch có thể làm tăng độ trễ và tiêu tốn hạn mức nếu không có tier phân cấp.
3. **Nguy cơ Bypass khi fallback:** Nếu phía client tự động mock điểm 3/3 khi API thất bại hoặc model alias không tồn tại, tính toàn vẹn của TypeSafe sẽ bị ảnh hưởng (vi phạm tighten-only invariant).

## Decision
1. **Tách rời Module Tranh biện (`src/debate-evaluator.ts`)**:
   - Toàn bộ logic 5 personas, cấu trúc câu hỏi và tính điểm consensus được tách biệt hoàn toàn khỏi extension host.
2. **Cấu hình Model Tier linh hoạt**:
   - Hỗ trợ tham số `model` trong `executeTypeSafe`.
   - Client cho phép gửi `model: "jev-fast"`, đồng thời fallback an toàn về `jev-latest` nếu cần mà không làm gãy flow.
3. **Bảo vệ toàn vẹn (Integrity Shield)**:
   - Đưa `src/debate-evaluator.ts` vào `PROTECTED_INTEGRITY_PATTERNS` trong `typesafe-planner.ts`.
4. **Quy trình triển khai an toàn**:
   - Cung cấp công cụ sao lưu và triển khai tự động `tools/sync-baseline.bat` / `tools/sync-baseline.cjs` để người dùng chủ động triển khai từ workspace `D:\100.Software\Github\omp_extension` sang `C:\Users\thant\Projects\omp_extension`.
