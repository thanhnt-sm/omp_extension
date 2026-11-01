# Hướng dẫn kiểm chứng cài đặt và kết nối (Installation and Health Verification)

## Phân biệt các lớp bằng chứng (Evidence Boundaries)

| Lớp | Cách kiểm tra | Chứng minh được | Không chứng minh được |
|---|---|---|---|
| Đồng bộ trên đĩa (Disk Parity) | `node tools/verify-omp-global.cjs --json` | Con trỏ nạp bất biến, bảng kê SHA-256, kế hoạch đồng bộ, bộ phân giải và bộ lọc | Mã đã nạp trong OMP, định tuyến native judge, phê duyệt nhiệm vụ |
| Kết nối HTTP của extension (Extension Transport) | `--live` hoặc `--require-live` tường minh | Kết quả request trực tiếp của extension và model được dịch vụ trả về | Native `judge()` của OMP hoặc phê duyệt ngữ nghĩa (Semantic Approval) |
| Vai trò judge bản địa (Native Judge Role) | `bun tools/native-judge-setup.cjs --check --config <config.yml>` | Tệp được chọn chứa role `typesafe/jev-1.14.0` | Profile đang chạy thực sự dùng tệp đó, credential hợp lệ |
| Định tuyến judge bản địa (Native Judge Routing) | `eval` gọi `judge()` và `judgeBatch()`, ghi metadata model | Backend thực sự phục vụ request cụ thể | Chất lượng trên dữ liệu thực, Advisor hoặc quyền hoàn tất todo |
| Mã được nạp (Loaded Code) | Khởi động lại và thực hiện đường hành vi cần kiểm tra | Hành vi quan sát trong phiên mới | Toàn bộ mã đã được kiểm định chỉ từ digest |
| Hoàn tất nhiệm vụ (Native Finality) | Bằng chứng đầy đủ, M, Advisor thật và kết quả Core đã quyết toán khớp mục tiêu | Hoàn tất đúng hiện thân (Incarnation) | Nhiệm vụ hoặc hiện thân khác |

Không có lệnh verifier đơn lẻ nào chứng minh toàn bộ các lớp trên. Không dùng số lượng tệp, thời gian chạy dự kiến hoặc dòng trạng thái xanh thay cho bằng chứng hành vi.

## Kiểm tra cài đặt hiện hành (Current Installation Verification)

```sh
node tools/sync-baseline.cjs --dry-run
```

Verifier mặc định ngoại tuyến (Offline by Default), kể cả khi có `TYPESAFE_API_KEY`. `--help` thoát trước kiểm tra cài đặt; tham số lạ bị từ chối. Chỉ `--live`/`--require-live` gọi HTTP. Kế hoạch đồng bộ có mã thoát `0` chỉ nghĩa tiền kiểm hợp lệ; verifier yêu cầu mọi hành động là `NOOP` để công nhận đồng bộ. JSON `verificationScope` phân biệt kiểm đĩa, HTTP, native judge, mã đã nạp và quyền ngữ nghĩa.

`overallOk` chỉ tổng hợp các kiểm tra cài đặt và probe được yêu cầu; không phải phê duyệt ngữ nghĩa. Bản ghi sao lưu gần nhất là thông tin quan sát, không thay thế kiểm tra bảng kê hoặc chứng minh mã đang chạy.

## Thăm dò HTTP tường minh (Explicit Live Probe)

```sh
node tools/verify-omp-global.cjs --live --json
node tools/verify-omp-global.cjs --require-live --json
```

Đây là request có thể tính phí tới TypeSafe qua client riêng của extension, không phải OMP native judge. `--live` cho phép bỏ qua nếu thiếu credential; `--require-live` yêu cầu probe thực sự thành công. Không in credential, không đưa credential vào argument hoặc repo. Thất bại mạng là không khả dụng (Unavailable), không phải bằng chứng nhiệm vụ sai.

Công cụ một chạm (One-Click) giữ hai quy trình riêng:

```sh
bun run oneclick
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File tools/oneclick-omp.ps1 -Mode VerifyOnly -Live
```

`Auto` giữ mã lỗi lần kiểm cuối; smoke đã xác nhận verifier thứ hai thoát `7` thì oneclick thoát `7` và không in thành công. Thành công của công cụ không cài hoặc bật native judge, không bật chính sách launcher cho phiên mở bằng `omp` trực tiếp.

## Kiểm chứng native judge (Native Judge Verification)

Làm theo [hướng dẫn native judge](native-judge-guide.md) và [hướng dẫn chuyển máy](reinstall-portability-audit.md). Native OMP quản lý role, provider, credential, cache và usage; không dùng `.claude/.ck.json` để cấu hình native auth.

Ví dụ trong `eval` JavaScript, chỉ gửi dữ liệu tổng hợp không nhạy cảm:

```js
const batch = await judgeBatch(
  { positive: { message: "I love this product" }, negative: { message: "I hate this product" } },
  { sentiment: { type: "choice", instructions: "Classify the sentiment in `message`.", criteria: { positive: "Positive sentiment", negative: "Negative sentiment" } } },
  { concurrency: 2, retries: 0, intent: "Native judge smoke" },
);
const results = await batch.results();
print("Batch results:", JSON.stringify(results));
```

Ghi model thực tế và lỗi từng item; không coi đáp án đúng nhưng thiếu nguồn gốc backend (Backend Provenance) là bằng chứng Jev. `bool` trả xác suất trong `.bool`, không phải boolean. Native eval nhận `choice`, `bool`, `score` theo schema host hiện tại; không dùng `noul` của HTTP API như native type.

Giữ phép tính, kiểm tra schema, I/O và quyền thay đổi trạng thái trong code. Ghép nhiều câu hỏi độc lập cùng state vào một request; nhiều state dùng batch. Không retry phán quyết không đổi hoặc thay ngưỡng để tìm pass.

## Diễn giải `runtime-origin` và `ONLINE`

`runtime-origin.interpretation` là `disk-observation-not-loaded-code-proof`. Digest khớp chỉ chứng minh quan sát tệp trên đĩa khớp nhau. `loadedFactoryDigest` cũng không tự chứng minh toàn bộ module phụ thuộc đã nạp cùng revision. Sau triển khai phải khởi động lại OMP và thực hiện đường hành vi cần xác minh.

`TypeSafe: ONLINE (jev-latest). Transport only; resolved model: ...` chỉ là kết quả chẩn đoán HTTP của extension ở thời điểm đó. Nó không chứng minh `judge()` native đã được chọn hoặc nhiệm vụ được phê duyệt. Chỉ thị quy trình được chèn vào phiên (Policy Injection) cũng không phải biên nhận Advisor hay kết quả Core.

## Xử lý sai lệch (Recovery)

- Con trỏ nạp sai hoặc thiếu: dừng triển khai và báo người sở hữu cài đặt. Không sửa, tạo lại hoặc tự phục hồi proxy toàn cục.
- Bảng kê hoặc kế hoạch đồng bộ khác: xem hành động, dùng quy trình giao dịch `tools/sync-baseline.cjs` sau kiểm chứng; không sao chép đè thủ công.
- Resolver extension tắt: kiểm tra nguyên nhân không lộ secret; không tự bật wildcard cho mọi dự án. Đây là activation extension, không phải cấu hình native judge.
- HTTP lỗi: kiểm tra credential/endpoint theo đúng client gây lỗi; sửa `models.yml` của native không sửa endpoint hardcode của extension.
- Thiếu callback judge chính thức cho extension: giữ trạng thái `HOST_BRIDGE_REQUIRED`; không dựng façade, không gọi `eval` từ preflight, không dùng output tự nộp làm quyền native.
- Thiếu lịch sử thực thi do host sở hữu (Host-Owned Execution Observation): giữ nguyên mục tiêu và hiện thân; không giả receipt hoặc đánh dấu todo hoàn tất. Báo rõ owner host, bước tiếp theo là khôi phục observation bridge, điều kiện mở lại là bind/collect nhìn thấy execution thật, lệnh tiếp tục là `typesafe_bind_task` với đúng mục tiêu hiện hành.

## Kiểm thử bổ sung (Additional Checks)

Chạy `bun test` cho source; chạy module liên quan và smoke đường đổi sau sửa. Các bài kiểm thử dùng mock transport không chứng minh request native thật hoặc phê duyệt nhiệm vụ. Đo kiểm M/H bắt cặp (Paired Evaluation) chỉ được thực thi theo hợp đồng host và xác nhận con người thật; H vẫn là ứng viên quan sát (Shadow Candidate).

## Nguồn chính thức (Official References)

- [OMP eval](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/eval.md).
- [OMP model/provider](https://github.com/can1357/oh-my-pi/blob/main/docs/models.md).
- [OMP extension API](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/extensibility/extensions/types.ts).
- [TypeSafe: thiết kế với System One](https://docs.typesafe.ai/concepts/how-to-build-with-system-one).

Tài liệu upstream `main` có thể mới hơn binary đã cài; schema của phiên đang chạy và smoke thực tế quyết định capability được phép sử dụng.
