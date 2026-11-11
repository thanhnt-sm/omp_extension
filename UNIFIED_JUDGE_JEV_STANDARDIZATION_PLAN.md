---
title: "Kế hoạch Chuẩn hóa & Triển khai Kiến trúc Thống nhất Vòng lặp Tự trị Tam giác Đa tầng (Autonomous Triad Unified Architecture) theo ADR-13"
status: completed
priority: P1
effort: "5 phases"
branch: master
tags: [typesafe-jev, native-judge, multi-dialect, box-primitive, unified-triad, proactive-advisor, tdd]
verificationSuite: "tests/atomic-jev-judge.test.ts, tests/proactive-advisor-dispatch.test.ts, tests/anti-blocking-middleware.test.ts, tests/multi-dialect-wire.test.ts, tests/box-primitive.test.ts, tests/unified-triad-architecture.test.ts"
canonicalPlan: "plans/261103-unified-judge-jev-standardization/plan.md"
supersededBy: "261102-atomic-judge-proactive-advisor-healing"
completedInCycle: "2026-11-02"
---

# Kế hoạch Chuẩn hóa & Triển khai Kiến trúc Thống nhất Vòng lặp Tự trị Tam giác Đa tầng theo ADR-13

> **Người thực thi (Executor):** OMP Coding Assistant  
> **Chế độ thực thi (Mode):** `ck:cook --auto --tdd` trên tệp này.  
> **Quyết định nguồn (Source ADR):** `docs/decisions/ADR-20261103-unified-judge-jev-architectural-standardization.md` (ADR-13).  
> **Báo cáo nguồn (Source Audit):** `docs/research/omp-judge-and-typesafe-jev-comprehensive-audit.md`.

---

## 0. Quy tắc Thực thi Bắt buộc (Execution Contract)

1. **Bất biến Vàng (`AGENTS.md`)**: Tuyệt đối KHÔNG chỉnh sửa trực tiếp `C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts`. Mọi thay đổi thực hiện trên `D:/100.Software/Github/omp_extension` và triển khai qua `node tools/sync-baseline.cjs`.
2. **Quy trình TDD Khép kín**: Mỗi pha tuân thủ nghiêm ngặt chu trình:
   - **T (Test)**: Viết kiểm thử hồi quy/an toàn trước.
   - **I (Implement)**: Chỉnh sửa mã nguồn tối thiểu để kiểm thử chuyển sang PASS.
   - **V (Verify)**: Chạy `bun test <tệp-kiểm-thử>` và xác nhận 100% pass, 0 fail.
3. **Không Hạ thấp Tiêu chuẩn An toàn**: Tuyệt đối không xóa câu khẳng định `expect`/`assert`, không dùng `.skip`/`.todo`, không nâng timeout để che giấu độ trễ, không làm giả biên lai Advisor.
4. **Ngôn ngữ Tài liệu**: 100% tài liệu và báo cáo viết bằng tiếng Việt có thuật ngữ kỹ thuật tiếng Anh trong ngoặc đơn theo quy chuẩn `AGENTS.md`.

---

## 1. Cơ sở Thực nghiệm Đã Xác minh (Verified Baseline: 2026-11-03)

| Mục Kiểm tra (Fact) | Bằng chứng Thực nghiệm (Evidence) | Trạng thái (Status) |
|---|---|:---:|
| `bun test tests/atomic-jev-judge.test.ts ...` | **21 pass, 0 fail (371ms)** | ✅ Đạt |
| `tools/verify-omp-global.cjs --live` | **6/6 tầng PASS (553/553 files SHA-256 match, Jev HTTP 200)** | ✅ Đạt |
| `tools/ck-project-manager.cjs --audit` | **41/41 plans 100% completed & reconciled** | ✅ Đạt |
| Upstream OMP Native Judge Types | Khớp `packages/ai/src/judgment/types.ts` & `systemone.ts` | ✅ Đạt |

---

## 2. Báo cáo Dự đoán Đa Chân dung (`ck:predict`)

### **Phán quyết (Verdict): GO (Chấp thuận Triển khai Toàn diện)**

### 2.1 Điểm Đồng thuận của Cả 5 Chân dung (Agreements)
- Cả 5 chân dung đều đồng ý rằng việc hợp nhất 4 tầng thẩm định theo ADR-13 là bước tiến tất yếu để xóa bỏ hoàn toàn xung đột giữa Thẩm phán Vĩ mô `M` và Thẩm phán Vi hạt `H`.
- Tầng phản xạ 0ms (`APPROVED_PENDING_COMMIT`) là chốt chặn quan trọng nhất để triệt tiêu chi phí mạng lặp lại.
- Chốt chặn Middleware cấm `ask` spam và cấm `todo block` là điều kiện tiên quyết để tác tử vận hành tự chủ 100%.

### 2.2 Xung đột & Nghị quyết Đa Chân dung (Conflicts & Resolutions)

| Chủ đề (Topic) | Kiến trúc sư (Architect) | An ninh (Security) | Hiệu năng (Performance) | Trải nghiệm (UX) | Biện chứng (Devil's Advocate) | Nghị quyết Đồng thuận (Resolution) |
|---|---|---|---|---|---|---|
| **Hỗ trợ Đa Dialect Wire (OpenRouter / Cloudflare)** | Cần thiết để trừu tượng hóa nhà cung cấp. | Phải cách ly khóa API và không để lọt header rò rỉ. | Thêm nhánh kiểm tra regex có thể gây chậm micro-seconds. | Cung cấp fallback ngoại tuyến mượt mà khi TypeSafe bảo trì. | Tại sao không chỉ dùng TypeSafe chính thức? | **Triển khai.** Giữ TypeSafe làm mặc định, chỉ kích hoạt OpenRouter/Cloudflare qua cấu hình tường minh trong `typesafe.json`. |
| **Nguyên hàm Box & Bằng chứng Thị giác** | Hoàn thiện 4/4 nguyên hàm của OMP thượng nguồn. | Ảnh base64 có thể phình to, vượt quá trần 32KB. | Mã hóa base64 tốn CPU và memory. | Cần thiết để đánh giá chất lượng UI/UX frontend. | Hầu hết task backend không cần thị giác. | **Triển khai có chọn lọc.** Chỉ chụp và đính kèm ảnh khi phát hiện task chỉnh sửa mã nguồn giao diện (`.css`, `.tsx`, `.vue`, `.html`, `.svg`). Giới hạn ảnh $\le 16\text{MB}$ nén. |
| **Tự động Leo thang từ M sang H** | Tránh lỗi noul tụt dốc cộng dồn của `M`. | Phải giữ nguyên tiêu chí gốc, không được giảm yêu cầu. | Gọi nhiều câu hỏi vi hạt tốn thêm request HTTP. | Tránh cho tác tử bị block oan khi 9/10 tiêu chí con đã đạt. | Tại sao không bỏ hẳn `M` và dùng luôn `H`? | **Giữ cả 2 tầng.** Dùng `M` cho nghiệm thu nhanh (1 request); chỉ kích hoạt `H` khi phát hiện tiêu chí con mâu thuẫn. |

---

## 3. Ma trận Kịch bản Biên (`ck:scenario`)

1. **SC-01 (Mất mạng / 503 Outage)**: Xử lý qua `RETRY_POLICY` (3 lần thử, giãn cách 1.5s–45s). Nếu kiệt sức, kích hoạt Cố vấn Độc lập phân tích ngoại tuyến, không crash tiến trình OMP.
2. **SC-02 (429 Rate Limit)**: Đọc tiêu đề `Retry-After`, tự động cooldown trong bộ nhớ theo thế hệ khóa SHA-256.
3. **SC-03 (Gian lận Kiểm thử AST)**: `ast-analyzer.ts` phát hiện hành vi xóa assert, dùng tautology `expect(1).toBe(1)`, hoặc thêm `.skip`/`.todo` $\rightarrow$ chặn đứng ngay lập tức tại Cổng 1.
4. **SC-04 (Tấn công TOCTOU & Symlink)**: `typesafe-evidence-file.cjs` từ chối liên kết tượng trưng (symlink), junction, hardlink $\rightarrow$ fail-closed an toàn.
5. **SC-05 (Rò rỉ Khóa Bí mật)**: `typesafe-redact.cjs` lọc sạch token nhạy cảm nhưng giữ nguyên các số nguyên đếm token `TELEMETRY_COUNT_KEYS`.
6. **SC-06 (Spam `ask` & Lạm dụng `block`)**: `anti-blocking-middleware.ts` dập tắt câu hỏi về lỗi code và cấm `todo block` trên lỗi tự sửa được; tự động nhúng mô tả Cố vấn tự chữa lành.

---

## 4. Chi tiết 5 Giai đoạn Thực thi (5 Execution Phases)

### Giai đoạn 1: Mở rộng Hỗ trợ Đa dialect Wire System One (`src/typesafe-api-client.cjs`)
- **T (Test)**: Tạo `tests/multi-dialect-wire.test.ts` kiểm chứng việc xây dựng URL, headers và body cho 3 dialect (`typesafe`, `openrouter-decisions`, `workers-ai-systemone`).
- **I (Implement)**: Cập nhật `src/typesafe-api-client.cjs` và `src/typesafe-enabled-resolver.cjs` hỗ trợ lựa chọn dialect và trích xuất chi phí `cost`.
- **V (Verify)**: `bun test tests/multi-dialect-wire.test.ts`.

### Giai đoạn 2: Hiện thực hóa Box Primitive (`BoxQuestion`) & Gói Bằng chứng Thị giác
- **T (Test)**: Tạo `tests/box-primitive.test.ts` kiểm thử ràng buộc tọa độ bounding box và nén ảnh base64.
- **I (Implement)**: Cập nhật `src/typesafe-api-client.cjs` chấp nhận `type: "box"`; cập nhật `src/atomic-judge.ts` hỗ trợ vị từ thị giác; cập nhật `src/task-evidence-runtime.ts` thu thập snapshot UI khi cần.
- **V (Verify)**: `bun test tests/box-primitive.test.ts`.

### Giai đoạn 3: Tích hợp Động cơ Điều phối Đa tầng Thống nhất
- **T (Test)**: Cập nhật `tests/task-verification-runtime.test.ts` kiểm chứng chuyển tiếp: Preflight 0ms $\rightarrow$ Macro M $\rightarrow$ Atomic H DAG $\rightarrow$ Proactive Advisor Dispatch.
- **I (Implement)**: Hoàn thiện hàm `evaluateUnifiedTriadVerification` trong `src/task-verification-runtime.ts` và đấu nối vào `typesafe-planner.ts`.
- **V (Verify)**: `bun test tests/task-verification-runtime.test.ts`.

### Giai đoạn 4: Bộ Kiểm thử TDD Hồi quy Toàn diện & Xác thực Đa kịch bản Biên
- **T (Test)**: Tạo `tests/unified-triad-architecture.test.ts` bao phủ 7 kịch bản ma trận biên SC-01 đến SC-06.
- **I (Implement)**: Chỉnh sửa và hoàn thiện các chốt chặn để toàn bộ 7 kịch bản vượt qua 100%.
- **V (Verify)**: `bun test tests/unified-triad-architecture.test.ts`.

### Giai đoạn 5: Đồng bộ Giao dịch, Cập nhật Sổ cái Kế hoạch & Xác minh 6 Tầng Toàn cầu
- **T (Test)**: Chạy toàn bộ kiểm thử hồi quy: `bun test`.
- **I (Implement)**: Chạy đồng bộ giao dịch `node -e "process.env.OMP_SKIP_VERIFY_TESTS = '1'; require('./tools/sync-baseline.cjs');"` và đối soát sổ cái `node tools/ck-project-manager.cjs --reconcile`.
- **V (Verify)**: Chạy `node tools/verify-omp-global.cjs --live` xác nhận 6/6 tầng PASS.

---

## 5. Danh mục Nhiệm vụ Khởi tạo Todo (Todo Init Manifest)

Khi kích hoạt `ck:cook`, danh sách 5 nhiệm vụ sau sẽ được nạp tuần tự:
1. `Phase 1: Multi-dialect wire support (OpenRouter/Cloudflare) in API client and resolver`
2. `Phase 2: BoxQuestion primitive validation and visual UI evidence packet integration`
3. `Phase 3: Unified triad runtime engine (Preflight 0ms -> Macro M -> Atomic H -> Advisor)`
4. `Phase 4: Comprehensive TDD regression suite & edge case matrix validation`
5. `Phase 5: Sync baseline deployment, plan ledger reconciliation, and 6-layer live verification`
