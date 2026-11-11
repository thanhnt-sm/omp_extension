# Giai đoạn 1: Mở rộng Hỗ trợ Đa dialect Wire System One (OpenRouter / Cloudflare)

> **Mục tiêu**: Bổ sung hỗ trợ các dialect wire chuẩn hóa tương thích System One theo đặc tả `oh-my-pi/packages/ai/src/judgment/systemone.ts` vào `src/typesafe-api-client.cjs` và cấu hình bộ giải quyết `src/typesafe-enabled-resolver.cjs`.
> **Trạng thái**: Hoàn tất Kiểm thử & Nghiệm thu (23/23 tests PASS).

---

## 1. Yêu cầu Chức năng (Functional Requirements)

1. **Hỗ trợ Dialect `typesafe` (Mặc định)**:
   - Endpoint: `POST {baseUrl}/v1/systemone`
   - Headers: `Authorization: Bearer <API_KEY>`, `Content-Type: application/json`
   - Body: `{ model, state, questions, assets? }`
2. **Hỗ trợ Dialect `openrouter-decisions`**:
   - Endpoint: `POST {baseUrl}/decisions`
   - Format: Thêm trường `cost` vào dữ liệu sử dụng `usage` để theo dõi chi phí USD.
3. **Hỗ trợ Dialect `workers-ai-systemone` (Cloudflare Clef)**:
   - Endpoint: `POST {baseUrl}/{model}` (`@cf/cloudflare/clef`)
   - Header: Token xác thực Cloudflare hoặc API key qua `Authorization: Bearer <TOKEN>`.
4. **Bảo toàn An toàn Dữ liệu**:
   - Giữ nguyên cơ chế che giấu bí mật `typesafe-redact.cjs` và bảo toàn `TELEMETRY_COUNT_KEYS`.
   - Giữ nguyên giới hạn trần cứng 32KB theo cơ chế Đóng băng An toàn khi Lỗi (Fail-Closed); bộ cắt rót nước (water-filling truncator) bị vô hiệu hóa để bảo toàn trọn vẹn chứng cứ.

---

## 2. Các Bước Thực thi Cụ thể (Implementation Steps)

- [x] Cập nhật `src/typesafe-api-client.cjs`:
  - Khai báo kiểu cấu hình `SystemOneDialect: "typesafe" | "openrouter-decisions" | "workers-ai-systemone"`.
  - Hàm `buildSystemOneWirePayload(dialect, options)` chuẩn hóa cấu trúc URL, headers, và body envelope.
  - Hàm `decodeSystemOneResponse(dialect, rawResponse)` phân giải đúng định dạng phản hồi của từng dialect.
- [x] Cập nhật `src/typesafe-enabled-resolver.cjs`:
  - Cho phép cấu hình thuộc tính `dialect` và `endpoint` trong `~/.omp/agent/typesafe.json`.
- [x] Viết kiểm thử đơn vị:
  - Kiểm chứng việc tạo payload và giải mã phản hồi cho cả 3 dialect trong `tests/multi-dialect-wire.test.ts`.

---

## 3. Tiêu chí Chấp thuận (Acceptance Criteria)

- [x] Phản hồi từ cả 3 dialect đều được chuẩn hóa về định dạng nội bộ `SystemOneAnswerSet`.
- [x] Lỗi 429 và 529 được xử lý thông qua `RETRY_POLICY` bất kể dialect nào được kích hoạt.
- [x] Không rò rỉ token xác thực ra bên ngoài hoặc trong log kiểm thử.
