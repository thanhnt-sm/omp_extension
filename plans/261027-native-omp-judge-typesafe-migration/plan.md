---
title: "Cài Jev vào judge bản địa OMP rồi di chuyển các đánh giá nguyên tử"
description: "Xác nhận Jev chạy qua judge bản địa của OMP trước; dùng eval cho các phán đoán nguyên tử; chỉ di chuyển caller trong extension và loại công cụ TypeSafe riêng khi host cung cấp API đánh giá chính thức. Giữ hợp đồng todo, bằng chứng và ranh giới bảo mật."
status: completed
priority: P1
effort: "multi-phase"
branch: master
tags: [native-judge, typesafe-jev, todo, evidence, security, migration]
blockedBy: []
blocks: []
created: 2026-10-27
supersededBy: "261102-atomic-judge-proactive-advisor-healing"
completedInCycle: "2026-11-02"
verificationSuite: "tests/atomic-jev-judge.test.ts, tests/proactive-advisor-dispatch.test.ts"
---

# Cài Jev vào judge bản địa OMP rồi di chuyển các đánh giá nguyên tử

## Tổng quan

**Thứ tự bắt buộc:** trước hết cấu hình (configuration) Jev làm mô hình đánh giá (judge role) bản địa của OMP và chứng minh `judge()` hoạt động; tiếp theo dùng `eval` `judge()`/`judge_batch()` cho các câu hỏi nguyên tử nhỏ hơn todo, plan và công việc của Advisor. Chỉ sau đó mới xem xét di chuyển đường đánh giá nằm *bên trong extension*. Không tạo công cụ `typesafe_*` để thay thế OMP.

**Hai ranh giới khác nhau:** [Tài liệu `eval` OMP](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/eval.md) công bố `judge()` và `judgeBatch()` cho tác tử trong `eval`; có thể dùng chúng để chạy quyết định nguyên tử ngay cả khi extension không có API judge. [Mã nguồn `ExtensionContext` OMP](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/extensibility/extensions/types.ts) hiện **không** công bố callback `judge`; do đó di chuyển các semantic caller tự động của extension vẫn cần bridge chính thức (`HOST_BRIDGE_REQUIRED`). Thiếu bridge **không** chặn cấu hình hay smoke native judge, và không được xử lý bằng cách tạo façade tool hoặc coi output `eval` do tác tử tự nộp là receipt có thẩm quyền.

Không gọi `todo init` hay closure chain cũ trong phiên hiện tại. Ở phiên triển khai mới, không tạo native todo trước khi xác định thao tác đó có thể hoàn tất theo đúng host contract; khi phải chờ bridge bên ngoài, ghi báo cáo phục hồi thay vì để lại todo bị chặn. Không thể hứa không bao giờ có todo bị chặn bởi lỗi mạng hoặc việc thực sự đang chờ con người.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Cấu hình Jev cho Judge bản địa](./phase-01-nghi-n-c-u-h-p-ng-judge-b-n-a.md) | Pending |
| 2 | [Phán đoán nguyên tử qua eval](./phase-02-di-chuy-n-semantic-caller.md) | Pending |
| 3 | [Bridge host và di chuyển caller extension](./phase-03-lo-i-b-transport-v-ph-thu-c-claude.md) | Pending |
| 4 | [Củng cố Todo Native và bằng chứng](./phase-04-c-ng-c-todo-native-v-b-ng-ch-ng.md) | Pending |
| 5 | [Kiểm thử và triển khai](./phase-05-ki-m-th-v-tri-n-khai.md) | Pending |

Các kế hoạch `261019-research-to-cook-execution` và `261019-jev-atomic-review` chồng lấn semantic/receipt; không chạy song song. Đối chiếu công việc còn thiếu trước khi triển khai; không tự đánh dấu kế hoạch cũ hoàn tất hoặc ghi quan hệ chặn một chiều.

## Phạm vi với kế hoạch cũ

`TYPESAFE_REVIEW_FIX_JEV_TEST_PLAN.md` và các kế hoạch lịch sử vẫn được giữ nguyên làm hồ sơ bất biến (frozen historical record). Kế hoạch này là source of truth mới cho mục tiêu native OMP judge; không chỉnh digest, closure protocol hoặc trạng thái của kế hoạch cũ trong quá trình này.

## Quyết định kiến trúc

1. **Ưu tiên native judge:** dùng mô hình Jev có sẵn trong OMP qua `modelRoles.judge`, xác thực (authentication) bằng cơ chế provider của OMP, không qua `.claude/.ck.json` hay HTTP client riêng của extension. Kiểm tra role/model thực tế trước khi đổi cấu hình; không ghi đè cấu hình hiện có khi chưa có bản sao lưu và phạm vi được phép.
2. **Phán đoán nguyên tử:** `judge(state, questions)` nhận `choice`, `bool`, `score`; dùng `judge_batch` (Python) hoặc `judgeBatch` (JavaScript) cho nhiều state cùng rubric. Có thể ghép nhiều câu hỏi độc lập trên một state vào một call; không biến Jev thành tác tử thực hiện todo, plan, suy luận Advisor hoặc quyền human.
3. **Nguồn gốc xác suất:** giữ xác suất gốc; chỉ diễn giải xác suất khi nguồn model xác nhận thuộc native Jev, vì fallback prompt có thể tạo xác suất tổng hợp. Transport `ONLINE` chỉ chứng minh kết nối; không phải phê duyệt semantic.
4. **Bridge extension riêng:** chỉ di chuyển các caller bên trong extension khi phiên bản OMP đang chạy cấp API host chính thức; không gọi `eval` từ hook/preflight như đường vòng và không dựng custom TypeSafe tool.
5. **Bằng chứng và todo:** giữ snapshot, redaction, private-path guard, contract/incarnation và receipt tất định; native `todo` chỉ nhận schema của host. Không thêm `requirements`, `testCommand`, `approval`, `human`, `EGC` hay flag vòng đời.
6. **Tách `.claude`:** bỏ dependency runtime của TypeSafe vào cấu hình, hook hoặc MCP `.claude`; giữ cấm truy cập/sửa vùng nhạy cảm này như bất biến an toàn (security boundary).
7. **Đóng băng khi lỗi (fail-closed):** thiếu bằng chứng → `EVIDENCE_REQUIRED`; host/judge không khả dụng → `UNAVAILABLE`; không retry semantic rejection không đổi, hạ ngưỡng, giả receipt Advisor/human hoặc coi child pass là parent integration.

## Bằng chứng nghiên cứu

- Tài liệu OMP chính thức `docs/tools/eval.md` xác nhận `judge(state, questions)` và `judgeBatch`/`judge_batch` là helper bản địa trong `eval`; state là một giá trị JSON không rỗng, câu hỏi dùng `choice`, `bool`, `score`, và batch do host sở hữu.
- Tài liệu TypeSafe chính thức `https://docs.typesafe.ai/concepts/system-one` xác nhận Jev/System One nhận state và câu hỏi có kiểu, trả quyết định có cấu trúc/xác suất; không sinh văn bản hay tự chọn hành động.
- Tài liệu TypeSafe `https://docs.typesafe.ai/concepts/how-to-build-with-system-one` khuyến nghị giữ control flow/side effects trong code, dùng câu hỏi hẹp/atomic, hỏi song song trên cùng state và compose kết quả bằng code.
- Mã nguồn hiện tại chứng minh lớp riêng cần loại bỏ: `typesafe-planner.ts:2010-2065` gọi `policyClient.judgeWithPolicy`; `typesafe-planner.ts:2096-2305` đăng ký semantic tools; `src/semantic-judge-client.ts:54-71` đọc API key và gọi policy transport; `typesafe-enabled-resolver.cjs:505-539` đọc `~/.claude/.ck.json`.
- Seam `ctx.judge` trong `src/egc-judge.ts:26-39` là kiểu do extension tự định nghĩa, không chứng minh OMP cấp callback; `ExtensionAPI` nội bộ trong `typesafe-planner.ts:136-153` cũng không khai báo `judge`. Phải kiểm tra API của host thực tế ở giai đoạn 3, sau khi đã xác minh Jev và luồng đánh giá nguyên tử ở giai đoạn 1–2.

## Ma trận caller và dependency

| Caller | Hiện trạng | Đích đến | Bất biến kiểm thử |
|---|---|---|---|
| `src/verification-gate.ts` | `createSemanticJudgeClient`, câu hỏi `noul` | native `judge` adapter, `bool` | Gate 1/evidence vẫn tất định; lỗi host là `UNAVAILABLE` |
| `src/cook-expert-judge.ts` | expert/native-done/drop client qua policy HTTP | native `judge`, giữ `choice`/`score`, đổi Noul thành `bool` | rubric/threshold/raw answer không đổi |
| `src/plan-evaluator.ts` | đọc `TYPESAFE_API_KEY`, policy client | native `judge` | không đọc credential/endpoint riêng |
| `src/bicameral-consensus.ts` | `createSemanticJudgeClient` decision | native adapter | child/advisor pass không tự thành parent approval |
| `src/debate-evaluator.ts` | policy transport trực tiếp | `judgeBatch` hoặc nhiều câu hỏi cùng state | unavailable fail-closed, không synthetic score |
| `src/egc-judge.ts` | có `ctx.judge` nhưng còn fallback policy | host callback duy nhất | không direct HTTP |
| `src/task-verification-macro.ts` | nhận semantic client từ planner | nhận native judge adapter | cache key và unchanged rejection giữ nguyên |
| `src/atomic-judge.ts`, `src/atomic-evaluation.ts` | policy transport cho H shadow | host judge/batch | H vẫn shadow-only, không cấp native authority |
| `typesafe-planner.ts` health | ping TypeSafe riêng | chỉ capability/status host hoặc bỏ semantic ping | ONLINE không được coi semantic approval |
| `typesafe-planner.ts` registrations | 16 custom tools/lifecycle controls | xóa custom semantic/lifecycle surface; giữ internal functions cần thiết | tool discovery chỉ thấy native OMP + tools thật sự cần cho extension |

## Ma trận dependency cần dọn

- `src/typesafe-api-client.cjs`: trước hết tách/giữ redaction primitive nếu còn caller; xóa phần HTTP/credential/retry sau khi graph sạch.
- `src/typesafe-policy-client.cjs`: giữ policy validation thuần nếu còn dùng; xóa `judgeWithPolicy`/scheduler transport sau khi mọi caller chuyển.
- `src/semantic-judge-client.ts`: đổi thành native adapter tối thiểu hoặc xóa nếu host injection dùng trực tiếp; không giữ tên façade cho HTTP.
- `src/typesafe-enabled-resolver.cjs`: xóa khỏi activation/dispatch; không đọc `~/.claude/.ck.json`.
- `typesafe-planner.ts`: xóa `executeTypeSafe`, `createExtensionJudgeClient`, custom semantic registration và health HTTP probe sau migration; giữ evidence/contract hooks.
- `.claude` path guards trong `src/evidence-collector.ts`, `src/evidence-privacy.ts`, `src/verification-gate.ts`: giữ nguyên vì là security boundary.

## Các cổng triển khai (implementation gates)

1. **Cổng A — Jev bản địa độc lập:** đọc cấu hình hiệu lực, danh mục mô hình (model catalog), định tuyến `judge` và nguồn xác thực trên **đúng bản OMP đang chạy**; ghi ID Jev và URL cơ sở (base URL) thực tế trước khi quyết định có cần cấu hình. [Tài liệu mô hình OMP](https://github.com/can1357/oh-my-pi/blob/main/docs/models.md) mô tả các model TypeSafe native và cách nối `{baseUrl}/v1/systemone`, nhưng ví dụ trong tài liệu không chứng minh thiết lập phiên này. Sao lưu cấu hình trước thay đổi, không ghi khóa vào repo hoặc `.claude`. Chạy `eval` smoke `choice`, `bool`, `score` trên dữ liệu không nhạy cảm; câu trả lời của `judge()` chỉ mang đáp án, nên chứng minh nguồn Jev bằng bản ghi sử dụng (usage ledger) hoặc nguồn gốc backend khác **do host công bố**, không suy diễn từ `ONLINE`, thời gian đáp ứng hay đáp án đúng.
2. **Cổng B — quy trình nguyên tử (atomic workflow):** chỉ chạy sau khi Cổng A xác minh backend Jev. Chạy một state nhiều câu hỏi và nhiều state qua `judge_batch`/`judgeBatch`, kiểm tra thất bại từng item, không đẩy quyết định hay side effect sang Jev. Nếu Cổng A chưa chứng minh provenance Jev, đánh dấu `BACKEND_UNVERIFIED`, ghi output quan sát được và dừng; không coi output của fallback tiny/smol là native-Jev pass. Không dùng `noul` trong prelude: TypeSafe Noul ↔ OMP `bool` với trường xác suất `.bool`.
3. **Cổng C — chỉ cho migration extension:** đọc API của **bản host đang chạy** để xác nhận callback `judge` chính thức trong extension. Nguồn OMP upstream hiện chưa có callback này: khi chưa đạt, ghi `HOST_BRIDGE_REQUIRED` và **chỉ dừng migration extension (Phase 3–5)**; Phase 1–2 vẫn được làm và xác minh. Việc phát triển bridge thuộc repository OMP upstream với contract được host phê duyệt, không tự sửa runtime hoặc dựng fallback trong workspace này.
4. **Cổng D — todo:** chỉ tạo danh sách native khi Phase liên quan có thể hoàn tất; từng lệnh chỉ dùng native input, kiểm tra matching settled Core result. External wait cần báo cáo công khai với exact goal, owner, next action, observable unblock condition, resume command; không block/drop/rm để che nợ.

## Tiêu chí hoàn tất

- Cổng A và B có output quan sát được chứng minh native `judge` chọn Jev và trả cấu trúc hợp lệ; không tính status `ONLINE` là semantic pass.
- Nếu Cổng C còn `HOST_BRIDGE_REQUIRED`, báo phần native Jev/atomic workflow đã xác minh riêng và **không** tuyên bố extension migration, xóa transport, sửa todo lifecycle hoặc deployment đã xong.
- Khi Cổng C đạt, mọi semantic caller trong extension đi qua đúng API host; đường production không còn HTTP/API key/provider selection riêng hoặc custom semantic/lifecycle `registerTool`.
- Evidence/policy tất định, guard đường dẫn riêng tư và native todo contract giữ nguyên; không dùng kết quả con như parent integration.
- Chạy toàn bộ test file bị ảnh hưởng, `bun test`, smoke changed-path, dry-run sync sạch rồi mới triển khai có backup/rollback.
- Không hứa mọi `todo` đều được hoàn tất: chỉ tạo danh sách sau khi tiền đề của phase đạt, hoàn tất phải có settled Core result khớp task; khi chờ ngoài, lưu báo cáo phục hồi, không xóa nợ.

## Lệnh bàn giao cho phiên mới

Trước tiên chạy validation của kế hoạch; chưa chạy `ck:cook --auto` trong trạng thái hiện tại vì Cổng A/B chưa có provenance Jev thực tế và Cổng C chưa có extension bridge.

```text
/ck:plan validate D:/100.Software/Github/omp_extension/plans/261027-native-omp-judge-typesafe-migration/plan.md
```

Sau validation, phiên mới chỉ được thực hiện Phase 1–2: discovery cấu hình hiệu lực, backup có điều kiện, native `judge` smoke và atomic batch smoke. Nếu không xác minh được role/model/backend provenance, dừng với `BACKEND_UNVERIFIED` hoặc `UNAVAILABLE` đúng nguyên nhân. Nếu backend đạt nhưng chưa có extension bridge, dừng riêng migration extension với `HOST_BRIDGE_REQUIRED`; không chạy Phase 3–5, không tạo todo chờ bridge, không chạy todo smoke/deploy extension. Không dùng output `eval` làm receipt hay authority cho native todo.

## Rollback

Mỗi phase phải giữ diff nhỏ và có test trước/sau. Nếu native adapter hoặc caller migration fail: revert phase hiện tại, giữ evidence/log, không xóa receipt và không thay đổi native todo để che failure. Nếu deploy đã bắt đầu: chỉ dùng transaction rollback của `tools/sync-baseline.cjs`; không sửa proxy toàn cục trực tiếp. Chỉ restart OMP sau khi workspace verification và deploy verification pass.

## Nhật ký kiểm định kế hoạch (Validation Log)

### Phiên 1 — 2026-10-27

**Kích hoạt:** Người dùng yêu cầu dùng OMP judge bản địa để chạy Jev trước, sau đó mở rộng thành các phán đoán nguyên tử; loại bỏ lớp tool TypeSafe riêng và tránh todo bị chặn.

#### Kết quả xác minh mã nguồn/tài liệu

- **Đã xác minh:** Kế hoạch có đúng năm phase và năm phase file tương ứng; CLI `plan-cli status` đọc đúng năm phase.
- **Đã xác minh:** OMP `eval` công bố `judge` với `choice`, `bool`, `score` và `judge_batch`/`judgeBatch`; nhiều câu hỏi trên cùng state dùng một request, nhiều state dùng batch.
- **Đã xác minh:** Tài liệu TypeSafe System One mô tả state + câu hỏi typed, output có cấu trúc/xác suất, control flow và side effect do code sở hữu.
- **Đã xác minh:** `typesafe-planner.ts` hiện đăng ký các nhóm `typesafe_*` semantic/lifecycle; inventory cắt chuyển đã được ghi ở Phase 3–4.
- **Đã xác minh:** `typesafe-planner.ts:2010-2065` và `src/semantic-judge-client.ts:54-71` hiện có đường transport riêng; `typesafe-enabled-resolver.cjs:505-539` hiện đọc cấu hình `.claude` cho activation.
- **Đã xác minh:** Mã nguồn `ExtensionContext` OMP upstream không khai báo callback `judge`; `judge()` hiện là helper của `eval`. Đây là tiền đề `HOST_BRIDGE_REQUIRED` chỉ cho migration semantic caller của extension.
- **Chưa xác minh:** Cấu hình hiệu lực hiện tại có role Jev nào, ID model nào, base URL nào, credential source nào và backend provenance nào; thao tác `cfg://modelRoles/judge` không tồn tại trong phiên này. Phase 1 phải discover từ host thật, không hardcode.
- **Chưa xác minh:** Smoke native Jev, `judge_batch` và native todo trong phiên triển khai mới; không dùng kết quả transport `ONLINE` cũ làm receipt.

#### Các điểm cần người dùng xác nhận

1. Cấu hình Jev: kiểm tra cấu hình hiệu lực trước; chỉ sửa nếu native judge probe thất bại vì cấu hình, luôn backup và không ghi credential vào repo.
2. Cầu nối extension: giữ Phase 3–5 chờ `HOST_BRIDGE_REQUIRED` nếu host chưa công bố callback judge; không tạo façade hoặc quay lại custom tool.
3. Todo: không tạo native todo cho công việc Phase 1–2 khi chưa có đường closure hợp lệ; chỉ tạo một danh sách native sau khi phase có thể hoàn tất theo host contract.
4. Atomic workflow: dùng `eval` judge cho câu hỏi nguyên tử không side effect; output chỉ là tín hiệu hỗ trợ, không phải receipt completion.

#### Khuyến nghị

Sau khi xác nhận bốn điểm trên, chạy Phase 1–2 ở phiên OMP mới. Nếu Phase 1 không chứng minh được backend Jev hoặc Phase 2 không chứng minh được batch/provenance, dừng trước migration extension và ghi `UNAVAILABLE`/`EVIDENCE_REQUIRED` đúng nguyên nhân.

### Ghi chú trạng thái phiên

- `read cfg://modelRoles/judge` đã trả `Unknown setting`; đây là bằng chứng rằng đường dẫn cấu hình chưa được xác minh, không phải bằng chứng role thiếu.
- `set-active-plan.cjs` chỉ trả cảnh báo `CK_SESSION_ID not set` và `Would set`; không coi active-plan state đã được lưu. Phiên mới phải dùng đường dẫn tuyệt đối ở trên.
- `HOST_BRIDGE_REQUIRED` là trạng thái chưa đạt của migration extension, không phải thành công thay thế. Phase 3–5 chỉ hoàn tất khi bridge và đường evidence/review native tương ứng đã được kiểm chứng.

### Cập nhật discovery read-only — 2026-10-27

- `omp config path` trả `C:\Users\thant\.omp\agent`; đường dẫn hiệu lực đã được quan sát.
- `omp config --help` xác nhận các thao tác `list`, `get`, `set`, `reset`, `path`, `init-xdg`; không dùng `config list --json` sau khi đã phát hiện output cấu hình có nguy cơ chứa credential.
- `omp config get modelRoles.judge --json` trả `Unknown setting`; chỉ kết luận khóa dotted này không được CLI resolve, không kết luận role không tồn tại.
- `omp models find jev --json` trả `{"models":[]}`.
- `omp models typesafe --json` trả `{"models":[]}`.
- **Đính chính Cổng A:** Hai truy vấn `find jev` và `typesafe` trả rỗng nhưng không chứng minh Jev vắng khỏi catalog; `--kind all` bên dưới cho thấy các model có `kind: "judge"`. Vai trò cấu hình đã trỏ tới `typesafe/jev-latest`; chưa có smoke hay nguồn gốc request thực tế, nên trạng thái vẫn `BACKEND_UNVERIFIED` về **backend được sử dụng**, không phải thiếu model catalog.
- **Credential safety:** một lần đọc raw cấu hình trước đó đã làm lộ credential trong transcript/tool output. Không đọc lại raw config, không ghi secret vào report/plan, không commit/sync config. Người vận hành phải rotate/revoke credential, bảo vệ transcript/artifact/log, rồi khởi động OMP phiên mới trước discovery hoặc smoke tiếp theo.
- **Todo/lifecycle:** không đánh dấu bảy mục native hiện tại hoàn tất, không retry mutation custom, không chạy code/test/deploy. Sau rotation/restart, xác minh nguồn gốc request Jev bằng cơ chế host trước khi công nhận Phase 1; không dùng output từ truy vấn `find` mặc định để kết luận model thiếu.

### Ranh giới kiểm định và trạng thái dừng

- **Đã chạy kiểm tra cấu trúc:** `plan-cli status` với đường dẫn tuyệt đối đọc đúng năm phase và tất cả ở trạng thái `Pending`; kiểm tra placeholder/hunk lỗi trong thư mục plan không có kết quả.
- **Chưa chạy:** `/ck:plan validate` đầy đủ (phỏng vấn/verification workflow), Phase 1 thực thi, Phase 2 thực thi, native `judge`, `judge_batch`/`judgeBatch`, test changed-path, todo smoke, sync hoặc deployment.
- **Lý do dừng:** credential exposure cần rotation/revoke và bảo vệ transcript/artifact/log; catalog đầy đủ đã có Jev native nhưng chưa smoke `judge()` hay xác minh backend thực tế, nên Cổng A vẫn `BACKEND_UNVERIFIED`.
- **Hệ quả:** không đánh dấu phase, todo hoặc migration hoàn tất; không dùng reminder lifecycle để vượt qua blocker; không thể hoàn tất bảy todo hiện tại qua custom lifecycle tools đang unavailable.

### Kiểm tra catalog bổ sung — read-only

- Đã phân tích **toàn bộ JSON lưu trong artifact của** `omp models --kind all --json` (179 bản ghi), chỉ trích xuất bốn model khớp Jev/TypeSafe cùng `kind`, không trích xuất credential: `commandcode/typesafe/jev` (`judge`), `typesafe/jev-1.14.0` (`judge`), `typesafe/jev-latest` (`judge`), `typesafe/jev-preview` (`judge`).
- Lệnh `omp models find jev --json` và `omp models typesafe --json` không kèm `--kind all` đều trả danh sách trống trong phiên này; hai kết quả đó **không** chứng minh Jev thiếu catalog. Lệnh lọc `findstr` trên JSON một dòng cũng không phải bộ lọc bản ghi: output bị cắt nên không thể kết luận vắng mặt.
- Catalog hiện expose Jev native và cấu hình từng được quan sát trỏ `modelRoles.judge` tới `typesafe/jev-latest`; chưa chứng minh lần gọi `judge()` thực sự dùng Jev, credential hợp lệ hoặc backend provenance. Không chạy `models refresh`, không gọi `judge`, không đọc raw credential config, không chạy code/test/deploy và không mutate todo.
- **Kết luận chính xác:** catalog có model native Jev; trạng thái `BACKEND_UNVERIFIED` chỉ còn áp dụng cho định tuyến/credential/backend của request thực tế. Sau rotation/restart mới kiểm tra smoke an toàn và bản ghi nguồn gốc (provenance) do OMP công bố.
