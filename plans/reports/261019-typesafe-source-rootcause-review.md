# Source review: TypeSafe JEV, todo và Advisor

Ngày: 2026-10-19. Phạm vi ban đầu: review/điều tra, không sửa runtime/test/threshold/loader hoặc deploy. Sau bàn giao, user đã cho phép sửa riêng evidence plumbing; kết quả implementation/kiểm chứng bổ sung ở cuối báo cáo. Không triển khai toàn bộ roadmap hoặc gọi live JEV để benchmark.

## Kết luận

**Giả thuyết input gửi judge có vấn đề được củng cố bằng các lỗi tái hiện ở code tích hợp. Chưa có bằng chứng để kết luận JEV luôn sai hoặc đo tỷ lệ chính xác của JEV trên công việc này.** Các lỗi gồm mất hợp đồng/bằng chứng, diff không đúng task, biến lỗi dịch vụ thành yêu cầu sửa code, quyền quyết định không nhất quán và Advisor nội bộ không phải reasoning agent.

Có thêm lỗi an toàn ngoài triệu chứng chấm thấp: native history không rehydrate, EGC marker có thể làm planner bỏ qua gate, và native completion bỏ qua consensus escalation. Không dùng các đường này để vượt gate.

## Phạm vi và phương pháp

- Đọc source triển khai được inventory phát hiện: entrypoint `typesafe-planner.ts`, toàn bộ 19 tệp TS/CJS dưới `src/`, 6 script dưới `scripts/`, 4 tệp executable dưới `tools/`. Bao gồm EGC alternative, resolver, redaction, transport, policy, evidence, lifecycle, gate và deployment helpers.
- Đối chiếu 4 bản agent contract dưới `agents/` và `.omp/agents/`; review có trọng tâm các test evidence/consensus/todo/lifecycle/input/remediation. Toàn suite được thực thi; không tuyên bố đã đọc từng dòng của mọi test hay mọi tài liệu lịch sử.
- `xd://lsp` báo không có language server; dùng tìm kiếm symbol/callsite. `TeamCreate` không có trong runtime, nên không gọi đây là Agent Teams.
- Các probe dùng hàm/callback thật, Git repo tạm, host record tổng hợp, fake fetch tại chỗ. Không gọi API đánh giá thật trong probe; response giả lập chỉ kiểm tra adapter/control flow, không chứng minh độ chính xác ngữ nghĩa của model.
- Một lần native `todo done` thật cho mục mapping bị reject `analysis_research`, `REJECT`, `P=0.13`. Không có wire capture cho lần đó; không suy nguyên nhân cụ thể từ enum/điểm chung.

## Findings đã xác nhận

### F01 — HIGH: test receipt và acceptance criteria bị mất ở native done

**Source:** `typesafe-planner.ts:1751-1811`, `src/evidence-collector.ts:514-560`.

Native caller đọc `params.testCommand` và `params.requirements`, nhưng schema todo đang được host cung cấp trong phiên này không có hai field đó hoặc `planPath`. Caller không truyền `planPath` cho evidence collector. `collectConversationContext` trả `lastTestSummary`, nhưng caller native không sử dụng.

**Quan sát:** branch có `357 pass / 0 fail / exit 0`; `lastTestSummary` giữ được nội dung. Payload sau redaction vẫn có `test_summary = No testCommand provided.` và `task_requirements` chỉ là tên todo, không có điều kiện `handle empty input` của user. Test output có thể còn trong work-log ngắn, nhưng đó không thay thế receipt gắn task/evidence.

**Khắc phục đề xuất:** lấy contract và test receipt từ nguồn host-owned, gắn đúng task/revision/evidence; dùng chung evidence builder cho native/advisory, không thêm flag do agent tự khai để tự chứng nhận pass. Không mặc định chạy test cho task nghiên cứu không cần test.

### F02 — HIGH: task-baseline chỉ lọc tệp, không tạo diff từ baseline

**Source:** `src/evidence-collector.ts:54-120,376-450`.

Snapshot giữ hash của dirty files; diff của tệp thay đổi được lấy bằng `git diff HEAD -- files`, không phải baseline-content → current-content.

**Quan sát:** trước task đổi `preexisting=0→41`; trong task chỉ đổi `taskChange=0→7`. Evidence mang nhãn `task-baseline` nhưng chứa cả dòng thêm `preexisting=41`.

**Tác động:** judge có thể đánh giá WIP ngoài task là drift hoặc attribution sai. Gắn nhãn task-scoped không làm nội dung thật sự task-scoped.

**Khắc phục:** lưu/provision baseline đủ để dựng diff thật, bảo toàn staged/untracked/revert/delete; không chỉ đổi nhãn hoặc loại tệp để né reject.

### F03 — HIGH: task nhiều commit chỉ gửi commit cuối

**Source:** `src/evidence-collector.ts:419-435`.

Có `baseline.headSha` nhưng fallback dùng `HEAD~1..HEAD` thay vì toàn khoảng từ baseline.

**Quan sát:** task tạo và commit `src/first.ts`, rồi `src/second.ts`. Evidence chỉ có second.ts; phần triển khai first.ts biến mất khỏi payload.

**Khắc phục:** tính khoảng revision theo baseline đúng task và kết hợp working-tree delta; có xử lý first commit, rebase và baseline không còn hợp lệ.

### F04 — HIGH: rolling conversation window thay hợp đồng user bằng lời thúc tiếp tục

**Source:** `typesafe-planner.ts:726-824`, `src/cook-expert-judge.ts:220-239`.

Hai user message gần nhất, tám agent/tool message gần nhất, rồi cắt tail 2.000/3.000 ký tự. Macro cắt tiếp các field xuống khoảng 1.950 ký tự.

**Quan sát:** request gốc yêu cầu lexer/API invariants bị thay bằng `Continue. / Proceed.`; các lần đọc source sau đó đẩy test proof ra khỏi work-log, dù `lastTestSummary` vẫn tồn tại.

**Khắc phục:** contract ổn định có revision; yêu cầu bổ sung chỉ cập nhật contract theo quy tắc rõ ràng. Work-log là claim/background, không là nguồn chân lý hay thay thế contract.

### F05 — HIGH: outage bị biến thành yêu cầu sửa implementation; Gate 2 retry counter không tăng

**Source:** `typesafe-planner.ts:1775-1777,1804,1815-1826`, `typesafe-planner.ts:1128-1202`.

Formatter có nhánh `isUnavailable` nhưng caller không truyền classification đó. Gate 2 không tăng `consecutiveFailuresByTask`; chỉ Gate 1 tăng. `nextActions` được gán bằng `reasons`; `diffHash` hash task+reasons, không phải evidence.

**Quan sát:** fake HTTP 503 tạo chỉ thị `Align implementation changes...`, `remove uncontracted drift...`; sau hai Gate 2 failure, counter vẫn 0.

**Tác động:** agent có thể sửa code đúng để chữa outage hoặc lặp không có tiến triển. Prompt cấm retry unchanged không phải progress guard thực thi trong code.

**Khắc phục:** phân biệt unavailable / insufficient evidence / semantic reject / authority required; outage không sinh code-edit directives. Progress identity phải gắn evidence/contract; giới hạn retry không biến reject thành pass.

### F06 — HIGH: Advisor endpoint fail-open khi JEV lỗi

**Source:** `src/bicameral-consensus.ts:1063-1067,1119-1195`.

JEV result được khởi tạo từ local Advisor; khi client trả lỗi hoặc throw, kết quả khởi tạo vẫn được dùng. Decision clarity không điều khiển nhánh approve nếu risk không vượt 2.

**Quan sát:** client error `http_503` → JEV `APPROVE` → `AUTO_APPROVE`. Clarity 0.01 và low-risk cũng `AUTO_APPROVE`.

**Giới hạn:** đây là endpoint tư vấn quyết định; không đồng nghĩa native todo tự động pass trên cùng outage. Native completion vẫn fail-closed ở tình huống 503 đã probe.

**Khắc phục:** unavailable/uncertain phải là trạng thái thật, không giả một lobe đồng ý. Không coi advice là quyền mutation.

### F07 — HIGH: native done dùng macroResult.approved, bỏ qua consensus

**Source:** `typesafe-planner.ts:1792-1827`, `src/bicameral-consensus.ts:811-869`.

**Quan sát:** Advisor `DISALLOW`, JEV macro approve, consensus `HUMAN_ESCALATION`, nhưng native callback vẫn stage done. Probe chỉ chứng minh staging, không tuyên bố completion thật trong host.

**Khắc phục:** chọn một authority composer được đặc tả rõ và dùng nhất quán; giữ exact target/revision/input identity và matching native commit. Không sửa bằng cách buộc Advisor đồng ý với JEV.

### F08 — HIGH: Advisor nội bộ là heuristic, và bị sửa verdict sau JEV

**Source:** `src/bicameral-consensus.ts:208-412,828-848,906-918`; các file `agents/advisor.md`, `agents/ck-advisor.md`.

Endpoint `typesafe_advisor` không spawn/read bằng agent contract. Nó xếp hạng theo keyword, overlap và template; `evidencePaths` không được đọc. Vì vậy tên `ck:advisor` không chứng minh reasoning review đã thực sự chạy.

Khi JEV reject, code sửa Advisor thành `DISALLOW` thay vì giữ hai kết quả độc lập. **Quan sát:** verdict/block và reason yêu cầu remediation, nhưng recommendation vẫn `Verified test or build evidence confirms task completion`.

**Khắc phục:** phân biệt `intent_heuristic` với reasoning Advisor thật; giữ raw kết quả độc lập; reasoning agent đọc exact evidence để đề xuất sửa. Không yêu cầu JEV sinh root cause/free-form kế hoạch khắc phục.

### F09 — HIGH: phủ định của yêu cầu drop bị hiểu ngược

**Source:** `src/bicameral-consensus.ts:431-464`.

**Quan sát:** `Do not drop lexer verification.` → Advisor `ALLOW`, reason user authorized dropping.

**Giới hạn:** drop còn có JEV lobe độc lập; lỗi heuristic đơn lẻ không chứng minh native drop đã được thực thi trái phép.

**Khắc phục:** cancellation là quyết định authority gắn exact target; không suy permission bằng regex chứa động từ, đặc biệt khi có negation/quote/report về lỗi drop.

### F10 — HIGH: native history không rehydrate do false với nullish coalescing

**Source:** `typesafe-planner.ts:1532-1550,1574-1585`.

`customPhases` bằng `false` cho record không phải `user_todo_edit`; `customPhases ?? resultPhases` giữ false, che kết quả native todo hợp lệ.

**Quan sát differential:** session_start với branch chứa todo init/pending → phases rỗng. Cùng phases qua `user_todo_edit` → khôi phục đúng. Probe đầu tiên thất bại vì kỳ vọng native history khôi phục; điều tra tiếp đã xác định lỗi riêng, không sửa assertion để tuyên bố đường completion pass.

**Khắc phục:** chọn nguồn phases bằng kiểm tra array hợp lệ, không dùng false làm sentinel; kiểm tra normal-result, custom-edit, latest valid result, branch switch và restart. Không reset debt để né gate.

### F11 — HIGH: chỉ có EGC marker cũng làm planner bỏ gate

**Source:** `typesafe-planner.ts:961-965,1593-1594`; `src/egc.ts:78-81,392-407`.

Planner suy EGC đang hoạt động từ biến môi trường hoặc sự tồn tại `.omp/egc.json`, không xác nhận EGC đã đăng ký/nạp contract hợp lệ.

**Quan sát:** cùng callback không marker bị reject; thêm file EGC `{}` trong repo tạm → không reject, không có staged approval, dù chưa đăng ký extension EGC.

**Giới hạn:** không probe native commit thật; chưa xác nhận workspace người dùng hiện tại có EGC active. Đây là lỗi handoff enforcement khi điều kiện kích hoạt xuất hiện.

**Khắc phục:** handoff qua host-owned registration/validated contract, không marker do repo/agent có thể tạo. Không tắt planner chỉ để thoát rejection.

### F12 — MEDIUM: câu hỏi quá rộng và cắt bằng chứng theo vị trí

**Source:** `src/cook-expert-judge.ts:203-322`, `typesafe-planner.ts:442-499,509-696`.

Một choice và một noul cùng hỏi toàn bộ deliverables; drift/scope vẫn cần suy luận toàn cảnh từ diff tóm tắt. Research artifact bị cắt head ~4.940 ký tự, nhiều bước summarization khác không chọn theo criterion.

**Quan sát:** artifact 11.938 ký tự mất acceptance evidence ở cuối; gửi 4.988 ký tự sau enclosure. Đây là mất dữ liệu tái hiện được, không tự chứng minh score nào sai.

**Khắc phục:** chọn evidence hoàn chỉnh theo criterion/claim, khai báo thiếu hoặc truncation; narrow semantic questions; parent integration do reasoning review + kiểm chứng tích hợp. Không chia todo thành vô số dòng rồi giả định lỗi biến mất.

### F13 — MEDIUM: 32 KiB là local policy, khác test/production; không phải API limit

**Source:** `src/payload-safety.ts:187,195-322`, `typesafe-planner.ts:359,2327-2359`.

**Quan sát:** cùng input qua `preparePayloadSafe`: test 32.768 bytes; production 34.804 bytes. Native đi qua structured object, direct helper vẫn string. Tài liệu repo mô tả cap 32 KiB không nhất quán với helper production.

[API hiện tại](https://docs.typesafe.ai/api.md) ghi body tối đa **32 MiB**; [model](https://docs.typesafe.ai/models.md) có giới hạn context theo **token**, không theo ký tự/byte. Không trộn các đơn vị; không khẳng định 34.804-byte body vi phạm API.

**Khắc phục:** một chính sách rõ ràng, nhất quán giữa runtime/test, đo coverage/evidence loss. Không đơn giản tăng cap hoặc gửi toàn transcript.

### F14 — MEDIUM: safe plan bị reject chỉ vì nhắc protected path

**Source:** `src/plan-evaluator.ts:67-93,270-283`.

**Quan sát:** plan `never modify ~/.claude/settings.json` bị isolation check từ chối. Khác với micro-check đã dùng path provenance, plan evaluator vẫn quét raw references.

**Khắc phục:** tách forbidden mutation khỏi lời mô tả an toàn/negative requirement; không xóa nhắc boundary chỉ để đạt approve. Nếu chính sách cấm cả đọc/reference, cần thể hiện rõ là policy chứ không gán sai mutation.

### F15 — MEDIUM: hai debate implementations trả verdict khác nhau

**Source:** `typesafe-planner.ts:1332-1417`, `src/debate-evaluator.ts:107-181`.

**Quan sát:** architect/security 0.5, ba persona còn lại 3 → inline reject, module approve. Model-tier/model-env và security/architect guard cũng khác nhau.

**Khắc phục:** một implementation/policy source-of-truth và consumer-level checks; không chỉnh threshold cho khớp test dễ hơn.

### F16 — HIGH: report JSON đổi rubric; cạnh tranh artifact làm mất report đúng task

**Source:** `typesafe-planner.ts:395-402,476-498,1790-1811`, `src/cook-expert-judge.ts:211-239`.

Sau khi xuất bản map thật 3.735 UTF-8 bytes, parent chạy full affected modules và scratch assertions, rồi changed-path callback smoke riêng. Hai fixture dùng repo tạm có committed baseline được dựng trước khi copy report; giữ nguyên tên/nội dung các output thật.

- **A — chỉ map:** `analysis_research`, research rubric; final artifact 3.781 ký tự, giữ đầy đủ graph/provenance/attestation/causal limits.
- **B — năm report thật cùng xuất hiện:** `changedFiles` vẫn có map và calculation JSON, nhưng classifier chọn `code_change`, instructions thực tế chuyển sang implementation rubric. Collector đọc prediction/scenarios/rootcause trước; artifact cuối 4.939 ký tự chỉ còn prediction/scenarios, mất mọi nhóm evidence cốt lõi của map.
- `unified_diff` vẫn có đường dẫn map, nhưng không còn hai limitation quan trọng về staging/commit và thiếu historical wire. Vì vậy không được nói “map không xuất hiện ở bất kỳ kênh nào”; có path không đồng nghĩa đầy đủ proof đã tới judge.

**Kiểm chứng:** run 175 tests/10 files → 173 pass, **2 fail** đúng desired assertions (research bị phân loại code và map không còn trong artifact); separate smoke exit 1, giữ cùng failure. Không nới assertion, không xóa/đổi tên JSON, không reset task baseline để làm mất competition. Evidence: `local://typesafe-map-packet-observed.json`; test output `artifact://41`. Fake responses chỉ instrumentation, không semantic approval/native commit.

**Giới hạn:** report-only competition, reconstructed isolated baseline, không phải exact Main workspace packet hoặc wire của original P=.13. Đây là causal proof của delivery/rubric failure trong fixture, không retrospective attribution của event cũ.

**Khắc phục:** evidence chọn theo stable task/criterion và applicability, không chỉ thứ tự filename/changedFiles; report data JSON không mặc nhiên là product code. Khi proof bắt buộc bị bỏ phải báo insufficient evidence trước semantic conclusion. Sửa plumbing là implementation scope riêng, không được “chữa” bằng cách chỉnh nội dung output thật để săn approve.

## Những hành vi không được kết luận là bug

1. **Rejected task không block được ở headless host:** source đòi trusted UI. Đây là chính sách user đã chọn, ghi trong `docs/typesafe-operations.md:23-44` và báo cáo recovery trước đó. Probe nhận `human_resolution_required`, giữ task/debt. Cần đường operator rõ ràng; không tự bỏ yêu cầu này.
2. **Không phải drop luôn hỏng:** báo cáo native scratch trước đó có rm/drop được judge approve và native commit. Current callback/tests cũng có đường AUTO_APPROVE headless. Conflict hoặc intent chưa đủ vẫn cần human, dù lý do agent thấy hợp lý.
3. **P=0.51 chưa chắc approve:** Choice có thể vẫn NEXT_ACTION_REQUIRED; probability và verdict riêng. Không dùng 0.50 làm phép chữa mọi refusal.
4. **Không quy tất cả về deploy stale:** tất cả 20 implementation file trên đĩa workspace/target khớp hash; entrypoint/four CJS khớp runtime-origin hiện có. Imported TS memory và sự kiện lịch sử vẫn chưa được attested đầy đủ.
5. **Không quy unsupported event thành JEV thấp:** Gate 1, resolver, auth hoặc transport fail có thể xảy ra trước câu trả lời model.

## Kiểm chứng ban đầu — checkpoint trước remediation

| Kiểm chứng | Kết quả | Giới hạn |
|---|---|---|
| `bun test` | 357 pass; 0 fail; 1.374 expectations; 35 files; 50,79s | Suite xanh không bao phủ các repro mới |
| `local://typesafe-source-audit-smoke.ts` | Exit 0; 10,81s; các assertion nguồn/input/control flow nêu trên pass | Fake fetch, temp Git repo, không model accuracy |
| Duplicate policy / test-vs-prod cap / post-JEV Advisor probes | Exit 0 | So sánh hàm thực với đáp án tổng hợp |
| Native-history / EGC differential probe | Exit 0 sau điều tra assertion thất bại ban đầu | Host record tổng hợp; không user todo/global mutation |
| Hash workspace/target | 20/20 bằng nhau | Không historical in-memory attestation |
| Native mapping todo done | REJECT P=0.13; chưa commit | Một event thật, không wire input; chưa đủ kết luận causal |
| Affected modules + fresh packet assertions | 173 pass / 2 fail; 175 tests; 10 files; 31,31s | Hai failure mới giữ nguyên: classifier/rubric và artifact delivery |
| Separate native packet callback smoke | Exit 1; A control đủ evidence, B competition thiếu proof/đổi rubric | Reconstructed report-only fixture; zero live API/native tool calls |
| Native bookkeeping after delivery | Phase-wide block → `human_resolution_required`; eleven non-debt targets blocked sequentially | Final native summary: 0/12 done, 1 open, 11 blocked. Original rejected mapping stays in progress; no done retry or debt bypass |

Không thay test assets của repo, không thêm permanent test, không suppress failure. Scratch diagnostics có hai assertion fail được ghi nhận, không coi suite xanh cũ là bằng chứng chúng đã được sửa. Không kết luận về flaky; không đo coverage/typecheck hoặc live JEV latency.

## Hướng xử lý theo phụ thuộc

1. Sửa source-of-truth của contract/evidence trước: F01–F04, F10. Giữ task/criterion/revision identity.
2. Làm authority và error taxonomy nhất quán: F05–F09, F11. Không fake consensus hoặc xóa debt.
3. Thử narrow criterion/claim verification với JEV ở shadow mode; Advisor reasoning review parent integration; human giữ quyền scope/authority. F12–F15 phải có đối chứng old/new trên cùng contract/evidence, không retry tới lúc pass.
4. Regression kiểm tra hành vi từng finding, full affected module và changed-path smoke; không chỉ kiểm tra wording hoặc call forwarding.
5. Chỉ sau kiểm chứng và phê duyệt thay đổi runtime mới sync-baseline/restart; phiên review này không deploy.

## Nguồn online và giới hạn causal

- [JEV trong coding agents](https://docs.typesafe.ai/introduction/coding-agents.md): typed judgments, không tự viết code/lập luận hội thoại.
- [State](https://docs.typesafe.ai/concepts/state.md), [Primitives](https://docs.typesafe.ai/primitives.md): structured relevant evidence; narrow judgments; độc lập giữa các question không có nghĩa lỗi thống kê độc lập.
- [Confidence](https://docs.typesafe.ai/confidence.md): Choice confidence là độ tập trung phân phối; Noul là P(yes), không phải mức độ hoàn thành.
- [Models](https://docs.typesafe.ai/models.md), [API](https://docs.typesafe.ai/api.md): model version/alias, token context và body bytes là ba vấn đề khác nhau.
- [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md): indirection/irrelevant context/generation hạn chế theo phiên bản, không bằng chứng calibration của cohort người dùng.

Chưa có labeled dataset và paired before/after để đo false approve/false reject. Historical forensics không có event structurally paired; không suy tỷ lệ model lỗi. Original mapping sau đó đã thực sự native-approved/committed (`d309dc2a`) qua fresh Advisor và relevant updated evidence; điều đó không khôi phục wire hay chứng minh nguyên nhân P=.13.

## Authorized remediation — F16 evidence plumbing

User chọn **“Cho phép sửa evidence plumbing”**, không cho phép deploy. Hai executor sở hữu source và regression độc lập; parent inspect, chạy full affected modules trong toàn suite, rồi separate changed-path smoke trước fresh Advisor review.

### Thay đổi thực thi

- `src/evidence-collector.ts`: dùng chung path/status applicability cho inference và macro; phân biệt research JSON ở report roots với product/config/code, cả rename endpoints, quoting và separators. Đây không phải security/permission boundary.
- `typesafe-planner.ts`: collector nhận actual task.content; explicit task binding ưu tiên report đầy đủ, không coi prose reference là binding. Bỏ summarizer cũ không còn caller. Metadata nêu omissions/unreadable/truncation; không xóa hoặc đổi tên output thật.
- `src/cook-expert-judge.ts` và transport entrypoint: thống nhất 4.940 raw UTF-8 bytes; không cắt artifact thêm sau selection. Mandatory proof không đủ budget hoặc proof bị mất sau permitted redaction → `insufficient_deliverable_evidence`, không fake semantic approval.
- `tests/task-artifact-routing.test.ts`: 25 permanent behavioral regressions; không sửa existing tests hoặc năm desired assertions trong preserved scratch.

### Kiểm chứng sau sửa

| Run | Kết quả quan sát | Phạm vi/giới hạn |
|---|---|---|
| `bun test ./tests` cộng preserved packet test | **387 pass / 0 fail**, 1.764 expects, 37 files, 56,27s; `artifact://47` | Toàn suite repo + năm scratch assertions; không phải live model evaluation |
| Separate preserved callback CLI smoke | **Exit 0**, A/B đều đúng rubric và giữ đủ sáu nhóm map proof | B final field 4.914 UTF-8 bytes; zero live API/native tool calls; staging, không commit |
| Post-edit SHA-256 | **17/20 equal**, khác đúng ba source files được phép sửa | Target/proxy không deploy; recorded entrypoint digest vẫn khớp target cũ, không repaired workspace |

Before evidence giữ nguyên: `local://typesafe-map-packet-observed.json` (173/2 và smoke exit 1). After: `local://typesafe-map-packet-after.json`; identity: `local://typesafe-postrepair-identity.json`. Các số artifact được đo ở snapshot chạy smoke; cập nhật tài liệu sau đó không phải một benchmark mới.

Không hạ threshold, thay Advisor heuristic, sửa todo schema/target binding/commit protocol, bypass EGC, bỏ rejection debt hoặc triển khai runtime. Findings khác vẫn là findings chưa sửa; fix này không chứng minh chất lượng JEV tăng và không giải thích hồi tố P=.13. Main cached runtime và authoritative approval phải được xét riêng.

## Current planning/recovery checkpoint — 2026-10-19

- Actual native view: **3/23done,20open,0blocked**; ba committed records `e824e6e7`, `7c331054`, `d309dc2a` được giữ nguyên. Không còn11stale blanket blocks. Các bảng0/12 và20/20 phía trên là checkpoint lịch sử, không trạng thái hiện tại.
- Target source-review khác vừa bị done reject `code_change REJECT P=.15` (request `b2b6000c`, result `8bcae43c`), không commit. Readonly Advisor xác nhận review không yêu cầu implement16findings/H/deploy; source-confirmed deployed artifact/rubric defects là giả thuyết về event này, không causal proof của score.
- Đã thực thi remediation có thể làm trong scope docs: [3590byte exact-task acceptance](261019-typesafe-source-review-acceptance.md), [complete30file/16claim index](261019-typesafe-source-review-index.json), [actual prospective deployed-helper delivery smoke](261019-source-review-delivery-evidence.json). Control giữ đủ16claims;117changed-file competition giữ0claims của bản đó. Exit0/zero network/native nghĩa là quan sát thành công việc proof vẫn bị mất, không approval. Không phải exact Main task baseline/wire.
- Không retry cùng input, không đổi tên/xóa report, hạ gate, reset/drop task hoặc viết global proxy. [Handoff](../261019-jev-atomic-review/recovery-handoff.md) có exact owner/action/release condition; activation chỉ là tooling-recovery route nếu cần, không acceptance thêm cho review hoặc blanket dependency của task khác.
- [All33plan/83phase audit](261019-all-plan-implementation-inventory.md), [C01–C35 coverage](261019-research-to-cook-coverage.json), [complete ten-phase master](../261019-research-to-cook-execution/plan.md), [online verification](../261019-research-to-cook-execution/research/jev-atomic-online-verification.md), [council ADR](../../docs/decisions/ADR-20261019-jev-atomic-advisor-direction.md) và [fresh prediction](261019-jev-direction-final-prediction.md) đã bàn giao. Full H/baseline residual implementation, real benchmark, deploy/restart và cook execution chưa diễn ra.


## F17 follow-up — HIGH: private thinking được đưa vào state gửi judge

**Source:** deployed `typesafe-planner.ts:763-764,1749,1808`, `src/cook-expert-judge.ts:224`; workspace tương ứng `typesafe-planner.ts:787-788`. Context collector nối assistant thinking vào worklog rồi đưa worklog vào outgoing state. Existing `tests/bicameral-consensus.test.ts:416-458` còn mong đợi hành vi unsafe này.

**Kiểm chứng mới:** probe dùng marker giả lập, hàm deployed thật và production preparation; exit0, marker còn trong cả projected context lẫn prepared state, zero network/native operations. Không đọc/lưu reasoning riêng thật; không kết luận lịch sử đã truyền dữ liệu nào hoặc giải thích hồi tố score. [Evidence](261019-private-context-export-evidence.json), [task-bound follow-up](261019-source-review-f17-privacy.md).

**Action:** dừng các remote completion checks qua collector unsafe; cần quyền sửa typed public-only projection, regression final-egress không marker nhưng giữ public evidence, rồi activation có preservation obligations/debt thật. Không dùng commentary để đẩy private context khỏi tail, không regex lọc suy nghĩ sau concatenation, không disable/bypass gate.

Target verification cũng đã nhận first done reject `a46e8cb1`, displayed code_change/REJECT/P=.10/REDUCTION, chưa commit. [Acceptance matrix](261019-verification-task-acceptance.md) giữ357/0, audit smoke0,173/2/smoke1 và supplement387/0/smoke0 đúng scope. Không cần implement16findings/H để hoàn thành nghĩa vụ chạy kiểm chứng. Native3/23done20open0blocked; hai target reject,18target chưa attempt. Fresh dry-run311baselinefiles/no mutation không phải permission hoặc debt-preserving activation.

