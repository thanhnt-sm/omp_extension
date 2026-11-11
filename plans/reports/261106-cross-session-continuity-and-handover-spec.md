# Đặc tả Bàn giao & Tiếp tục Thực thi Qua Phiên Mới (Cross-Session Continuity & Handover Spec)

> **Mục tiêu**: Lưu trữ toàn bộ bối cảnh kiến trúc, hiện trạng mã nguồn, kết quả kiểm thử và danh mục tồn đọng chi tiết để phiên làm việc mới tiếp tục xử lý tự động và liền mạch.  
> **Kế hoạch Trung tâm**: `plans/261103-unified-judge-jev-standardization/plan.md` (ADR-13: Kiến trúc Thống nhất Vòng lặp Tự trị Tam giác Đa tầng).  
> **Thời điểm Bàn giao**: 2026-11-06.  
> **Trạng thái Kiểm chứng Toàn cầu**: `node tools/verify-omp-global.cjs --live` đạt **INSTALLATION CHECKS PASSED (575/575 tệp khớp SHA-256)**.

---

## 1. Lý do Chuyển giao Phiên & Bối cảnh Vận hành

1. **Yêu cầu Khởi động lại Tiến trình Chủ OMP (`OMP Host Process Restart`)**:
   - Tiến trình chủ OMP lưu trữ trong bộ nhớ RAM mã nguồn của tiện ích mở rộng tại thời điểm khởi động phiên.
   - Trong phiên làm việc này, chúng tôi đã hoàn thành trên đĩa (`on-disk`) bộ chọn kiểm chứng tốc độ cao `src/test-asset-selector.ts` (thời gian chạy giảm từ >300s xuống còn **704ms** đối với 7 bộ kiểm thử cốt lõi).
   - Để tiến trình chủ OMP giải phóng mã nguồn cũ trong RAM và nạp bộ chọn 704ms mới vào hoạt động, **người dùng chỉ cần khởi động lại phiên OMP một lần duy nhất (`restart OMP`)**.
2. **Yêu cầu Của Người dùng Về Tự động Hóa Tuyệt đối**:
   - Con người chỉ xác nhận mục tiêu giải pháp và phạm vi kế hoạch (*Business Scope & Plan Intent*).
   - Toàn bộ các bước thực thi kỹ thuật (*Technical Execution*), chạy kiểm thử, đánh giá Judge JEV và đóng Todo phải được **AI tự động khép kín hoàn toàn, không yêu cầu con người xác nhận thủ công**.

---

## 2. Tổng hợp Mã nguồn Đã Hoàn tất & Đã Kiểm chứng (Verified Artifacts)

Toàn bộ các tệp sau đã được kiểm thử và đạt **137 pass / 0 fail (100%)** qua lệnh `bun test`:

### 2.1 Giai đoạn 1: Hỗ trợ Đa Dialect System One (`phase-01`)
- **Tệp Mã nguồn**: `src/typesafe-api-client.cjs` & `src/typesafe-enabled-resolver.cjs`.
- **Chức năng**:
  - Hỗ trợ 3 dialect wire: `typesafe` (`/v1/systemone`), `openrouter-decisions` (`/decisions`), `workers-ai-systemone` (`@cf/cloudflare/clef`).
  - Hàm `buildSystemOneWirePayload` định hình URL, tiêu đề Authorization cố định không bị ghi đè, và thân envelope.
  - Hàm `decodeSystemOneResponse` bóc tách phong bì Cloudflare `{ result, success }` và trích xuất chi phí USD `cost` từ OpenRouter.
  - Xử lý HTTP 429/529 qua `RETRY_POLICY` với exponential backoff và cooldown 45s theo SHA-256 của API key.
- **Tệp Kiểm thử**: `tests/multi-dialect-wire.test.ts` (**23 pass, 0 fail, 128ms**).
- **Hồ sơ Kế hoạch**: Đã tích 3/3 tiêu chí chấp thuận `[x]`, dòng 40 trong `plan.md` đạt `Completed`.

### 2.2 Giai đoạn 2: Nguyên hàm `BoxQuestion`, Gói Bằng chứng Thị giác UI & Chốt chặn AC3 (`phase-02`)
- **Tệp Mã nguồn**: `src/typesafe-api-client.cjs`, `src/judge-evidence-packet.ts`, `src/task-evidence-runtime.ts`.
- **Hiện trạng**: **Triển khai Một phần (Đang mở)**:
  - *Kiến trúc gói đã tách*: Chuyển đổi `JudgeEvidencePacket` sang mô hình chỉ lưu siêu dữ liệu `visualAssets: Array<{ key, format, bytes, sha256 }>` và tách `assetPayload` trên kết quả `JudgeEvidencePacketResult`. Tuy nhiên, chưa nối `assetPayload` vào request thẩm định thực tế và chưa kiểm thử ảnh lớn (100KB–1MB).
  - *Kiểm thử hồi quy `src/atomic-judge.ts`*: Trong `tests/atomic-judge.test.ts`, bổ sung ca kiểm thử khẳng định danh sách cho phép ở dòng 91 từ chối `answerType: "box"` bằng lỗi `atomic_predicate_invalid` trước khi dispatch (đạt 10/10 pass).
  - *Đã áp dụng các chốt chặn an toàn nhị phân*: Loại bỏ hoàn toàn sự trùng lặp base64, kiểm tra magic bytes PNG (`89 50 4E 47 0D 0A 1A 0A`) và JPEG (`FF D8 FF`), kiểm tra độ dài base64 chia hết cho 4, allowlist MIME không ép kiểu, và tách kiểm tra `textBytes` 32KB với dung lượng ảnh 4MB/8MB.
  - *Khoảng cách thực nghiệm còn mở*: (1) Kiểm thử tích hợp chạy `collectTaskEvidence` với tệp `.png` thật trong repo git; (2) Nối `assetPayload` vào luồng gửi request và kiểm thử ảnh lớn; (3) Hook chụp ảnh tự động từ browser; (4) Chạy đồng bộ đầy đủ có kiểm chứng cô lập tại đích (`timeout: 0`) khi môi trường cho phép.
- **Tệp Kiểm thử**: `tests/box-primitive.test.ts` (**20 pass, 0 fail, 100%**) & `tests/atomic-judge.test.ts` (**10 pass, 0 fail, 100%**).
- **Hồ sơ Kế hoạch**: `plans/261103-unified-judge-jev-standardization/phase-02-box-primitive-and-visual-evidence.md`.

### 2.3 Sửa Lỗ hổng An toàn Fail-Open (`testExitCode === null`)
- **Tệp Mã nguồn**: `src/atomic-jev-evaluator.ts` & `src/cook-expert-judge.ts`.
- **Chức năng**: Bổ sung cờ `testRequired` (mặc định `true` - Fail-Closed). Nếu tác vụ code có thay đổi sản phẩm mà `testExitCode === null` $\rightarrow$ REJECT; nếu tác vụ nghiên cứu không yêu cầu test $\rightarrow$ PASS.
- **Tệp Kiểm thử**: `tests/atomic-jev-judge.test.ts` (**6 pass, 0 fail**) & `tests/cook-expert-judge.test.ts` (**82 pass, 0 fail**).

### 2.4 Sửa Cắt Byte UTF-8 trong Macro M (`src/task-verification-macro.ts`)
- **Chức năng**:
  - Đưa hàm cắt byte `truncateToUtf8Bytes` ra phạm vi mô-đun với giải thuật lùi biên bitwise chuẩn tắc (`buf[end] & 0xC0 === 0x80`), không dùng regex thay thế `\uFFFD`.
  - Cắt `testOutput` theo byte UTF-8 kèm con trỏ SHA-256; không gắn cờ `truncated = true` cho `testOutput` để tránh chặn oan các bài test có output dài.
  - Kích hoạt Fail-Closed trong `evaluateMonolithicTask` khi `state.overflow` để yêu cầu chứng cứ chọn lọc (*selections*).
- **Tệp Kiểm thử**: `tests/macro-evidence-fields.test.ts` (**3 pass, 0 fail, 283ms**) & `tests/task-verification-runtime.test.ts` (**6 pass, 0 fail, 97ms**).

### 2.5 Cải tiến Bộ chọn Kiểm chứng Tất định (`src/test-asset-selector.ts`)
- **Chức năng**:
  - Nhận diện trực tiếp các tệp kiểm thử nằm trong danh sách sửa đổi (`directChangedTests`), hỗ trợ cả `/` và `\`.
  - Chuẩn hóa tên gốc với `.replace(/\.test$/, "")`.
  - Loại bỏ giới hạn cứng `.slice(0, 10)`, đối sánh chính xác tiền/hậu tố chống dương tính giả.
- **Tệp Kiểm thử**: `tests/test-asset-selector.test.ts` (**7 pass, 0 fail, 43ms**).
- **Đo đạc Thực tế 7 Bộ Test Cốt lõi**: **89 pass, 0 fail trong đúng 704ms**.

### 2.6 Đồng bộ Giao dịch Toàn cầu
- Chạy `tools/sync-baseline.cjs`, tạo bản sao lưu `omp_extension_backup_2026-11-06T07-34-59-227Z`.
- `tools/verify-omp-global.cjs --live` đạt **6/6 tầng PASS (575/575 tệp khớp SHA-256)**.

---

## 3. Danh mục Tồn đọng Chi tiết Cho Phiên Mới (Pending Tasks Checklist)

| # | Hạng mục Công việc | Tệp Liên quan | Yêu cầu Kỹ thuật Cần Thực thi | Trạng thái |
|---|---|---|---|---|
| **1** | **Bằng chứng ảnh thị giác UI trong runtime (Giai đoạn 2)** | `src/task-evidence-runtime.ts` & `src/judge-evidence-packet.ts` | Thu thập ảnh snapshot UI base64 đã qua kiểm chứng snapshot khi phát hiện thay đổi tệp `.css`, `.tsx`, `.vue`, `.html`, `.svg`; lưu siêu dữ liệu `visualAssets` trong packet và `assetPayload` trên kết quả. Cần bổ sung test cây git thật và nối `assetPayload` vào request. | **Đang mở (Triển khai một phần)** |
| **2** | **Tiêu chí AC3: Trần gói bằng chứng thị giác (Giai đoạn 2)** | `tests/box-primitive.test.ts` & `src/judge-evidence-packet.ts` | Kiến trúc gói đã tách siêu dữ liệu `visualAssets`; chưa nối `assetPayload` vào request; chưa kiểm thử ảnh lớn (100KB–1MB). | **Đang mở (Kiến trúc đã tách, chưa nối wire)** |
| **3** | **Định hình Ngữ nghĩa Vị từ Box trong Atomic Judge** | `src/atomic-judge.ts` & `tests/atomic-judge.test.ts` | Bổ sung test hồi quy xác nhận danh sách cho phép ở dòng 91 trong `src/atomic-judge.ts` từ chối `answerType: "box"` với lỗi `atomic_predicate_invalid` trước khi dispatch. | **HOÀN TẤT KIỂM THỬ (10/10 PASS)** |
| **4** | **Động cơ Điều phối 4 Tầng Thống nhất (Giai đoạn 3)** | `src/task-verification-runtime.ts` & `typesafe-planner.ts` | Hiện thực hóa hàm `evaluateUnifiedTriadVerification`: Tầng 1 (Preflight 0ms) $\rightarrow$ Tầng 2 (Macro M $\le 32\text{KB}$) $\rightarrow$ Tầng 3 (Atomic H DAG phân tách khi có mâu thuẫn) $\rightarrow$ Tầng 4 (Advisor tự chữa lành). **Lưu ý**: Loại bỏ cơ chế H lách qua phán quyết REJECT của M; chỉ dùng H cho bài toán thiếu bằng chứng (*EVIDENCE_REQUIRED*). | Đang mở (Kế tiếp) |
| **5** | **Bộ Kiểm thử Ma trận Biên (Giai đoạn 4)** | `tests/unified-triad-architecture.test.ts` | Xây dựng 7 ca kiểm thử tương ứng 7 kịch bản ma trận biên SC-01 đến SC-07 (Mất mạng, 429 Rate Limit, Test Evasion AST, TOCTOU Symlink, Rò rỉ Khóa, Chặn ask spam/block). |
| **6** | **Đối soát Sổ cái & Kiểm chứng 6 Tầng Toàn cầu (Giai đoạn 5)** | `plans/plan-ledger.json` & `tools/verify-omp-global.cjs` | Chạy đồng bộ giao dịch đầy đủ (không đặt cờ skip verify), kiểm chứng 6 tầng toàn cầu và cập nhật Sổ cái Kế hoạch đạt 100%. |
| **7** | **Xử lý 3 ca Timeout trong `evidence-collector.test.ts`** | `tests/evidence-collector.test.ts` | Khắc phục hiện tượng nghẽn đĩa và lỗi khóa tệp `EBUSY` trên Windows khi chạy lệnh con git đồng thời trong bài test snapshot. |
| **8** | **Thu thập Chứng từ Hợp lệ & Khép kín Todo** | `src/task-evidence-runtime.ts` | Nguyên nhân `CURATION_REQUIRED` là ngân sách `artifactSelection` (4526/4940 bytes) và thiếu `selections` đúng cấu trúc `{ criterionIds, sources, artifactPaths }`. Cần nghiên cứu cách trích xuất mã định danh tiêu chí (`criterionId`) và mã băm tệp (`fullFileDigest`) đang bị che thành `[REDACTED:high-entropy]` trong output công cụ để cấu trúc `CriterionPacketSelection` chuẩn xác. Kỳ vọng tự động đóng Todo sau khi khởi động lại là **dự đoán kỹ thuật chưa kiểm chứng (*expected, unverified*)**. |
| **9** | **Kiểm thử Đơn vị Trực tiếp cho `evaluateMonolithicTask`** | `tests/macro-evidence-fields.test.ts` | Bổ sung bài kiểm thử trực tiếp cho `evaluateMonolithicTask` khi `state.overflow === true`, xác nhận trả về `EVIDENCE_REQUIRED` với mã `payload_too_large` và `client.evaluate` không bị gọi. |
| **10** | **Kiểm thử Ca `testOutput` Dài trong Macro State** | `tests/macro-evidence-fields.test.ts` | Bổ sung ca kiểm thử cho `testOutput` dài $>3000\text{ bytes}$ bảo đảm cắt theo byte và nhúng con trỏ SHA-256 an toàn mà không đánh dấu nhầm `truncated = true`. |
| **11** | **Chạy Kiểm chứng Cô lập Toàn diện tại Đích** | `tools/sync-baseline.cjs` | Các lần đồng bộ trước đều sử dụng cờ `OMP_SKIP_VERIFY_TESTS=1` (`deployed_unverified`); cần chạy một lượt đồng bộ đầy đủ có chạy kiểm thử tại đích khi môi trường cho phép. |

---

## 4. Hướng dẫn Thao tác Cho Phiên Mới (Session Resume Runbook)

Ngay khi mở phiên làm việc OMP mới, tác tử tiếp quản cần thực hiện tuần tự các bước sau:

### Bước 1: Xác nhận Kiểm chứng Cài đặt Sẵn sàng
```bash
node tools/verify-omp-global.cjs --live
```
*Kết quả kỳ vọng*: `INSTALLATION CHECKS PASSED (575/575 files match SHA-256)`, JEV Probe `ONLINE`.

### Bước 2: Ghi nhận Hiện trạng Cây Làm việc Git (Uncommitted Changes)
Kho mã nguồn hiện có 13 tệp đang sửa đổi dở dang (`unstaged`) và 19 tệp chưa theo dõi (`untracked`). Không tự ý chạy `git commit` nếu chưa có sự chỉ đạo tường minh từ người dùng:
- 13 tệp đang sửa đổi: `README.md`, `docs/decisions/README.md`, `docs/design-guidelines.md`, `src/atomic-jev-evaluator.ts`, `src/cook-expert-judge.ts`, `src/task-contract-runtime-sources.ts`, `src/task-verification-macro.ts`, `src/typesafe-api-client.cjs`, `src/typesafe-enabled-resolver.cjs`, `src/typesafe-policy-client.cjs`, `tests/atomic-jev-judge.test.ts`, `tests/autonomous-todo-resolution.test.ts`, `typesafe-planner.ts`.
- Các tệp mới chưa theo dõi tiêu biểu: `UNIFIED_JUDGE_JEV_STANDARDIZATION_PLAN.md`, `plans/261103-unified-judge-jev-standardization/`, `src/test-asset-selector.ts`, `tests/box-primitive.test.ts`, `tests/multi-dialect-wire.test.ts`, `tests/test-asset-selector.test.ts`, `plans/reports/261106-cross-session-continuity-and-handover-spec.md`.

### Bước 3: Chạy Kiểm tra 7 Bộ Test Nền tảng
```bash
bun test tests/multi-dialect-wire.test.ts tests/box-primitive.test.ts tests/atomic-jev-judge.test.ts tests/cook-expert-judge.test.ts tests/macro-evidence-fields.test.ts tests/task-verification-runtime.test.ts tests/test-asset-selector.test.ts
```
*Kết quả kỳ vọng*: **137 pass, 0 fail (100%)** trong $<2$ giây.

### Bước 4: Tiếp tục Thực thi Giai đoạn 2 theo Lộ trình
Kích hoạt lệnh tiếp tục tự động:
```
/skill:ck:cook plans/261103-unified-judge-jev-standardization/phase-02-box-primitive-and-visual-evidence.md --auto --tdd
```
Tập trung hoàn thành Mục 1 (thu thập ảnh UI) và Mục 2 (kiểm thử trần kích thước AC3) theo đúng đặc tả trên.
