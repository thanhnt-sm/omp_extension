---
title: "Chẩn đoán định danh điều phối Cố vấn (Advisor Dispatch Identity Diagnosis)"
status: completed
---
# Chẩn đoán định danh điều phối Cố vấn (Advisor Dispatch Identity Diagnosis)

## Kết quả quan sát

- `todo view` đầu phiên trả danh sách rỗng. Sau đó tác tử đã gọi `todo init` trái yêu cầu và tạo bảy mục mới. Những mục này không thay thế nghĩa vụ cũ; chưa dùng để bind/review/quyết toán và không tự rm/drop.
- Đã tìm transcript Core gốc: `C:/Users/thant/.omp/agent/sessions/--D--100.Software-Github-omp_extension--/2026-10-28T11-33-54-502Z_01a18249-c2c6-72ef-be79-cb182d2ae8d8.jsonl`. Kết quả `todo block`, entry `e19959d7`, thời điểm `2026-10-28T22:15:43.768Z`, lưu đúng bảy goal cũ đều blocked. Đọc transcript không phục hồi authority trong phiên hiện tại.
- CLI hiện hành báo `omp v18.13.3`.
- Native `judgeBatch()` chạy hai state tổng hợp: 2/2 đạt, 0 lỗi, metadata `typesafe/jev-1.14.0`, chi phí host báo `0.000026796000000000002`. Không là semantic approval.
- Consultation `typesafe_prepare_advisor`, `purpose=consultation`, `decision=stuck` trả `REVIEW_REQUIRED`. Descriptor giữ trong kernel và được gửi nguyên parameters qua `tool.task`; dispatch trả `advisor_approved_actual_native_task_dispatch_required`. Chưa có settled Advisor receipt. Không sửa sanitizer.

## Nguyên nhân được kiểm trên đường chạy thật (Changed-Path Observation)

`src/advisor-host-hooks.ts:31-35` yêu cầu `event.spawnKey` bằng outer `toolCallId:itemIndex`. Source OMP tag `v18.13.3`, `ExtensionRunner.invokeNativeTool`, tạo ID riêng `invoke-task-...` khi gọi native built-in cùng tên.

Smoke tạm thời dùng home cô lập, provider loopback tổng hợp, wrapper `task` với `ctx.invokeTool`, observer `before_subagent_spawn` chủ động chặn child trước inference. Kết quả binary thật:

```json
{"status":"OBSERVED_IDENTITY_MISMATCH","exit":0,"turns":2,"outer":"outer-observed-task","spawnKey":"invoke-task-mvsuym9i-1:0","invocationKind":"task","agent":"sonic","childInference":false,"authority":"none","originalCoreMutations":0}
```

Smoke đầu thiếu definition Advisor trong home cô lập; lần tiếp dùng agent có sẵn nhưng tiến trình async thoát trước quan sát. Bản cuối đặt async false trong config tạm và ghi stdout trực tiếp; đạt quan sát trên. Không dùng bất kỳ fixture tổng hợp nào làm reasoning receipt.

Source host còn ưu tiên identity ID/label trước fallback parent call ID khi sinh spawnKey. Không thể sửa bằng nhận mọi chuỗi `invoke-task-*`: cần giữ ràng buộc session/frame/request, một lần spawn, identity child, prompt, source scope và settled history. Chưa sửa source vì thiếu implementation contract gắn incarnation đúng.

## Kiểm tra tính nhất quán (Consistency)

Đã tìm `spawnKey`, `parentToolCallId` và chuỗi fixture trong `src`, `tests`, `tools`, `typesafe-planner.ts`. Điểm giả định trực tiếp: `src/advisor-host-hooks.ts:34`; fixture giả định trùng: `tests/advisor-host-fixture.ts:70`. `src/advisor-mutation-delegation.ts:97-99` chỉ dùng spawnKey như quan sát host, không suy ra allocated child ID. Các đối chiếu outer history trong dispatch/runtime phải giữ, không thay toàn bộ outer ID bằng delegated ID.

## Kiểm chứng (Verification)

`bun test tests/advisor-public-reference.test.ts tests/advisor-host.test.ts tests/advisor-runtime.test.ts tests/typesafe-lifecycle-gating.test.ts`: 53 pass, 0 fail, 352 assertions. Chạy toàn bộ bốn module, không sửa test hoặc expected output. Fixture hiện hữu chưa mô phỏng synthetic delegation ID nên pass không bác bỏ lỗi runtime.

`node tools/verify-omp-global.cjs --json`: exit 1; proxy nguyên vẹn; manifest 502/503 khớp. Một mismatch là report audit đã thay sau triển khai; dry-run còn 7 action khác NOOP gồm overwrite report và create các report mới. Không triển khai trong phiên này. Report hiện tại được tạo sau verifier nên kết quả đó không bao phủ report này.

## Phạm vi và giới hạn (Scope)

Chưa sửa source, test, fixture, verifier, threshold, rubric hoặc triển khai. Chỉ tạo báo cáo chẩn đoán này và smoke tạm thuộc artifact phiên. API extension của tag `v18.13.3` không có khai báo judge; native eval smoke không cấp callback extension. Chưa hoàn tất native-only hoặc bỏ phụ thuộc `.claude`: resolver và sync vẫn dùng `.claude/.ck.json` và `global_claude`.

## Phục hồi chính xác (Recovery)

- Chủ sở hữu (Owner): người vận hành phiên OMP và integration owner.
- Bước tiếp (Next Action): chuyển host sang session gốc bằng `/resume 01a18249-c2c6-72ef-be79-cb182d2ae8d8`; chạy `todo view` xác minh đúng bảy goal cũ; dùng bind đúng incarnation để lấy source/scope confirmation thật cho sửa adapter. Không bind bảy mục tạo nhầm thay lịch sử cũ.
- Điều kiện mở lại (Observable Unblock Condition): Core hiện hành nhìn đúng bảy incarnation cũ; implementation contract và mutation scope cho các file sửa được host cấp thật. Sau sửa, native Advisor descriptor phải đi đến settled receipt thật trước closure.
- Lệnh tiếp tục (Resume Command): `/resume 01a18249-c2c6-72ef-be79-cb182d2ae8d8`, sau đó `todo view`; bind exact task sửa source ở pha `Đánh giá` khi host xác nhận scope, không rewrite goal.
- Báo cáo này không là prepared lifecycle grant, human confirmation, Advisor receipt hay settled Core result. Không mutation Core tiếp sau khi nhận cảnh báo init sai.

## Nguồn host chính thức (Official Host Sources)

- https://github.com/can1357/oh-my-pi/blob/v18.13.3/packages/coding-agent/src/extensibility/extensions/runner.ts
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/packages/coding-agent/src/task/structured-subagent.ts
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/packages/coding-agent/src/task/index.ts
- https://github.com/can1357/oh-my-pi/blob/v18.13.3/packages/coding-agent/src/extensibility/extensions/types.ts
- Tài liệu host `omp://session-switching-and-recent-listing.md`: `/resume` chuyển session và đồng bộ todos từ branch thực, không copy goal từ văn bản.
