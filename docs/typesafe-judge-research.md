# Nghiên cứu Thẩm định TypeSafe (TypeSafe Judge Research): Đánh giá Kế hoạch, Tấn công Đỏ (Red-Teaming) và Xác thực Đa Tác tử (Multi-Agent Validation)

## Tổng quan (Overview)
Tài liệu này tổng hợp các mẫu thiết kế mã nguồn mở tiên tiến nhất (State-of-the-Art Open-Source Patterns) nhằm đánh giá các bản kế hoạch do Mô hình Ngôn ngữ Lớn (LLM) sinh ra, kiểm thử xâm nhập đối kháng (Red-Teaming) các hệ thống AI và sử dụng cơ chế tranh luận đa tác tử (Multi-Agent Debate) để xác thực. Những đúc kết chuyên sâu tại đây làm nền tảng lý luận cho việc gia cố bộ thẩm định TypeSafe (TypeSafe Judge) nhằm đánh giá và sửa chữa tốt hơn các kế hoạch từng bước được tạo ra bởi các mô hình có năng lực suy luận yếu hơn.

## 1. Đánh giá Kế hoạch & Quỹ đạo Hành động của LLM (LLM Plan & Trajectory Evaluation)
Các khung công tác (Frameworks) dưới đây đo lường năng lực của một LLM trong việc hình thành, xác thực và thực thi kế hoạch:
- **[karthikv792/LLMs-Planning](https://github.com/karthikv792/LLMs-Planning) (PlanBench)**:
  Tập trung vào lập kế hoạch tự động sử dụng ngôn ngữ định nghĩa miền lập kế hoạch (Planning Domain Definition Language — PDDL). Chuyển dịch ngôn ngữ tự nhiên thành các quy tắc miền hình thức (Formal Domain Rules) để xác minh tính khả thi một cách tất định (Deterministic Executability Verification).
- **[THUDM/AgentBench](https://github.com/THUDM/AgentBench)**:
  Đánh giá các tác tử trên nhiều môi trường hệ điều hành, cơ sở dữ liệu và web nhằm theo dõi các bước thực thi trung gian cũng như mức độ tuân thủ kế hoạch (Plan Adherence).
- **[webarena-ai/webarena](https://github.com/webarena-ai/webarena)**:
  Kiểm thử việc lập kế hoạch nhiệm vụ đầu-cuối (End-to-End Task Planning) trong các môi trường động có tầm nhìn dài hạn (Long-Horizon Dynamic Settings), nơi các kế hoạch bắt buộc phải thích ứng với những trạng thái bất ngờ.

*Chiến lược Kế thừa (Inheritance Strategy):* Đưa vào một bước tiền kiểm cấu trúc (Structural Pre-Check) tương tự như các bộ xác minh hình thức của PlanBench nhằm loại bỏ ngay lập tức các kế hoạch bị đứt gãy logic hoặc không thể thực thi trước khi triển khai các lượt đánh giá ngữ nghĩa tốn kém (Expensive Semantic Evaluations).

## 2. Kiểm thử Đối kháng Đỏ & Bảo mật Chống Tấn công LLM (LLM Red Teaming & Adversarial Security)
Các khung công tác này tự động hóa việc kiểm thử đối kháng (Adversarial Testing) và phát hiện lỗ hổng bảo mật:
- **[NVIDIA/garak](https://github.com/NVIDIA/garak)**:
  Đóng vai trò như một công cụ rà quét `"nmap"` dành cho LLM, thăm dò các mô hình để tìm kiếm lỗ hổng tiêm lệnh (Prompt Injection), ảo giác (Hallucinations) và các kỹ thuật vượt rào đã biết (Known Jailbreaks).
- **[microsoft/PyRIT](https://github.com/microsoft/PyRIT)**:
  Điều phối các chiến dịch tấn công đối kháng thích ứng đa lượt (Multi-Turn Adaptive Adversarial Campaigns) nhắm vào các mô hình, tác tử và đường ống tạo sinh tăng cường truy xuất (RAG Pipelines).
- **[promptfoo/promptfoo](https://github.com/promptfoo/promptfoo)**:
  Tích hợp quét bảo mật và kiểm thử đối kháng đỏ vào đường ống CI/CD, đối chiếu các phát hiện với tiêu chuẩn OWASP dành cho LLM (OWASP Top 10 for LLMs).

*Chiến lược Kế thừa (Inheritance Strategy):* Triển khai cơ chế phân tích biên XML nghiêm ngặt (Rigorous XML-Boundary Parsing) và các ràng buộc khắc phục lỗi (Remediation Constraints). Việc đánh giá đối kháng đảm bảo bộ thẩm định gắn cờ chính xác các hành vi tiêm lệnh hoặc các mục tiêu bị ảo giác ẩn bên trong các bản kế hoạch được sinh ra.

## 3. Xác thực & Tranh luận Đa Tác tử (Multi-Agent Validation & Debate)
Các khung công tác này thay thế việc đánh giá bằng một mô hình đơn lẻ bằng sự đồng thuận đa tác tử (Multi-Agent Consensus) nhằm giảm thiểu thiên kiến:
- **[chanchimin/ChatEval](https://github.com/chanchimin/ChatEval)**:
  Sử dụng một hội đồng gồm các tác tử trọng tài LLM tự hành (Autonomous LLM Referee Agents) mang các nhân cách khác biệt (Distinct Personas) để tranh luận về những điểm bất đồng và đi đến đồng thuận, giúp giảm thiểu tối đa thiên kiến của thẩm phán đơn lẻ (Single-Judge Bias).
- **[microsoft/autogen](https://github.com/microsoft/autogen)** (AgentEval):
  Sử dụng các tác tử Phê bình (`CriticAgent`), Định lượng (`QuantifierAgent`) và Xác minh (`VerifierAgent`) để định nghĩa tiêu chí và kiểm chứng sự thành công của quy trình làm việc đa tác tử.

*Chiến lược Kế thừa (Inheritance Strategy):* Đưa vào cơ chế tranh luận đa nhân cách (Multi-Persona Debate gồm Kiến trúc sư — `Architect`, Bảo mật — `Security`, Hiệu năng — `Performance`, Trải nghiệm Người dùng — `UX`, và Người phản biện — `Devil's Advocate`) được vận hành bởi một phân tầng mô hình nhanh và tiết kiệm chi phí như một bước tiền đánh giá. Bước này giúp sàng lọc cộng tác các điểm yếu cấu trúc trước khi bước vào giai đoạn thực thi sâu.

## Kết luận & Các Bước Hành động Tiếp theo (Conclusion & Actionable Next Steps)
Để gia cố toàn diện bộ thẩm định TypeSafe (TypeSafe Judge):
1. **Phân loại Tiền Đánh giá (Pre-Evaluation Triage)**: Bổ sung bước kiểm tra cấu trúc tất định (`runStructuralTriage` trong `src/plan-evaluator.ts`) để loại bỏ ngay lập tức các kế hoạch thiếu bước thực hiện hoặc có các phụ thuộc lơ lửng (Floating Dependencies).
2. **Các Cổng Xác thực Nghiêm ngặt (Strict Verification Gates)**: Thực thi các ràng buộc bất biến sử dụng thẻ bao đóng XML (`src/xml-enclosure.ts`, `src/remediation-generator.ts`) và cung cấp hướng dẫn khắc phục có cấu trúc khi xảy ra lỗi.
3. **Tranh luận Đa Nhân cách (Multi-Persona Debate)**: Tích hợp cuộc tranh luận đồng thuận tốc độ cao (`runMultiPersonaDebate` trong `src/debate-evaluator.ts`) vào pha tiếp nhận để thẩm định toàn diện các bản kế hoạch.
