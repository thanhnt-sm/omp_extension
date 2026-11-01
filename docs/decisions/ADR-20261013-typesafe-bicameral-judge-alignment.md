# ADR-20261013-typesafe-bicameral-judge-alignment: Đồng thuận Lưỡng viện Cố vấn – JEV (Bicameral Advisor-JEV Consensus), Loại bỏ Ngưỡng Số học (Threshold Elimination) và Khắc phục Thích ứng Không Chặn (Non-Blocking Adaptive Remediation)

- **Trạng thái (Status):** Đã quyết định (Decided)
- **Ngày (Date):** 2026-10-13
- **Hội đồng thẩm định (Council):** Lĩnh vực Trí tuệ Nhân tạo (AI Domain), 4 lăng kính chuyên gia: Độ trung thực Tài liệu (Docs-Fidelity), Kỹ thuật Phần mềm (Engineering), Bảo mật (Security), Chi phí (Cost) + Nghiên cứu (Research)

---

## 1. Câu hỏi Đặt ra (Question)

Làm thế nào để Oh-My-Pi (OMP) và TypeSafe System One (JEV) quản trị việc xác thực nhiệm vụ (task verification) và các bước chuyển đổi vòng đời (lifecycle transitions — chẳng hạn như hủy bỏ các nhiệm vụ đã lỗi thời và hoàn thành sản phẩm bàn giao) mà không phụ thuộc vào các ngưỡng số dấu phẩy động tùy tiện ở phía máy khách (arbitrary client-side floating-point thresholds như `0.80` / `0.30`), đồng thời vẫn đảm bảo tiến độ tự hành của tác tử (autonomous agent progress), chủ quyền tối cao của con người (strict human sovereignty), và khả năng thích ứng kế hoạch không gây chặn cứng (non-blocking plan adaptation)?

---

## 2. Bối cảnh (Context)

Trong kiến trúc trước đây, tiện ích mở rộng `typesafe-planner` của OMP và mô-đun `src/cook-expert-judge.ts` phụ thuộc vào các ngưỡng số học cục bộ được mã hóa cứng (`TYPESAFE_AUTO_APPROVAL_THRESHOLD = 0.80`, `DROP_REJECT_FLOOR = 0.30`) áp đặt đè lên các xác suất `noul` theo trường phái Bayes từ máy chủ JEV.

Kiến trúc này đã gây ra những xung đột vận hành nghiêm trọng trong luồng công việc thực tế (real-world workflows):
1. **Nghi ngờ Ngược lại Mô hình (Double-Guessing the Model):** Khi JEV tính toán độ tự tin đã được hiệu chuẩn (calibrated confidence — ví dụ: $P=0.75$ trên sản phẩm bàn giao mã nguồn hoặc $P=0.35$ trên lý do hủy bỏ nhiệm vụ), mã nguồn phía máy khách lại ép kết quả đánh giá rơi vào một "vùng xám bất định" (undecided gray zone) $[0.30, 0.80)$ hoặc ném ra các ngoại lệ gây chặn cứng (blocking exceptions).
2. **Khóa chết Tác tử ở Trạng thái Cuối (Terminal Agent Deadlocks — "omp bị lỗi không thoát ra được"):** Khi một tác tử hoàn thành công việc hợp lệ hoặc tìm cách loại bỏ các nhiệm vụ dư thừa sau khi quá trình biên dịch sạch đã thành công (ví dụ: bản dựng sạch với 0 lỗi MSBuild), bộ chặn phía máy khách lại ném ra lỗi không thể phục hồi thay vì tổng hợp các hành động tiếp theo (`nextaction`) hoặc tôn trọng ý định của người dùng.
3. **Phình đại Biến Cấu hình (Configuration Sprawl):** Các nhà phát triển và người dùng buộc phải tinh chỉnh thủ công các biến môi trường ngưỡng tùy tiện (`TYPESAFE_AUTO_APPROVAL_THRESHOLD`) chỉ để vượt qua các rào cản nhân tạo ở phía máy khách.

Người dùng yêu cầu một kiến trúc chuẩn mực trong đó:
- Các ngưỡng số học cứng bị loại bỏ để nhường chỗ cho trí tuệ mô hình tự chủ (autonomous model intelligence).
- Luồng đánh giá của Cố vấn (Advisor evaluation stream) và Thẩm phán JEV của OMP (OMP JEV Judge) cùng tham gia đạt đồng thuận (consensus).
- Việc leo thang lên con người (human escalation) **chỉ** diễn ra khi có sự xung đột thực sự (genuine conflict) giữa Cố vấn và Thẩm phán.
- Quyết định của con người mang tính chủ quyền tối cao, có hiệu lực ràng buộc ngay lập tức và giải phóng luồng thực thi (sovereign, binding, and immediately unblocking).
- Các phát hiện của Thẩm phán/Cố vấn cùng yêu cầu hành động tiếp theo (`nextaction`) được tổng hợp thành các bản cập nhật kế hoạch thích ứng (adaptive plan updates) thay vì các lỗi chặn đứng tiến trình.

---

## 3. Phương án thay thế đã cân nhắc (Alternatives Considered)

| Phương án (Option) | Mô tả chi tiết (Description) |
|---|---|
| **Phương án 1: Điều chỉnh Ngưỡng Tĩnh (Option 1: Static Threshold Adjustment — Giữ nguyên hiện trạng với mặc định nới lỏng)** | Giữ lại tầng tính toán số học phía máy khách; hạ ngưỡng mặc định từ `0.80` xuống `0.50` hoặc cho phép ghi đè tùy ý qua biến môi trường. |
| **Phương án 2: Thẩm quyền Đơn viện Thuần JEV (Option 2: Pure JEV Unicameral Authority — Lựa chọn Trực tiếp / Điểm cắt Bayes)** | Loại bỏ mọi ngưỡng máy khách; chuyển đổi các truy vấn JEV sang dạng lựa chọn phân loại (`APPROVE`, `REJECT`) hoặc ngưỡng đa số Bayes tiêu chuẩn ($P \ge 0.50$), với JEV đóng vai trò người gác cổng duy nhất. |
| **Phương án 3: Đồng thuận Lưỡng viện Cố vấn – JEV kèm Quyền Ghi đè Chủ quyền của Con người & Khắc phục Hành động Tiếp theo Thích ứng (Option 3: Bicameral Advisor-JEV Consensus with Sovereign Human Override & Adaptive Next-Action Remediation — Được khuyến nghị)** | Thiết lập cơ chế đánh giá kép (dual evaluation): **Cố vấn (Advisor)** đánh giá nhật ký công việc theo ngữ cảnh và ý định người dùng + **TypeSafe JEV** đánh giá chân lý nền tảng từ Git diff, xác minh cây cú pháp trừu tượng (AST verification) và sản phẩm bàn giao. Nếu cả hai đồng thuận $\implies$ tự động thực thi (auto-execute). Nếu xung đột $\implies$ leo thang lên người dùng (escalate to human). Phán quyết của con người có thẩm quyền tối cao và ràng buộc vĩnh viễn. Điểm thấp hoặc thiếu tiêu chí sẽ kích hoạt thích ứng kế hoạch có cấu trúc thay vì ném lỗi chặn cứng. |

### Phán quyết theo Lăng kính Chuyên gia (Lens Verdicts)

| Lăng kính (Lens) | Phán quyết & Lý giải (Verdict & Rationale) | Độ tin cậy (Confidence) |
|---|---|---|
| **Độ trung thực Tài liệu (docs-fidelity)** | **Phương án 3.** Tài liệu chính thức của TypeSafe (`skill://typesafe-ai`, `docs.typesafe.ai`) cảnh báo rõ ràng: *"Hãy xem các ngưỡng trong sổ tay hướng dẫn (cookbook thresholds) và kết quả minh họa là những ví dụ để tham khảo đánh giá, không phải quy tắc phổ quát hay giới hạn vĩnh viễn của mô hình"*. Tài liệu khuyến nghị sử dụng JEV cho các phán đoán có kiểu dữ liệu tường minh (typed judgments) và ủy quyền sự bất định cho con người hoặc tác tử suy luận thay vì các dải lọc cứng ở máy khách. | `0.95` |
| **Kỹ thuật Phần mềm (engineering)** | **Phương án 3.** Loại bỏ tầng số học dễ gãy vỡ trong `src/verification-gate.ts` và `src/cook-expert-judge.ts`. Thay thế các lệnh ném ngoại lệ `throw new Error(...)` bằng các vòng lặp đối soát kế hoạch/nhiệm vụ mang tính xây dựng (constructive plan/todo reconciliation loops). Giải quyết dứt điểm lỗi `omp bị lỗi không thoát ra được` bằng các nhánh giải phóng tất định. | `0.92` |
| **Bảo mật (security)** | **Phương án 3.** Bảo toàn Lưới Chính sách Chỉ Thắt chặt (Tighten-Only Policy Lattice) mà không cần các con số nhân tạo. Việc yêu cầu đồng thuận giữa hai lăng kính độc lập (Cố vấn kiểm tra ý định/lịch sử và JEV kiểm tra chân lý nền tảng từ diff/AST) ngăn chặn hành vi giả mạo đơn tác tử (single-agent spoofing — Attack 1 & 8). Sự phê duyệt chủ quyền của con người cung cấp chốt chặn an toàn về mặt thủ tục. | `0.90` |
| **Chi phí (cost)** | **Phương án 3.** Giảm mạnh chi phí trên mỗi nhiệm vụ hoàn thành ($\$/\text{completed-task}$). Ngăn chặn các cơn bão thử lại gây lãng phí token khi tác tử liên tục va vào bức tường `0.80` cứng nhắc. Một lượt gọi JEV kết hợp đánh giá Cố vấn tốn ít chi phí hơn nhiều so với hàng loạt chu kỳ thất bại dẫn tới khóa dừng. | `0.94` |

---

## 4. Bằng chứng kiểm chứng (Verification Evidence)

| Khẳng định (Claim) | Nguồn tham chiếu (Source) | Ngày (Date) | Phân loại (Type) | Phương án hỗ trợ (Supports) |
|---|---|---|---|---|
| Các ngưỡng mẫu của TypeSafe chỉ là ví dụ minh họa, không phải giới hạn mô hình vĩnh viễn | `https://docs.typesafe.ai`, `skill://typesafe-ai` | 2026-10-13 | Tài liệu chính thức (official) | Phương án 3 |
| Nguyên hàm `judge` của OMP được thiết kế như một kiểu dữ liệu định danh (`choice`, `bool`, `score`) trả về phán quyết trực tiếp | `xd://eval/judge` | 2026-10-13 | Tài liệu chính thức (official) | Phương án 2, Phương án 3 |
| Thẩm phán TypeSafe của OMP hỗ trợ chuỗi chuyển đổi dự phòng uyển chuyển tự động (`@tiny`, `@smol`, `@default`) | `skill://omp-typesafe-judge-setup` | 2026-10-13 | Tài liệu chính thức (official) | Phương án 3 |
| Việc xóa bỏ đơn thuần các ngưỡng số học mà không có cơ chế đồng thuận thay thế đã làm gãy 10 bộ kiểm thử tại môi trường đích | Nhật ký dựng `tools/sync-baseline.bat` | 2026-10-13 | Đo đạc thực tế (measured) | Phương án 3 |
| Cơ chế ủy quyền của người dùng máy chủ cho phép hủy bỏ nhiệm vụ hợp lệ khi ngữ cảnh chứng minh rõ ý định | `tests/todo-drop-gate.test.ts:400-430` | 2026-10-12 | Đo đạc thực tế (measured) | Phương án 3 |

---

## 5. Quyết định (Decision)

**Áp dụng Phương án 3: Đồng thuận Lưỡng viện Cố vấn – JEV (Bicameral Advisor-JEV Consensus), Quyền Ghi đè Chủ quyền của Con người (Sovereign Human Override), và Khắc phục Hành động Tiếp theo Thích ứng (Adaptive Next-Action Remediation).**

1. **Loại bỏ Ngưỡng Số học Máy khách (Eliminate Client Thresholds):** Xóa bỏ các phép so sánh số học cứng ở phía máy khách (`< 0.80`, `< 0.30`) và "vùng xám" (gray zone) gây mơ hồ.
2. **Đánh giá Lưỡng viện (Bicameral Evaluation):**
   - **Thùy 1 — Cố vấn (Lobe 1 — Advisor / `ck:advisor`):** Đánh giá ý định ngữ nghĩa (semantic intent), ngữ cảnh hội thoại (conversation context), lời nhắc của người dùng (user prompts) và nhật ký làm việc của tác tử (agent work log). Trả về `ALLOW` | `DISALLOW` | `UNCERTAIN`.
   - **Thùy 2 — Thẩm phán OMP / TypeSafe JEV (Lobe 2 — OMP Judge / TypeSafe JEV):** Đánh giá chân lý nền tảng từ khác biệt Git (ground-truth Git diff), mã thoát thực thi kiểm thử (test execution exit codes), và ranh giới cây cú pháp trừu tượng (AST boundaries) thông qua phán quyết phân loại (`APPROVE` | `REJECT` | `NEXT_ACTION_REQUIRED`).
3. **Bộ máy Đồng thuận & Leo thang (Consensus & Escalation Engine):**
   - Cả hai cùng đồng thuận phê duyệt $\implies$ **Tự động Phê duyệt (Auto-Approve):** Tiếp tục thực thi ngay lập tức, không cần sự can thiệp của con người.
   - Cả hai cùng đồng thuận từ chối $\implies$ **Tổng hợp Khắc phục (Synthesize Remediation):** Tạo chênh lệch kế hoạch có thể hành động (actionable plan delta), không ném ngoại lệ kết thúc phiên.
   - Bất đồng / Xung đột giữa Cố vấn và JEV $\implies$ **Leo thang lên Con người (Escalate to Human):** Trình bày ngắn gọn cả hai góc nhìn để người dùng quyết định.
4. **Bất biến Chủ quyền của Con người (Sovereign Human Invariant):**
   - Khi người dùng xác nhận/phê duyệt (ví dụ: nhấn Đồng ý khi hủy bỏ nhiệm vụ hoặc chấp thuận thay đổi kế hoạch), quyết định đó được ghi nhận là ủy quyền máy chủ có thẩm quyền (`host-authorization`).
   - Bộ máy BẮT BUỘC phải thực thi ngay thao tác biến đổi đã được phê duyệt; các cổng kiểm tra tiếp theo bị nghiêm cấm chặn lại các thao tác đã được con người thông qua.
5. **Đối soát Kế hoạch & Danh sách Nhiệm vụ Không Chặn (Non-Blocking Plan & Todo Reconciliation):**
   - Nếu JEV hoặc Cố vấn phát hiện còn thiếu yêu cầu (`NEXT_ACTION_REQUIRED`), bộ máy sẽ sinh ra các mục hành động tiếp theo (`nextaction`) cụ thể, tự động phác thảo cập nhật cho `todo` và `plan.md`, trình bày bản sửa đổi kế hoạch cho người dùng và tiếp tục thực thi sau khi được chấp thuận.

---

## 6. Lý giải & Hệ quả (Rationale & Consequences)

### Lý giải Kỹ thuật (Rationale)
Hội đồng hoàn toàn nhất trí rằng việc lọc toán học ở phía máy khách ($P \ge 0.80$) là một sai lầm kiến trúc đi ngược lại triết lý thiết kế chính thức của TypeSafe lẫn mục tiêu tự hành của tác tử trong OMP. Các mô hình JEV System One đã được huấn luyện để đưa ra các phán đoán lẽ thường có hiệu chuẩn (calibrated common-sense judgments). Việc nghi ngờ ngược lại JEV bằng các dải số dấu phẩy động đã tạo ra một "bộ lọc quan liêu" (bureaucratic filter) khóa chặt các tác tử vào vòng lặp thất bại không lối thoát.

Bằng cách ghép đôi khả năng xác minh mã nguồn thực tế của JEV với khả năng thấu hiểu ý định của Cố vấn:
- **Dương tính giả (False Positives — mã khung/stub rỗng nhưng có mã thoát kiểm thử bằng 0)** bị bắt giữ vì JEV kiểm tra trực tiếp AST và sản phẩm bàn giao trong bản diff.
- **Âm tính giả (False Negatives — hủy bỏ hợp lý các nhiệm vụ đã lỗi thời sau khi dựng thành công)** được giải quyết vì Cố vấn xác nhận ý định của người dùng và điều kiện thành công thực tế.
- **Leo thang lên con người (Human Escalation)** được dành riêng cho các trường hợp mơ hồ thực sự, xóa bỏ tình trạng mệt mỏi vì thông báo (notification fatigue).

### Rủi ro, Hệ quả & Biện pháp Giảm thiểu (Risks, Consequences & Mitigations)

| Rủi ro (Risk) | Mức độ (Severity) | Biện pháp giảm thiểu (Mitigation) |
|---|---|---|
| **Tác tử ảo giác ra sự đồng thuận của Cố vấn (Agent Hallucinating Advisor Consensus)** | Cao (High) | Đánh giá của Cố vấn chạy trong ngữ cảnh tiện ích mở rộng được kiểm soát hoặc môi trường hộp cát tác tử con độc lập (independent subagent sandbox); không thể bị giả mạo bởi văn bản lời nhắc thô. |
| **Làm gãy các khẳng định kiểm thử hiện hành (Breaking Existing Test Assertions)** | Cao (High) | Tái cấu trúc tuần차 các bộ kiểm thử đơn vị (`tests/todo-drop-gate.test.ts`, `tests/cook-expert-judge.test.ts`) để kiểm tra các trạng thái quyết định lưỡng viện thay vì ranh giới số `0.80`. |
| **Vòng lặp cập nhật kế hoạch không giới hạn (Unbounded Plan Update Loops)** | Trung bình (Medium) | Khống chế số chu kỳ thích ứng kế hoạch tự động ở mức tối đa 2 vòng lặp trước khi bắt buộc có sự can thiệp của con người. |
| **Hủy bỏ ngầm các nhiệm vụ trọng yếu (Silent Drop of Critical Tasks)** | Nghiêm trọng (Critical) | Cưỡng chế xác nhận chủ quyền của con người bấtất cứ khi nào một nhiệm vụ đã giao ước có bằng chứng diff khác rỗng trừ khi cả JEV và Cố vấn đều phát hành phê duyệt vô điều kiện. |

---

## 7. Danh sách Kiểm tra Triển khai (Implementation Checklist)

- [x] **Giai đoạn 1: Tái cấu trúc Hợp đồng Quyết định (Phase 1: Decision Contract Refactoring):**
  - Cập nhật `src/cook-expert-judge.ts` để chuyển đổi các câu hỏi trong `runDropJustificationCheck` và `runPhaseMacroCheck` sang phán quyết phân loại (`APPROVE`, `REJECT`, `NEXT_ACTION_REQUIRED`).
  - Ngừng sử dụng (deprecate) `resolveAutoApprovalThreshold` và `DROP_REJECT_FLOOR` làm rào cản chặn.
- [x] **Giai đoạn 2: Tích hợp Bộ Đánh giá Lưỡng viện (Phase 2: Bicameral Evaluator Integration):**
  - Triển khai `evaluateAdvisorIntent(ctx)` và mô-đun `src/bicameral-consensus.ts`.
  - Hòa hợp đầu ra của Cố vấn và Thẩm phán JEV thành `BicameralConsensusResult` (`AUTO_APPROVE`, `AUTO_REJECT`, `PLAN_RECONCILIATION`, `HUMAN_ESCALATION`).
- [x] **Giai đoạn 3: Thẩm quyền Chủ quyền của Con người & Đối soát Kế hoạch (Phase 3: Sovereign Human Authority & Plan Reconciliation):**
  - Cập nhật `handleTodoInterception` trong `typesafe-planner.ts` để thực thi vô điều kiện khi có sự phê duyệt xác thực của người dùng.
  - Triển khai tổng hợp kế hoạch không chặn: khi bị từ chối hoặc có chỉ thị hành động tiếp theo, sinh ra các mục nhiệm vụ cập nhật mà không làm sập phiên.
- [x] **Giai đoạn 4: Đồng bộ Hồi quy & Triển khai (Phase 4: Regression Alignment & Deployment):**
  - Cập nhật các bộ kiểm thử trong `tests/` để xác thực các kịch bản lưỡng viện.
  - Triển khai cơ sở qua `node tools/sync-baseline.cjs` và xác minh tỷ lệ vượt qua 100% trên toàn bộ bộ kiểm thử đích.

---

## 8. Điều kiện Mở lại & Quản trị (Reopen Conditions & Governance)

### Điều kiện Mở lại (Reopen Conditions)
- TypeSafe phát hành bản sửa đổi API gây đứt gãy cho `/v1/systemone` hoặc thay đổi ngữ nghĩa nguyên hàm (primitive semantics).
- Số liệu đo đạc từ xa (telemetry) cho thấy sự gia tăng các lượt hủy bỏ nhiệm vụ trái phép dưới cơ chế đồng thuận lưỡng viện.
- Người dùng máy chủ phản ánh tình trạng mệt mỏi vì thông báo (notification fatigue) do tỷ lệ leo thang xung đột vượt quá $10\%$ tổng số lệnh gọi công cụ.

### Chủ sở hữu (Owners)
- **Chủ sở hữu Kiến trúc (Architectural Owner):** Nhóm Tiện ích mở rộng Lõi OMP TypeSafe (OMP TypeSafe Core Extension Team).
- **Bảo mật Thời gian chạy (Runtime Security):** Nhóm Bảo trì Cổng Xác thực & Kiểm thử Đối kháng (Red-Team & Verification Gate Maintainers).

### Siêu dữ liệu Hội đồng (Council Metadata)
- **Mô hình sử dụng (Models used):** 4 lăng kính (`docs-fidelity`, `engineering`, `security`, `cost`) + `research` (phân tích khung dây tích hợp sẵn).
- **Chi phí ước tính (Cost estimate):** $\approx \$0.50$ (đánh giá khung dây có bộ nhớ đệm).
- **Các lăng kính đã chạy (Lenses run):** `docs-fidelity`, `engineering`, `security`, `cost` (lĩnh vực: `ai`).
- **Khởi tạo bởi (Generated by):** `/ck:council` vào ngày 2026-10-13.
