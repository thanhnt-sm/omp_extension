# Nghiên cứu: todo bị block, không thể xóa

## Kết luận
Có hai lỗi điều khiển trực tiếp trong `stageNativeTodoCall` và một lỗi phân loại boundary đã được kiểm tra bằng hàm thật. Phiên này chỉ bổ sung plan; chưa sửa hay triển khai extension.

| Vấn đề | Bằng chứng source | Hướng sửa trong plan |
|---|---|---|
| AUTO_APPROVE vẫn đòi UI | `typesafe-planner.ts:1545-1580`: sau khi loại AUTO_REJECT/RECONCILE_PLAN, code luôn đi vào confirm, kể cả AUTO_APPROVE | Phase 4: chỉ HUMAN_ESCALATION cần UI; AUTO_APPROVE tiếp tục stage tự động |
| block sau rejection không có đường xác nhận | `typesafe-planner.ts:1587-1592` kiểm tra failure/remediation và hủy; UI hiện tại chỉ thuộc destructiveTargets (drop/rm/init) | Phase 4: mở xác nhận UI đúng target cho rejected block; giữ task và nợ khắc phục |
| Tài liệu nhắc .claude bị coi là sửa cấu hình | `src/cook-expert-judge.ts:153-156` quét toàn gitDiff; `src/verification-gate.ts:109-115` chỉ xét header/path | Phase 5: dùng một kiểm tra path đáng tin cậy cho hai gate; không bỏ bảo vệ đường dẫn thật |
| Planning task bị gửi dưới rubric code và thiếu artifact | `typesafe-planner.ts:1618-1628,1653-1666`; thiếu planPath/diffScope/changedFiles cho artifact, hardcode taskType | Phase 5: phục hồi task-scoped evidence và classifier hiện có, không hạ threshold |
| Baseline không có thay đổi có thể kéo WIP ngoài task vào gate | `src/evidence-collector.ts:414-423` fallback full tree dù baseline hợp lệ | Phase 5: giữ tập task-baseline rỗng; fallback toàn cây chỉ khi thực sự không có baseline đáng tin cậy và phải khai báo đúng |

## Phân biệt trạng thái
- `done` khẳng định hoàn thành; phải qua gate phù hợp loại task.
- `block` ghi nhận trở ngại, không hoàn thành, không xóa rejection. Người dùng đã chọn cần xác nhận người dùng khi block task đã bị reject.
- `drop` bỏ cam kết, còn dấu trạng thái abandoned; `rm` xóa khỏi danh sách. Cả hai cần verdict/ủy quyền cho đúng target; không phải cách đổi rejection thành completion.
- Native `tool_result` hợp lệ mới commit. `typesafe-planner.ts:1986-2100` đã có call ID, input hash, generation/revision, tombstone và cleanup. Sửa recovery phải giữ các invariant này; không reset maps trước native result.

## Smoke đã chạy trong lượt nghiên cứu
Thực thi `bun -e` qua eval, import trực tiếp `runTaskMicroCheck` và `checkDeterministicPreconditions`, không ghi fixture lên repo, không gọi API và không thao tác todo thật.

Input A: `gitStatus = ' M docs/recovery.md'`, changedFiles chỉ chứa docs/recovery.md; unified diff của file markdown có dòng thêm `Read .claude/hooks only; do not modify it.`.
Input B: status và diff header trỏ tới `.claude/settings.json` thật.

Output quan sát:
```json
{
  "docsOnly": {
    "nativeMicroClaudeSafe": false,
    "verificationGateClaudeSafe": true,
    "nativeReasons": [
      "Claude boundary violation: task modified files under .claude or Claude configuration."
    ]
  },
  "realProtectedPath": { "nativeMicroClaudeSafe": false }
}
```
Đây là bằng chứng false positive của native micro-check cho input tổng hợp, không phải bằng chứng không có cấu hình thật bị sửa trong phiên lịch sử. Không chạy lại thao tác todo bị người dùng báo lỗi để xác nhận.

## Khoảng trống kiểm thử và tài liệu
- `tests/todo-drop-gate.test.ts:20-22,44-124`: env key rỗng; nhiều ca chỉ chứng minh unavailable, chưa chứng minh AUTO_APPROVE headless đi tới native commit.
- `tests/todo-block-remediation.test.ts:18-37`: có block bình thường, chưa có reject -> confirm -> block/unblock -> retry.
- `tools/todo-remediation-smoke.ts:20-29`: dùng host isHuman; chưa exercise đường bicameral AUTO_APPROVE của agent.
- `docs/typesafe-operations.md:25-40` và `docs/operations-and-user-guide.md:118-136` còn hướng dẫn resetFailures/authorization cũ. Implementation cần cập nhật đúng đường khôi phục hiện hành, không thêm shim cho flag agent tự khai.
- LSP references đã được gọi cho runTaskMicroCheck nhưng trả `No language server found for this action`; dùng grep fallback. Native caller: `typesafe-planner.ts:1631`. Module consumers hiện có: `tests/cook-expert-judge.test.ts`, `tests/cook-verification-adversarial.test.ts`; verification preconditions được dùng tại `src/verification-gate.ts:308`, `tests/verification-gate.test.ts`, `tests/adversarial-compliance.test.ts`.

## Chính sách đã xác nhận
Câu hỏi: Với todo đã bị Gate 1/2 từ chối, plan nên cho phép block theo chính sách nào?
Các lựa chọn: Xác nhận người dùng | Cho block, giữ nợ khắc phục.
Trả lời: **Xác nhận người dùng**. AUTO_APPROVE cho rm/drop vẫn tự động; block không xóa rejection hay ghi nhận hoàn thành.

## Giới hạn và phạm vi
Không chứng minh mọi trường hợp không xóa được đều do AUTO_APPROVE fallthrough: verdict thực tế, UI, key/resolver, target và runtime version vẫn phải ghi nhận ở smoke sau sửa. Không triển khai production, sửa global proxy, bật bypass, thay threshold hoặc chạy toàn suite trong lượt lập kế hoạch.

## Kiểm tra plan sau bổ sung
Đã chạy `plan-cli.cjs status` trên canonical plan: 5 phase Pending, không có cross-plan dependency. Đã chạy structural/link smoke bằng eval:
```json
{
  "result": "PASS",
  "phases": 5,
  "sectionsPerPhase": 10,
  "localMarkdownLinksResolved": 7,
  "recoveryOrder": "4 -> 5",
  "forensicOrder": "1 -> 2 -> 3",
  "overlappingPlansCrossNoted": 2,
  "allExecutionPhasesPending": true,
  "productionImplementationExecuted": false
}
```
Đã cập nhật source brief và cross-note tại todo-drop fidelity / baseline audit mà không đổi trạng thái hay dependency của các plan cũ. Chưa chạy regression suite, sync-baseline hay live OMP recovery; đó là acceptance của implementation, không phải kết quả nghiên cứu này.
