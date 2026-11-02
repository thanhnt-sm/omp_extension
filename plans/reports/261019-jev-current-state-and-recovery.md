---
title: "Prediction Report: Current JEV solution and actionable todo recovery"
status: completed
---
# Prediction Report: Current JEV solution and actionable todo recovery

Ngày: 2026-10-19. Đây là checkpoint hiện trạng source, native acceptance và thiết kế; không phải tuyên bố đã triển khai atomic architecture hoặc runtime đã reload.

## Verdict: CAUTION

**Đã hoàn thành bản sửa input hẹp và tháo lý do block cũ. Chưa triển khai đầy đủ JEV atomic + real Advisor synthesis.** Latest user yêu cầu chuyển mọi nghiên cứu/plan còn thiếu thành implementation-ready `ck:cook --auto` handoff; planning này không tự sửa thêm production.

## Hiện tại đang dùng judge như thế nào

| Lớp | Hiện trạng có trong source | Phần chưa hoàn thành |
|---|---|---|
| Native `todo done` | Snapshot/evidence → deterministic Gate1 → per-task macro JEV → stage → matching native result commit | Durable original contract, exact criterion/test receipt và các lỗi evidence/authority còn lại |
| Gate2 | Một batch bốn question: `deliverables_verdict` Choice, `meets_criteria` Noul, `architectural_drift` Choice, `scope_mode` Choice | Chưa là các predicate claim–source nhỏ; chưa có parent integration acceptance |
| Applicability | Phân biệt code/research/docs; workspace F16 sửa report JSON và task-bound artifact delivery | Cached deployment chưa được chứng minh nạp bản sửa workspace |
| Advisor runtime nội bộ | `evaluateAdvisorIntent` là heuristic keyword/overlap; kết quả còn bị sửa sau JEV | Chưa phải reasoning agent đọc source và tổng hợp độc lập |
| Advisor trong workflow phiên này | Read-only Advisor thật đã nghiên cứu, giao source/test executors qua parent, review sau full checks và dẫn đến native completion | Đây không phải một daemon/runtime orchestration service mới |
| Atomic + synthesis | Design/research/scenarios và complete ten-phase master đã viết; chưa implement H/runtime Advisor | [Master](../261019-research-to-cook-execution/plan.md) cụ thể hóa baseline, real reasoner, paired evaluation và conditional cutover |

Source: `src/cook-expert-judge.ts:218-337,365-460`, `src/bicameral-consensus.ts:811-869,1038-1067,1193-1223`, `typesafe-planner.ts:1812-1883,2163-2295`.

Scope note hiện tại yêu cầu chấm `todo_task` và `task_requirements`, không toàn bộ plan. Tuy nhiên task/criteria vẫn có thể quá rộng và packet vẫn có rolling context/các clamp ngoài artifact. Vì thế “đã có scope note” không đồng nghĩa đã triển khai atomic judgments.

### Model và policy

- Default transport paths yêu cầu `jev-latest`; predict có `TYPESAFE_PREDICT_MODEL`. Alias có thể đổi. Chưa có requested/resolved-model receipt cho mọi native operation để khẳng định exact backend revision.
- Source `resolveAutoApprovalThreshold` mặc định `.50`, configurable qua `TYPESAFE_AUTO_APPROVAL_THRESHOLD`; default dùng `P > .50`, custom dùng `P >= threshold`. Đây là default source, **không phải attestation effective env của Main hoặc chứng minh `.50` tối ưu/an toàn cho workload**.
- Choice `APPROVE` có Noul thấp bị hạ thành `NEXT_ACTION_REQUIRED` hoặc `REJECT`; macro còn `< .25` split. Drift khác `no_drift` và scope `REDUCTION` chặn approval. Chưa thay policy/threshold trong bản sửa này.
- Raw Noul probability, Choice confidence và heuristic confidence không được đồng nhất. Current source còn fallback/mixing cần cleanup theo coverage C09–C11; không che chúng bằng một tuyên bố “true calibration đã xong”.

## Đã thực thi thật

1. Before actual-source fixture: calculation JSON làm research thành code rubric, report competition làm map mất khỏi final artifact. Affected-module+scratch run **173 pass / 2 fail**, separate callback smoke **exit1**.
2. Source executor sửa ba files; independent test executor thêm25behavioral cases. Parent inspect rồi chạy full repo cộng preserved diagnostic: **387 pass / 0 fail**, 1.764expects/37files,56.27s. Separate preserved callback smoke **exit0**, đủ sáu map-proof groups ở cả A/B. B final artifact4.914UTF-8bytes; no live API/native commit trong fixture.
3. Read-only Advisor signoff; hai target source-only được native gate chấp nhận và commit riêng. Không coi synthetic approval là approval thật.
4. **11 stale-blocked targets đã native unblock tuần tự**; không init/reset/drop, không xóa nghĩa vụ hoặc debt. Pending không đồng nghĩa completed.
5. Năm persona và cùng-operation Advisor đã rút điều kiện activation bị thêm sai vào literal mapping. Mismatch17/20 được báo đúng là kết quả identity verification; không bắt equality/deploy. Một lần same-target evaluation với map/evidence mới đã được judge **APPROVED/DONE**. Record `d309dc2a`.

Hiện **3/23done,20open,0blocked**: source-review reject `8bcae43c`/displayedP=.15 và verification reject `a46e8cb1`/displayedP=.10/reduction;18target còn lại chưa attempt. F17 synthetic-only probe chứng minh private thinking vào prepared state. Dừng affected remote completion checks cho tới public-only projection thật sự active và debt-preserving activation hợp lệ; không reset/drop hoặc giả native-closed. Review/verification deliverables vẫn có receipts, không đòi implement mọi finding để chấp nhận chúng.

Evidence đầy đủ, gồm native call/record IDs và raw verified values cần thiết: [durable bundle](261019-todo-recovery-evidence.json). [Handoff](../261019-jev-atomic-review/recovery-handoff.md). Source identity sau sửa17/20 bằng nhau, khác đúng ba source files; proxy unchanged. Dry-run sync exit0/282baselinefiles, không mutation. **Không deploy/restart, không chứng minh Main nạp fix, không benchmark accuracy JEV.**

## Agreements (all personas align)

Năm pass độc lập: Architect, Security, Performance, UX, Devil’s Advocate; sau đó debate explicit conflicts. Tất cả giữ CAUTION cho workflow/handoff, không cấp quyền deploy.

- Block chỉ có ý nghĩa khi có dependency thật, owner, next action và release condition. Việc agent còn làm được phải được thực thi, không treo bằng nhãn external.
- Read-only Advisor → bounded source/test executors → parent checks/smoke → fresh review → cùng native operation. Đã thực thi chuỗi này cho bản sửa hẹp.
- Delivery, native acceptance và repaired-runtime activation là ba trạng thái khác nhau.
- Identity verification không đòi identity equality; không tự thêm activation hay historical-wire acceptance vào task mapping.
- Parent integration không được suy từ child pass; JEV/advice không tạo human authority.
- Essential handoff phải ở repo, có evidence thực và next steps; JSON/report không được hydrate approvals hoặc reset debt.

## Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil’s Advocate | Resolution |
|---|---|---|---|---|---|---|
| Chờ deploy mới đóng mọi task? | Tách từng contract | Tách quyền/acceptance | Hai native pass phủ định blanket wait | Gây treo giả | Thêm scope | Chỉ task thật sự cần corrected runtime mới phụ thuộc activation |
| Mapping mismatch có nghĩa fail? | Là kết quả hợp lệ | Không cần equality | Một fresh evaluation | Báo rõ limits | Rút giả định cũ | Cùng target được evaluated once và native committed; không claim fix active |
| Unblock có đủ giải quyết? | Chỉ lifecycle | Debt vẫn giữ | Không retry/poll daemon | Cần next action | Không đổi tên thành done | Reactivate rồi thực thi/đánh giá từng target đủ bằng chứng |
| Tạo recovery service mới? | Chưa cần | Tăng authority surface | Tăng polling/retry | Chưa giải quyết thông tin sai | Có cách đơn giản hơn | Dùng workflow hiện có và durable handoff; implementation mới phải có criterion riêng |

## Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| Native ignore composed consensus; EGC marker/blocked bypass | High | Implement authority/EGC ownership fixes; không dùng bypass để đóng công việc |
| Snapshot trước test, dirty/multi-commit attribution sai | High | Real baseline preimages, full commit span và snapshot freshness |
| Session transition mất rejection debt | Medium | Trusted history/contract/debt recovery; report không là authority |
| Report symlink đọc file riêng ngoài workspace | Medium | Real-target/regular-file authorization ở mọi evidence reader; no raw host logs |
| Chia nhỏ nhưng bỏ parent integration hoặc fake confidence | High | Coverage ledger, real Advisor và deterministic authority composer |
| Historical wire thiếu hoặc benchmark chưa có | High | Nêu đúng limitation; prospective held-out evaluation, không dựng causal/accuracy claims |

Sáu security findings là static source findings, không phải observed exploits. Chi tiết và source ranges được giữ trong evidence bundle. Không mở rộng bản sửa hẹp ngầm để giả chúng đã được xử lý.

## Recommendations

1. **Implement repaired-current foundation đầy đủ**, không chỉ F16: durable contract/criterion/evidence/test identity, actual task deltas, canonical outcomes, independent policy, lifecycle/debt/EGC, privacy/process/transport residuals.
2. **Implement atomic engine thật:** deterministic checks bằng code; JEV xử lý bounded semantic predicates trên coherent evidence; batch theo shared evidence, không một request cho mọi microtodo.
3. **Integrate real read-only Advisor và parent acceptance** qua host-supported dispatch/provenance; không rename heuristic thành reasoner hoặc giả API chưa có.
4. **Run paired repaired-M versus H evaluation** trên independently adjudicated task/project holdout, đủ original obligations, actual model/usage/latency/cost và false approve/reject/abstention/integration metrics. Mock và cookbook speedup không thay dataset.
5. **Cut over only on demonstrated acceptance**, clean caller migration và real native/runtime proof. Auto cook không hạ gate, cấp human permission hoặc tự restart host.
6. **Audit toàn bộ lịch sử trước handoff**, giữ mọi origin/unfinished objective, retire cơ chế unsafe bằng replacement rõ. Không chạy lại work đã thực hiện chỉ vì checkbox cũ sai.

Đã đối chiếu [33-plan/83-phase inventory](261019-all-plan-implementation-inventory.md), [research C01–C35](261019-all-research-implementation-coverage.md) và sáu security findings vào [coverage](261019-research-to-cook-coverage.json). [Master](../261019-research-to-cook-execution/plan.md), [auto-cook prompt](../261019-research-to-cook-execution/execution-prompt.md), [online verification](../261019-research-to-cook-execution/research/jev-atomic-online-verification.md), [council ADR](../../docs/decisions/ADR-20261019-jev-atomic-advisor-direction.md) và [final prediction](261019-jev-direction-final-prediction.md) đã viết; chưa có H implementation/live benchmark/deploy hoặc cook execution.

## Primary best-practice sources

- [System One primitives](https://docs.typesafe.ai/primitives.md): typed focused judgments, không generation/reasoning mở.
- [Structured state](https://docs.typesafe.ai/concepts/state.md): relevant named data, không toàn bộ transcript.
- [Parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions.md): independent questions dùng chung state; không suy statistical independence hay workload savings.
- [Confidence semantics](https://docs.typesafe.ai/confidence.md): certainty/concentration không phải correctness và không thay raw Noul.
- [API](https://docs.typesafe.ai/api.md): phân biệt vendor API limits với local transport budget.
