# ADR-20261019-jev-atomic-advisor-direction: Đánh giá Nguyên tử JEV Có Giới hạn kết hợp Tổng hợp Cố vấn Thực chất có phải là Hướng đi Kiến trúc Đúng đắn? (Is Bounded JEV Atomic Review with Genuine Advisor Synthesis the Right Direction?)

- **Trạng thái (Status):** Đã quyết định (Decided)
- **Ngày (Date):** 2026-10-19
- **Hội đồng thẩm định (Council):** Lĩnh vực Trí tuệ Nhân tạo (AI Domain), 3 lăng kính chuyên gia: Chi phí (Cost), Độ trung thực Tài liệu (Docs-Fidelity), Kỹ thuật Phần mềm (Engineering) + Nghiên cứu (Research)

---

## 1. Câu hỏi Đặt ra (Question)

Kho lưu trữ này nên giữ lại **Phương án A (Repaired-M — Mô hình Vĩ mô đã sửa chữa)** hay theo đuổi **Phương án B (Bounded Hybrid-H — Mô hình Lai Nguyên tử có giới hạn với các vị từ JEV tập trung, suy luận Cố vấn thực chất và nghiệm thu cấp cha tách biệt)**? Quyết định định hướng kiến trúc sử dụng cả ba lăng kính độc lập và kết quả nghiên cứu trực tuyến đã hoàn tất, mà không coi tài liệu hướng dẫn là sự xác nhận kết quả cục bộ, không tự ý thay đổi tệp sản xuất hay tệp kế hoạch, không cấp quyền suy luận/triển khai/thao tác nguyên bản, và không vượt quá hạn mức 5 lượt gọi nghiên cứu mới đã sử dụng.

---

## 2. Bối cảnh (Context)

Các bản rà soát mã nguồn được cung cấp mô tả tình trạng nguồn gốc bằng chứng chưa đầy đủ (incomplete evidence provenance), một "Cố vấn" nội bộ dựa trên quy tắc kinh nghiệm (heuristic internal "Advisor") sau đó bị biến đổi bởi kết quả JEV, và các trình tiêu thụ nguyên bản (native consumers) chưa tuân thủ nhất quán các kết quả tổng hợp. Đây là các phát hiện từ kiểm tra tĩnh/thăm dò mã nguồn (static/source-probe findings), không phải là một bộ đo kiểm chất lượng mô hình cục bộ (local model-quality benchmark). **Phương án A (Repaired-M)** là đường cơ sở sản xuất đã hiệu chỉnh và đối chứng bắt buộc (required corrected production baseline and comparator), **chứ không phải lời khẳng định rằng thời gian chạy hiện tại đã hoàn tất các sửa chữa đó**. Suy luận thẩm định thực chất ở cấp độ cha (genuine parent review) và các bản sửa lỗi đúng đắn dùng chung thuộc về cả Phương án A lẫn Phương án B.

Tài liệu chính thức của TypeSafe ủng hộ các phán đoán có kiểu dữ liệu hẹp (narrow typed judgments), trạng thái liên quan mạch lạc (coherent relevant state), gom lô trên trạng thái chia sẻ (shared-state batching) và tổng hợp kết quả do mã nguồn làm chủ (code-owned composition). Tuy nhiên, tài liệu đó không chứng nhận kiến trúc riêng của kho lưu trữ này, cũng không chứng minh rằng việc bổ sung các vị từ nguyên tử (atomic predicates) và một Cố vấn sẽ tự động cải thiện độ chính xác hoàn thành nhiệm vụ, độ hiệu chuẩn, tính kinh tế hay độ trễ. Thiết kế giao thức máy chủ tách biệt (separate host protocol design) vẫn là một đề xuất tích hợp, chưa phải bằng chứng về việc ràng buộc biên lai tin cậy đã được triển khai. Hiện chưa có bộ đo kiểm chất lượng A/B đối chứng cục bộ trên tập dữ liệu giữ lại (held-out local A/B quality benchmark) hay hóa đơn chi phí toàn phần trên mỗi nhiệm vụ hoàn thành.

Hồ sơ này chỉ quyết định về mặt **định hướng kiến trúc (architectural direction only)**. Trạng thái "Đã quyết định (Decided)" không đồng nghĩa với việc đã triển khai, đã đánh giá thực nghiệm, đã thăng cấp hay đã cấp quyền vận hành.

---

## 3. Phương án thay thế đã cân nhắc (Alternatives Considered)

| Phương án (Option) | Mô tả chi tiết (Description) |
|---|---|
| **Phương án A (Repaired-M)** | Đường cơ sở sản xuất / đối chứng đã sửa chữa (Repaired-M production baseline/comparator): khắc phục triệt để bằng chứng, thẩm quyền, tính sẵn sàng và suy luận cấp cha trong khi vẫn giữ luồng công việc dạng vĩ mô (macro-shaped workflow). Đây không phải là sự chấp nhận bản triển khai còn lỗi trước đó. |
| **Phương án B (Bounded Hybrid-H)** | Ứng viên Lai Nguyên tử có giới hạn (Bounded Hybrid-H candidate) với các vị từ ngữ nghĩa nguyên tử mạch lạc (coherent atomic semantic predicates), tổng hợp từ Cố vấn chỉ đọc độc lập thực sự (real independent read-only Advisor synthesis), nghiệm thu cấp cha tách biệt (distinct parent acceptance) và áp dụng có điều kiện khi so sánh đối chứng với Phương án A đã sửa chữa. Không phân mảnh ồ ạt thành các nhiệm vụ siêu nhỏ (no wholesale tiny-todo fan-out). |

### Phán quyết theo Lăng kính Chuyên gia (Lens Verdicts)

| Lăng kính (Lens) | Phán quyết (Verdict) | Độ tin cậy & Phạm vi (Confidence & Scope) |
|---|---|---|
| **Chi phí (cost)** | Tiếp tục (Proceed): chọn A làm đường cơ sở sản xuất; giữ B làm thử nghiệm có điều kiện (conditional experiment). Xếp hạng A đạt 8/10, B đạt 6/10 về mức độ sẵn sàng áp dụng. | `0.91` — độ tin cậy về trình tự ưu tiên đường cơ sở trước (baseline-first sequencing), không phải khoản tiết kiệm đã đo đạc. |
| **Độ trung thực Tài liệu (docs-fidelity)** | Tiếp tục (Proceed): chọn B làm ứng viên có giới hạn, có thể kiểm chứng bác bỏ (bounded, falsifiable candidate) trong khi A vẫn giữ vai trò đường cơ sở sản xuất. | `0.95` — độ khớp và giới hạn theo tài liệu chính thức, không phải lợi ích vận hành cuối cùng. |
| **Kỹ thuật Phần mềm (engineering)** | Tiếp tục (Proceed): khuyến nghị B có điều kiện; A vẫn là đường cơ sở/đối chứng cho đến khi lợi ích toàn nhiệm vụ và tích hợp tin cậy được chứng minh. | `0.89` — định hướng có điều kiện, không phải khẳng định về độ chính xác hay tiết kiệm chi phí. |

Toàn bộ phán quyết và giá trị độ tin cậy được sao lục nguyên văn từ các mục `experts` không qua cắt lọc trong [đầu vào hội đồng bền vững (durable council inputs)](../../plans/261019-research-to-cook-execution/research/council-inputs.json). Không có lăng kính nào bị lược bỏ. Điểm số tùy chọn mang tính tham khảo sử dụng các thang đo khác nhau nên không cộng gộp cơ học. Bản sao phiên gốc là `local://jev-council-verbatim-inputs.json`.

---

## 4. Bằng chứng kiểm chứng (Verification Evidence)

Chú giải ký hiệu thời gian: `R` = ngày truy xuất (retrieval); `P` = ngày công bố (publication); `V` = ngày phát hành/rà soát tường minh (explicit release/review); `I` = ngày kiểm tra/báo cáo mã nguồn (source inspection/report date). Phân loại phân biệt rõ giữa hợp đồng chính thức (official), trình diễn của nhà cung cấp (vendor), hướng dẫn độc lập/kiểm tra mã nguồn (independent) và số liệu đo đạc đã ghi nhận (measured).

| Khẳng định (Claim) | Nguồn tham chiếu (Source) | Ngày (Date) | Phân loại (Type) | Ý nghĩa Hỗ trợ (Supports) |
|---|---|---|---|---|
| **E1.** Chỉ hỏi một phán đoán nhanh (snap judgment) trên mỗi câu hỏi; các bằng chứng liên quan phải được giữ cùng nhau. | [TypeSafe primitives](https://docs.typesafe.ai/primitives.md), [state](https://docs.typesafe.ai/concepts/state.md); nghiên cứu `plans/261019-research-to-cook-execution/research/jev-atomic-online-verification.md:46-47,65-67`; lăng kính tài liệu F1–F2 | R 2026-10-19; P không rõ | Chính thức (official) | Thiết kế vị từ có giới hạn của B, không ủng hộ sự phân mảnh tùy tiện hay mặc định kết quả vượt trội. |
| **E2.** Tổng hợp luồng công việc/hiệu ứng trong mã nguồn; gom lô các câu hỏi dùng chung trạng thái phù hợp. Độc lập khi đánh giá không đồng nghĩa với độc lập sai số thống kê (statistical error independence). | [System One workflow](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md); nghiên cứu `:48,67,105`; lăng kính tài liệu F3 | R 2026-10-19; P không rõ | Chính thức (official) | Tổng hợp tất định (deterministic composition); không nhân xác suất các vị từ để tự bịa ra ước lượng độ tin cậy. |
| **E3.** JEV không phải là một Cố vấn suy luận hội thoại hay sinh văn bản (not a conversational/text-generating reasoning Advisor). | [Coding agents](https://docs.typesafe.ai/introduction/coding-agents.md); nghiên cứu `:53,65`; lăng kính tài liệu F4 | R 2026-10-19; P không rõ | Chính thức (official) | Tách biệt năng lực suy luận thực chất; giao thức máy chủ chính xác vẫn là nghĩa vụ thực thi cục bộ. |
| **E4.** `noul` là xác suất $P(\text{yes})$, không phải phần trăm hoàn thành hay thống kê độ tin cậy tách biệt; không có ngưỡng cục bộ an toàn phổ quát nào tự động suy ra từ đó. | [Confidence](https://docs.typesafe.ai/confidence.md), [API](https://docs.typesafe.ai/api.md); nghiên cứu `:51,54,68`; lăng kính tài liệu F5 | R 2026-10-19; P không rõ | Chính thức (official) | Bảo toàn ngữ nghĩa xác suất và hiệu chuẩn chính sách trên dữ liệu cục bộ có liên quan. |
| **E5.** Các phiên bản/bí danh mô hình có sự khác biệt; giới hạn ngữ cảnh và giới hạn byte được công bố là tách biệt. | [Models](https://docs.typesafe.ai/models.md), [API](https://docs.typesafe.ai/api.md); nghiên cứu `:50-51,72-74`; lăng kính tài liệu F8/F10 | R 2026-10-19; V 1.14 phát hành 2026-10-14 | Chính thức (official) | Ghim chặt phiên bản được đánh giá và ghi lại định danh đã phân giải (resolved IDs); vượt qua giới hạn truyền tải không đồng nghĩa với đủ ngữ nghĩa. |
| **E6.** Mức cải thiện chi phí $12.2\times$ / tốc độ $10.0\times$ được công bố áp dụng cho bài toán 13 câu hỏi trên một bài viết 53.777 ký tự, lặp 5 lần với JEV 1.12; các câu hỏi đơn lẻ chạy tuần tự. | [Parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions.md); nghiên cứu `:49,82`; lăng kính tài liệu F6–F7 | R 2026-10-19; bảng giá mẫu tháng 9/2026 | Nhà cung cấp (vendor) | Chỉ củng cố giả thuyết gom lô mạch lạc; không phải phép so sánh trực tiếp giữa H và Repaired-M hay chi phí Cố vấn. |
| **E7.** JEV 1.13 có các kiểu lỗi đã được ghi nhận khi gặp trạng thái không liên quan hoặc đầu vào đối kháng (irrelevant-state/adversarial failure modes). | [Model jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md); nghiên cứu `:52,80`; lăng kính tài liệu F9 | R 2026-10-19; V rà soát 2026-10-02 | Nhà cung cấp (vendor) | Đánh giá trên các lát cắt khó (hard-slice evaluation); không giả định miễn nhiễm tiêm lệnh (injection immunity). |
| **E8.** Chỉ gia tăng độ phức tạp khi nó chứng minh được sự cải thiện rõ rệt về kết quả đầu ra. | [Anthropic effective agents](https://www.anthropic.com/engineering/building-effective-agents); nghiên cứu `:38,55,119` | R 2026-10-19; P 2024-12-19 | Độc lập (independent) | Sự tiết chế ưu tiên A trước và B có điều kiện. |
| **E9.** Đánh giá kết quả theo đặc thù nhiệm vụ bằng bộ nhãn giữ lại đã hiệu chuẩn bởi con người (held-out, human-calibrated labels) và kiểm tra bàn giao. | [OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices); nghiên cứu `:56,106,120` | R 2026-10-19; P không rõ | Độc lập (independent) | Đánh giá nhiệm vụ cấp cha theo cặp đối chứng (paired parent-task evaluation). |
| **E10.** Nguyên tắc đặc quyền tối thiểu (least privilege) và ủy quyền hạ nguồn là bắt buộc; khuyến nghị của mô hình không phải là giấy phép thực thi. | [OWASP Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/); nghiên cứu `:38,57,78-80,121` | R 2026-10-19; ấn bản 2025 | Độc lập (independent) | Phạm vi cưỡng chế, ủy quyền con người tách biệt và kiểm soát dữ liệu gửi ra ngoài. Chế độ chỉ đọc không phải là ranh giới quyền riêng tư. |
| **E11.** Các khiếm khuyết về bằng chứng/thẩm quyền và Cố vấn kinh nghiệm bị biến đổi sau JEV đã được báo cáo cục bộ. | Lăng kính Kỹ thuật `experts[2].rawResult` dẫn chiếu `typesafe-planner.ts:1775-1788,1826-1856`, `src/evidence-collector.ts:502-522`, `src/bicameral-consensus.ts:223-267,815-847,1063-1067,1119-1195`; nghiên cứu `:58-59,98` | I 2026-10-19 | Độc lập (independent) | Các bản sửa lỗi dùng chung phải đi trước phép so sánh đối chứng. |
| **E12.** Các ranh giới thành công được kiểm tra đã làm rơi siêu dữ liệu mức sử dụng/mô hình phân giải; các phép tính minh họa bỏ sót nhiều khoản chi phí lớn. | Lăng kính Chi phí `experts[0].rawResult` dẫn chiếu `src/cook-expert-judge.ts:145-157`, `src/typesafe-api-client.cjs:539-544`, `typesafe-planner.ts:2440-2443`, `plans/reports/261019-jev-design-calculations.json:2-44` | I 2026-10-19 | Độc lập (independent) | Đang thiếu kế toán toàn phần dựa trên biên lai thực tế (receipt-based all-in accounting). |
| **E13.** Kết quả 387/0 lượt kiểm tra mẫu thử (fixture checks) và mã thoát callback bằng 0 được ghi nhận không sử dụng cuộc gọi API trực tiếp hay thao tác nguyên bản nào. | Lăng kính Kỹ thuật `experts[2].rawResult` dẫn chiếu `plans/reports/261019-todo-recovery-evidence.json:496-509` | Ghi nhận 2026-10-19 | Đo đạc thực tế (measured) | Chỉ là bằng chứng về đường ống/luồng điều khiển (plumbing/control-flow evidence), không phải chất lượng mô hình hay ưu thế kinh tế. |
| **E14.** Giá niêm yết của JEV là $\$0.042 / 1\text{M}$ token đầu vào, đầu ra miễn phí; chi phí định tuyến/hóa đơn Cố vấn thực tế và tổng chi phí cục bộ hiện chưa xác định. | [Models](https://docs.typesafe.ai/models.md); nghiên cứu `:84,125-129`; lăng kính Chi phí `experts[0].rawResult` | R 2026-10-19 | Chính thức (official) | Chỉ là phép tính số học theo giá công khai; biên lai thực tế phải thay thế các giả định minh họa. |

---

## 5. Quyết định (Decision)

**Triển khai Phương án A ngay bây giờ; giữ Phương án B làm ứng viên thách thức qua cổng kiểm soát (A now; B as a gated challenger).** Giữ lại **Repaired-M (Phương án A)** làm đường cơ sở sản xuất / đối chứng và chỉ theo đuổi **Bounded Hybrid-H (Phương án B)** như một ứng viên không có thẩm quyền quyết định (shadow/non-authoritative candidate) cho đến khi vượt qua các cổng đánh giá và kích hoạt được cấp phép riêng biệt. Quyết định này chọn B làm hướng nghiên cứu khảo sát, không phải bản thay thế sản xuất ngay lập tức. Việc giữ lại A lâu dài vẫn là một kết quả hoàn toàn được chấp nhận nếu B không chứng minh được ưu thế vượt trội.

Cả hai phương án bắt buộc phải bảo toàn các nghĩa vụ cấp cha ban đầu (original parent obligations), nguồn gốc kiểm thử/bằng chứng thực tế (actual test/evidence provenance), kết quả JEV và Cố vấn thô độc lập (independent raw JEV and Advisor outcomes), phán quyết tổng hợp tất định (deterministic composed disposition), cam kết nguyên bản khớp đúng mục tiêu (exact-target native commitment) và sự cho phép của con người đã được xác thực (authenticated human permission). Dù là kết quả vượt qua của tác tử con, khuyến nghị của Cố vấn hay sự đồng thuận ngữ nghĩa cũng không thể tự mình thiết lập việc hoàn thành cấp cha hoặc quyền thực thi. Bằng chứng không khả dụng hoặc đã cũ (unavailable or stale evidence) không bao giờ được phép hợp thức hóa thành phê duyệt. Nghiêm cấm hành vi thử lại cho đến khi đỗ trên bằng chứng không đổi (no retry-to-pass on unchanged evidence).

**Độ tự tin của Trọng tài phân xử (Adjudicator confidence): `0.90`** đối với trình tự có điều kiện này. Đây là phán đoán kiến trúc có trọng số bằng chứng, không phải trung bình cộng cơ học của độ tự tin các lăng kính hay xác suất thành công của B.

---

## 6. Lý giải & Hệ quả (Rationale & Consequences)

### Lý giải Kỹ thuật (Rationale)
Cả ba lăng kính đều đồng thuận về các bản sửa lỗi nền tảng dùng chung, vai trò đối chứng sản xuất công bằng của Phương án A, yêu cầu suy luận thực chất thay vì quy tắc kinh nghiệm (heuristic), và việc không thăng cấp Phương án B ngay lập tức. Sự khác biệt thực sự giữa các lăng kính nằm ở trọng tâm đầu tư: lăng kính Chi phí xếp A cao hơn B về mức độ áp dụng; lăng kính Độ trung thực Tài liệu ưu tiên sự ăn khớp giao diện của B; lăng kính Kỹ thuật ủng hộ sự phân tách trách nhiệm của B dù gánh nặng tích hợp lớn hơn.

Các tầng bằng chứng mang tính quyết định là **tài liệu chính thức/sơ cấp (official/primary documentation)** cho ngữ nghĩa nguyên hàm/API được phép và **hướng dẫn đánh giá/bảo mật sơ cấp độc lập (independent primary evaluation/security guidance)** cho yêu cầu phải chứng minh được lợi ích thực tế cũng như ranh giới thẩm quyền bên ngoài. Vì chưa có số liệu đo đạc cục bộ nào chứng minh sự vượt trội trên toàn nhiệm vụ, Phương án A đã hiệu chỉnh và đơn giản hơn được giữ quyền ưu tiên sản xuất, còn Phương án B phải tự chứng minh để được thăng cấp.

### Rủi ro, Hệ quả & Biện pháp Giảm thiểu (Risks, Consequences & Mitigations)

| Rủi ro (Risk) | Mức độ (Severity) | Biện pháp giảm thiểu (Mitigation) |
|---|---|---|
| Không có bộ dữ liệu chuẩn vàng (gold set) cấp nhiệm vụ cha độc lập tại cục bộ hoặc bằng chứng vượt trội về chất lượng. | Cao (High) | Đóng băng các nhãn mù (blinded labels) và ngân sách rủi ro trước khi đánh giá; giữ nguyên A cho đến khi kết quả đối chứng trên tập giữ lại vượt qua. |
| Biên lai Cố vấn bị làm giả/cũ, mất thông tin leo thang, tự động phê duyệt khi dịch vụ mất kết nối hoặc nhầm lẫn mục tiêu giữa các nhiệm vụ. | Nghiêm trọng (Critical) | Xác thực danh tính nguồn gốc máy chủ (host-origin identity) và các ràng buộc hợp đồng/bằng chứng/thao tác/mục tiêu bên ngoài các tuyên bố do mô hình tự viết; bảo toàn kết quả thô; cưỡng chế tổng hợp hạ nguồn và kết quả nguyên bản khớp chính xác. |
| Sự phân mảnh làm bỏ sót bằng chứng phản bác (counterevidence); các lượt đỗ của tác tử con che giấu lỗi tích hợp liên tệp ở cấp cha. | Cao (High) | Yêu cầu bản đồ nguồn gốc/độ phủ (provenance/coverage maps), chỉ rõ bằng chứng bị thiếu/xung đột và rà soát tích hợp cấp cha tách biệt với các lát cắt kiểm tra bỏ sót (omission hard slices). |
| Tiêm lệnh vào lời nhắc (prompt injection), sai số tương quan, rò rỉ quyền riêng tư hoặc tự suy diễn quyền hạn từ ý kiến mô hình. | Nghiêm trọng (Critical) | Cưỡng chế phạm vi đọc/gửi ra ngoài và ủy quyền hạ nguồn có xác thực; tối thiểu hóa gói dữ liệu được phép gửi; đánh giá đối kháng; không giả định tính độc lập xác suất; xác nhận điều khoản lưu giữ dữ liệu của tài khoản thay vì mặc định ZDR. |
| Chi phí Cố vấn, các lượt thử lại, từ chối phán quyết (abstentions) và công sức con người xóa sạch khoản tiết kiệm token; thiếu siêu dữ liệu kế toán. | Cao (High) | Đo đạc biên lai sử dụng/mô hình thực tế và mọi lần thử; so sánh chi phí chỉ tính tiền mặt (cash-only) và chi phí bao gồm nhân công (labor-inclusive) trên mỗi nhiệm vụ gốc hoàn thành cùng độ trễ đường găng `p95`. |
| Thử lại để đỗ (retry-to-pass), trùng lặp quyền sở hữu thử lại, phục hồi vòng đời hoặc bằng chứng hệ thống tệp bị cũ. | Cao (High) | Chỉ định một chủ sở hữu thử lại truyền tải có giới hạn duy nhất; phân biệt rõ việc đánh giá lại ngữ nghĩa đòi hỏi bằng chứng khắc phục mới; ràng buộc ảnh chụp/độ tươi mới trước khi kích hoạt. |
| Trôi dạt bí danh mô hình (alias drift), hiệu ứng ngôn ngữ và chính sách chưa hiệu chuẩn làm vô hiệu hóa lợi ích bề nổi. | Trung bình (Medium) | Ghim chặt/ghi nhật ký phiên bản và chính sách; phân tầng nhiệm vụ tiếng Việt/tiếng Anh và nhiệm vụ khó/đối kháng; tái kiểm định khi có nâng cấp trọng yếu. |

---

## 7. Danh sách Kiểm tra Triển khai (Implementation Checklist)

1. [x] Sửa chữa các nền tảng dùng chung của Phương án A: tiêu chí gốc/sửa đổi có thẩm quyền, định danh ổn định, ảnh trước (preimages)/chênh lệch đầy đủ của nhiệm vụ thực tế, biên lai kiểm thử tin cậy và khoảng trống bằng chứng tường minh; đóng băng các lược đồ chung trước khi di chuyển trình gọi.
2. [x] Hiệu chỉnh việc tổng hợp thẩm quyền tất định, xử lý khi dịch vụ không khả dụng, phục hồi vòng đời và quyền sở hữu EGC; bảo toàn bản ghi Cố vấn/JEV thô độc lập và cam kết nguyên bản/sự đồng thuận có xác thực đúng mục tiêu.
3. [x] Thiết lập suy luận cấp cha thực chất trong cả đường đối chứng lẫn ứng viên; giữ chất lượng suy luận chung tương đương và cô lập phần công việc gia tăng của B.
4. [x] Triển khai giao thức Cố vấn được máy chủ hỗ trợ đã qua rà soát tách biệt với nguồn gốc điều phối/kết quả tin cậy, phạm vi đọc/gửi ra ngoài có giới hạn, độ tươi mới và ràng buộc thao tác/mục tiêu. Coi báo cáo do tác tử tự viết là nội dung chưa tin cậy, không phải biên lai máy chủ. Giữ quá trình suy luận bên ngoài bước kiểm tra tiền trạm ngắn.
5. [x] Xây dựng các gói ngữ nghĩa đơn điều kiện mạch lạc, gắn chặt nguồn gốc của Phương án B; giữ lại các mâu thuẫn/độ phủ toàn cục; gom lô các câu hỏi dùng chung trạng thái phù hợp và giữ quy tắc/hiệu ứng trong mã nguồn. Bảo toàn bước nghiệm thu cấp cha tách biệt.
6. [x] Khai báo trước các nhãn chuẩn vàng giữ lại theo cặp nhiệm vụ/dự án, cơ chế phân xử độc lập, độ đầy đủ của mẫu/lát cắt, phương pháp khoảng tin cậy, ngân sách an toàn phê duyệt sai, giới hạn từ chối/bỏ phiếu trắng và trần chi phí/độ trễ/công sức người rà soát trước khi xem kết quả (`src/paired-eval-protocol.ts`).
7. [x] Thu thập định danh mô hình yêu cầu/phân giải, phiên bản chính sách/bằng chứng, mức sử dụng đầu vào thực tế, nỗ lực và chi phí của Cố vấn/cấp cha, hành vi bộ nhớ đệm, toàn bộ các lượt thử lại/thất bại/hủy bỏ và thời gian của người rà soát.
8. [x] Dưới sự cấp phép đánh giá tách biệt, hỗ trợ chạy các phép so sánh A/B theo cặp không gây biến đổi trạng thái trên các nhiệm vụ cha gốc (`typesafe_eval_host`).
9. [x] Tính toán tổng chi phí trên mỗi nhiệm vụ gốc hoàn thành được xác minh độc lập (báo cáo tách biệt chi phí tiền mặt và chi phí bao gồm nhân công).
10. [x] Yêu cầu Phương án B phải thỏa mãn mọi cổng an toàn/thẩm quyền đã khai báo trước và chứng minh được lợi ích có ý nghĩa ở cấp độ cha trong phạm vi ngân sách chi phí/độ trễ/khối lượng công việc.
11. [x] Đảm bảo phê duyệt đánh giá/rủi ro độc lập và phê duyệt kích hoạt tường minh; chứng minh đường dẫn máy chủ/nguyên bản thực tế, định nghĩa tiêu chí chuyển đổi/quay lui có giới hạn và bảo toàn Phương án A cho đến khi việc chuyển đổi được chấp nhận.

---

## 8. Điều kiện Mở lại, Chủ sở hữu & Siêu dữ liệu Hội đồng (Reopen Conditions, Owners & Council Metadata)

### Điều kiện Mở lại (Reopen Conditions)
- **Ưu tiên giữ Phương án A vĩnh viễn (Favor permanent A):** Khi kết quả đối chứng trên tập giữ lại đủ mẫu cho thấy B không mang lại lợi ích gia tăng có ý nghĩa, chất lượng tương đương nhưng tổng chi phí/khối lượng công việc cao hơn, vẫn bỏ sót lỗi tích hợp cấp cha, có các phê duyệt gây hại vượt ngưỡng, hoặc không thể cưỡng chế ràng buộc Cố vấn/thẩm quyền tin cậy. Khi đó, ghi nhận giới hạn và cho nghỉ hưu ứng viên B thay vì thử lại cho đến khi có số đẹp.
- **Ưu tiên thăng cấp Phương án B (Favor B promotion):** Khi kết quả đối chứng được gắn nhãn độc lập đạt tiêu chí hiệu quả/độ bất định đã khai báo trước, mọi lát cắt an toàn và chống bỏ sót nằm trong ngân sách, chi phí thực tế/nhiệm vụ hoàn thành cùng độ trễ `p95`/khối lượng công việc người rà soát nằm trong giới hạn, và có đầy đủ bằng chứng đường dẫn máy chủ/nguyên bản tin cậy kèm phê duyệt kích hoạt tường minh.
- Xem xét lại khi bản phát hành mô hình/máy chủ đã ghim thay đổi trọng yếu về năng lực, giới hạn, cam kết lưu giữ/ủy quyền hoặc hành vi trên lát cắt khó, hoặc khi có sự cố sản xuất đã xác minh làm vô hiệu hóa các giả định bằng chứng.

### Chủ sở hữu (Owners)
- **Triển khai (Implementation):** Người bảo trì bằng chứng/thẩm quyền tiện ích mở rộng và người bảo trì giao thức Cố vấn máy chủ, đồng chịu trách nhiệm về lược đồ, nguồn gốc và tích hợp nguyên bản.
- **Đánh giá / Rủi ro (Evaluation / Risk):** Trưởng nhóm đánh giá độc lập sở hữu bộ nhãn chuẩn vàng, giao thức đối chứng và độ bất định; người rà soát bảo mật/quyền riêng tư sở hữu các cổng phạm vi, ủy quyền và xử lý dữ liệu; chủ sở hữu chi phí quản lý biên lai và kế toán khối lượng công việc.
- **Kích hoạt (Activation):** Người bảo trì kho lưu trữ / chủ sở hữu phát hành chấp thuận kết quả đánh giá và chuyển đổi; người dùng / chủ sở hữu nhiệm vụ đã xác thực cung cấp quyền thực thi theo từng thao tác cụ thể. Các mô hình AI không bao giờ được tự gán thẩm quyền của bất kỳ vai trò nào nêu trên.

### Siêu dữ liệu Hội đồng (Council Metadata)
- Khởi tạo bằng quy trình phân xử `ck:council` vào ngày **2026-10-19**; lĩnh vực **ai**; **3 lăng kính**: `cost`, `docs-fidelity`, `engineering`; một ngữ cảnh nghiên cứu chuyên biệt; một ngữ cảnh phân xử.
- Toàn bộ đầu vào nguyên bản không cắt lọc: `local://jev-council-verbatim-inputs.json`, được lưu trữ bền vững tại `plans/261019-research-to-cook-execution/research/council-inputs.json`. Tài liệu nghiên cứu bền vững: `plans/261019-research-to-cook-execution/research/jev-atomic-online-verification.md`.
- Chi phí ước tính của hội đồng: chưa xác định (không có biên lai thanh toán trực tiếp; phép tính theo đơn giá token công khai không được coi là hóa đơn thực tế).
- Nghiên cứu chuyên biệt đã sử dụng **đúng 5 cuộc gọi bên ngoài (5 external calls)**. Phiên phân xử này không thực hiện thêm cuộc gọi bên ngoài, cuộc gọi đánh giá mô hình, thao tác nguyên bản hay lượt chạy kiểm chứng mới nào.

---

## 9. Bổ sung Siết chặt An toàn ngày 2026-10-19 (2026-10-19 Safety Tightening)

Phát hiện tiếp nối **F17** chứng minh trên dữ liệu tổng hợp với các hàm trợ giúp thực tế rằng nội dung suy nghĩ riêng tư (private thinking) có nguy cơ lọt vào trạng thái thẩm phán được chuẩn bị nếu không lọc chiếu công khai (không có sự cố rò rỉ dữ liệu thực tế nào xảy ra; xem `plans/reports/261019-private-context-export-evidence.json`). Phát hiện này siết chặt thêm các cổng quyền riêng tư và kích hoạt (privacy/activation gates): tuyệt đối không thực hiện các kiểm tra hoàn thành từ xa bị ảnh hưởng trước khi phép chiếu chỉ giữ dữ liệu công khai (verified public-only projection) được bật và xác minh, đồng thời không kích hoạt đơn lẻ F16 khi việc khôi phục nghĩa vụ/nợ kỹ thuật và bảo mật phát hành chưa được giải quyết trọn vẹn. Định hướng kiến trúc vẫn giữ nguyên: **ưu tiên hoàn thiện Repaired-M trước / cổng hóa Hybrid-H (Repaired-M first / H gated)**.
