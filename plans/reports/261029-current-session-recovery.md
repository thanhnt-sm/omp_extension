---
title: "Phục hồi đúng phiên Core và lỗi Advisor trước dispatch"
status: completed
---
# Phục hồi đúng phiên Core và lỗi Advisor trước dispatch

## Bằng chứng hiện hành

- `todo view` trong phiên `01a1859f-fe9c-769f-8032-c5e1b4324caf` trả danh sách rỗng. Không suy ra các nghĩa vụ cũ đã hoàn tất hoặc đã được xóa.
- Lịch sử lưu trữ (archive) xác định phiên gốc là `01a18249-c2c6-72ef-be79-cb182d2ae8d8`, cùng workspace. Bản tóm tắt gần nhất ghi 13 mục còn chờ Advisor và biên nhận kiểm thử (test receipt).
- `typesafe_bind_task` cho mục `Xác minh runtime Advisor trong src/host-history.ts và src/advisor-public-context.ts bằng native descriptor và receipt thật`, phase `Đánh giá`, trả `EVIDENCE_REQUIRED`: thiếu đích native duy nhất có nguồn gốc tạo thực (creation provenance).
- `typesafe_recovery_report` trả `EVIDENCE_REQUIRED`: chưa có trạng thái phục hồi đã bind trong phiên này. Báo cáo này là bàn giao công khai, không phải biên nhận có thẩm quyền (authority receipt).
- `omp --help` xác nhận phiên bản `18.13.3` và hỗ trợ `--resume=<value>`.
- `bun tools/native-judge-setup.cjs --check --config C:/Users/thant/.omp/agent/config.yml` trả model `typesafe/jev-1.14.0`, `match: yes`; không ghi cấu hình.
- Thử nghiệm nhanh (smoke) native `judgeBatch`: hai yêu cầu phân loại sửa mã/giải thích trả đúng `change`/`explain`; `done: 2`, `failed: 0`, model `typesafe/jev-1.14.0`, thời gian `0.3s`, chi phí `0.000027636000000000004`. Không phải kiểm định hiệu chuẩn (calibration) hoặc phê duyệt semantic nhiệm vụ.

## Lỗi runtime mới

Chuẩn bị consultation rồi chuyển nguyên `details.advisor.parameters` qua `tool.task` trong cùng eval đã tạo child `AnnoyedBird`. Kết quả thực: `initial prompt dropped before provider dispatch after 4 attempts`, `exitCode: 1`, `requests: 0`, `tokens: 0`; chưa có biên nhận Advisor thực (actual Advisor receipt). Không còn quan sát lỗi spawn-key ở lần gọi này; không suy ra mọi kiểm tra spawn đã được chứng minh.

Giả thuyết mất wrapper đã được bác bỏ trong smoke cô lập: `promptMatches: true`, parent ancestry khớp, dispatch frame còn hiệu lực. Lỗi thật quan sát được là outer call `diag-2` khác native call do `invokeTool` sinh (`invoke-task-…:0`), khiến `routeChild` từ chối và `before_agent_start` gọi abort. Source [OMP v18.13.3 runner](https://github.com/can1357/oh-my-pi/blob/v18.13.3/packages/coding-agent/src/extensibility/extensions/runner.ts) xác nhận `invokeNativeTool` tạo ID mới.

## Bàn giao phục hồi

- Chủ sở hữu (owner): người vận hành host khôi phục phiên; integration owner tiếp tục chẩn đoán và sửa source trong workspace.
- Hành động kế tiếp (next action): quay lại đúng phiên Core bằng lệnh dưới đây; chạy `todo view`, giữ nguyên mục tiêu và incarnation; tiếp tục từ hai báo cáo người dùng chỉ định và báo cáo này.
- Điều kiện mở chặn quan sát được (observable unblock condition): Core hiện đúng các incarnation gốc, bind thành công; đường Advisor tạo biên nhận thực sau sửa có bằng chứng; command receipt và curation đủ trước M/Advisor/settled Core result.
- Lệnh tiếp tục (resume command): `omp --resume 01a18249-c2c6-72ef-be79-cb182d2ae8d8`.
- Không khởi tạo lại todo cũ, không clear/drop để né nợ, không lặp semantic rejection không đổi, không nhận deployment/fixture/native judge smoke là completion.

Lượt tiếp tục đã sửa bốn tệp production: `advisor-native-schema.ts`, `advisor-host-dispatch.ts`, `advisor-host-state.ts`, `advisor-host-hooks.ts`. Khi schema native hỗ trợ `name`, adapter sinh tên child duy nhất và kiểm exact tên tại spawn lẫn ID child thật, giữ parent/session/epoch/prompt checks. Caller không được tự cấp tên qua descriptor công khai. Không sửa public message projection hoặc sanitizer theo giả thuyết cũ.

Kiểm consistency đã grep toàn `src`/`tests` cho `namedChild`, `allocatedName`, `spawnKey` và capability interface. Sáu module Advisor/host/privacy đạt 54 pass, 0 fail, 247 assertions. Smoke CLI cô lập dùng provider loopback đi qua dispatch, child exit 0 với một request và tạo receipt điều khiển; đây không phải independent Advisor assessment hoặc quyền hoàn tất nhiệm vụ thật. Source mới cần full-suite/deployment verification; chưa hoàn tất hoặc xóa nghĩa vụ nào.

## Hậu kiểm triển khai tiếp theo

- Bootstrap PowerShell gặp Node `14.19.3` trên PATH, thiếu `Object.hasOwn`. Node `24.14.1` đã có trong NVM; đã dùng PATH riêng của tiến trình, chưa đổi mặc định toàn máy.
- Node mới cần `SystemRoot` để khởi tạo CSPRNG khi bootstrap policy; `tools/promote-omp-global.ps1` bổ sung duy nhất giá trị này từ API hệ điều hành, không nhận giá trị do caller đặt. Hai module sync/installation đạt 44 pass, 0 fail, 517 assertions.
- Transaction bằng Node `24.14.1`: `DEPLOYED_VERIFIED`, suite cô lập 952 pass, 4 skip, 0 fail trong 318.59s. Backup: `C:/Users/thant/Projects/omp_extension_backup_2026-10-29T05-11-00-914Z`.
- Hậu kiểm ở thời điểm triển khai: 514/514 tệp khớp, không mismatch hoặc hành động chờ; proxy bất biến giữ nguyên. Report được cập nhật sau đó nên không suy rộng parity lịch sử cho report mới.
- Chưa có live independent Advisor receipt từ bản mới trong phiên hiện tại. Receipt điều khiển loopback không được dùng cho nghĩa vụ production.
- Full suite 318.59s vượt policy `workspace-tests` 300000ms; vẫn cần xử lý hiệu năng hoặc hợp đồng lệnh hợp lệ, không sửa assertion hay tăng timeout để che lỗi. Không tuyên bố đã hoàn tất done/drop/rm/clear hoặc native-only migration.

## Rà soát độc lập và sửa tiếp

- Reviewer `ReviewDelegationBoundary` xác định lỗi parent-prefix ở nested Advisor. `advisor-host-dispatch.ts` đã tách tên gửi native khỏi ID kỳ vọng: với parent là subagent, ID kỳ vọng gồm `raw.agent.id` và tên child. Không nới so sánh ID tại hook/route. Bốn module đạt 48 pass; smoke adapter main/nested đều có một provider call và một fixture receipt. Chưa có live independent receipt.
- `TraceSyncCost` đề xuất giữ mọi lstat/identity checkpoint nhưng canonicalize một lần ở ancestor hiện hữu sâu nhất. Đã sửa `captureParents`/`assertParents`, không cache xuyên lượt. Ba module sync/security/installation đạt 71 pass, 2 skip, 0 fail trong 220.86s; dry-run thật đạt, không mutation.
- Cảnh báo incomplete todo đếm các mục pending/in_progress khi agent dừng; không phản ánh người dùng chưa cấp quyền. Không tắt reminder, không dùng drop/rm thay done hoặc tạo thêm danh sách trùng để xử lý triệu chứng.
