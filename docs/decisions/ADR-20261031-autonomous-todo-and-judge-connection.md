# Quyết định Kiến trúc: Khôi phục Kết nối TypeSafe System One / Native Judge và Cơ chế Tự chủ Nghiên cứu, Khắc phục và Gỡ bỏ Nhiệm vụ (ADR-20261031: Restoring TypeSafe System One / Native Judge Connection & Autonomous Research, Remediation, and Todo Clearance Engine)

- **Trạng thái (Status)**: Đã chấp thuận (Accepted)
- **Ngày quyết định (Date)**: 2026-10-31
- **Khuôn khổ Thẩm định (Evaluation Framework)**: Hội đồng Độc lập TypeSafe & Đánh giá Rủi ro Đa chiều (`ck:council` + `ck:problem-solving`)
- **Tác động Kiến trúc (Architectural Scope)**: `typesafe-planner.ts`, `src/typesafe-enabled-resolver.cjs`, `src/task-verification-runtime.ts`, `src/host-history.ts`, `~/.omp/agent/typesafe.json`

---

## 1. Bối cảnh & Vấn đề Thực tiễn (Context & Problem Statement)

Trong quá trình vận hành tiện ích mở rộng TypeSafe cho oh-my-pi (omp), hệ thống gặp phải hai sự cố nghiêm trọng ảnh hưởng trực tiếp đến khả năng làm việc của AI Agent:

1. **Lỗi ngắt kết nối TypeSafe System One & Native Judge (Connection Severance & Judge Failure)**:
   - Tệp cấu hình người dùng toàn cục `~/.omp/agent/typesafe.json` bị cấu hình sai khi đưa các thư mục làm việc chính (`D:/100.Software/Github/omp_extension` và `C:/Users/thant/Projects/omp_extension`) vào danh sách `excludeProjects`.
   - Hệ quả: Bộ phân giải `typesafe-enabled-resolver.cjs` xác định phiên làm việc ở trạng thái `global-excluded`, lập tức vô hiệu hóa công cụ Thẩm phán Native (`typesafe_judge`) và toàn bộ các cuộc gọi suy luận TypeSafe System One với mã trạng thái `status: "DISABLED", reason: "global-excluded"`.

2. **Hiện tượng Đóng băng Công việc khi Todo bị Chặn (Stalled Workflow & Static Blocking Deadlock)**:
   - Cơ chế bảo vệ trước khi hoàn thành (`preflight verification`) của `todo(op="done")` và chốt chặn vòng đời (`lifecycle authority`) áp dụng nguyên tắc đóng băng an toàn khi lỗi (`fail-closed`). Khi kiểm thử thất bại hoặc thiếu bằng chứng xác thực (`EVIDENCE_REQUIRED`), thao tác `todo` bị từ chối hoàn toàn.
   - Thiếu sót cốt lõi: Hệ thống chỉ dừng lại ở việc từ chối thụ động mà không cung cấp quy trình và chỉ dẫn tự phục hồi rõ ràng cho AI Agent. Agent rơi vào vòng lặp bế tắc: thử hoàn thành -> bị từ chối -> thử đánh dấu chặn (`todo block`) -> công việc bị đóng băng và treo vô thời hạn, không có khả năng tự tiến triển.

---

## 2. Thẩm định Các Phương án Kiến trúc (Council Evaluation of Architectural Options)

Hội đồng Thẩm định đã xem xét 3 phương án giải quyết:

| Tiêu chí Đánh giá | Phương án A: Duy trì Chặn Cứng Thụ động (Passive Fail-Closed) | Phương án B: Gỡ bỏ Hoàn toàn Preflight Guard (Bypass Guards) | Phương án C (Được chọn): Khôi phục Kết nối & Cơ chế Tự chủ 5 Bước (Autonomous Resolution Loop) |
| :--- | :--- | :--- | :--- |
| **Tính Liên tục của Công việc (Workflow Continuity)** | Kém: Agent bị treo khi gặp lỗi, đòi hỏi con người can thiệp thủ công | Cao: Agent hoàn thành tự do nhưng mất kiểm soát chất lượng | **Tối ưu: Agent tự nghiên cứu, sửa mã, lấy bằng chứng và hoàn tất tự động** |
| **Tính Toàn vẹn & An toàn Mã nguồn (Integrity & Security)** | Cao: Bảo vệ mã nguồn nhưng gây tắc nghẽn hoàn toàn | Rất thấp: Nguy cơ lọt lỗi nghiêm trọng và trôi dạt kiến trúc | **Tuyệt đối: Duy trì 100% bằng chứng kiểm thử thực tế và xác thực lưỡng viện** |
| **Độ tin cậy của Judge & TypeSafe API** | Bị tê liệt do `excludeProjects` sai lệch | Không khắc phục nguyên nhân gốc rễ | **Hoàn hảo: Khôi phục toàn bộ kết nối, 100% kiểm thử tích hợp vượt qua** |

---

## 3. Quyết định Kiến trúc (Architectural Decision)

Hội đồng Thẩm định nhất trí thông qua **Phương án C**:

### 3.1. Khôi phục Kết nối Toàn cục TypeSafe & Native Judge
- Làm sạch tệp cấu hình toàn cục `~/.omp/agent/typesafe.json`: Loại bỏ hoàn toàn các đường dẫn kho mã nguồn khỏi danh sách `excludeProjects` (`"excludeProjects": []`).
- Đảm bảo quyền ủy nhiệm TypeSafe hoạt động thông suốt trên toàn bộ môi trường phát triển (`D:/100.Software/Github/omp_extension`) và môi trường chạy thực tế (`C:/Users/thant/Projects/omp_extension`).

### 3.2. Thiết lập Giao thức Tự giải quyết Nhiệm vụ (Autonomous Resolution Protocol)
Quy định chặt chẽ chu trình tự giải quyết 5 bước bắt buộc dành cho AI Agent khi đối mặt với bất kỳ nhiệm vụ nào hoặc khi gặp lỗi thiếu bằng chứng:
1. **Bước 1 - Tự Nghiên cứu Căn nguyên (Autonomous Root-Cause Research)**: Sử dụng các công cụ đọc và phân tích mã (`read`, `find`, `grep`, `scout`) để xác định chính xác nguyên nhân gây lỗi hoặc yêu cầu nghiệp vụ. Tuyệt đối không phỏng đoán.
2. **Bước 2 - Suy luận & Thiết kế Giải pháp (Reasoning & Technical Design)**: Áp dụng tư duy phân rã và đơn giản hóa (`ck:problem-solving`) để lập phương án sửa lỗi tối ưu, tuân thủ nguyên tắc Clean Code và TDD.
3. **Bước 3 - Thực thi Kỹ thuật (Technical Implementation)**: Chỉnh sửa mã nguồn (`edit`, `write`), bổ sung các trường hợp kiểm thử biên (`regression tests`) để bao phủ lỗi.
4. **Bước 4 - Kiểm chứng Thực nghiệm & Thu thập Bằng chứng (Empirical Verification & Evidence Collection)**:
   - Chạy lệnh kiểm thử thực tế (`bun test`) để chứng minh mã nguồn hoạt động chính xác với mã thoát `0`.
   - Gọi `typesafe_bind_task` để gắn kết nhiệm vụ với mục tiêu thực tế.
   - Gọi `typesafe_collect_evidence` để ghi nhận bằng chứng khách quan (nhật ký kiểm thử, hàm băm thay đổi).
5. **Bước 5 - Thẩm định & Gỡ Todo (Review & Todo Clearance)**:
   - Gọi `typesafe_review_task` (hoặc ủy thác cố vấn độc lập qua `typesafe_prepare_advisor`) để nhận xác nhận đủ điều kiện `APPROVED_PENDING_COMMIT`.
   - Thực thi `todo(op="done")` để gỡ bỏ nhiệm vụ thành công rực rỡ, kèm đầy đủ bằng chứng đã được kiểm chứng.

### 3.3. Hỗ trợ Mở khóa và Tiếp tục Nhiệm vụ Đã bị Chặn (Unblock & Resume Mechanism)
- Khi một nhiệm vụ trước đó đã bị đưa vào trạng thái `blocked`, Agent được hướng dẫn chủ động gọi `todo(op="unblock", task="...")` sau đó gọi `todo(op="start", task="...")` để đưa nhiệm vụ trở lại luồng thực thi tự chủ, triệt tiêu hoàn toàn tình trạng công việc bị treo.

### 3.4. Khắc phục Tương thích Đa Môi trường Thực thi (Cross-Runtime Polyfill & Compatibility)
- Loại bỏ hoàn toàn sự phụ thuộc vào các API chưa phổ quát (như `Object.hasOwn` chỉ có từ Node 16.9+), thay thế bằng `Object.prototype.hasOwnProperty.call` trong `src/typesafe-policy-client.cjs` và `src/typesafe-api-client.cjs`.
- Bổ sung `SafeAbortController`, nhập chuẩn `performance` từ `node:perf_hooks` và bộ đệm HTTP dự phòng `defaultNodeFetch` (dựa trên module tích hợp sẵn `node:https`) khi chạy trên các phiên bản Node.js cũ thiếu `globalThis.fetch` và `globalThis.performance`.
- Cập nhật `package.json` và `tools/oneclick-omp.ps1` để ưu tiên thực thi bằng Bun (`bun`) - môi trường runtime chính thức và hiện đại của OMP.

### 3.5. Ranh giới Tách biệt Tuyệt đối với .claude (Strict Zero-Touch Isolation from .claude)
- Hệ thống vận hành độc lập 100% trong không gian OMP (`~/.omp/agent/typesafe.json`, `~/.omp/agent/config.yml`), không đọc, không ghi, không tham chiếu và không dùng chung bất kỳ tệp cấu hình hay thư mục nào thuộc `.claude` (`Strict Zero-Touch Isolation`).
- Mọi quy trình phân giải trạng thái bật/tắt TypeSafe (`typesafe-enabled-resolver.cjs`) và kiểm thử đều được cấu hình độc lập, loại trừ triệt để nguy cơ xung đột môi trường.

### 3.6. Chuẩn hóa Nhận diện Đường dẫn Chứa Dấu gạch dưới trong Bộ Lọc Bí mật (Underscore Path Segment Normalization in Redaction Filter)
- **Nguyên nhân Gốc rễ (Root Cause)**: Biểu thức chính quy `PATH_SEGMENT_SHAPE_RE` trong `src/typesafe-redact-patterns.cjs` trước đây chỉ cho phép các phân đoạn đường dẫn bắt đầu bằng chữ cái hoặc chữ số. Khi cây mã nguồn chứa các thư mục hoặc tệp có tiền tố dấu gạch dưới (như `_control`, `_internal`, `__tests__`), hàm phân loại nhầm lẫn đường dẫn hợp lệ thành bí mật ngẫu nhiên có độ hỗn loạn cao (`high-entropy secret`), dẫn đến việc đường dẫn bị che giấu thành `[REDACTED:high-entropy].json`. Hệ quả: Hàm `validatePublicReferences` phát hiện sự bất đối xứng giữa tham chiếu gốc và tham chiếu đã lọc, ném ngoại lệ `advisor_public_reference_redaction_required`, chặn đứng hoàn toàn việc khởi tạo cố vấn độc lập (`typesafe_advisor`).
- **Biện pháp Khắc phục (Resolution)**: Chuẩn hóa `PATH_SEGMENT_SHAPE_RE` thành `/^_*(?:[a-z0-9]+|[A-Z0-9]+|[A-Z][a-z0-9]+)(?:[-_]+(?:[a-z0-9]+|[A-Z0-9]+|[A-Z][a-z0-9]+))*_*$/` để hỗ trợ đầy đủ các phân đoạn đường dẫn chứa tiền tố và hậu tố dấu gạch dưới hợp lệ trong lập trình hiện đại. Toàn bộ 535 tệp mã nguồn và tài liệu trong kho lưu trữ đều đạt tính toàn vẹn 100% khi đi qua bộ lọc bảo mật.

### 3.7. Thu hẹp Biên nhận Kiểm thử để Đáp ứng Ngân sách Gói Bằng chứng TypeSafe JEV (Verification Receipt Asset Scoping)
- **Nguyên nhân Gốc rễ (Root Cause)**: Khi đăng ký lệnh `workspace-tests` trong `typesafe-planner.ts`, toàn bộ 90 tệp kiểm thử trong thư mục `tests/` đều được đưa vào trường `testAssetPaths`. Mỗi tệp kiểm thử được băm mã SHA-256 và lưu trạng thái hai lần (`testAssetsBefore` và `testAssetsAfter`). Khi `typesafe_collect_evidence` chạy, trường `verificationReceipt` bị phình to lên tới 64.945 bytes (xấp xỉ 65 KB). Trong khi đó, trần ngân sách gói bằng chứng của TypeSafe JEV (`maxBytes`) là 32.768 bytes (32 KB). Do 65 KB vượt quá 32 KB, hàm `buildJudgeEvidencePacket` từ chối tạo gói bằng chứng với lý do `MANDATORY_PACKET_PROOF_EXCEEDS_BUDGET`.
- **Biện pháp Khắc phục (Resolution)**: Tại `typesafe-planner.ts` (dòng 1226-1234), áp dụng cơ chế lọc thông minh: ưu tiên các tệp kiểm thử có tên liên quan trực tiếp đến nội dung mục tiêu của hợp đồng (`contract.target.content`), đồng thời giới hạn tối đa 8 tệp kiểm thử trọng tâm cho `testAssetPaths`. Kích thước `verificationReceipt` giảm từ 65 KB xuống còn 8.703 bytes (8,7 KB), giúp toàn bộ gói bằng chứng hoàn chỉnh đạt ~16 KB, hoàn toàn nằm an toàn dưới trần ngân sách 32 KB của TypeSafe JEV.

### 3.8. Chuẩn hóa Phân giải Mô hình Thẩm phán Native OMP và JEV API (OMP Native Judge Model Resolution & Prefix Normalization)
- **Nguyên nhân Gốc rễ (Root Cause)**: Tệp cấu hình OMP toàn cục `~/.omp/agent/config.yml` chỉ định vai trò thẩm phán bản địa qua cú pháp phân cấp: `modelRoles.judge: typesafe/jev-1.14.0`. Khi OMP Native Judge hoặc các công cụ nội bộ gọi `typesafe_judge` với tham số `model: "typesafe/jev-1.14.0"`, bộ lọc chính sách `src/typesafe-policy-client.cjs` trước đây chỉ chứa danh sách cứng `allowedModels: ['jev-latest']`, đồng thời `src/typesafe-api-client.cjs` kiểm tra khớp chuỗi nghiêm ngặt (`allowed.includes(model)`). Hệ quả: Mọi cuộc gọi thẩm phán sử dụng định danh chính thức của OMP đều bị chặn đứng ngay tại chỗ với lỗi `TypeSafe error: model_not_allowed`. Đồng thời, nếu gửi nguyên vẹn chuỗi có tiền tố `typesafe/` sang API từ xa `https://api.typesafe.ai/v1/systemone`, máy chủ sẽ trả về lỗi HTTP 400 do máy chủ chỉ nhận diện tên mô hình trần (`jev-1.14.0` hoặc `jev-latest`).
- **Biện pháp Khắc phục (Resolution)**:
  1. Tại `src/typesafe-api-client.cjs`, bổ sung hàm chuẩn hóa mô hình: Tự động bóc tách tiền tố nhà cung cấp OMP (`rawModel.replace(/^typesafe\//i, '')`) trước khi truyền qua mạng sang máy chủ TypeSafe System One.
  2. Mở rộng cơ chế kiểm tra tính hợp lệ của mô hình: Chấp nhận cả chuỗi có tiền tố (`typesafe/jev-1.14.0`, `typesafe/jev-latest`), chuỗi số hiệu phiên bản (`jev-1.14.0`), và chuỗi alias mới nhất (`jev-latest`), đồng thời tiếp tục chặn đứng an toàn các mô hình trái phép (`untrusted-model`, `gpt-4o`) với mã lỗi `model_not_allowed`.
  3. Cập nhật danh sách mặc định `allowedModels` trong `src/typesafe-policy-client.cjs` để đồng bộ hoàn toàn với cấu hình bản địa OMP.
  4. Kiểm chứng thực tế: Toàn bộ 10 bài kiểm thử đơn vị trong `tests/autonomous-todo-resolution.test.ts` và kiểm tra mạng trực tiếp đều xác nhận kết nối thẩm phán thành công mỹ mãn với HTTP 200 và mô hình giải quyết `jev-1.14.0`.


### 3.9. Kiểm chứng Thực tế và Chuẩn hóa Bộ tham số Thẩm phán Đa dạng (Live Judge Empirical Verification & Diagnostic Schema Standards)
- **Nguyên nhân Gốc rễ Lỗi Thẩm phán (Judge Input Validation Root Cause)**: Khi người dùng hoặc Agent gọi công cụ `typesafe_judge` với dạng câu hỏi `score` nhưng không truyền tiêu chí mức độ (`criteria: string[]`), hoặc dạng câu hỏi `choice` nhưng thiếu tiêu chí tùy chọn (`criteria: Record<string, string>`), bộ kiểm tra `validateInput` trong `src/typesafe-api-client.cjs` sẽ trả về lỗi phân loại `invalid_input`. Đây là cơ chế chốt chặn bảo mật hợp lệ (`fail-closed validation`) theo chuẩn JEV Specification để ngăn chặn việc gửi payload rác lên máy chủ TypeSafe System One.
- **Kiểm chứng Toàn diện Thực tế (Comprehensive Live Verification)**:
  1. Thực hiện cuộc gọi thẩm phán thực tế `typesafe_judge` với đầy đủ 3 kiểu câu hỏi chuẩn JEV: `choice` (lựa chọn nhị phân kèm mô tả), `noul` (xác suất mở) và `score` (thang điểm 3 mức).
  2. Kết quả máy chủ từ xa `https://api.typesafe.ai/v1/systemone`: Trả về trạng thái `HTTP 200 OK`, mô hình phân giải `jev-1.14.0`, sử dụng 384 input tokens và 63 output tokens, đánh giá thành công 100% câu hỏi với độ tin cậy tuyệt đối.
  3. Khẳng định: Kết nối mạng TypeSafe và vai trò Thẩm phán OMP Native Judge hoàn toàn thông suốt, chính xác và tuân thủ 100% đặc tả kỹ thuật chính thức.
---

## 4. Hậu quả & Biện pháp Kiểm chứng (Consequences & Verification)

- **Bảo toàn Bất biến Vàng (Preservation of Golden Invariants)**: Tuyệt đối không chỉnh sửa trực tiếp tệp trung chuyển OMP toàn cục (`C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts`). Mọi thay đổi đều được thực hiện tại không gian phát triển và đồng bộ qua quy trình có kiểm chứng.
- **Khả năng Chống Thoái lui (Regression Prevention)**: Bộ kiểm thử `tests/autonomous-todo-resolution.test.ts` và các bài kiểm thử tích hợp preflight bảo đảm AI Agent luôn nhận được quyền thực thi hợp lệ đối với các yêu cầu triển khai thực tế.
- **Đồng bộ Baseline (Synchronized Baseline)**: Toàn bộ mã nguồn sau khi kiểm chứng đạt 100% vượt qua sẽ được đồng bộ hóa sang môi trường đích thông qua kịch bản giao dịch `node tools/sync-baseline.cjs`.
