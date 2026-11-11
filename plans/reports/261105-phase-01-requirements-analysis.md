# Báo cáo Phân tích Yêu cầu Kỹ thuật Giai đoạn 1 (Phase 1 Requirements Analysis Report)

> **Mục tiêu Nhiệm vụ**: Phân tích yêu cầu kỹ thuật và tiêu chí nghiệm thu của Giai đoạn 1 từ kế hoạch `plans/261103-unified-judge-jev-standardization/phase-01-multi-provider-wire-support.md`.  
> **Tác vụ Ràng buộc**: `Đọc và phân tích yêu cầu Phase 01 từ file kế hoạch` (`taskKind: research`)  
> **Ngày lập**: 2026-11-05  

---

## 1. Phân rã Yêu cầu Chức năng & Bản đồ Mã nguồn (Functional Requirements Mapping)

| Yêu cầu Chức năng (Requirement) | Mô tả Chi tiết (Description) | Tệp Mã nguồn Thực thi (Implementation) | Tệp Kiểm thử Đơn vị (Unit Tests) |
|---|---|---|---|
| **1. Dialect `typesafe`** | Mặc định: `POST {baseUrl}/v1/systemone`, tiêu đề `Authorization: Bearer <API_KEY>`, thân `{ model, state, questions, assets? }`. | `src/typesafe-api-client.cjs` (`buildSystemOneWirePayload`, `SYSTEM_ONE_DIALECTS.TYPESAFE`) | `tests/multi-dialect-wire.test.ts` (`2. buildSystemOneWirePayload wire construction`) |
| **2. Dialect `openrouter-decisions`** | Điểm cuối: `POST {baseUrl}/decisions`, bóc tách và ánh xạ chi phí USD `cost` vào `usage.cost`. | `src/typesafe-api-client.cjs` (`buildSystemOneWirePayload`, `decodeSystemOneResponse`) | `tests/multi-dialect-wire.test.ts` (`2. buildSystemOneWirePayload`, `3. decodeSystemOneResponse`) |
| **3. Dialect `workers-ai-systemone`** | Điểm cuối: `POST {baseUrl}/{model}`, tự động gán `@cf/cloudflare/clef`, bóc tách phong bì `{ result, success }`. | `src/typesafe-api-client.cjs` (`buildSystemOneWirePayload`, `decodeSystemOneResponse`) | `tests/multi-dialect-wire.test.ts` (`2. buildSystemOneWirePayload`, `3. decodeSystemOneResponse`, `6. Hardened Security`) |
| **4. Cấu hình Toàn cục OMP** | Đọc `dialect`, `endpoint`, `baseUrl` từ `~/.omp/agent/typesafe.json`. Chốt chặn fail-closed cấm URL HTTP không loopback và cấm `userinfo`. | `src/typesafe-enabled-resolver.cjs` (`resolveTypeSafeEnabled`, `isValidWireUrl`) | `tests/multi-dialect-wire.test.ts` (`5. typesafe-enabled-resolver configuration`) |
| **5. An toàn & Khử rò rỉ Token** | Cố định tiêu đề `Authorization` không bị ghi đè bởi `extraHeaders`. Cấm fallback thô khi giải mã hỏng. | `src/typesafe-api-client.cjs` (`buildSystemOneWirePayload` headers, `judgeTypeSafe` validation) | `tests/multi-dialect-wire.test.ts` (`6. Hardened Security & Wire Integrity`) |

---

## 2. Tiêu chí Chấp thuận (Acceptance Criteria Verification)

1. **Chuẩn hóa Phản hồi**: Toàn bộ phản hồi từ cả 3 dialect đều được hàm `decodeSystemOneResponse` chuẩn hóa về định dạng nội bộ `SystemOneAnswerSet` trước khi chuyển giao cho bộ lọc câu trả lời.
2. **Chính sách Thử lại Lũy thừa**: Lỗi 429 và 529 được xử lý thông qua `requestWithRetry` theo đúng `RETRY_POLICY` bất kể dialect nào được kích hoạt.
3. **Bảo mật & Che giấu Khóa Bí mật**: Thuật toán che giấu bí mật `typesafe-redact.cjs` bảo toàn số nguyên đếm token `TELEMETRY_COUNT_KEYS`, loại bỏ mọi khóa PEM/JWT/Bearer trước khi rời khỏi máy cục bộ.
