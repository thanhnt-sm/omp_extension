---
title: "Prediction Report: JEV atomic evidence, Advisor synthesis và parent acceptance"
status: completed
---
# Prediction Report: JEV atomic evidence, Advisor synthesis và parent acceptance

Ngày: 2026-10-19. Yêu cầu: `ck:predict`, red-team, nghiên cứu online, `ck:scenario`, tính toán/so sánh và giải pháp. Phạm vi: thiết kế có bằng chứng; chưa triển khai runtime hoặc gọi live JEV để benchmark.

## Verdict: CAUTION

**Đúng hướng: JEV nên kiểm các judgment hẹp, có evidence đủ và rõ. Không đúng nếu suy ra phải băm mọi todo thành việc li ti, JEV tự quyết định hoàn tất, hoặc mọi plan lớn đều bắt human duyệt.**

Khuyến nghị: **repaired-M → H shadow → conditional cutover**. M là workflow hiện tại sau khi sửa lỗi evidence/authority đã chứng minh. H giữ task hierarchy, dùng JEV cho predicate ngữ nghĩa hẹp, Advisor reasoning thật cho synthesis/integration, human theo thẩm quyền/rủi ro hiện có. A, biến thể “child JEV pass hết thì parent done”, bị loại.

Kích thước todo không phải tiêu chí đủ. Một report dài có thể chỉ cần kiểm một quan hệ claim–source; một todo một dòng “thiết kế auth an toàn” vẫn là reasoning phức tạp.

## Agreements (all personas align)

- Code sở hữu workflow, deterministic checks và side effects; JEV không sinh implementation, root cause hay kế hoạch khắc phục mở.
- Sửa nguồn evidence, original contract và authority composition trước; decomposition không phục hồi bằng chứng đã mất hoặc bị gán sai.
- Giữ original obligations và parent integration. Child pass không chứng minh toàn hệ thống đạt yêu cầu.
- Advisor khuyến nghị không phải human authorization; semantic receipt không phải native commit.
- Missing evidence, contradiction, outage và authority conflict là các trạng thái khác nhau; không chữa HTTP503 bằng sửa implementation.
- Không có số đo cho thấy H chính xác/rẻ/nhanh hơn trên workload này. Phải so với **repaired M**, không chỉ với đầu vào hiện tại đang lỗi.

## Independent analyses and debate

Năm phiên phân tích riêng đọc cùng contract/evidence, không đọc kết quả nhau ở vòng đầu. Sau khi đủ năm kết quả, parent đưa các xung đột cụ thể cho vòng phản biện. Đây là analytical subagents của `ck:predict`, không phải Agent Teams; `TeamCreate` không được runtime cung cấp.

| Persona | Vòng độc lập | Sau phản biện |
|---|---|---|
| Architect | CAUTION, ưu tiên H | Đồng ý repaired-M trước, H shadow sau; chưa cutover |
| Security | CAUTION, ưu tiên H có ràng buộc authority | Đồng ý có điều kiện; shadow không được mutation hoặc xuất dữ liệu ngoài policy |
| Performance | CAUTION, ưu tiên H có accounting | Đồng ý trình tự; global batch có thể rẻ hơn H; phải đo tổng chi phí |
| UX/DX | CAUTION, ưu tiên H; không human-every-plan | Đồng ý hướng thiết kế; tách lifecycle khỏi verification, bảo toàn research completion |
| Devil’s Advocate | CAUTION, ưu tiên sửa M trước | Conditional GO cho phép so sánh, không cho promotion; dừng ở M nếu đủ tốt là hợp lệ |

GO ở vòng hai là đồng ý **hướng nghiên cứu có gate**, không phải approval của runtime hoặc task bị reject.

## Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|---|---|---|---|---|---|---|
| Làm H ngay hay sửa M trước | H là hướng kiến trúc tốt | Cần vá authority trước | Không quy lợi ích sửa plumbing cho decomposition | Sửa error state trước | Sửa M có thể đã đủ | Sửa correctness làm baseline; H chỉ shadow |
| Tiny todo hay tiny judgment | Giữ hierarchy | Decomposition không cấp quyền | Request lẻ gây nhân context | Tránh tracker hàng trăm item | Chia quá nhỏ làm mất quan hệ | Todo có ý nghĩa; predicate hẹp bên trong |
| Một global batch hay nhiều packet | Evidence phải đủ quan hệ | Packet phải có provenance | Global batch có thể rẻ nhất | Reason gắn criterion dễ hiểu | Không coi context thêm luôn là rác | Batch theo coherent evidence; so sánh cùng coverage |
| Mọi parent cần human? | Advisor xem integration | Human theo authority | Human/reasoning cost không miễn phí | Tránh prompt vô ích | Model advice không thay authority | Advisor cho synthesis; human theo policy/rủi ro, không theo độ dài |
| Retry với cùng artifacts | Cần binding/freshness | Không retry-to-pass | Backoff một owner, deadline chung | Outage recovery không đòi fake edit | Sampling tới pass làm tăng rủi ro | Unavailable có thể retry khi dịch vụ hồi phục; semantic reject cần proof mới liên quan |

## Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| Hạ parent obligation thành checklist nhỏ rồi approve | Critical | Coverage do reviewer độc lập đối chiếu contract gốc; integration evidence riêng |
| Current native bỏ qua consensus hoặc marker EGC tắt gate | Critical | Sửa authority trước, host-attested handoff; shadow không có effect |
| Fake JEV approval khi dịch vụ lỗi | High | UNAVAILABLE là trạng thái thật, không default/heuristic approval |
| Retrieval/cắt head làm mất proof, gán sai task | High | Span/path/revision/coverage/omission rõ; evidence thiếu thì abstain |
| Cùng một summary sai đánh lừa mọi predicate và Advisor | High | Reviewer đọc source độc lập, negative controls, task-level labels; không nhân confidence |
| Nhiều predicate làm false block tăng | High | Đo task-level false rejection và abstention; tránh check trùng, route uncertain sang reasoning |
| Untrusted artifacts/approval text thành authority | Critical | Typed allowlist, provenance và trusted human receipt; enclosure không phải authentication |
| Shadow vẫn làm lộ dữ liệu | High | Allowlisted evidence, redact trước egress, không private thinking, policy retention rõ |
| H tốn hơn repaired M/global batching | Medium | Đo usage + retrieval + Advisor + retries + human time; không quảng cáo tiết kiệm chung |

## Recommendations

1. **Không tự động đổi todo/plan lớn sang một gate JEV khác để lấy approve.** Giữ hợp đồng, task hierarchy và authoritative operation hiện có cho đến khi một cutover được phê duyệt/kiểm chứng.
2. **Sửa tính đúng trước:** durable contract, task-relative diff, full commit interval, test/artifact receipt, lifecycle rehydration, error taxonomy và authority composition. [Source review](261019-typesafe-source-rootcause-review.md) chứa các repro cụ thể.
3. **Chuyển đơn vị đánh giá thành một quan hệ ngữ nghĩa có scope.** Mỗi predicate có criterion ID, claim, evidence đủ và giới hạn kết luận. Không hỏi “toàn plan này production-ready chưa?” từ một diff đã cắt.
4. **Dùng reasoning Advisor thật** đọc evidence để giải thích/synthesize/rootcause. Hàm heuristic nội bộ đang mang tên Advisor không làm công việc đó.
5. **Giữ kiểm chứng tích hợp ở parent.** Child hoàn tất không thay contract coverage, compatibility/runtime smoke, review risk hoặc matching native commit.
6. **Đánh giá H trong shadow**, cùng contract/evidence với repaired M, label whole-task độc lập, metric có uncertainty; không đổi threshold/rubric để đạt kết quả.
7. Chỉ sau đó xem xét [roadmap triển khai có điều kiện](../261019-jev-atomic-review/plan.md). Cả ba phase vẫn pending; không có runtime/deployment được thực thi trong lượt này.

## Online best practices: bằng chứng và cách áp dụng

### 1. Narrow judgment, không phải reasoning agent

[TypeSafe primitives](https://docs.typesafe.ai/primitives.md) yêu cầu focused snap judgment; [coding agents](https://docs.typesafe.ai/introduction/coding-agents.md) nói JEV không trò chuyện, viết code hay tự chọn hành động. [Building guide](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md) đặt deterministic flow trong code.

**Áp dụng:** cho JEV kiểm một quan hệ claim/evidence hoặc phân loại giới hạn; Advisor tìm root cause và thiết kế remediation; human giải quyết thẩm quyền. Không yêu cầu thêm `explanation` tự do từ JEV như thể nó là generative model.

### 2. Evidence vừa đủ, không phải ngắn bằng mọi giá

[State](https://docs.typesafe.ai/concepts/state.md) khuyến nghị named JSON fields với quan hệ rõ. [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md) cảnh báo indirection, irrelevant context và instructions/criteria mâu thuẫn.

**Áp dụng:** retrieve theo criterion, giữ toàn hunk/hàm/callsite liên quan và counterevidence. Một snippet không đủ chứng minh “không có lỗi ở bất kỳ đâu”. Bản gốc tiếng Việt được giữ nguyên; normalized English có thể là experimental arm riêng, không tự thay nghĩa hoặc giả định accuracy tương đương.

### 3. Deterministic trước, semantic sau

[Citation-check cookbook](https://docs.typesafe.ai/cookbooks/citation_check.md) dùng string match tìm quote trước, sau đó Choice kiểm quan hệ supports/contradicts/says-nothing.

**Áp dụng:** exit code, schema, file/hash/path và native result identity do code kiểm. JEV không đếm test hoặc suy lại một giá trị code đã biết. Citation đúng chỉ chứng minh quan hệ ở phạm vi đó, không toàn bộ kết luận nghiên cứu.

### 4. Batching, không request-per-microtodo

[Parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions.md) cho independent questions dùng chung state trong một request. Cookbook ghi 12,2× rẻ, 10× nhanh trên **13 câu hỏi, tài liệu GDPR, JEV 1.12, cached run, singles tuần tự**. Không dùng các hệ số đó làm benchmark của extension này; singles chạy concurrent có latency khác.

**Áp dụng:** gom các predicate dùng chung evidence. Nếu B cần kết quả A để lấy evidence, chúng là hai bước phụ thuộc, không “độc lập” chỉ vì ở hai todo.

### 5. Confidence và error không phải permission

[Confidence](https://docs.typesafe.ai/confidence.md): Choice/Score confidence là concentration của distribution; Noul là P(yes), không có confidence riêng. API independence không bảo đảm lỗi giữa các câu hỏi độc lập thống kê.

**Áp dụng:** không đồng nhất score=độ hoàn thành, không lấy confidence của REJECT thành xác suất đúng của APPROVE, không lấy trung bình để bù một invariant fail. Ngưỡng lựa chọn theo risk/dataset, không từ một hằng số phổ quát.

### 6. Cascade cho reasoning khó

[SDE cascade](https://docs.typesafe.ai/cookbooks/sde_cascade.md) minh họa verifier hẹp phát hiện lỗi rồi escalation sang reasoning model. Đây là pattern thiết kế, không phép đo workload hiện tại; cookbook khác model/version và chứa dữ liệu cached/synthetic minh họa.

### 7. Giới hạn phải đúng đơn vị

[API](https://docs.typesafe.ai/api.md): body tối đa 32 MiB. [Models](https://docs.typesafe.ai/models.md): default 64k token/request, 32k token/question; state tính trong cả hai; alias có thể đổi và response `model` cho version thực. 32 KiB và các mức 2.000/5.000/14.000 ký tự trong repo là local policy, không giới hạn API. Không bật long context tự động hoặc bỏ local cap chỉ để lấy pass.

## Giải pháp H: contract, packet, receipt, synthesis

### Quy tắc routing

- **Deterministic:** test exit/observed smoke, schema, source identity, task/operation match, freshness; không gọi model để tính lại.
- **JEV:** một hoặc vài semantic predicates có cùng evidence universe. Kết quả là tín hiệu typed, không native permission.
- **Advisor:** reasoning/cross-file synthesis, contract coverage, parent integration, root cause và remediation có evidence; read-only.
- **Human:** genuine scope waiver/cancellation conflict, protected risk hoặc authority hiện hành. Không biến mọi review lớn thành một human prompt.

Research task không cần giả code diff/test run để có “implementation evidence”; code task vẫn cần runtime proof phù hợp. Những artifact có sẵn nhưng không nằm trong current diff vẫn có thể là bằng chứng nếu identity/provenance hợp lệ; không biến changedFiles thành toàn bộ tri thức được phép dùng.

### Packet tối thiểu về ngữ nghĩa

```json
{
  "binding": {
    "mode": "shadow",
    "operation": "done",
    "task_id": "T-map",
    "criterion_id": "C-runtime-provenance-claim",
    "contract_revision": 3,
    "evidence_revision": "snapshot-id"
  },
  "criterion": "The cited source supports the stated runtime-provenance claim.",
  "claim": "Matching workspace and deployment disk hashes proves every imported TypeScript module in loaded memory has the same code.",
  "evidence": {
    "path": "plans/reports/261019-typesafe-source-runtime-map.md",
    "range": "5",
    "source_text": "Disk equality does NOT attest all imported TypeScript in loaded memory or any historical session.",
    "coverage": "Explicit provenance limitation; not a measurement of loaded memory"
  },
  "omissions": ["No imported-module loaded-memory attestation is supplied."]
}
```

Đây là **packet thiết kế**, không request đã gửi hoặc code đã triển khai; các binding ID/revision là minh họa. `source_text` là câu thật trong map đã xuất bản. Claim cố ý trái với nguồn để minh họa một negative case có đáp án có thể adjudicate; chưa gọi JEV để đo kết quả. Binding chỉ chứa identity cần thiết; code giữ full contract và references, không xuất toàn transcript/thinking.

Câu hỏi đề xuất: “How does `evidence.source_text` relate to `claim`, under `criterion`?” Options có nghĩa chính xác: `supports`, `contradicts`, `insufficient_evidence`. `supports` chỉ xác nhận claim trong scope packet; không có nghĩa task/parent đã hoàn tất. Code và reasoning review giữ nguyên obligations khác.

Receipt giữ hash payload thật sau transformation, criterion/rubric/policy identity, requested/resolved model, outcome và applicability. Cached semantic receipt không cached human authorization; rebind operation/targets/revision khi native stage/commit. Không hứa ACID giữa filesystem và todo nếu host không cung cấp primitive đó.

### Recovery contract

| Verification state | Hành động | Không được làm |
|---|---|---|
| EVIDENCE_REQUIRED | Thu thập proof/counterevidence còn thiếu | Suy requirement bị lỗi hoặc ép sửa code |
| REJECTED | Advisor đọc exact criterion/evidence, chẩn đoán rồi remediation đúng scope | Retry unchanged để săn approve |
| UNAVAILABLE | Khôi phục dependency theo bounded backoff/cooldown | Gọi đó là semantic reject hoặc giả approval |
| HUMAN_REQUIRED | Trusted host xác nhận đúng operation/targets theo policy | Dùng lời Advisor/model làm consent |
| APPROVED_PENDING_COMMIT | Kiểm binding rồi đợi native result đúng | Tuyên bố done từ staging |

Lifecycle `blocked` riêng biệt: policy hiện tại đòi trusted UI khi block task đã reject; headless vẫn giữ task/debt và báo limitation. Verified auto-removal của obsolete/satisfied work được giữ; scope waiver mới không tự suy từ keyword.

## Tính toán so sánh — giả định công khai, không benchmark

Cùng **80 predicate**: N=20 work units, k=4 predicate/unit. Local packet s=1.500 token; mỗi question q=120; overhead h=100/request; global state S=12.000 token. S nhỏ hơn tổng 20×s giả định có evidence trùng/curation khác nhau; phải kiểm equivalent coverage, không mặc định global context là rác. Không retry/cache/Advisor/human/evidence-collection/integration cost trong bảng.

Giá input tham chiếu từ Models hiện tại: $0,042/1M token; output free. Token counts dưới đây là phép tính từ giả định, không tokenization/API usage thật.

| Cách đặt cùng 80 predicate | Requests | Token input giả định | Chi phí JEV giả định, USD |
|---|---:|---:|---:|
| 80 request riêng, mỗi lần gửi full context | 80 | 977.600 | 0,0410592 |
| Một global batch với đủ 80 question | 1 | 21.700 | 0,0009114 |
| 80 request riêng với small packet | 80 | 137.600 | 0,0057792 |
| H: 20 coherent packets, mỗi packet 4 question | 20 | 41.600 | 0,0017472 |

Global batch là **batching/context ablation**, không literal hiện trạng M vốn có bốn macro questions. Một request bốn câu hỏi toàn plan cũng không tương đương coverage của 80 predicate; không so chúng như cùng chất lượng.

- H giảm **69,77% modeled token** so small singles, nhưng dùng **1,917×** global-batch tokens.
- Không biết global batch hay H có accuracy tốt hơn trên workload này; cần paired evaluation.
- Concurrency=4 cho số request-waves lý tưởng lần lượt 20/1/20/5, không phải số đo wall time. Payload/service time, TPS/RPS, queue và retries có thể đổi thứ tự.
- Tổng chi phí phải cộng usage của mọi attempt, retrieval, real Advisor, integration verification và human workload. Existing native output hiện bỏ usage/model metadata, cần sửa accounting trước khi khẳng định savings.

Công thức khi k chia hết cho b:
`R_singles=N*k`, `R_batch=N*k/b`;
`T_singles=N*k*(s+q+h)`, `T_batch=(N*k/b)*(s+b*q+h)`.
Với packet không đồng đều, cộng từng packet thực; không dùng một cap/tỷ lệ giả định cho mọi task.

### False-block amplification và retry-to-pass

Nếu **giả định** một plan hoàn toàn đúng, 80 checks độc lập thống kê, mỗi check false-reject 1%, xác suất có ít nhất một false reject là `1-0.99^80 = 55,25%`. Với 0,1%/check là `1-0.999^80 = 7,69%`. Đây không phải độ chính xác đo được của JEV; lỗi thường tương quan nên không được dùng phép nhân làm cam kết.

Nếu một semantic decision sai có false-accept 5%, thử ba lần độc lập rồi lấy bất kỳ pass nào thì rủi ro ít nhất một pass sai là `1-0.95^3 = 14,26%`. Nếu outputs tương quan/deterministic, công thức không áp dụng; điều đó không làm retry-to-pass trở thành bằng chứng tốt.

Kết luận: không thêm check trùng chỉ để tạo cảm giác chắc chắn; không hạ threshold, không repeated sampling để chọn kết quả thuận lợi.

## Scenario và evaluation gates

[Scenario report](261019-jev-atomic-scenarios.md): **36 case / 12 dimensions**; 13 Critical, 17 High, 6 Medium. Bảng phân biệt observed-source repro, existing suite, calculations và design-only; không tuyên bố 36 production tests pass.

Đã chạy counterexample writer/reader: hai unit assertions đều pass nhưng integration fail do schema không tương thích. Truth table minh họa 256 cấu hình cho thấy child-only completion nhận cả cấu hình thiếu điều kiện khác; không dùng con số đó như error rate production.

Trước promotion:
1. Human-adjudicated whole-task labels và holdout theo task/project, không split ngẫu nhiên các child của cùng một parent vào train/test.
2. Current vs repaired-input comparison trước; repaired M vs H sau; ablation duplicate questions/Advisor overhead; original obligations và relevant evidence tương đương.
3. Đo false approval, false rejection, abstention, correct escalation và integration recall ở mức **task/parent**, thêm language strata, latency/usage/cost/reviewer burden.
4. Negative cases gồm missing/reordered/truncated evidence, dirty baseline, multi-commit, injected claims, negation, stale operation, unavailable service và children-pass/parent-fail.
5. Freeze policy/model/rubric trước holdout. Không đổi original acceptance meaning để thắng evaluation. Shadow không mutation và vẫn cần privacy approval cho external data.
6. Đặt risk/workload criteria trước khi nhìn kết quả. Không có corpus/criteria thì chưa đủ promotion, không bịa một approval từ persona agreement.

Ví dụ uncertainty, không phải dataset đã thu: nếu 0 false approve trên 300 negative cases độc lập/đại diện, exact one-sided 95% upper bound vẫn khoảng **0,994%**, không 0%. Với 3.000 case là **0,0998%**. Mức rủi ro chấp nhận phải do domain/authority quy định; synthetic cases không tự đại diện traffic thật.

## Deliverables và trạng thái thực tế

- [Implementation-ready roadmap](../261019-jev-atomic-review/plan.md): prerequisites → shadow evaluation → conditional cutover, tất cả pending.
- [Source review](261019-typesafe-source-rootcause-review.md): lỗi hiện tại và kiểm chứng.
- [Source/runtime map](261019-typesafe-source-runtime-map.md): graph/provenance/limits.
- [Scenarios](261019-jev-atomic-scenarios.md), [calculation inputs/results](261019-jev-design-calculations.json).
- Unmodified full suite: 357 pass, 0 fail. Actual-source diagnostic smokes dùng fake fetch đã chạy; không phải live JEV benchmark.

### Checkpoint trước quyền implementation

Original mapping task bị native gate reject P=.13, chưa có native completion. Fresh actual-source packet verification đã phát hiện lỗi cụ thể: map-only control giữ đủ proof dưới research rubric; năm report thật cùng xuất hiện làm JSON report kích hoạt code_change và đẩy map khỏi artifact cuối. Full affected-module + scratch run: **173 pass / 2 fail**; separate smoke exit 1. Final artifact vẫn có vài report khác; unified diff còn map path nhưng mất limitation cốt lõi. Đây là reconstructed report-only fixture, không wire lịch sử của Main và không benchmark JEV. Không đổi report names/content hoặc baseline để né failure; chưa sửa runtime. Evidence: `local://typesafe-map-packet-observed.json` và F16 trong source review. Báo cáo phân tích hoàn thiện không đồng nghĩa tracker/gate đã approve.

## Unresolved questions

- Task-level false-approve/false-reject/risk targets, representative adjudicated corpus, org quotas/SLOs và real Advisor/human cost chưa được đo/đặt.
- Host có primitive mutation-time evidence precondition hay chỉ revision check? Chưa được chứng minh; không hứa atomic workspace/todo consistency.
- Exact wire/full answers/resolved model của original P=.13 không có; không quy event đó chắc chắn cho kích thước todo hoặc một finding cụ thể.

## Bổ sung sau quyền sửa evidence plumbing

User đã cho phép sửa hẹp F16, chưa cho phép triển khai hybrid roadmap hoặc deploy. Source sửa trong ba file: `typesafe-planner.ts`, `src/cook-expert-judge.ts`, `src/evidence-collector.ts`; thêm 25 regression cases. Native collector dùng target task thật, task binding tường minh thay vì prose mention, cùng UTF-8 budget và kiểm tra không mất proof qua sanitizer/redaction.

Full suite repo cộng preserved diagnostic: **387 pass / 0 fail**, 37 files, 56,27s (`artifact://47`). Separate preserved callback smoke **exit 0**, research rubric và đủ sáu nhóm proof trong cả A/B; fixture staging không phải native commit. Evidence `local://typesafe-map-packet-after.json`.

Post-edit identity: **17/20 disk pairs equal**, khác đúng ba source files được sửa; active deployment và proxy chưa đổi, recorded entrypoint origin vẫn khớp target cũ. Không suy rằng Main đã nạp fix hoặc original task đã được approve. Đây là bằng chứng sửa routing/delivery, không đo độ chính xác JEV; các prerequisite khác của repaired-M và cả H shadow/cutover chưa được thực thi.

## Current direction and authoritative state

The earlier missing-completion statements describe their dated checkpoints. Original mapping now has actual native commit `d309dc2a`; the two narrow source/verification targets committed separately, and11stale blocks were removed without debt bypass. Current native3/23done20open0blocked; a different source-review target newly rejected P=.15 remains uncommitted with concrete diagnosis/executed document repair and delivery/authority handoff.

The complete [ten-phase execution master](../261019-research-to-cook-execution/plan.md) replaces the older broad recipe, preserves every accepted residual and implements H only in future cook. [Fresh five-persona prediction/debate](261019-jev-direction-final-prediction.md) and [online-adjudicated ADR](../../docs/decisions/ADR-20261019-jev-atomic-advisor-direction.md) both retain CAUTION: repaired-M first, genuine bounded H challenger, measured conditional adoption. No source fixture/persona agreement establishes superior model accuracy or production savings.

