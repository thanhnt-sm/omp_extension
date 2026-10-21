---
phase: 4
title: "Todo rejection recovery and deletion"
status: completed
priority: P1
effort: ""
dependencies: []
---

# Phase 4: Todo rejection recovery and deletion

## Overview
Sửa đường recovery của native todo để đồng thuận AUTO_APPROVE không đòi UI và rejected task có thể block qua xác nhận người dùng. Nhánh sửa lỗi này được người dùng bổ sung sau phạm vi forensic ban đầu; có thể thực hiện trước Phase 1–3.

## Requirements
- `AUTO_APPROVE`: drop/rm/replacing-init stage tự động, không gọi confirm; provenance judge.
- `AUTO_REJECT` hoặc `RECONCILE_PLAN`: giữ từ chối, không prompt để biến thành approval.
- `HUMAN_ESCALATION`: xác nhận đúng operation/target set và revision; không UI, từ chối, exception đều không stage.
- Rejected `block`: cần xác nhận UI hoặc host identity đáng tin cậy theo lựa chọn người dùng; giữ failure/remediation và task chưa hoàn thành sau commit. Block bình thường không reject giữ nguyên hành vi.
- `unblock`/`start` không xóa debt, không cấp quyền done/drop. `params.isHuman/authorized/resetFailures` không tự cấp quyền.
- Không xóa thật todo phiên hiện tại để nghiên cứu. Không sửa global proxy hay dùng restart để giả vờ task đã được xác minh.

## Architecture
Giữ `stageNativeTodoCall` và native `tool_result` transaction hiện có. Không tạo recovery API, command parser, singleton, authorization token hay ops[] wrapper thứ hai.

| Verdict/operation | Preflight | Sau native result hợp lệ |
|---|---|---|
| AUTO_APPROVE drop/rm/init replacement | Stage ngay, không UI | Áp dụng trạng thái native; giải phóng đúng target |
| AUTO_REJECT / RECONCILE_PLAN | Hủy, không UI | Không có thay đổi |
| HUMAN_ESCALATION destructive | UI exact operation + task/phase/target set | Commit chỉ nếu xác nhận và transaction còn fresh |
| block có rejection | UI nêu rõ giữ rejection và task chưa hoàn thành | Status blocked; failure/debt vẫn còn |
| block không rejection | Giữ native staging hiện có | Status blocked |
| unblock/start rejected task | Không tự verify hay xóa debt | Task hoạt động lại nhưng done phải qua gate |

Sau mỗi await xác nhận/verifier, kiểm tra generation/revision và canonical input hash còn khớp. Chỉ commit khi tool result khớp call ID/hash/op/revision và semantic target effect. `rm`: target không còn; `drop`: target bỏ cam kết theo native status; `block`: target vẫn tồn tại và blocked; replacing-init đúng danh sách được xác nhận. Giữ auto-start/pointer changes hợp lệ của native tool; không đòi snapshot bằng toàn bộ cây trước mutation.

## Related Code Files
- Modify: `typesafe-planner.ts` — `stageNativeTodoCall:1490-1710`, result validation/cleanup `:1986-2100`, hướng dẫn reject hiện có khi cần.
- Modify: `tests/todo-drop-gate.test.ts`, `tests/todo-block-remediation.test.ts`, `tests/typesafe-lifecycle-gating.test.ts` — regression hành vi native.
- Modify: `tools/todo-remediation-smoke.ts` — thêm actual agent-verifier route bên cạnh host route.
- Read/reuse: `src/bicameral-consensus.ts:681-805` verdict lattice, `tests/cook-interception-bridge.test.ts` harness patterns.
- Modify after smoke: `docs/typesafe-operations.md`, `docs/operations-and-user-guide.md` — recovery policy/không dùng resetFailures bypass.
- Create: execution evidence `reports/todo-recovery-verification.md`; no new public API. Delete obsolete tests that pin old incidental wording, not protective behavior tests.

## Tests Before
Viết failing behavioral regression trước thay implementation; chạy toàn named module, ghi RED thật. Cases đã pass ghi rõ, không làm hỏng production để tạo RED. Dùng home/env fixture và transport response isolation theo convention baseline, không real key/network, không test-mode resolver bypass; khôi phục fetch/env trong finally.

1. Từng op drop, rm, replacing-init: real bicameral route ra AUTO_APPROVE với resolver fixture enabled; headless vẫn stage. Assert target còn nguyên trước result, biến đổi đúng sau result, không gọi confirm và đúng provenance; thêm UI-present để chứng minh không prompt.
2. AUTO_REJECT/RECONCILE_PLAN: không stage, không confirm; active targets còn. HUMAN_ESCALATION: accept/decline/no-UI/throw, chỉ accept được commit.
3. Có failure/remediation từ rejected done: `block` mở đúng UI. Accept -> commit blocked nhưng debt còn và active contract không bị xóa; decline/no-UI -> state và debt không đổi. Từng trường hợp Gate 1 và Gate 2 debt.
4. `block -> unblock/start -> done`: metadata không tự giải phóng gate; done vẫn reject nếu evidence chưa đạt. Một lần done hợp lệ về sau mới cleanup đúng target.
5. Trong lúc confirm/verifier đang await: native branch edit, generation/revision đổi, input/target đổi -> không stage/commit bằng approval cũ. Late/duplicate/error/wrong-op result không xóa debt/task; replay không gửi success report lần hai.
6. rm/drop có task trùng nội dung ở nhiều phase: xác nhận đúng tập resolved hiện tại; không cấp quyền cho incarnation được reappend sau đó. Xác nhận không lan sang task khác. Không tự động rm toàn phase hay init rỗng để lách gate.
7. Result có canonical shape nhưng không áp dụng mutation cho target -> không báo thành công/không cleanup rejection. Giữ invariant của result done đã có.

## Implementation Steps
1. Đọc `reports/todo-recovery-research.md`; dùng lỗi đã quan sát làm ground truth. Bổ sung harness thiếu để tập test gọi vào native interception, không chỉ unit-test arbiter rồi kết luận rm đã chạy.
2. Thay fallthrough thành phân nhánh exhaustive verdict: AUTO_APPROVE đi tiếp; AUTO_REJECT/RECONCILE_PLAN cancel; HUMAN_ESCALATION mới mở UI. Unknown verdict fail closed. Không sửa lattice hay JEV thresholds.
3. Tại rejected block guard, nếu chưa host-authorized thì mở UI với reason và exact target set, cảnh báo debt còn. Accept mới cho stage. Không xóa pendingRemediations/lastFailureReasonByTask trong preflight, block, unblock hoặc start. Không xem một câu chat/ask output là trusted host identity.
4. Tái sử dụng checks generation/revision/hash cho approval và native commit, semantic target validation cho recovery ops nếu hiện tại mới chỉ validate shape. Không bỏ native transaction để tiện update local maps.
5. Giữ cleanup chỉ sau successful matching result: rm/drop bỏ đúng failure, counters, baseline khi task thật sự không còn mở; blocked task giữ tất cả. Replacing-init chỉ xóa incarnation được duyệt sau commit.
6. Hướng dẫn no-UI: `human_resolution_required` phải nói chưa có quyền, nêu op/target/reason và UI/host-owned todo edit cần thiết. Không gợi ý nhét flag vào params, retry done vô hạn, disable extension hay reset maps. Rejection helper phải phân biệt failed verification với task đang chờ người dùng.
7. Sau GREEN, smoke bằng isolated scratch workspace qua registered extension callbacks và native result. Cần xác minh live UI riêng ở Phase 5; script mock host không chứng minh UI thực.

## Refactor
Chỉ rút phần exact-target confirmation nhỏ trong closure nếu block/destructive cùng logic; tránh framework mới. Giữ callsite/API public cũ. Xóa nhánh AUTO_APPROVE rơi vào confirm và guidance cũ đã lỗi thời, không thêm aliases/bypass.

## Tests After
```text
bun test tests/todo-drop-gate.test.ts tests/todo-block-remediation.test.ts tests/typesafe-lifecycle-gating.test.ts
bun tools/todo-remediation-smoke.ts
```
Cập nhật smoke để chứng minh reject -> human-confirmed block -> unblock và AUTO_APPROVE rm/drop -> native commit, không chỉ host isHuman. Script chạy temp workspace và stub transport; phải báo giới hạn này. Không dùng tests kiểm tra wording hay mock echo để thay state assertions.

## Success Criteria
- [x] AUTO_APPROVE agent drop/rm/init replacement hoạt động headless, không UI, chỉ commit sau native result.
- [x] Rejected block có UI recovery thực và giữ nguyên nợ khắc phục; không tự hoàn thành task.
- [x] No-UI/deny/error/stale/forged approval không mutation, không cleanup, không success report.
- [x] Debt không sống lại sai ở task incarnation mới và không bị xóa bởi block/unblock/start.
- [x] RED/GREEN + isolated smoke ghi nhận; docs cập nhật sau smoke, không bypass runtime.

## Risk Assessment
Bỏ chốt block vô điều kiện sẽ cho agent tắt nhắc việc để né lỗi; không chọn cách đó. UI approval cần target binding, không thể tái dùng khi task đổi. No-UI HUMAN_ESCALATION vẫn là blocker hợp lệ, không được gọi là đã sửa hoàn toàn headless nếu không có trusted human surface. Restart không hoàn tất hợp đồng và không dùng làm cơ chế recovery.

<!-- Updated: Validation Session 2 - Người dùng chọn xác nhận người dùng cho block task đã bị reject. -->
