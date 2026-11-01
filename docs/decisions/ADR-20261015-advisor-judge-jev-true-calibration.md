# ADR-20261015-advisor-judge-jev-true-calibration: Hiệu chuẩn Cố vấn Thực sự dựa trên JEV (True JEV-Backed Advisor Calibration), Xóa bỏ Hoàn toàn Rào cản Ngưỡng 0.80/0.30 (Complete 0.80/0.30 Threshold Purge) và Độ trung thực Trạng thái JEV Có cấu trúc (Structured JEV State Fidelity)

- **Ngày (Date):** 2026-10-15
- **Trạng thái (Status):** Đã quyết định (Decided)
- **Lĩnh vực (Domain):** Trí tuệ Nhân tạo / Kiến trúc Phần mềm (AI / Software Architecture — `omp_extension`)
- **Kỹ năng áp dụng (Skills):** `ck:council`, `ck:brainstorm`, `ck:predict`, `ck:advisor`, `typesafe-ai`

---

## 1. Câu hỏi Đặt ra (Question)

Làm thế nào để `omp_extension` (`typesafe-planner.ts` và `src/*.ts`) đại tu toàn diện Cố vấn Lưỡng viện (Bicameral Advisor) và Thẩm phán TypeSafe JEV (TypeSafe JEV Judge — `jev-latest`) sao cho:
1. Cố vấn (`evaluateAdvisorIntent`, `evaluateAdvisorDecision`, `runBicameralMacroCheck`, `runBicameralDropCheck`, `runBicameralDecisionCheck`) không bao giờ xuất ra các phê duyệt đóng dấu cao su được mã hóa cứng ở mức `0.90` (`ALLOW (0.90)` — hardcoded rubber-stamp approvals),
2. Toàn bộ các bức tường ngưỡng số học còn sót lại gồm `0.80` (`resolveAutoApprovalThreshold`), `0.30` (`DROP_REJECT_FLOOR`), và `0.70` cùng các thông báo lỗi ngưỡng tương ứng đều bị xóa bỏ hoàn toàn theo đúng tinh thần của `ADR-20261013`, và
3. TypeSafe System One (`jev-latest`) nhận được đối tượng trạng thái JSON có cấu trúc (`state`) sạch sẽ, không bị cắt hỏng, được giới hạn đúng phạm vi nhiệm vụ con (sub-task-scoped) cùng bộ câu hỏi chuẩn tắc (`questions`) để công việc hợp lệ được đánh giá chính xác mà không gặp phải các phán quyết từ chối sai ở mức `0.00–0.52`?

---

## 2. Bối cảnh (Context)

Sau khi triển khai kiến trúc Đồng thuận Lưỡng viện ban đầu, kiểm toán vận hành chuyên sâu đã phát hiện ba bất cập kỹ thuật còn tồn tại trong mã nguồn:
1. **Hiệu chuẩn Cố vấn Giả tạo (Un-Calibrated Heuristic Advisor):** Các hàm `evaluateAdvisorIntent` và `evaluateAdvisorDecision` vẫn sử dụng các hằng số độ tự tin cố định (`0.90`, `0.85`, `0.95`) và cần phải vá tạm sau thực thi (`advisor.verdict = "DISALLOW"` monkey-patch) bên trong `runBicameralMacroCheck`.
2. **Tàn dư Ngưỡng Số học Cứng (Residual Numerical Threshold Walls):** Các hằng số `0.80` (`resolveAutoApprovalThreshold`), `0.30` (`DROP_REJECT_FLOOR`) và `0.70` vẫn xuất hiện trong các nhánh rẽ quyết định, bảng điểm (scorecards) và chuỗi thông báo từ chối tại `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/plan-evaluator.ts` và `typesafe-planner.ts`.
3. **Nhiễu Trạng thái Toàn Kế hoạch & Lỗi Cắt Chuỗi (Whole-Plan State Distraction & Payload Scrambling):** Hàm `extractCriteriaFromPlan` đổ toàn bộ danh sách hộp kiểm (checkboxes) của mọi giai đoạn trong kế hoạch vào trường `task_requirements` của một nhiệm vụ con đơn lẻ; hàm `constructGateQuestions` truyền mảng `string[]` không đúng chuẩn thay vì từ điển `Record<string, string>` cho `criteria`; và hàm `truncatePayloadState` làm xáo trộn các dòng trạng thái không phải diff khi gặp chuỗi con `"at "` hoặc tiêu đề Markdown `"# "`.

---

## 3. Phương án thay thế đã cân nhắc (Alternatives Considered)

| Phương án (Option) | Tóm tắt nội dung (Summary) |
|---|---|
| **Phương án 1: Đánh giá JEV Hai Thùy Gom lô + Chấm điểm Đa tín hiệu Hiệu chuẩn + Xóa bỏ Hoàn toàn Bức tường Ngưỡng + Trạng thái Nhiệm vụ Con Có cấu trúc (Batched Dual-Lobe JEV Evaluation + Calibrated Multi-Signal Heuristic + Zero Threshold Walls + Structured Sub-Task State — Được khuyến nghị)** | 1. **Hiệu chuẩn Cố vấn (Advisor Calibration):** Truy vấn JEV cho cả Thùy 1 (`advisor_intent` kiểu `choice` + `intent_confidence` / điểm `score` cho từng phương án) và Thùy 2 (sản phẩm bàn giao / độ trôi dạt / phạm vi) trong một yêu cầu gom lô `/v1/systemone` duy nhất khi trực tuyến; thay thế các hằng số cứng `0.90`/`0.85`/`0.95` trong `evaluateAdvisorIntent`/`evaluateAdvisorDecision` bằng điểm số bằng chứng đa tín hiệu liên tục và các nhánh `DISALLOW` thực sự khi kiểm thử thất bại hoặc thiếu bằng chứng mã nguồn.<br>2. **Không còn Bức tường Ngưỡng `0.80`/`0.30` (Zero Threshold Walls):** Xóa bỏ các bức tường và chuỗi văn bản ngưỡng `0.80`/`0.30`/`0.70` khỏi `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/plan-evaluator.ts`, và `typesafe-planner.ts`; dựa trên các phán quyết phân loại `choice` (`APPROVE` \| `REJECT` \| `NEXT_ACTION_REQUIRED` / `ESCALATE`) kết hợp tính nhất quán Bayes tự nhiên ($P = 0.50$).<br>3. **Độ trung thực của Trạng thái & Tiêu chí JEV (JEV State & Criteria Fidelity):** Giới hạn phạm vi `extractCriteriaFromPlan` theo đúng `taskId` đang hoạt động (đặt ngữ cảnh kế hoạch rộng hơn vào `plan_context`), loại bỏ việc kẹp chuỗi kép XML bên trong JSON và vực cắt cụt 950 ký tự, bảo toàn mã triển khai trong `summarizeUnifiedDiff`, hỗ trợ `params.phase` cùng nhận diện trình chạy kiểm thử rộng khắp trong `collectConversationContext`, và sửa lược đồ từ điển `criteria` trong `constructGateQuestions`. |
| **Phương án 2: Giữ nguyên Cố vấn Thùy 1 bằng Regex với Trọng số Điều chỉnh + Hạ `resolveAutoApprovalThreshold` xuống `0.50` (Keep Regex Lobe 1 + Lower Threshold to 0.50)** | Giữ lại Thùy 1 chỉ dùng regex với trọng số tinh chỉnh nhẹ và đổi giá trị mặc định của `resolveAutoApprovalThreshold()` từ `0.80` xuống `0.50` trong khi vẫn giữ các phép so sánh ngưỡng và chuỗi trạng thái bọc XML. |
| **Phương án 3: Tách hai Cuộc gọi HTTP Tuần tự riêng biệt tới `/v1/systemone` cho Cố vấn (Thùy 1) và Thẩm phán (Thùy 2) (Separate Sequential HTTP Calls)** | Phát hành hai yêu cầu HTTP POST tuần tự riêng biệt tới `/v1/systemone` trên mỗi lệnh `todo(op="done")` và `todo(op="drop")`: một cuộc gọi cho Cố vấn Thùy 1 và một cuộc gọi cho Thẩm phán Thùy 2. |

### Phán quyết theo Lăng kính Chuyên gia (Expert Lenses & Verdicts)

| Lăng kính (Lens) | Phán quyết & Lý giải (Verdict & Rationale) | Độ tin cậy (Confidence) |
|---|---|---|
| **Lăng kính Kiến trúc (ArchitectureLens — `ck:advisor`)** | **Phương án 1.** Kết hợp các câu hỏi của Thùy 1 và Thùy 2 trong một yêu cầu System One song song duy nhất khi trực tuyến, đồng thời trang bị cho bộ máy đồng bộ `evaluateAdvisorIntent` / `evaluateAdvisorDecision` các nhánh bằng chứng âm tính (`DISALLOW`) thực sự và độ tự tin có trọng số tín hiệu liên tục thay vì hằng số `0.90` cố định. Loại bỏ hoàn toàn bản vá tạm sau thực thi `advisor.verdict = "DISALLOW"` trong `runBicameralMacroCheck`. | `0.97` |
| **Lăng kính Thực hành Tốt nhất TypeSafe (TypeSafe Best-Practice Lens — `typesafe-ai`)** | **Phương án 1.** Tài liệu chính thức của TypeSafe (`docs.typesafe.ai/concepts/state.md`, `primitives.md`, `model-jaggedness/jev-1.13.md`, `confidence.md`) quy định rõ: (a) đối tượng `state` JSON có cấu trúc sạch sẽ, không chứa văn bản gây nhiễu của toàn bộ kế hoạch không liên quan, (b) sự khớp nối chính xác giữa `instructions`/`criteria` và nhiệm vụ con cụ thể đang được chấm, (c) gom lô các câu hỏi song song trên cùng một trạng thái trong một yêu cầu duy nhất, và (d) sử dụng độ tự tin phân phối `confidence` nguyên bản của `choice`/`score` cùng ngưỡng Bayes tự nhiên $P=0.50$ thay vì các bức tường `0.80`/`0.30` tùy tiện. | `0.96` |
| **Lăng kính Bảo mật & Độ tin cậy (Security & Reliability Lens)** | **Phương án 1.** Bảo toàn trọn vẹn các kiểm tra tất định tại Cổng 1 (cô lập `.claude`, mã thoát kiểm thử bằng 0, chốt bảo vệ AST chống xóa ròng lệnh khẳng định) và cơ chế ẩn thông tin nhạy cảm (secret redaction), đồng thời sửa lỗi xáo trộn dòng `"at "` và `"# "` trong `truncatePayloadState`, chuẩn hóa lược đồ từ điển trong `constructGateQuestions`, và bảo toàn mã nguồn thực thi trong `summarizeUnifiedDiff`. | `0.95` |

---

## 4. Quyết định (Decision)

Chúng tôi quyết định áp dụng **Phương án 1 (Option 1)** với ba trụ cột kỹ thuật:

1. **Cố vấn Đã Hiệu chuẩn, Không Đóng dấu Cao su (Calibrated, Non-Rubber-Stamp Advisor — `src/bicameral-consensus.ts`):**
   - Loại bỏ các hằng số độ tự tin mã hóa cứng `0.90`, `0.85`, `0.95`, `0.80` khỏi `evaluateAdvisorIntent` và `evaluateAdvisorDecision`.
   - Tính toán độ tự tin liên tục dựa trên trọng số bằng chứng (continuous evidence-weighted confidence) từ các tín hiệu độc lập: độ chồng lấp từ khóa giữa nhiệm vụ và nhật ký công việc (task-to-worklog token overlap), trạng thái mã thoát/tóm tắt kiểm thử đã xác minh, sự hiện diện thực tế của bản diff/tạo phẩm, độ khớp với lời nhắc người dùng, cùng các khoản phạt tường minh khi kiểm thử thất bại, có dấu vết lỗi, hoặc thiếu thay đổi mã nguồn trên nhiệm vụ `code_change`.
   - Đưa vào các nhánh trả về `DISALLOW` hạng nhất (first-class `DISALLOW` return paths) ngay trong `evaluateAdvisorIntent("done")` khi đầu ra kiểm thử báo lỗi (`exit != 0`, `FAIL`), khi nhiệm vụ `code_change` có không diff và không bằng chứng kiểm thử, hoặc khi ranh giới an toàn bị vi phạm—xóa bỏ bản vá tạm sau thực thi trong `runBicameralMacroCheck`.
   - Trong `runBicameralDecisionCheck`, `runBicameralMacroCheck`, và `runBicameralDropCheck`, tích hợp trực tiếp độ tự tin phân phối `confidence` thực tế của JEV và các phán đoán theo phương án / ý định vào `advisor.confidence` và `rankedOptions`.
   - Định tuyến việc chặn hủy bỏ nhiệm vụ (`todo` drop interception) trong `typesafe-planner.ts` đi qua `runBicameralDropCheck` để Thùy 1 và Thùy 2 thực sự phân xử thao tác hủy bỏ cùng nhau.

2. **Xóa bỏ Hoàn toàn các Bức tường Ngưỡng `0.80`, `0.30`, và `0.70` (Complete Elimination of Threshold Walls — `src/verification-gate.ts`, `src/cook-expert-judge.ts`, `src/plan-evaluator.ts`, `typesafe-planner.ts`):**
   - Xóa bỏ `0.80` (`resolveAutoApprovalThreshold`) và `0.30` (`DROP_REJECT_FLOOR`) khỏi toàn bộ các nhánh quyết định, bảng điểm, báo cáo nhiệm vụ và thông điệp từ chối.
   - Sử dụng phán quyết phân loại `choice` của JEV (`APPROVE` | `REJECT` | `NEXT_ACTION_REQUIRED` / `ESCALATE`) làm thẩm quyền chính, kết hợp với đa số Bayes tự nhiên ($P = 0.50$) cho các xác suất `noul` (`meets_criteria`, `task_actionability`, `claude_isolation_adherence`, `claude_account_untouched`, `drop_justified`).
   - Chỉ giữ lại `resolveAutoApprovalThreshold()` và `DROP_REJECT_FLOOR` dưới dạng các biểu tượng xuất khẩu tương thích ngược (backward-compatible exported symbols) được hiệu chuẩn về điểm giữa Bayes tự nhiên (`0.50`) để bất kỳ trình gọi bên ngoài nào nhập biểu tượng này không bao giờ va phải bức tường `0.80` hay `0.30`, và tuyệt đối không in chuỗi `"threshold 0.80"` hay `"(reject < 0.30)"` trong bất kỳ chẩn đoán, bảng điểm hay thông báo từ chối nào.

3. **Đường ống `state` và `questions` JEV Độ trung thực Cao (High-Fidelity JEV `state` and `questions` Pipeline — `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/plan-evaluator.ts`, `src/evidence-collector.ts`, `src/payload-safety.ts`, `typesafe-planner.ts`):**
   - Nâng cấp `extractCriteriaFromPlan(planContent, taskId)` nhận thức theo nhiệm vụ (task-aware): khi `taskId` khớp với các mục danh sách kiểm tra hoặc phần giai đoạn cụ thể, chỉ trả về các tiêu chí của nhiệm vụ đó làm `criteria` (`criteriaSource = "phase"`), thay vì đổ mọi hộp kiểm của toàn bộ kế hoạch đa giai đoạn vào `task_requirements`.
   - Trong `verifyTaskCompletion`, giới hạn phạm vi `constructGateQuestions` theo `context.taskId` (và các tiêu chí nhiệm vụ tương ứng), đồng thời chuyển đổi `deliverables_verdict.criteria` và `meets_criteria.criteria` từ mảng `string[]` không hợp lệ sang từ điển chuẩn tắc `Record<string, string>`.
   - Đồng bộ hóa ngân sách trường dữ liệu (field budgets) giữa `runPhaseMacroCheck` và `sanitizeStateForTypeSafe` (`3.000` ký tự cho `task_requirements`, `agent_work_log`, `test_summary`; `5.000` ký tự cho `deliverable_artifacts`), loại bỏ vực cắt `> 28.000` ký tự vốn nghiền nát mọi trường xuống `950` ký tự, và cập nhật `summarizeUnifiedDiff` để bảo toàn các dòng mã thêm/xóa thực tế lên tới ngân sách 14KB thay vì tước bỏ phần thân hàm (function bodies).
   - Mở rộng nhận diện trình chạy kiểm thử trong `collectConversationContext` (`bun test`, `npm test`, `vitest`, `jest`, `pytest`, `cargo test`, `go test`, `dotnet test`, `msbuild`, `tsc`, `node --test`) và đọc `params.phase || primaryOp.phase` trong `handleTodoInterception`.
   - Sửa hàm `truncatePayloadState` trong `src/payload-safety.ts` để các phép khớp chuỗi con `"at "` và tiêu đề Markdown `"# "` không làm xáo trộn các dòng trạng thái không phải diff.

---

## 5. Hệ quả (Consequences)

- **Tích cực (Positive):**
  - Độ tự tin của Cố vấn phản ánh trung thực chất lượng bằng chứng thực tế thay vì luôn đóng dấu `0.90`.
  - Xóa bỏ triệt để sự lệch pha giữa tài liệu kiến trúc và mã nguồn thực thi liên quan đến các ngưỡng `0.80`/`0.30`.
  - Tải trọng gửi tới JEV System One tuân thủ nghiêm ngặt đặc tả API chính thức, giúp nâng cao độ chính xác phân loại và giảm thiểu từ chối giả.
- **Đánh đổi & Điều kiện Mở lại (Trade-offs & Reopen Conditions):**
  - Mở lại hồ sơ quyết định này nếu TypeSafe System One giới thiệu lược đồ yêu cầu v2 mới hoặc nếu OMP thay đổi hợp đồng tham số của công cụ `todo` nguyên bản.

---

## 6. Bằng chứng kiểm chứng (Verification Evidence)

- **Các mô-đun đã được cập nhật và kiểm chứng (Verified Modules):**
  - `src/bicameral-consensus.ts`: Hiệu chuẩn đa tín hiệu và hợp nhất đánh giá JEV hai thùy.
  - `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/plan-evaluator.ts`: Xóa bỏ rào cản `0.80`/`0.30` và chuẩn hóa từ điển `Record<string, string>` cho `criteria`.
  - `src/evidence-collector.ts`, `src/payload-safety.ts`, `typesafe-planner.ts`: Trích xuất tiêu chí theo phạm vi nhiệm vụ (`criteriaSource = "phase"`), bảo toàn thân hàm trong diff và sửa lỗi cắt chuỗi `truncatePayloadState`.
- **Bộ kiểm thử (Test Suites):** Xác minh qua `tests/cook-expert-judge.test.ts`, `tests/typesafe-planner.test.ts`, và `tests/todo-drop-gate.test.ts`.
