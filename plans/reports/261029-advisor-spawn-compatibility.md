# Tương thích định danh Advisor trên OMP 18.13.3

## Nguyên nhân và sửa đổi

Binary `omp --version` trả `18.13.3`. Source đúng tag tại https://github.com/can1357/oh-my-pi/blob/v18.13.3/packages/coding-agent/src/task/structured-subagent.ts ưu tiên `identity.id`, tiếp theo label, sau đó mới dùng `parentToolCallId:index` làm `spawnKey`.

Adapter trước đó chỉ chấp nhận fallback cuối, gây `advisor_approved_actual_native_task_dispatch_required` sau khi descriptor đã chuẩn bị thành công. Workspace sửa đúng hai production files:
- `src/advisor-host-hooks.ts`: ghi `spawnKey` do hook host quan sát vào dispatch frame, vẫn giữ kiểm parent/session/epoch/native invocation và one-spawn.
- `src/advisor-host-state.ts`: khi route child, yêu cầu key khớp ID child thật hoặc fallback call/index đã hỗ trợ; vẫn kiểm prompt, parent ancestry, source scope và snapshot.

Thêm regression `tests/advisor-allocated-spawn.test.ts`: ID hợp lệ tạo review trong fixture điều khiển; ID khác không gọi provider và không tạo review. Không sửa assertion hoặc timeout hiện hữu.

## Kiểm tra tính nhất quán và phạm vi

Đã grep toàn bộ `src` và `tests` cho `spawnKey`, `DispatchFrame`, `spawnAuthorized`. Nhánh mutation delegation chỉ lưu observation, không suy key là child ID nên không đổi. Fixture cũ vẫn kiểm fallback; regression mới bổ sung allocated-ID. Production diff giới hạn hook/frame/route, không sửa rubric M, thresholds hoặc privacy policy.

## Bằng chứng thực thi

- Bảy module Advisor/host/privacy: 60 pass, 0 fail, 265 assertions.
- Smoke source điều khiển: allocated child tạo một settled fixture review; foreign ID tạo 0 provider calls, 0 review. Đây không phải live Advisor receipt.
- Full suite workspace trước thêm hai regression: 950 pass, 4 skip, 0 fail trong 330.64s; lần deadline 300s trước đó timeout. Không dùng kết quả dài hơn deadline như receipt 300s.
- Triển khai lần đầu: 951 pass, 4 skip, 1 fail; bài PowerShell subprocess timeout mặc định Bun 5s, transaction trả RECOVERED và rollback.
- Toàn module installation chạy ba lần sau đó: mỗi lần 6 pass, 0 fail, 42 assertions; 2.29s, 2.27s, 2.08s. Lỗi nhạy tải chưa được giải quyết bằng thay timeout; không gọi là chưa từng thất bại.
- Triển khai lần hai: 952 pass, 4 skip, 0 fail; 5428 assertions; 345.26s. DEPLOYED_VERIFIED; backup `C:/Users/thant/Projects/omp_extension_backup_2026-10-29T02-12-14-530Z`.
- Hậu kiểm trước khi tạo report này: 511/511 tệp khớp, mismatches rỗng, nonNoopActions rỗng; proxy nguyên vẹn. `nativeJudge`, `loadedCode`, `semanticAuthority` vẫn NOT_VERIFIED trong verifier.

## Hai lỗi runtime đã phân biệt

1. Sao chép descriptor từ output text đã bị biến đổi identity có thể gây `advisor_scoped_provisional_request_required`. Chuyển nguyên `details.advisor.parameters` trong eval tránh tự viết lại prompt; không sửa hoặc giả handle.
2. Chuyển descriptor nguyên vẹn qua `tool.task` vượt được lỗi provisional match nhưng gặp lỗi spawn hook; sửa allocated-ID ở trên nhằm xử lý lỗi thứ hai. Chưa có live settled Advisor receipt từ bản mới trong phiên này.

## Việc còn lại và phục hồi

Giữ nguyên bảy nghĩa vụ cũ và sáu bước mới trong Core. Không tuyên bố completion từ deploy hoặc fixture review. Owner: người vận hành host và integration owner. Cần nạp lại extension đã triển khai trong tiến trình host mới, resume cùng lịch sử, chuẩn bị consultation và chuyển descriptor nguyên vẹn để xác minh native dispatch/child/receipt thật. Chỉ mở lại blocked mục cũ khi prerequisite thực sự phục hồi.

Lệnh tiếp tục: `todo view`; đọc báo cáo này; `typesafe_prepare_advisor` với exact task/phase và purpose consultation; thực thi nguyên parameters trả về; kiểm receipt thật. Sau đó thu current command receipt và curate criterion đầy đủ trước M/Advisor/Core.

Ngân sách `workspace-tests` 300000ms vẫn chưa đạt ổn định trên máy hiện tại. Cần chẩn đoán hiệu năng/harness, không tăng timeout để che lỗi, không lấy deployment suite 345.26s thay receipt ngắn hơn. Không retry unchanged semantic rejection hoặc nới chốt bảo mật.
