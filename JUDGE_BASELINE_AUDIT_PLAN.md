# Judge Baseline Audit & Implementation Plan

> Revised: 2026-10-15 · Status: proposed, chưa triển khai · Scope: workspace → deployment target → runtime smoke sau restart.
> Phiên refinement chỉ sửa file này. Không sửa mã nguồn, chạy deploy, thay cấu hình global hoặc ghi proxy OMP.

## 1. Mục tiêu và ranh giới

Sửa sai lệch module loading, HTTP retry, session ownership, todo lifecycle, test-evasion heuristics và baseline deployment. Hoàn thành khi hành vi mới được chứng minh bằng regression checks, smoke thực tế và recovery rehearsal trong môi trường cô lập; không chỉ dựa vào một lần `bun test` xanh.

**Bất biến bắt buộc**
- Mọi sửa đổi implementation nằm trong development workspace. Không sửa trực tiếp active deployment target.
- Không ghi, tạo lại, thay thế hoặc tự repair `C:/Users/thant/.omp/agent/extensions/typesafe-planner.ts`. Đây là immutable trampoline theo `AGENTS.md`. Sync chỉ được kiểm tra read-only trước mọi mutation.
- Không tự xóa proxy `.disabled`, `skills/`, tài liệu hoặc test chỉ vì chúng không có counterpart trong workspace.
- Không đổi consent: giữ nguyên `.claude/.ck.json`; thiếu config không được tự tạo `projects: ["*"]`.
- Không chạy test có thể rename module trong home thật. Tests/fixtures không được ghi `.omp`/`.claude` thật hoặc gọi API thật.
- Fail-closed không đồng nghĩa xóa task, reset ratchet, giả lập consent hoặc công bố completion trước native tool success.

**Không mở rộng phạm vi:** không redesign calibration/thresholds, không thêm AST parser, không thêm vendor/router/telemetry framework. Giữ nguyên redaction, payload caps, response sanitization và lattice enforcement hiện có.

## 2. Evidence và độ tin cậy

Các anchor dưới đây là vị trí tại thời điểm review, không phải contract cố định. Triển khai phải tìm lại symbol, đọc references trước khi đổi exported API và kiểm tra host version đang dùng.

| ID | Finding đã đối chiếu | Evidence | Mức độ / giới hạn |
|---|---|---|---|
| E1 | Sync có thể ghi immutable proxy; substring check chấp nhận nội dung thừa | `tools/sync-baseline.cjs:197-216` | Critical. Có trong source; không khẳng định proxy thật hiện đang hỏng. |
| E2 | Resolver/redaction/API loaders ưu tiên global; policy loader chỉ dùng global | `typesafe-planner.ts:178-296`; `src/payload-safety.ts:33-59` | High. Có nguy cơ load code khác revision với workspace. |
| E3 | OMP retry khác shared client: thiếu 529, retry thêm 499/502/503/504, dùng lại attempt signal | `typesafe-planner.ts:2434-2485`; `src/typesafe-api-client.cjs:21-64,247-335` | High. Shared client cũng cần review cleanup cho auth/nonretryable responses. |
| E4 | Task maps/checkpoints ở module scope; `session_start` clear chúng; interception còn ghi chúng | `typesafe-planner.ts:45-70,935-936,1287-1294,1815-1890` | High. Chặn child startup riêng lẻ không tạo isolation. |
| E5 | Pre-exec interception dùng op đầu rồi bulk-delete done; state thay đổi trước native result | `typesafe-planner.ts:1895-1919,2311-2355` | High. Sai cả target coverage và commit timing. |
| E6 | Block confirmation đọc `primaryOp` trước declaration | `typesafe-planner.ts:1852,1895` | High trên nhánh có thể chạm lỗi; chọn đúng block op/target reason. |
| E7 | Gate 1 chỉ đếm assertions; shared analyzer là regex heuristic, không phải AST | `src/cook-expert-judge.ts:148-168`; `src/ast-analyzer.ts:15-62` | Medium. Smoke xác nhận unequal literals cũng bị gọi tautology. |
| E8 | Drop approval có thể bỏ qua intent conflict; approval được ghi vào authorization tracking trước tool success | `typesafe-planner.ts:1714-1825` | High. Cần phân biệt inference, judge approval và human consent. |
| E9 | Sync backup chỉ target nhưng còn ghi global resolver/MCP modules/agents/config; lỗi nhiều nhánh chỉ warning | `tools/sync-baseline.cjs:54-67,121-195,240-245` | High. Target-only restore không phải rollback đầy đủ. |
| E10 | Integration test rename policy file trong home thật và nuốt lỗi restore | `tests/typesafe-planner-integration.test.ts:55-85` | High. Không giữ global-only loader để chiều test này. |

### Sửa các tiền đề của bản brainstorm

- Các mô tả “proxy 650 dòng”, “resolver global 274 dòng”, “6 test fail”, “32 test files”, “12 plan cũ” là **historical/unverified trong phiên này**. Không dùng làm baseline hoặc expected output mới.
- Native `todo` nhận **một op top-level**, không nhận `ops: [...]`. `done`, `drop`, `rm` có thể nhắm một task, một phase hoặc toàn bộ list. Bỏ thiết kế batch wrapper; sửa coverage cho tất cả target của **single native op**.
- `model` là required trên wire theo API. Interface wrapper có thể nhận optional override rồi mặc định `jev-latest`; hiện `executeTypeSafe` đã gửi model nhưng `TypeSafeJudgeParams` chưa khai báo field đó.
- Vendor yêu cầu exponential backoff cho 429/529. Ba attempts, 15s budget, 10s/attempt, jitter, Retry-After parsing và 45s cooldown là **repository policy**, không phải con số vendor bắt buộc. Không suy luận vendor cấm retry mọi status khác; chỉ giữ allowlist local đã chọn.
- Không giữ exact warning wording chỉ để test pass. Tests nên assert loại lỗi, target, state và recovery; bỏ wording/source-text tests incidental thay vì re-pin.

### Nguồn contract

- [OMP extensions](omp://extensions.md): module state shared nhưng factory/API bind mới cho child; `ctx.agent.kind`; `tool_call` trước execution, `tool_result` sau execution; blocked calls không có normal post-result.
- [Native todo](omp://tools/todo.md): single-op inputs; phase/all targeting; error giữ pre-call state; `details.phases`, `completedTasks`, `op`; prewalk child có thể giữ todo riêng.
- [TypeSafe API](https://docs.typesafe.ai/api.md#handling-rate-limits): required model, typed answers, exponential backoff 429/529.
- [TypeSafe confidence](https://docs.typesafe.ai/confidence.md): probability và confidence không hoán đổi. Không đổi calibration trong audit này.

## 3. Prediction Report: Judge Baseline Audit

## Verdict: CAUTION

Có thể triển khai bản plan đã sửa dưới đây. **STOP quy trình deploy/prune của bản cũ**: vi phạm immutable proxy và rollback thiếu global effects. Không có chứng cứ cho một performance/design STOP không thể khắc phục sau các thay đổi giới hạn này.

### Agreements (all personas align)

Năm review độc lập: Architect, Security, Performance, UX, Devil's Advocate; không chia sẻ kết quả trong vòng phân tích đầu.

- Cả năm yêu cầu acceptance dựa trên hành vi và evidence, không lấy số test hoặc trạng thái global lịch sử làm bằng chứng hiện tại.
- Cả năm giữ fail-closed, nhưng không dùng test-mode bypass hoặc optimistic state mutation để làm luồng có vẻ thành công.
- Architect, Security, UX và Devil's Advocate cùng yêu cầu bỏ auto-repair proxy, cô lập fixtures và giới hạn deployment ownership/recovery.

### Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|---|---|---|---|---|---|---|
| Todo multi-target | Theo native task/phase/all, commit sau result | Không mở bypass qua target thiếu | Reuse evidence chung, giới hạn tổng latency | Không báo done trước success | Bỏ batch API giả định | Single-op target expansion; preflight mọi target; native result là nguồn commit. |
| Session isolation | Factory-owned state, child governance riêng | Không chia sẻ quyền giữa sessions | Tách task state khỏi cooldown theo credential | Child không xóa parent | Guard startup chưa đủ | Move mutable task state vào factory; chỉ skip child probe, không vô hiệu hóa child governance. |
| Retry reuse | Một transport contract | Giữ redaction/auth boundary | Shared bounded runner, không double-prepare | Abort/cooldown có recovery rõ | Không nhân bản policy số | Extract transport runner trong CJS hiện có; giữ wrapper OMP normalization/policy. |
| Prune/rollback | Manifest mọi mutable destination | Ownership + preimages + path guards | Không cần cơ chế deploy framework mới | Failures phải nói rõ restored/remaining | Không xóa tùy tiện để test xanh | Per-file manifest/journal trong sync hiện có; lần đầu không prune unknown files. |
| Evasion parity | Dùng một analyzer | Không coi heuristic là proof đầy đủ | Tránh duplicate scans | Phân loại lỗi/remediation rõ | Fix false positives, không thêm parser | Shared bounded heuristic; giữ semantic Gate 2; không quảng cáo AST guarantees. |

### Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| Proxy bị sync tự ghi | Critical | Read-only preflight trước backup/deploy; mismatch abort, không repair. |
| Xóa file không thuộc deployment / rollback thiếu global | High | Manifest ownership, prior hashes, preimages/absence cho mọi mutation; fault-injected recovery. |
| Child thay đổi parent / stale async result | High | Factory-local state, session generation, call-ID staging và lifecycle cleanup. |
| Một phase done chỉ verify task đầu hoặc commit trước native error | High | Target expansion, aggregate deadline, reconcile successful native result. |
| Retry kéo dài hook / abort chậm / key cũ throttle key mới | High | Bounded transport, abortable sleeps, credential-scoped cooldown, stale-call guard. |
| Judge bỏ requested task hoặc inference bị gọi là human consent | High | Intent conflict escalation, task-scoped trusted authorization, headless block. |
| Analyzer gây false positives hoặc bị net-count evasion | Medium | Test-file scoping, cùng analyzer cho gates, literal correctness và targeted negative cases. |

### Recommendations

1. Làm hermetic fixtures và read-only deployment preflight trước; không chạy sync hiện tại như một bước kiểm tra vô hại.
2. Cutover session ownership và native todo lifecycle cùng nhau; không chỉ thêm `isSubagentSession` rồi bọc vòng `for` quanh handler.
3. Dùng một retry runner, giữ nguyên policy/security wrappers và production behavior trong tests.
4. Chỉ promote sau isolated recovery rehearsal, workspace/target checks và post-restart runtime smoke.

## 4. Thứ tự triển khai và ownership

Một integration owner cho `typesafe-planner.ts` và sync. Các nhánh sửa retry/lifecycle/drop không được ghi chồng file độc lập. Phases dưới đây đều **pending**, không mô tả công việc đã hoàn thành.

| Phase | Phạm vi | Phụ thuộc | Exit gate |
|---|---|---|---|
| P0 | Contract baseline, fixtures và deployment preflight | Không | Không test nào cần mutate home thật; proxy/path/config checks không ghi gì. |
| P1 | Bundled module resolution | P0 | Không load global drift; missing/invalid bundled module fail-closed. |
| P2 | Shared bounded HTTP transport | P1 | Retry, deadline, abort, bodies và cooldown có proof deterministic. |
| P3 | Factory-owned state + native todo lifecycle | P0, P1, P2 | Parent/child độc lập; mọi target verified; commit khớp native result. |
| P4 | Evasion parity + drop arbitration | P3 | Không auto-drop intent conflict; không thêm heuristic false positive đã biết. |
| P5 | Managed deployment transaction + recovery | P0–P4 | Isolated fault injection phục hồi đủ mọi destination. |
| P6 | Promotion và runtime smoke | P5 | Workspace/target checks xanh; restart và loaded-revision smoke được ghi nhận. |

**Cross-plan boundary:** `plans/261015-advisor-judge-jev-true-calibration/plan.md` đang `in-progress` dù phase table ghi Completed; giữ nguyên trạng thái đó trong phiên này. Khi triển khai, đối chiếu source thực tế để rebase phần shared `typesafe-planner.ts`, `src/cook-expert-judge.ts`, `src/payload-safety.ts`; không mở lại calibration/threshold work. Hai plan `261014-typesafe-todo-done-verdict-fidelity` và `261014-typesafe-jev-advisor-overhaul` là historical context, không phải evidence rằng deploy/rollback đã an toàn. Không tạo blocking cycle hoặc sửa trạng thái plan khác chỉ để bookkeeping.

## 5. Implementation steps và acceptance

### P0 — Cô lập verification, xác thực contract và preflight

1. Thay fixture rename real-home trong integration test bằng temporary module root/process fixture; isolate CJS cache và restore env/mocks trong `finally`/teardown. Fault fixture không có local/global module phải exercise missing-module path thật, trước fetch.
2. Đối chiếu installed OMP schema/events với nguồn mục 2. Xác định call ID, cancellation, hook deadline và cách lấy canonical todo snapshot từ branch/session. Không parse rendered summary để lấy state.
3. Sync preflight read-only: validate proxy content đúng một export tới target planner. Cho phép một trailing LF/CRLF; reject BOM, extra statements/comments, mismatch hoặc missing file. Target override phải khớp immutable pointer; pointer override không cấp quyền ghi pointer.
4. Kiểm tra source/target/backup roots distinct, không lồng nhau; canonical containment theo Windows casing; reject symlink/junction/reparse redirects và unsafe write aliases. Backup directory phải mới, nằm ngoài mọi mutated root.
5. Required sources thiếu phải fail trước mutation; không `continue` im lặng. Không tự tạo wildcard consent; unknown/modified deployment artifacts là conflict, không tự xóa.

**Acceptance:** missing/mismatched proxy, overlapping paths, unsafe link, missing source đều exit nonzero; bytes/existence của target, proxy, config và globals không đổi. Fixture chạy không có API key thật và không cần sửa home thật.

### P1 — Bundled module cutover, không dựa vào global fallback

- Resolve resolver, API client, redaction, patterns và policy client từ `src/` kề bundle hiện hành. Remove global-first và hardcoded alternate-workspace candidates trong các loaders bị ảnh hưởng; không fallback sang global khi local module thiếu/hỏng.
- Validate required exports. Giữ `policy_client_missing`/disabled semantics phù hợp caller, không làm policy optional hoặc bypass lattice.
- Update resolver tests dùng bundled fixture; missing/invalid-module tests chạy process cô lập. Migrate callers và comments thay vì giữ global-only policy loader để chiều integration test.
- Successful CJS imports vẫn cached: file deploy mới cần restart OMP, không hứa hot reload.

**Acceptance:** global fixture cố ý trả kết quả stale không ảnh hưởng bundled behavior; missing/invalid local module không gọi fetch hoặc rơi sang global. Wildcard/exclude resolver cases được kiểm tra với config fixture, không phụ thuộc config cá nhân.

### P2 — Một bounded transport, giữ wrapper security

- Extract/reuse retry runner trong `src/typesafe-api-client.cjs`; cả `judgeTypeSafe` và OMP wrapper dùng cùng runner. Runner nhận prepared body, fetch, signal, clock/sleep/random và cooldown state; trả outcome có cấu trúc. Không gọi lại full `judgeTypeSafe` trên payload đã normalize/redact/cap.
- Giữ một policy source: retry 429/529, tối đa 3 attempts, total 15s, mỗi attempt tối đa 10s, useful remaining tối thiểu 1s; backoff full jitter theo base 500ms/cap 4000ms. Với 3 attempts, no-header ceilings là 500ms và 1000ms, không phải mọi delay đều 500–4000ms.
- Honor valid Retry-After seconds/date; malformed header dùng backoff. Header vượt 5s không sleep trong call; giữ finite server not-before qua calls, tối thiểu local cooldown 45s sau exhaustion. Không reset valid dài hơn 45s như một “clock mismatch”. Infinite/unrepresentable header dừng retry, không tạo infinite deadline.
- Deadline dùng monotonic clock; wall clock chỉ convert HTTP-date. Fresh controller mỗi attempt; bound cả fetch, body read và cleanup. Sleep phải abortable; body cancellation best-effort có giới hạn, không được treo budget. Không retry network/timeout/abort, auth hoặc status ngoài local allowlist.
- Cooldown theo credential identity, không lưu/log raw key; không bị xóa bởi checkpoint/task reset hoặc child startup. Key rotation tách state; stale in-flight call không được re-arm state của credential generation mới. Concurrent calls recheck cooldown trước retry và không gia hạn cooldown đang active vô hạn.
- Check cooldown trước expensive payload preparation khi đủ thông tin key; prepare/serialize một lần ngoài retry loop. Không tắt cooldown dưới `BUN_ENV`/`NODE_ENV=test`; inject/reset fixture state thay thế.
- Add `model?: string` vào params/type/schema thực sự exposed nếu wrapper nhận override; mặc định `jev-latest` trước redact/cap. Giữ auth kill-switch, question keys/options, response sanitization và lattice checks.

**Acceptance:** 529→200, 429 exhaustion, 503 single-attempt, auth kill-switch, Retry-After date/seconds/malformed/long, caller abort khi fetch/sleep/body pending, body stall, concurrent cooldown, expiry và key rotation. Dùng virtual time; assert no request khi cooldown và không approve khi unavailable. Body cleanup cả auth/nonretryable/probe responses không leak hoặc vượt deadline. Preserve stable error codes; diagnostics chỉ nêu status/cooldown/recovery, không response body/secret.

### P3 — Session ownership và native single-op todo lifecycle

1. Chuyển task maps, pending remediations, authorization, failure counters và checkpoints vào state của extension factory. Migrate exported-state consumers/test helpers qua explicit instance access; không giữ mutable singleton alias. Tách auth/cooldown sharing có chủ đích khỏi task state.
2. Child startup không reset parent, không probe lặp. Prewalk child vẫn govern todo riêng; không skip toàn bộ child `tool_call`. Main sessions cũng độc lập. Rehydrate canonical state trên resume/switch/branch; invalidate in-flight work bằng session generation.
3. Chấp nhận native top-level op. Remove synthetic `ops` normalization/callers/tests; reject unsupported wrappers trước side effects. Expand exact `task`, `phase`, hoặc all theo canonical snapshot, không dùng fallback task ID `"task"`. Cover `init` replacement, `drop`, `rm`, `block`, `unblock` và implicit pending→active normalization.
4. Preflight toàn bộ affected targets. Mỗi task có baseline/criteria/verdict riêng; evidence chung chỉ reuse khi cùng workspace revision/test command. Không capture checkpoint mới giữa các target khiến task sau mất diff; không chạy lại cả suite cho mỗi task.
5. Tách evaluation khỏi positive state commit. Chỉ stage call-ID/input fingerprint/generation + proposed changes; không xóa contract, thêm host authorization, advance checkpoint hoặc phát DONE report trong `tool_call`.
6. Reconcile từ successful `tool_result` với `details.phases`, `completedTasks`, `op`; native `isError` giữ authoritative task state. Stage bounded và expiring; blocked-by-later-hook/denied/cancelled calls không có normal result nên phải cleanup qua lifecycle/expiry, không giữ lock vô hạn. Failure diagnostics có thể cập nhật đúng session nhưng không tạo progress.
7. Áp aggregate preflight deadline nhỏ hơn hook deadline đã xác nhận. Không nhân 15s theo số task vượt deadline; thiếu budget thì reject với recovery, không skip remaining targets. Sau await kiểm tra generation/fingerprint trước commit; stale result không ảnh hưởng session mới.
8. Fix block reason lookup theo đúng op/target. Xóa test-name bypasses như `test-*`/`Pending Task` trong changed path; dùng harness thực thay vì production special cases.

**Acceptance:** task/phase/all `done` verify mọi affected task; một reject ngăn native mutation; native error sau preflight không tạo phantom completion; successful result commit đúng transitions một lần. Parent, hai main instances và prewalk child dùng cùng task text không ảnh hưởng nhau. Cover phase rm/drop, init replacement, block/unblock, unsupported wrapper, missing target, cancellation/later-hook block, duplicate/stale results, switch/branch và aggregate timeout. Smoke phải chạy native tool surface, không chỉ invoke handler giả.

### P4 — Shared heuristic parity và Bicameral intent arbitration

**Test-evasion**
- Reuse một `analyzeDiffForTestEvasion` result, không giữ duplicate regex scans ở Gate 1. Giữ `assertionDeleted` nghĩa deletion; gate analyzer safety riêng, không đổi nó thành “mọi issue đều là assertion deletion”.
- Scope diff theo test-file hunks; không coi Markdown example là test evasion. Sửa literal matching: `expect(true).toBe(false)` không phải tautology. Không tuyên bố regex là AST hoặc complete semantic proof.
- Review net-count masking giữa files, whitespace variants và documented examples. Thêm regression consumer-visible cho trường hợp sửa; không triển khai parser mới. Remaining heuristic limits phải ghi rõ; Gate 2 vẫn cần evidence/intent.
- Findings dùng cùng test-evasion classification/remediation ở callers; phân biệt xóa coverage để né completion với removal có chủ đích của wording/incidental tests. Không dùng lỗi heuristic làm lý do khôi phục test vô giá trị hoặc cấm mọi test refactor.

**Drop arbitration**
- Judge approve + Advisor DISALLOW có explicit user-intent conflict → unresolved conflict, không auto-approve. UI confirm yes/no giải quyết theo task scope; headless/confirm unavailable → block và giữ contracts, nêu `human_resolution_required` cùng cách resume.
- Không coi request rỗng là consent. Giữ distinction giữa inference của advisor, judge decision, trusted host authorization và explicit UI confirmation; chỉ hai nguồn sau được report là human-confirmed khi có provenance thật.
- Không thêm host authorization từ judge/heuristic drop approval; tránh quyền còn lại khi cùng task text được append lại. Commit drop/authorization theo P3 result lifecycle.

**Acceptance:** genuine assertion, deleted coverage, commented assertion, equal-literal tautology, unequal literals, docs example và cross-file masking; assert classification/state chứ không exact prose. Drop conflict: interactive yes/no, headless, UI unsupported, empty request, explicit cancellation; blocked case không gọi native mutation, không xóa task hoặc tạo authorization. Reports không gọi inference là human consent.

### P5 — Deployment ownership và compensating rollback

- Giữ `tools/sync-baseline.cjs` là integration entry; không tạo parallel deploy framework. Deduplicate manifest; bỏ required entries không còn tồn tại sau inventory, không hardcode file-count expectations.
- Dry-run hiển thị allowlisted destinations, planned overwrites/prunes và validation status; không tạo backup hay ghi global. Global scope gồm resolver, bốn MCP modules và owned OMP agent definitions nếu vẫn cần đồng bộ. Config/proxy không thuộc mutable set.
- Per-file manifest lưu relative path, destination root, prior deployed hash và new hash. Prune chỉ artifact có prior ownership và current hash khớp previous deployed hash. Unknown/locally changed files giữ nguyên và report conflict; lần sync đầu không tự nhận quyền sở hữu target-only artifacts. Không recursive delete `skills/` hoặc root `*.md` blanket.
- Trước mutation: single-writer lock, backup preimages/existence của **mọi** changed/deleted path ở mọi permitted root. Backup chứa sensitive data phải không mở rộng quyền truy cập hoặc in contents; verify hashes và absent markers. Không đưa backup vào recursive copy source.
- Stage/copy, verify artifact hashes và run target verification trong isolated/quiescent promotion window. Không gọi multi-root update là atomic; đây là transaction có compensating rollback. Recheck destination identity/conflicts trước ghi.
- Bất kỳ copy/prune/global-sync/hash/test failure đều rollback reverse journal: restore old bytes/metadata phù hợp, remove đúng transaction-created artifacts. Không chỉ catch failed `bun test`. Rollback lỗi giữ cả primary/recovery errors, exit nonzero và liệt kê unresolved paths; không in SUCCESS.
- Release lock/staging trong `finally`. `OMP_SKIP_VERIFY_TESTS=1` chỉ được báo unverified, không đạt promotion acceptance. Pointer mismatch phải abort từ P0, tuyệt đối không repair.

**Acceptance:** subprocess integration chạy với temp workspace/target/home/global roots và fake tool executable, rồi isolated real Bun target check. Inject failure sau target copy, global write, prune, verification và rollback; so sánh bytes/existence trước/sau toàn bộ mutable roots. Kiểm tra newly-created docs/plans/modules được gỡ khi rollback, unknown/modified files được giữ, config/proxy bất biến và repeated deploy idempotent.

### P6 — Promotion, restart và proof runtime

1. Sau khi P0 fixtures an toàn: chạy focused existing suites cho changed behaviors, rồi full `bun test` trong workspace. Ghi command, exit code, observed summary; không chốt trước số tests/files.
2. Chạy sync dry-run và isolated recovery rehearsal. Chỉ sau khi đạt P5 mới chạy `node tools/sync-baseline.cjs` để promote; không dùng script hiện tại làm baseline smoke.
3. Target verification phải đi kèm artifact hashes và same hermetic test setup. Giữ unknown artifacts; nếu chúng gây test conflict thì resolve provenance/content, không xóa để đạt `0 fail`.
4. Output tách `files deployed`, `target tests passed/skipped`, `runtime not yet verified`. User restart OMP theo workspace guideline; không hứa cached CJS module được thay bằng reload.
5. Sau restart, xác nhận loaded revision/module origin là target bundle, rồi smoke: parent init/start → child/prewalk activity → parent contract còn nguyên; task/phase completion thật; simulated unavailable/conflict không tạo progress. Không coi ONLINE health probe là bằng chứng loaded revision hoặc completion gates.
6. Update existing README/changelog liên quan sau smoke; bỏ throwaway fixtures/scripts. Ghi evidence vào plan, chỉ mark implementation completed khi toàn bộ gates đạt. Nếu restart chưa xảy ra, ghi rõ runtime acceptance pending, không báo end-to-end done.

## 6. Verification record của phiên refinement

**Đã thực hiện**
- Đọc plan, các source anchors tại mục 2 và relevant overlapping plans; năm persona review độc lập, parent phân xử.
- Đọc official OMP extension/native todo và TypeSafe API/confidence documentation nêu ở trên.
- `node --check tools/sync-baseline.cjs`: exit 0, không output; chỉ chứng minh syntax, không chứng minh deploy an toàn.
- Throwaway `bun -e` gọi analyzer trực tiếp: genuine assertion → safe; `expect(true).toBe(false)` → incorrectly unsafe/tautology; equal-literal example → unsafe; deleted test block → unsafe. Không tạo permanent test hoặc sửa analyzer trong phiên này.

**Chưa thực hiện / không được suy diễn:** full workspace tests, đo fresh global drift, baseline sync, rollback thực, API call thật, OMP restart hoặc runtime activation. Các mục P0–P6 là acceptance cho implementation tiếp theo, không phải kết quả đã đạt.
