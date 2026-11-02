---
title: "Scenario Report: JEV atomic evidence + Advisor parent review"
status: completed
---
# Scenario Report: JEV atomic evidence + Advisor parent review

Ngày: 2026-10-19. Thiết kế/điều tra, chưa triển khai runtime.

Dimensions analyzed: all 12 ck:scenario dimensions; User Types=agent/Advisor/human, Environment=headless/Windows/runtime mode, Business Logic=contract/scope/parent completion. Dimensions skipped: none.

Bảng nêu expected behavior, không tuyên bố 36 production tests đã pass. Cột bằng chứng phân biệt actual-source smoke, existing-suite, phép tính, và scenario thiết kế. Các known-source repro được mô tả trong [source review](261019-typesafe-source-rootcause-review.md).

| ID | Dimension | Scenario | Severity | Expected Behavior | Evidence status |
|---|---|---|---|---|---|
| U1 | User Types | Agent thực thi tự khai test pass | High | Chỉ nhận receipt do host thu; claim không tự cấp quyền | Design |
| U2 | User Types | Advisor khuyến nghị proceed nhưng không có native approval | Critical | Advice không cấp quyền mutation hoặc hoàn tất | Observed: native staging/consensus mismatch |
| U3 | User Types | Human từ chối xác nhận đúng tập target | Critical | Không đổi task/debt; không suy consent từ model | Existing-suite coverage |
| I1 | Input Extremes | Criterion hoặc bằng chứng bắt buộc rỗng | High | EVIDENCE_REQUIRED; không suy nội dung để chấm | Design |
| I2 | Input Extremes | Acceptance proof chỉ nằm cuối artifact dài | High | Giữ đoạn bằng chứng liên quan hoặc báo thiếu; không cắt im lặng | Observed: artifact tail lost |
| I3 | Input Extremes | Tiếng Việt, phủ định và đoạn trích chỉ thị gây nhiễu | High | Giữ raw intent; tách dữ liệu khỏi quyền; kiểm định theo ngôn ngữ | Design; negated English intent observed separately |
| T1 | Timing | Source/revision đổi khi judge đang chạy | Critical | Kết quả cũ không được stage/commit cho revision mới | Existing-suite coverage for stale transaction |
| T2 | Timing | Retry semantic reject với evidence không đổi | High | Không gọi lại để săn pass; giữ refusal và chẩn đoán | Observed: Gate2 attempt count stayed zero |
| T3 | Timing | 503 hồi phục nhưng source không đổi | Medium | Cho kiểm tra dịch vụ lại theo cooldown; không ép sửa code | Design |
| S1 | Scale | Task chỉ cần kiểm tra deterministic, không có semantic predicate | Medium | Không gọi JEV thừa; vẫn tuân thủ policy hiện hành cho operation | Design |
| S2 | Scale | 20 work units, mỗi unit 4 predicate chung evidence | Medium | So sánh batch theo packet với 80 request riêng; giữ đủ 80 tiêu chí | Calculated model |
| S3 | Scale | 1000 predicate hoặc packet vượt context/token budget | High | Chia theo coherent evidence; hàng đợi hữu hạn; không bật long context mặc định | Design |
| ST1 | State Transitions | Restart từ ordinary native todo history | Critical | Khôi phục task chưa xong và state; không mất contract | Observed: native history restored empty |
| ST2 | State Transitions | Tất cả child pass nhưng reader/writer không tương thích | High | Parent integration vẫn chưa đạt; chạy cross-component check | Executable toy counterexample |
| ST3 | State Transitions | Macro approve, Advisor DISALLOW, consensus HUMAN_ESCALATION | Critical | Không stage khi authority composer chưa cho phép | Observed: native staged anyway |
| E1 | Environment | Headless host block task đã bị reject | High | human_resolution_required; giữ debt, nêu đường trusted UI | Observed; existing policy |
| E2 | Environment | Windows path có khoảng trắng hoặc Unicode trong Git status | High | Giữ identity/path đúng; không gửi lỗi Git thay diff hợp lệ | Design |
| E3 | Environment | Cùng payload trong test và production | Medium | Dùng cùng policy cap; phân biệt bytes/chars/tokens | Observed: 32768 vs 34804 bytes |
| ER1 | Error Cascades | Native Gate2 nhận HTTP503 | High | UNAVAILABLE, không sinh chỉ thị sửa implementation | Observed: edit directives generated |
| ER2 | Error Cascades | Một answer bị thiếu hoặc malformed trong batch | High | Không approve từ partial/default answers; phân biệt protocol error | Design |
| ER3 | Error Cascades | Advisor decision endpoint nhận lỗi dịch vụ | Critical | Không giả JEV APPROVE từ local heuristic | Observed: AUTO_APPROVE on503 |
| A1 | Authorization | User nói Do not drop lexer verification | Critical | Không diễn giải thành consent; JEV/advice không thay human authority | Observed: heuristic ALLOW, native deletion not exercised |
| A2 | Authorization | Agent gửi isHuman/authorized/resetFailures trong todo params | Critical | Không dùng flag do agent tự khai để cấp quyền hoặc xóa debt | Existing-suite coverage |
| A3 | Authorization | Có EGC file rỗng nhưng extension EGC không đăng ký | Critical | Planner chỉ handoff khi host xác nhận enforcement thực sự hoạt động | Observed: marker skipped planner callback |
| D1 | Data Integrity | Cùng file đã có WIP trước task rồi được sửa tiếp | High | Diff task phải loại hunk trước task một cách có provenance | Observed: pre-task hunk leaked |
| D2 | Data Integrity | Task đã tạo hai commit rồi working tree sạch | High | Evidence bao phủ cả khoảng baseline đến hiện tại | Observed: first commit missing |
| D3 | Data Integrity | Contract đổi nhưng replay kết quả judge/cached approval cũ | Critical | Invalidate semantic result theo dependency; luôn rebind authority hiện tại | Design |
| IT1 | Integration | Explicit advisory verify approve nhưng native gate có contract khác | High | Không coi advisory pass là native completion authority | Design; distinct source routes verified |
| IT2 | Integration | Inline và module debate dùng policy khác nhau | High | Một policy source-of-truth; consumer phải cùng semantics | Observed: opposite verdicts on same scores |
| IT3 | Integration | jev-latest hoặc rubric đổi giữa hai đánh giá | High | Ghi resolved model/rubric; không gọi khác biệt đó là tiến bộ code | Design |
| C1 | Compliance | Raw thinking/secret-bearing logs bị đưa vào packet ngoài ý muốn | Critical | Chỉ allowlisted evidence; không xuất private thinking; redact trước egress | Source risk; no real-secret probe |
| C2 | Compliance | Redaction bỏ mất đoạn cần chứng minh criterion | High | Báo bằng chứng không đủ, dùng nguồn an toàn khác; không khôi phục secret | Design |
| C3 | Compliance | Audit không có request identity hoặc resolved model | Medium | Ghi metadata tối thiểu; không khẳng định causal/calibration khi thiếu | Observed limitation of historical/live rejection evidence |
| B1 | Business Logic | Chia nhỏ làm biến mất yêu cầu tương thích của user | Critical | Coverage đối chiếu contract gốc và parent integration độc lập | Design |
| B2 | Business Logic | Task lớn được coi là lý do tự động drop hoặc human approve | Critical | Độ lớn không cấp quyền; cancellation theo policy exact-target | Design |
| B3 | Business Logic | Report lớn nhưng chỉ kiểm một claim; hoặc plan nhỏ nhưng cần reasoning | Medium | Route theo độ hẹp/mức suy luận của judgment, không độ dài todo | Design |

## Summary
- Critical: 13
- High: 17
- Medium: 6
- Low: 0
- Total: 36 scenarios across 12 dimensions.

## Exercised design counterexamples

Throwaway actual-JS example: writer emits version2/token and passes its own unit assertion; reader accepts version1/access_token and passes its own unit assertion; connecting writer to reader throws schema-contract-mismatch. This proves the counterexample, not a new bug in this repository or JEV accuracy.

Exhaustive illustrative Boolean policy table: 256 states over child support, parent integration, evidence freshness, original-contract coverage, local checks, Advisor review, authority and native commit. Naive child-only completion admits 127 states lacking another required condition. This is a design truth table, NOT a measured production error rate, not a replacement gate implementation, and not an assumption that all eight conditions always apply identically to every task.

## Required validation before cutover
Human-adjudicated, task-level held-out cases; paired old/repaired-input/narrow-predicate comparison; task-level false approvals/rejections, abstentions, correct escalation and evidence coverage; exact model/rubric versions; request and usage receipts; no shadow decisions mutate state. Preserve existing human-confirmed rejected-block policy.
