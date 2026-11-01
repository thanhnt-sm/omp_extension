# Nhật ký Kỹ thuật: Sửa lỗi Trả lời Quyết định của Advisor & `ck:advisor` (Technical Journal: Fixing Advisor & `ck:advisor` Decision Answering)

**Ngày (Date)**: 2026-10-14  
**Phạm vi (Scope)**: `src/bicameral-consensus.ts`, `src/cook-expert-judge.ts`, `src/evidence-collector.ts`, `typesafe-planner.ts`, `.omp/agents/`, `agents/`, `tools/sync-baseline.cjs`  
**Xác minh (Verification)**: 285/285 bài kiểm thử không gian làm việc đạt (workspace tests passing); 300/300 bài kiểm thử môi trường đích đạt (target tests passing)

---

## 1. Phát biểu Vấn đề (Problem Statement)

Khi tác tử lập trình (coding agent) cần một quyết định kỹ thuật hoặc luồng công việc (thông qua đánh chặn `ask`, `typesafe_expert_review`, các thao tác biến đổi `todo`, hoặc `task(agent="advisor" | "ck:advisor")`), `advisor` và `ck:advisor` đã không trả về được câu trả lời quyết định cụ thể—hoặc trả về `UNCERTAIN` (`"Unrecognized mutation operation"` / `"Agent work log is incomplete"`), hoặc bỏ sót khuyến nghị trên các hộp thoại hỏi `ask`, hoặc thất bại khi tìm kiếm tác tử con (subagent discovery) trong OMP.

## 2. Các Nguyên nhân Gốc rễ Đã Xác định (Root Causes Identified)

1. **Đói Ngữ cảnh Bản ghi Hội thoại (`collectConversationContext` trong `typesafe-planner.ts` — Transcript Context Starvation)**:
   - Bỏ qua toàn bộ các mục `custom_message` (`customType: "skill-prompt"` chứa yêu cầu `User: ...` của người dùng khi gọi lệnh `/ck:*`, và `customType: "advisor"` chứa các ghi chú `<advisory>` bản địa của OMP).
   - Chỉ trích xuất các khối `b.type === "text"` từ thông điệp `assistant` trong khi bỏ qua các khối suy nghĩ (`thinking`) và gọi công cụ (`toolCall`), đẩy các chuỗi rỗng `""` vào danh sách đối với các lượt chỉ gọi công cụ (tool-only turns) khiến `assistantMessages.slice(-3)` trở thành rỗng.
   - Bỏ qua `msg.role === "toolResult"`, làm mất kết quả thực thi kiểm thử (`285 pass, 0 fail`) khỏi `agentWorkLog`.
2. **Thiếu Đánh giá Quyết định & Tùy chọn tại Thùy 1 (`src/bicameral-consensus.ts` — Missing Decision & Option Evaluation in Lobe 1)**:
   - Hàm `evaluateAdvisorIntent` chỉ xử lý `operation === "drop"` và `"done"`, khiến các thao tác `"decision"`, `"ask"`, và `"mutate"` bị rơi về trạng thái mặc định `UNCERTAIN`.
   - Thiếu cơ chế chấm điểm/xếp hạng các tùy chọn ứng viên (`recommendedOption`, `recommendedIndex`, `rankedOptions`), bộ định dạng hợp đồng 6 phần cố định của `ck:advisor` (`formatCkAdvisorReport` — fixed 6-section contract formatter), và hàm `runBicameralDecisionCheck`.
3. **Thiếu Chuyển giao Advisor trong Đánh chặn `ask` & `typesafe_expert_review` (`typesafe-planner.ts` — Missing Advisor Handoff in `ask` Interception & `typesafe_expert_review`)**:
   - Nhánh `toolName === "ask"` chỉ truy vấn TypeSafe JEV cho `risk_posture` và `decision_clarity` mà không gọi `evaluateAdvisorIntent` để đính kèm khuyến nghị của Advisor / `ck:advisor` hoặc điền sẵn chỉ số tùy chọn được khuyến nghị (`recommended` option index).
   - Công cụ `typesafe_expert_review` chỉ chấp nhận các vai trò `scope_arbiter`, `drift_guard`, và `risk_security_triage`, đồng thời chưa đăng ký công cụ `typesafe_advisor`.
4. **Thiếu Định nghĩa Tác tử Nhiệm vụ của OMP (`.omp/agents/`, `agents/` — Missing OMP Task-Agent Definitions)**:
   - OMP chủ đích bỏ qua thư mục `.claude/agents` (`TASK_AGENT_CONFIG_SOURCE = ".omp"`), dẫn đến việc gọi `task(agent="advisor")` và `task(agent="ck:advisor")` bị thất bại khi thiếu `.omp/agents/advisor.md` và `.omp/agents/ck-advisor.md`.
5. **Quy kết Nhầm Commit trên các Nhiệm vụ Chỉ Đọc (`src/evidence-collector.ts` — False Commit Attribution on Read-Only Tasks)**:
   - Cấu trúc `WorkspaceSnapshot` không theo dõi `headSha`, khiến các nhiệm vụ khảo sát/chẩn đoán chỉ đọc (read-only scouting/diagnosis tasks) không có thay đổi tập tin lại vô tình kế thừa bản khác biệt `HEAD~1..HEAD` từ các commit trước đó.

## 3. Giải pháp Khắc phục (Resolution)

- **`src/bicameral-consensus.ts`**: Hiện thực hóa `evaluateAdvisorDecision`, xếp hạng tùy chọn (`rankedOptions`, `recommendedOption`, `recommendedIndex`), `formatCkAdvisorReport` (hợp đồng 6 phần của `ck:advisor`: `Verdict`, `Recommendation`, `Ranked options`, `Findings`, `Confidence`, `Open questions`), và `runBicameralDecisionCheck`. Mở rộng `operation: "done"` và `"mutate"` để nhận diện các nhiệm vụ khảo sát/chẩn đoán, nhật ký thực thi công cụ, bằng chứng kiểm thử, và các cách diễn đạt hoàn thành bằng tiếng Việt.
- **`typesafe-planner.ts`**: Sửa `collectConversationContext` để trích xuất yêu cầu người dùng từ `skill-prompt`, ghi chú `advisor`, các khối `thinking`/`toolCall`, và kết quả `toolResult`; tích hợp `evaluateAdvisorIntent` vào đánh chặn `ask` (bao gồm dự phòng khi ngoại tuyến/lỗi và điền sẵn chỉ số `recommended`); bổ sung vai trò `"advisor"` và `"ck:advisor"` vào `typesafe_expert_review`; đăng ký công cụ `typesafe_advisor`.
- **`src/evidence-collector.ts` & `src/cook-expert-judge.ts`**: Bổ sung theo dõi `headSha` vào `WorkspaceSnapshot` và đồng bộ tiêu chí `APPROVE` của `deliverables_verdict` khi `testCommand` không được chỉ định.
- **`.omp/agents/`, `agents/`, `tools/sync-baseline.cjs`**: Bổ sung các tập tin định nghĩa `advisor.md` và `ck-advisor.md`, đồng thời đồng bộ chúng sang môi trường đích và `~/.omp/agent/agents/`.
