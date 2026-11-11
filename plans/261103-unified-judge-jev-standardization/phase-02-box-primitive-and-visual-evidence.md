# Giai đoạn 2: Hiện thực hóa Box Primitive (`BoxQuestion`) & Gói Bằng chứng Thị giác UI

> **Mục tiêu**: Bổ sung nguyên hàm toán học `BoxQuestion` của JEV 1.14+ vào cấu trúc câu hỏi của Thẩm phán và nâng cấp cơ chế thu thập bằng chứng giao diện thị giác trong `src/task-evidence-runtime.ts` và `src/judge-evidence-packet.ts`.
> **Trạng thái**: Hoàn tất trừ hook tự động chụp ảnh trình duyệt (hoãn, deferred). Đã quan sát: ảnh thật trong cây git (PNG/JPEG) đi qua `collectTaskEvidence` → `detectUIVisualEvidence` → `buildJudgeEvidencePacketSet`; gói ≤ 32,768 B ở ảnh 100 KB và ~900 KB; ảnh thật tới System One qua đường HTTP của extension (xem mục 4).

---

## 1. Yêu cầu Chức năng (Functional Requirements)

1. **Nguyên hàm Toán học `BoxQuestion`**:
   - `type: "box"`
   - `instructions`: Mô tả phần tử hoặc thành phần cần phát hiện trên ảnh giao diện (UI element).
   - `image`: Chỉ số ảnh trong mảng `images` được đính kèm vào yêu cầu.
   - Đầu ra mong đợi: `{ type: "box", box: { top: number, bottom: number, left: number, right: number }, confidence: number }`.
2. **Xác thực Bounding Box Hợp lệ**:
   - Kiểm tra ràng buộc chuẩn hóa: $0 \le \text{top} \le \text{bottom} \le 1$ và $0 \le \text{left} \le \text{right} \le 1$.
   - Nếu dữ liệu tọa độ không hợp lệ hoặc thiếu `confidence`, đánh dấu câu trả lời là `malformed`.
3. **Thu thập Bằng chứng Ảnh Thị giác**:
   - Trong `src/task-evidence-runtime.ts`: khi phát hiện nhiệm vụ liên quan tới frontend/UI (thay đổi `.css`, `.tsx`, `.vue`, `.html`, `.svg`), chuẩn bị cấu trúc `visualEvidence: { imageBase64?: string, mimeType?: string }`.
   - Trong `src/judge-evidence-packet.ts`: nhúng ảnh vào trường `assets` theo chuẩn của `packages/ai/src/judgment/systemone.ts`.

---

## 2. Các Bước Thực thi Cụ thể (Implementation Steps)

- [x] Cập nhật `src/typesafe-api-client.cjs`:
  - Mở rộng tập hợp `VALID_TYPES` thêm `"box"`.
  - Cập nhật hàm `validateInput` để kiểm tra thuộc tính `image` (phải là số nguyên không âm) và kiểm tra `assets` nghiêm ngặt theo allowlist an toàn.
  - Cập nhật `buildSystemOneWirePayload` để đính kèm tiêu đề `TypeSafe-Danger-Zone-Images: true` khi có `assets` và loại bỏ thuộc tính nội bộ `image` khỏi câu hỏi wire System One.
  - Cập nhật hàm vệ sinh câu trả lời để kiểm tra tọa độ bounding box.
- [x] Cập nhật `src/judge-evidence-packet.ts`:
  - Bổ sung cấu trúc `SystemOneImageAsset` và `VisualEvidence`.
  - Nhúng ảnh vào thuộc tính `assets` với khóa `ui_visual_evidence` theo chuẩn System One.
  - Chốt chặn an toàn AC3: kiểm soát ngân sách trần 32,768 bytes, từ chối fail-closed khi gói bằng chứng vượt quá ngân sách.
- [x] Cập nhật `src/task-evidence-runtime.ts`:
  - Bổ sung hàm nhận diện tệp giao diện frontend `isUIFrontendPath` (`.css`, `.tsx`, `.vue`, `.html`, `.svg`).
  - Hiện thực hóa hàm `detectUIVisualEvidence` trích xuất ảnh base64 đã qua kiểm chứng snapshot từ `evidence.sourceEvidence`, tránh hoàn toàn việc tạo dữ liệu giả mạo.
- [x] `src/atomic-judge.ts`: giữ nguyên việc từ chối `box` (keep rejecting `box`); kiểm thử hồi quy pass (`tests/atomic-judge.test.ts`, `atomic_predicate_invalid`).
- [ ] Hook tự động chụp ảnh trình duyệt (browser auto-capture): **hoãn (deferred)**, ngoài phạm vi giai đoạn này; ảnh hiện đến từ tệp `.png`/`.jpg` đã đổi trong cây git.
- [x] Chuyển bằng chứng thị giác tới M (`src/task-verification-macro.ts`, `src/cook-expert-judge.ts`, `src/visual-evidence-send-guard.ts`): `assets` + đúng một câu `noul` `visual_supports_ui_criteria` (chỉ khi có ảnh, chỉ siết chặt); chốt chặn sha256 trước khi gửi.
- [x] Sửa đường truyền `src/typesafe-api-client.cjs`: header `TypeSafe-Danger-Zone-Images` thực sự được gửi qua `requestWithRetry` (trước đó chỉ có trong hàm dựng payload) và trần thân 32 KiB chỉ áp cho phần văn bản (ảnh đi kèm ngoài trần). Trước sửa, mọi ảnh > ~24 KB bị `payload too large` ở lớp truyền.
- [x] `detectUIVisualEvidence` bỏ qua đường dẫn riêng tư và ngoài phạm vi đọc; `taskRecoveryProgress` gộp siêu dữ liệu `visualAssets` vào digest tiến trình.
- [x] Viết kiểm thử đơn vị:
  - Kiểm thử trong `tests/box-primitive.test.ts`: kiểm tra validation của box, tọa độ ngoài dải [0, 1], kiểm duyệt bounding box, wire encoding, assets danger zone header, nhúng gói bằng chứng thị giác và trần an toàn AC3 (19/19 PASS).
  - `tests/visual-evidence-integration.test.ts`: git tree thật, PNG/JPEG sinh trong test, sha256, trần gói, ảnh > 1 MiB và vượt ngân sách tích lũy cho `EVIDENCE_REQUIRED`, đường dẫn riêng tư, phạm vi đọc, ranh giới lưu trữ, digest cổng thử lại.
  - `tests/visual-evidence-judge-forwarding.test.ts`: thân wire bắt được (`assets`, header, base64 không nằm trong `state`, không ảnh thì thân giống hệt cũ), chốt chặn sha256, câu `noul` chỉ siết chặt, giới hạn số câu hỏi.
  - `tests/visual-evidence-live-typesafe.test.ts`: gác bằng `OMP_LIVE_TYPESAFE_TESTS=1` + `TYPESAFE_API_KEY`.
---

## 3. Tiêu chí Chấp thuận (Acceptance Criteria)

- [x] `BoxQuestion` hợp lệ được mã hóa chuẩn xác và giải mã đúng tọa độ.
- [x] Bounding box sai lệch (ví dụ: `top > bottom`) bị từ chối dứt khoát.
- [x] Không làm phình kích thước gói bằng chứng vượt quá giới hạn trần an toàn của hệ thống (AC3): gói chỉ mang siêu dữ liệu `visualAssets`; quan sát thực nghiệm ≤ 32,768 B với ảnh thật 100 KB và ~900 KB; ảnh > 1 MiB hoặc vượt ngân sách nguồn tích lũy cho `EVIDENCE_REQUIRED` và không gửi asset nào.

---

## 4. Kết quả Quan sát Thực nghiệm (Observed Results)

- **Ảnh thật qua HTTP thật** (`OMP_LIVE_TYPESAFE_TESTS=1`, PNG 320x320 có hình vuông đỏ trên nền trắng, `judgeTypeSafe`, header `TypeSafe-Danger-Zone-Images: true`): model trả về `jev-1.14.0`; "contains a red square" = **0.94**, "contains a blue circle" = **0.02**. `state` không mô tả ảnh nên kết quả đến từ điểm ảnh, không phải suy luận văn bản.
- Lần chạy đầu trả `http_400`: nguyên nhân là (a) asset không được nhắc đến trong văn bản (System One trả 400 cho asset không tham chiếu) và (b) ảnh 256x256 dưới ngưỡng 78,400 px. Đã sửa bằng khoá wire cố định `ui_visual_evidence` nằm trong câu hỏi thị giác và ảnh ≥ 280 px. Khoá dẫn xuất từ nội dung (`visual-evidence-<32 hex của sha256>`, chuỗi 48 ký tự) đã bị bỏ: bộ che giấu `typesafe-redact-patterns.cjs` coi chuỗi liên tục ≥ 32 ký tự có entropy > 4.3 bit/ký tự là bí mật và thay bằng `[REDACTED:high-entropy]` trong văn bản câu hỏi tuỳ theo hash của ảnh, khiến asset không còn được tham chiếu (HTTP 400). Khoá cố định ngắn, entropy thấp nên không bao giờ bị che; danh tính ảnh vẫn được ràng buộc bằng sha256 trong siêu dữ liệu `visualAssets` và chốt chặn `verifyVisualAssetsForSend`. Mỗi yêu cầu chỉ mang một ảnh.
- Ràng buộc nhà cung cấp cần nhớ: cạnh 280-1568 px, tổng 78,400-2,458,624 px; ngoài dải bị `400` (không tự co ảnh). Host kiểm tra kích thước cục bộ trước khi gửi (hằng `SYSTEM_ONE_IMAGE_LIMITS` trong `src/visual-evidence-send-guard.ts`; đọc IHDR của PNG và SOF0-SOF15 của JPEG, không thêm phụ thuộc), tại `buildJudgeEvidencePacket` và lại tại `verifyVisualAssetsForSend`: ngoài dải thì `EVIDENCE_REQUIRED` với `VISUAL_EVIDENCE_DIMENSIONS_OUT_OF_RANGE:<key>:<rộng>x<cao>`, không đọc được thì `VISUAL_EVIDENCE_DIMENSIONS_UNREADABLE:<key>`; ảnh không bao giờ bị bỏ lặng lẽ và không có yêu cầu nào được gửi (fail-closed, chỉ siết chặt).
- Đột biến thủ công (mutation): bỏ `assets` ở lời gọi macro, bỏ so sánh sha256, làm câu hỏi thị giác không chặn: mỗi đột biến làm kiểm thử thất bại.
