---
phase: 3
title: "Bridge host và di chuyển caller extension"
status: pending
priority: P1
effort: "2d"
dependencies: [1, 2]
---

# Giai đoạn 3: Bridge host và di chuyển caller extension

## Tổng quan
Chỉ tiến hành khi **bản OMP đang chạy** công bố API đánh giá (judgment API) được hỗ trợ cho extension. Hiện [mã nguồn `ExtensionContext` upstream](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/extensibility/extensions/types.ts) không có `judge`; helper `judge()` của `eval` không phải callback có thể gọi an toàn từ hook. Nếu chưa có bridge, ghi `HOST_BRIDGE_REQUIRED` và dừng giai đoạn 3–5, không làm ảnh hưởng kết quả độc lập của giai đoạn 1–2.

## Yêu cầu
- Phân tách công việc ở OMP upstream khỏi công việc ở repository này: upstream phải công bố hợp đồng host chính thức; không tự sửa mã host ngoài workspace này hoặc tạo `typesafe_*` facade.
- Chỉ khi bridge đã được host nạp: chuyển tất cả caller semantic sang API host, bảo toàn rubric M, threshold, raw probabilities, cache applicability và H shadow-only.
- Không cho phép `eval` result do agent tự nộp làm receipt có thẩm quyền để đóng `todo`; không gọi `eval` từ native preflight.

## Kiến trúc
Bridge upstream cần có quyền gọi (authorization), hủy (`AbortSignal`), định tuyến judge role, usage/provenance đủ để phân biệt Jev native với fallback, và lifecycle không vượt qua task/native permission. Đây là **tiền đề ngoài repo**, không phải giấy phép xây một transport mới. Adapter trong repo này chỉ chuyển `state`/`questions` và đối chiếu answer shape; không sở hữu key, URL, retry, fallback hoặc model selection. Câu hỏi nhị phân `noul` nội bộ ánh xạ sang `bool` OMP, nhưng xác suất gốc và ngưỡng giữ nguyên.

## Tệp mã liên quan
- Đối chiếu upstream: `packages/coding-agent/src/extensibility/extensions/types.ts`, `packages/coding-agent/src/judgment/index.ts`, `packages/coding-agent/src/eval/judgment-bridge.ts` trong phiên bản host thực tế.
- Chỉ sửa sau khi tiền đề đạt: `typesafe-planner.ts`, `src/semantic-judge-client.ts`, `src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, `src/bicameral-consensus.ts`, `src/debate-evaluator.ts`, `src/egc-judge.ts`, `src/task-verification-macro.ts`, `src/atomic-judge.ts`, `src/atomic-evaluation.ts`.
- Ghi báo cáo `HOST_BRIDGE_REQUIRED` tại `plans/261027-native-omp-judge-typesafe-migration/reports/phase-03-host-bridge.md` khi không có API.

## Danh mục đăng ký phải xử lý (tool registration inventory)

| Đăng ký hiện tại | Xử lý sau khi có API host | Điều kiện không được mất |
|---|---|---|
| `typesafe_judge`, `typesafe_rerank`, `typesafe_evaluate_multi` | Xóa; tác tử dùng native `eval` `judge`/`judge_batch` | Giữ cách đọc xác suất/chấm điểm qua primitive bản địa |
| `typesafe_elevate_plan`, `typesafe_expert_review`, `typesafe_verify_completion` | Xóa công cụ; chỉ giữ rubric/chính sách tất định (deterministic policy) nếu còn caller nội bộ | Không làm plan/Advisor thành quyền todo |
| `typesafe_bind_task`, `typesafe_collect_evidence`, `typesafe_retrieve_evidence`, `typesafe_review_task` | Chuyển logic sang hook/API nội bộ được host kiểm chứng **trước**; xóa registration cùng giao dịch cắt chuyển ở giai đoạn 4 | Không mất contract, chứng cứ nguồn, biên nhận test, ứng dụng cache M |
| `typesafe_prepare_todo_mutation`, `typesafe_resolve_historical_debt`, `typesafe_recovery_report` | Xác minh đường native lifecycle/report và bảo toàn debt ở giai đoạn 4 **trước khi** xóa registration | Không xoá nợ lịch sử, không giả xác nhận human |
| `typesafe_eval_host` | Xóa registration; chỉ giữ đánh giá bóng (shadow evaluation) khi có nguồn đối chứng và phê duyệt thực tế qua host | H/atomic không thành production authority |
| `typesafe_prepare_advisor`, `typesafe_advisor` trong `src/advisor-host.ts` và nhánh stub `typesafe-planner.ts:2308-2314` | Chứng minh native `task` và receipt độc lập ở giai đoạn 4 trước khi xóa registration/stub | Receipt thật phải trùng binding và phiên; child pass không chứng minh parent integration |

Đích cuối là không còn công cụ đăng ký tên bắt đầu `typesafe_`. Ở giai đoạn này chỉ cắt registration semantic khi có đường native tương ứng; **không** cắt lifecycle/Advisor registration trước giai đoạn 4. Giai đoạn 4 xác minh và cắt đồng thời, rồi giai đoạn 5 kiểm tra mọi `registerTool`/`pi.registerTool`/`api.registerTool`, vòng lặp và tên tạo động. Không giữ alias hay façade khi chuyển đổi đã hoàn tất.

## Các bước thực hiện
1. Xác minh mã nguồn (source), phiên bản (version) và kiểm tra thực tế (smoke) callback extension trong host đang chạy; kiểu `ctx.judge` tự khai báo ở `src/egc-judge.ts` không đủ chứng minh. Nếu vắng, ghi `HOST_BRIDGE_REQUIRED` vào báo cáo công khai với nguyên văn mục tiêu, chủ sở hữu là người duy trì OMP, hành động tiếp là công bố API host chính thức, điều kiện gỡ chặn là callback thật hoạt động trên bản host đã nạp, và lệnh tiếp tục `/ck:cook --auto D:/100.Software/Github/omp_extension/plans/261027-native-omp-judge-typesafe-migration/plan.md` từ giai đoạn 3. Không tạo native todo chờ hoặc tự sửa host toàn cục.
2. Khi tiền đề đạt, lập đồ thị import/callsite thực tế cho `judgeWithPolicy`, `judgeTypeSafe`, `createSemanticJudgeClient`, API key lookup và các bản sao semantic dispatch.
3. Viết test đỏ cho callback: `choice`, `bool`, `score`, lỗi host, không `fetch`; chạy cả test file trước/sau mỗi thay đổi.
4. Di chuyển từng caller ở danh sách trên theo nhóm; giữ câu hỏi nguyên tử, ngưỡng M hiện tại và phân loại `EVIDENCE_REQUIRED` khác `UNAVAILABLE`. Không retry rejection không đổi; receipt Advisor bổ sung chỉ ghép cached M result hợp lệ.
5. Với nhiều state cùng rubric dùng host batch nếu bridge công bố; nếu không có batch callback, ghi giới hạn chính thức và giữ batch ở `eval`, không giả API.
6. Cắt semantic registrations trong danh mục sau khi caller đã chuyển và test toàn tệp đạt. Ghi danh sách lifecycle/Advisor registration chờ giai đoạn 4; không xóa khả năng thu bằng chứng hoặc đối soát chỉ để làm inventory sạch.
7. Sau khi không còn caller transport, tách redaction/policy tất định khỏi `src/typesafe-api-client.cjs` và `src/typesafe-policy-client.cjs`, rồi xóa HTTP client/credential/retry/resolver đọc `~/.claude/.ck.json`; giữ guard đường dẫn `.claude` độc lập.

## Tiêu chí thành công
- [ ] Bridge extension được chứng minh bằng mã nguồn và smoke trên bản host đang chạy, hoặc giai đoạn ghi `HOST_BRIDGE_REQUIRED` và không sửa caller.
- [ ] Khi bridge tồn tại, mọi semantic caller dùng callback host thật, giữ xác suất/ngưỡng M và không gửi `noul` qua prelude OMP.
- [ ] Toàn bộ test file bị ảnh hưởng đạt, gồm sibling tests cho evidence, outage, rejection và parent integration.
- [ ] Semantic registrations có đường native thay thế đã được cắt; lifecycle/Advisor registrations chưa bị xóa khi đường evidence/review thay thế chưa chứng minh được.
- [ ] Không còn HTTP/khóa API/`.claude/.ck.json` trong đường đánh giá production; redaction và policy tất định còn được kiểm thử độc lập.

## Đánh giá rủi ro
API host upstream không tồn tại tại thời điểm lập kế hoạch; không đánh dấu phase hoàn tất chỉ từ native `eval` smoke. Không tạo tool/layer giả làm bridge và không tự sửa repo OMP trong phạm vi plan extension này.
