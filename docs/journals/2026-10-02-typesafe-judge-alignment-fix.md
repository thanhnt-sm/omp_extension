# Đồng bộ Giám định TypeSafe System One & Kiến trúc Không Xung đột (TypeSafe System One Judge Alignment & Zero-Conflict Architecture — Cook Run)

**Ngày (Date):** 2026-10-02  
**Chế độ (Mode):** `code+tdd` (`plans/261002-typesafe-judge-alignment-fix`)  
**Trạng thái (Status):** HOÀN TẤT (COMPLETE) — Toàn bộ 5 giai đoạn đã được triển khai và xác minh; 83/83 bài kiểm thử đơn vị, tích hợp và đối kháng (unit, integration, and adversarial tests) đều đạt với 341 câu lệnh khẳng định (assertions); Không chỉnh sửa bất kỳ tập tin nào trong `src/` hoặc các gói cốt lõi (core packages).

---

## 1. Tóm tắt Điều hành (Executive Summary)

Đợt triển khai này thiết lập sự đồng bộ dứt điểm, không xung đột (zero-conflict alignment) giữa tích hợp TypeSafe System One của Oh-My-Pi và đặc tả chính thức của TypeSafe.ai (`docs.typesafe.ai/api.md`). Cuộc kiểm toán trước đó đã phát hiện các lỗi âm thầm không liên tục (intermittent silent failures) gây ra bởi điểm cuối mặc định sai lệch `/v1/judge` (rogue endpoint defaults), lệch lược đồ trên mảng `criteria` (schema mismatches), hiện tượng Mù Định danh Câu hỏi (Question ID Blindness) trong `typesafe_rerank`, và suy thoái ngữ cảnh (context rot) trên các bản so sánh khác biệt hợp nhất cỡ lớn (large unified diffs).

Mọi nâng cấp đều được cô lập nghiêm ngặt ở tầng phần mở rộng (extension layer — `typesafe-planner.ts` và `typesafe-planner.test.ts`), đảm bảo không xảy ra xung đột hợp nhất thượng nguồn (zero upstream merge conflicts) khi cập nhật nhân Oh-My-Pi (Oh-My-Pi core).

---

## 2. Chi tiết Đã Triển khai (What Was Implemented)

### Giai đoạn 1: Kiểm toán và Thống nhất Tầng Truyền tải Mạng (Phase 1: Audit and Unify Network Transport)
- **Tiêm Bộ chuyển đổi Thống nhất (Unified Adapter Injection):** Xây dựng `createExtensionJudgeClient` bên trong `typesafe-planner.ts`, hiện thực hóa các giao diện `ExpertJudgeClient`, `PlanJudgeClient`, và `GateJudgeClient`.
- **Các Điểm gọi Phụ thuộc Được Tiêm (Injected Dependency Call Sites):**
  - `handleTodoInterception`: truyền bộ chuyển đổi (adapter) vào `runPhaseMacroCheck(macroContext, client)`.
  - `typesafe_elevate_plan`: truyền bộ chuyển đổi vào `evaluatePlanDraft(params, client)`.
  - `typesafe_verify_completion`: truyền bộ chuyển đổi vào `verifyTaskCompletion({ ...params, cwd }, client)`.
  - `typesafe_expert_review`: truyền bộ chuyển đổi vào `evaluateScopeArbiter`, `evaluateDriftGuard`, và `evaluateRiskSecurityTriage`.
- **Vô hiệu hóa Điểm cuối Sai lệch (Rogue Endpoint Neutralization):** Ghi đè máy khách mặc định để đảm bảo 100% yêu cầu gửi đi đều nhắm tới `POST https://api.typesafe.ai/v1/systemone` với tiêu đề `Authorization: Bearer ${apiKey}` và gói tin `{ model: "jev-latest" }`.

### Giai đoạn 2: Đồng bộ Hợp đồng API và Lược đồ (Phase 2: API Contract and Schema Alignment)
- **Bộ Chuẩn hóa Tiêu chí (`normalizeTypeSafePayload` — Criteria Normalizer):**
  - Tự động chuyển đổi mảng chuỗi của câu hỏi Lựa chọn (`Choice` string arrays — `["KEY: description", ...]`) sang từ điển chuẩn TypeSafe `{ [key]: description }`.
  - Tự động chuyển đổi mảng 2 phần tử của câu hỏi Nhị phân (`Noul` 2-element arrays — `[trueDesc, falseDesc]`) sang đối tượng có cấu trúc `{ "true": trueDesc, "false": falseDesc }`.
  - Bảo toàn mảng cấp độ có thứ tự của câu hỏi Điểm số (`Score` ordered level arrays — 2..10 cấp độ).
- **Loại bỏ Thao tác Đọc Độ tự tin Ảo của Noul (Eliminated Phantom Noul Confidence Reads):** Kết quả `Noul` được đánh giá nghiêm ngặt thông qua `answer.noul` (số thực dấu phẩy động 0..1); tuyệt đối không phụ thuộc vào thuộc tính `.confidence` không tồn tại.
- **Giới hạn Phạm vi Xác thực Lưới (Lattice Validation Scoping):** Đặt điều kiện để kiểm tra lưới (lattice checks) chỉ chạy khi các tùy chọn tiêu chí câu hỏi giao thoa với `HOST_POLICY.lattice` (`auto`, `review`, `block`), ngăn chặn lỗi từ chối giả `unknown-choice` đối với các câu hỏi lựa chọn chuyên biệt theo miền (`scope_arbiter`, `drift_guard`).

### Giai đoạn 3: Tinh gọn Ngữ cảnh và Trạng thái — Chống Suy thoái Ngữ cảnh (Phase 3: Context and State De-cluttering — Anti-Context-Rot)
- **Bộ Tóm tắt Bản Khác biệt (`summarizeUnifiedDiff` — Diff Summarizer):**
  - Cắt gọn các bản khác biệt Git quá khổ (oversized git diffs) trong khi vẫn bảo toàn tiêu đề tập tin (`diff --git`, `--- a/`, `+++ b/`), tiêu đề phân đoạn (`@@ ... @@` — hunk headers), chữ ký hàm (function signatures), và các câu lệnh khẳng định kiểm thử (`expect`, `assert`).
  - Bất biến bảo mật nghiêm ngặt (strict security invariant): các câu lệnh khẳng định kiểm thử bị xóa (`- expect(`, `- assert(`) không bao giờ bị lược bỏ, ngăn chặn hành vi trốn tránh kiểm thử (test evasion bypass).
- **Khôi phục JSON Bản địa & Chốt chặn Giới hạn 8KB Token (`sanitizeStateForTypeSafe` — Native JSON Recovery & 8KB Token Guard):**
  - Phát hiện và phân tích cú pháp các trạng thái JSON bị chuỗi hóa (stringified JSON states) trở lại thành đối tượng JSON bản địa để JEV phân giải từng trường riêng lẻ.
  - Cưỡng chế giới hạn cứng $\le 8\text{KB}$ (~2000 tokens) trên tổng dung lượng `state` sau khi tuần tự hóa (serialized `state`).
- **Tham chiếu Đường dẫn bằng Dấu Huyền (Backtick Path Referencing):** Cưỡng chế tham chiếu khóa bằng dấu huyền (`\`unified_diff\``, `\`plan_requirements\``) trong chỉ dẫn câu hỏi (question instructions).

### Giai đoạn 4: Các Công cụ Tổ hợp Xếp hạng lại và Đa nhãn (Phase 4: Compound Tools Rerank and Multi-label)
- **Phòng vệ Chống Mù Định danh Câu hỏi khi Xếp hạng lại (Rerank Question ID Blindness Defense):** Viết lại bộ sinh câu hỏi của `typesafe_rerank` để tham chiếu tường minh từng phần tử ứng viên bằng dấu huyền (`Rate how relevant candidate \`candidates[${i}]\` is to the target \`query\`.`) với 3 mức điểm cụ thể (Level 0..2). Bảo toàn thứ tự sắp xếp đầu ra giảm dần.
- **Hiệu chuẩn Đa nhãn (Multi-Label Calibration):** Chuyển đổi `typesafe_evaluate_multi` thành các câu hỏi có/không rõ ràng (`Does the content in \`state\` clearly satisfy, demonstrate, or exhibit "${dim}"?`) kèm tiêu chí `Noul` có cấu trúc `{ true, false }`.

### Giai đoạn 5: Củng cố Cấu hình và Xác minh Không Xung đột (Phase 5: Configuration Hardening and Zero-Conflict Verification)
- **Cấu hình Nhà cung cấp (Provider Configuration):** Xác minh `~/.omp/agent/models.yml` trỏ tới `https://api.typesafe.ai` mà không có hậu tố `/v1`.
- **Xác minh Đăng ký Tham gia & Xác thực (Opt-in & Auth Verification):** Xác minh danh sách cho phép dự án theo ký tự đại diện trong `~/.claude/.ck.json` và biến `TYPESAFE_API_KEY` khác rỗng.
- **Kiểm toán Không Xung đột (Zero-Conflict Audit):** Xác nhận không có bất kỳ sửa đổi nào trên toàn bộ tập tin trong `src/` và các gói cốt lõi.
- **Bộ Kiểm thử Toàn diện (Full Test Suite):** 83/83 bài kiểm thử vượt qua trên 11 bộ kiểm thử với 341 câu lệnh khẳng định (assertions).

---

## 3. Số liệu Xác minh Kiểm thử (Test Verification Metrics)

| Bộ kiểm thử (Test Suite) | Số bài kiểm thử (Tests) | Số khẳng định (Assertions) | Trạng thái (Status) |
|---|---|---|---|
| `typesafe-planner.test.ts` | 11 | 98 | ĐẠT (PASS) |
| `tests/adversarial-compliance.test.ts` | 8 | 30 | ĐẠT (PASS) |
| `tests/cook-expert-judge.test.ts` | 12 | 23 | ĐẠT (PASS) |
| `tests/cook-interception-bridge.test.ts` | 8 | 15 | ĐẠT (PASS) |
| `tests/cook-verification-adversarial.test.ts` | 6 | 20 | ĐẠT (PASS) |
| `tests/cook-workflow-specs.test.ts` | 6 | 22 | ĐẠT (PASS) |
| `tests/e2e-workflow.test.ts` | 2 | 11 | ĐẠT (PASS) |
| `tests/evidence-collector.test.ts` | 7 | 19 | ĐẠT (PASS) |
| `tests/payload-safety.test.ts` | 7 | 16 | ĐẠT (PASS) |
| `tests/plan-evaluator.test.ts` | 8 | 35 | ĐẠT (PASS) |
| `tests/verification-gate.test.ts` | 8 | 31 | ĐẠT (PASS) |
| **Tổng cộng (Total)** | **83** | **341** | **100% ĐẠT (PASS)** |
