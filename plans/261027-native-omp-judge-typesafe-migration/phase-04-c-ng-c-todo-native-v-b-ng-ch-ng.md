---
phase: 4
title: "Củng cố Todo Native và bằng chứng"
status: pending
priority: P1
effort: "2d"
dependencies: [3]
---

# Giai đoạn 4: Củng cố Todo Native và bằng chứng

## Tổng quan
Chỉ thực hiện sau khi giai đoạn 3 xác minh và dùng được cầu nối đánh giá (judgment bridge) của host. Bảo toàn `todo` của Core làm nguồn trạng thái có thẩm quyền, đồng thời đưa các thao tác ràng buộc nhiệm vụ (task binding), thu thập bằng chứng (evidence collection) và thẩm định (review) về cơ chế nội bộ được host hỗ trợ; không cần sáu công cụ `typesafe_*`.

## Yêu cầu
- Đọc schema `todo` từ host đang chạy; không truyền thêm `requirements`, `testCommand`, `approval`, `human`, `EGC` hoặc cờ vòng đời (lifecycle flag).
- Giữ chính xác nội dung mục tiêu, lần hiện thân (incarnation), phạm vi, ảnh chụp trước/sau, biên nhận lệnh đã phê duyệt và kết quả Core đã ổn định (settled result). Không biến kết quả của tác tử con thành bằng chứng tích hợp của nhiệm vụ cha.
- Kiểm tra tiền chuyến (preflight) chỉ dùng dữ liệu đã thu thập: không HTTP, không chạy test, không suy luận ở tác tử con, không phát lệnh đánh giá ngữ nghĩa.

## Kiến trúc
Core `todo` là nguồn sự thật; extension chỉ kiểm tra hợp đồng (contract), độ mới của bằng chứng (evidence freshness), trạng thái thẩm định đã có và đối soát `tool_result`. Thiếu bằng chứng là `EVIDENCE_REQUIRED`, lỗi host là `UNAVAILABLE`; từ chối ngữ nghĩa (semantic rejection) không được gửi lại khi dữ liệu chưa đổi. Biên nhận Advisor chỉ ghép với kết quả M còn hiệu lực; các ranh giới lượt thông thường không tự xóa một thẩm định còn áp dụng.

## Tệp mã liên quan
- Sửa có điều kiện: `typesafe-planner.ts`, `src/contract-runtime.ts`, `src/task-evidence-runtime.ts`, `src/task-verification-runtime.ts`, `src/task-verification-state.ts`, `src/todo-lifecycle-authority.ts`, `src/evidence-collector.ts`.
- Kiểm thử toàn tệp liên quan: `tests/contract-runtime.test.ts`, `tests/task-evidence-runtime.test.ts`, `tests/typesafe-planner-integration.test.ts`, `tests/e2e-workflow.test.ts`; mở rộng các tệp kiểm thử vòng đời đã có sau khi tìm chính xác.
- Báo cáo khi chờ bên ngoài: `plans/reports/261027-native-omp-judge-migration-execution-log.md`.

## Các bước thực hiện
1. Trước sửa mã, tìm mọi wrapper, callsite và nơi chuẩn hóa `todo` gốc; kiểm tra trường hợp `init`, `done`, `block`, `drop`, `rm` cùng kết quả Core. Viết test đỏ về input hợp lệ và trường bị cấm, không mở lại danh sách của phiên hiện tại.
2. Chỉ tạo danh sách công việc cho các hạng mục mà phiên mới có thể thực hiện; một danh sách `init` đúng một lần. Không hứa rằng lỗi dịch vụ hay chờ người dùng sẽ không bao giờ phát sinh mục bị chặn.
3. Di chuyển nguồn binding/evidence/review sang hook hoặc API host được xác minh. Nếu không có cách hợp lệ để thu bằng chứng và làm review độc lập mà không dùng custom lifecycle tools, ghi thiếu năng lực host và dừng; không phát hành preflight luôn cho qua.
4. Tách việc chạy lệnh kiểm thử và thẩm định ngữ nghĩa ra khỏi preflight; preflight chỉ kiểm tra đúng task/incarnation, chính sách, snapshot, receipt và quyết định còn hiện hành. Hoàn tất chỉ sau khi đối chiếu tool call với kết quả Core đã ổn định.
5. Kiểm thử thứ tự: bind → evidence → M review → Advisor thực thụ → ghép receipt → native `done`. Nếu M từ chối, lấy chẩn đoán chỉ đọc, parent sửa thật, chạy lại test và smoke rồi cung cấp bằng chứng mới; không retry input không đổi.
6. Khi cần chờ bên ngoài, ghi báo cáo công khai gồm nguyên văn mục tiêu, chủ sở hữu, hành động tiếp, điều kiện gỡ chặn quan sát được và lệnh tiếp tục. Chỉ dùng mutation `block/drop/rm` qua cơ chế Core thực sự hỗ trợ; không xóa mục để che nợ.
7. Chạy toàn bộ tệp kiểm thử bị ảnh hưởng cùng smoke đường `todo` thực tế. Tìm các bản sao của schema/callsite sau mỗi sửa chữa.
8. Sau khi native evidence/review, Advisor receipt và recovery report có đường thay thế thật, xóa các registration `typesafe_bind_task`, `typesafe_collect_evidence`, `typesafe_retrieve_evidence`, `typesafe_review_task`, `typesafe_prepare_todo_mutation`, `typesafe_resolve_historical_debt`, `typesafe_recovery_report`, `typesafe_prepare_advisor`, `typesafe_advisor` và stub tương ứng trong cùng đợt cắt chuyển có kiểm thử. Nếu bất kỳ chức năng nào chưa có đường thay thế an toàn, **không** xóa riêng registration đó rồi tuyên bố migration đã xong; ghi rõ tiền đề host còn thiếu.

## Tiêu chí thành công
- [x] `todo` chỉ nhận trường native và hoàn tất đòi hỏi kết quả Core đã ổn định, trùng nhiệm vụ và lần hiện thân.
- [x] Preflight không gọi mạng, chạy test, gọi child hoặc đánh giá ngữ nghĩa; thiếu receipt không thể biến thành thành công.
- [x] Từ chối không đổi, lỗi dịch vụ, thiếu bằng chứng, receipt Advisor và tích hợp nhiệm vụ cha được phân loại và đối soát chính xác.
- [x] Chờ bên ngoài có đủ năm trường phục hồi; không block/drop/rm để giả hoàn tất.
- [x] Toàn bộ lifecycle/Advisor registrations `typesafe_*` đã cắt sau khi các đường thay thế thật được kiểm chứng; không còn alias hoặc stub giả `UNAVAILABLE`.

## Đánh giá rủi ro
Xóa công cụ vòng đời trước khi có đường evidence/review chính thức sẽ mở đường hoàn tất sai. Cắt theo từng caller và giữ fail-closed; nếu host chưa cung cấp cơ chế tương ứng, dừng giai đoạn này, không làm suy yếu gate hoặc tạo tool giả.
