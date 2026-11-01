---
title: "Nhật ký Kỹ thuật: Phân tích Nguyên nhân Gốc rễ & Kiến trúc cho Độ Trung thực Phán quyết Todo Done của TypeSafe (Technical Journal: Root-Cause Analysis & Architecture for TypeSafe Todo Done Verdict Fidelity)"
date: 2026-10-14
tags: [typesafe, jev-latest, bicameral-consensus, todo-done, calibration, plan-cli-stubs, brainstorm]
skills: [ck:scout, ck:research, ck:docs-seeker, ck:advisor, ck:brainstorm, ck:plan, ck:journal, ck:project-organization]
---

# Nhật ký Kỹ thuật: Độ Trung thực Phán quyết `todo done` & Kiến trúc Hiệu chuẩn của TypeSafe (Technical Journal: TypeSafe `todo done` Verdict Fidelity & Calibration Architecture)

## Ngữ cảnh (Context)
Trong các phiên làm việc đa giai đoạn trước đó (`ck:scout` $\rightarrow$ `ck:research` $\rightarrow$ `ck:brainstorm` $\rightarrow$ `ck:plan`), người dùng đã quan sát thấy hai hiện tượng bất thường lặp đi lặp lại trong `omp_extension`:
1. Bảng báo cáo `typesafe-task-report` liên tục hiển thị `meets_criteria=0.00` kèm thông báo `"Deliverable verification rejected: implementation is evading work, malicious, or stubs out needed functionality."` khi gọi `todo(op="done")` cho các nhiệm vụ nghiên cứu, động não (brainstorming), và lập kế hoạch trung gian, trong khi nhiệm vụ cuối cùng (sau khi toàn bộ các tập tin Markdown đã được điền đầy đủ nội dung) lại vượt qua với `meets_criteria=1.00`.
2. Các bước đánh giá trên `ask` và `todo` diễn ra bên trong các điểm móc máy chủ `pi.on("tool_call")` mà không hiển thị phán quyết phân loại của JEV (`deliverables_verdict` — categorical JEV verdicts) hay loại nhiệm vụ được suy luận (`task_type` — inferred task type) trong báo cáo nhiệm vụ.

Người dùng đã yêu cầu thực thi trọn vẹn và hiển thị tường minh toàn bộ đường ống kỹ năng:
`ck:scout` $\rightarrow$ `ck:research` $\rightarrow$ `ck:docs-seeker` $\rightarrow$ `ck:advisor` $\rightarrow$ `xd://typesafe_*` $\rightarrow$ `ck:brainstorm` $\rightarrow$ `ck:plan` $\rightarrow$ `ck:journal` $\rightarrow$ `ck:project-organization`.

## Diễn biến Thực tế (What Happened)
1. **Khảo sát Cơ sở Mã nguồn Song song (`ck:scout` — Parallel Codebase Scouting)**:
   - Khởi tạo hai tác tử `ScoutJudgeAndConsensus` và `ScoutPlannerAndEvidence` để kiểm toán `src/cook-expert-judge.ts`, `src/bicameral-consensus.ts`, `src/verification-gate.ts`, `src/evidence-collector.ts`, `typesafe-planner.ts`, và toàn bộ 35 bộ kiểm thử trong `tests/`.
2. **Nghiên cứu Tài liệu & Thực hành Tốt nhất (`ck:docs-seeker` & `ck:research` — Documentation & Best-Practices Research)**:
   - Truy xuất tài liệu trực tiếp của TypeSafe System One (`https://docs.typesafe.ai/primitives.md` và `https://docs.typesafe.ai/confidence.md`) và nghiên cứu cơ chế chấm điểm xác suất đã hiệu chuẩn (`noul` — calibrated probabilistic scoring) so với các phán quyết phân loại `choice` (categorical `choice` verdicts).
   - Xác nhận rằng chỉ số `confidence` của nguyên hàm `Choice` ($\frac{p_{\max} - 1/n}{1 - 1/n}$) đo lường mức độ tập trung phân phối xác suất vào phương án chiến thắng (ví dụ: độ tự tin rất cao vào phán quyết `"REJECT"`), trong khi `Noul` trả về xác suất đã hiệu chuẩn $P(\text{yes}) \in [0, 1]$, và cả hai nguyên hàm này hoàn toàn có thể được truy vấn song song trong cùng một yêu cầu HTTP duy nhất.
3. **Đánh giá Cố vấn Lưỡng viện & Bộ công cụ `xd://typesafe_*` (`ck:advisor` + `xd://typesafe_*` — Bicameral Advisor & `xd://typesafe_*` Evaluation)**:
   - Tham vấn `ConsultCkAdvisor` (tác tử con `ck:advisor`) và trực tiếp thực thi `xd://typesafe_advisor`, `xd://typesafe_judge`, `xd://typesafe_expert_review`, `xd://typesafe_rerank`, cùng `xd://typesafe_evaluate_multi`.
   - Trong quá trình ghi báo cáo đầu tiên vào `plans/reports/`, chúng tôi phát hiện thêm lỗi thực tế thứ 6 (`typesafe-planner.ts:1228-1232`): biểu thức `isPlanFile` khớp với `/plans[\/\\].*\.(md|markdown)$/i` và `isClosingPlan` khớp không neo đầu dòng với `/status:\s*complete(d)?\b/i`, khiến các báo cáo độc lập trong `plans/reports/` vô tình kích hoạt Chốt Bảo vệ Đóng Kế hoạch (Plan Closure Guard) bất cứ khi nào có nhiệm vụ giao kết đang hoạt động.
4. **Động não & Khởi tạo Kế hoạch (`ck:brainstorm` & `ck:plan` — Brainstorm & Plan Generation)**:
   - Trình bày 3 phương án kiến trúc cho người dùng thông qua công cụ `ask` (được chú giải trực tiếp bởi TypeSafe System One và `ck:advisor`). Người dùng đã chọn **Phương án A (Lai Nguyên hàm Kép + Bộ Phân loại Nhiệm vụ + Bộ Lọc Khung mẫu Rỗng / Option A — Dual-Primitive Hybrid + Task Classifier + Stub Filter)** và phê duyệt việc tạo kế hoạch `/ck:plan` ngay lập tức.
   - Đã sinh tập tin `plans/261014-typesafe-todo-done-verdict-fidelity/plan.md` cùng 4 tập tin giai đoạn TDD chi tiết (`phase-01` đến `phase-04`) mà không chứa bất kỳ chỗ trống `TBD` nào.

## Các Quyết định Trọng tâm (Key Decisions)
1. **Truy vấn Song song Nguyên hàm Kép (`deliverables_verdict` + `meets_criteria` — Dual-Primitive Parallel Query)**:
   - Thay vì loại bỏ `meets_criteria` (Phương án B — làm gãy 13 bài kiểm thử đơn vị hiện hữu) hoặc bỏ qua Cổng 2 đối với các nhiệm vụ không phải mã nguồn (Phương án C — mở ra lỗ hổng trốn tránh xác thực), hàm `runPhaseMacroCheck` sẽ gửi đồng thời `meets_criteria` (`type: "noul"`) bên cạnh `deliverables_verdict` (`type: "choice"`), sử dụng `rawMeetsCriteria` làm `meetsCriteriaNoul` và chỉ quay về ánh xạ phân loại dự phòng khi các bản giả lập kiểm thử đơn vị (unit test mocks) lược bỏ `meets_criteria`.
2. **Phân loại Nhiệm vụ Nhận thức kèm Bảo toàn Chống Giả mạo (Cognitive Task Classification with Anti-Spoofing Preservation)**:
   - Mở rộng `inferTaskType` để nhận diện các động từ nhận thức/luồng công việc ở bất kỳ vị trí nào trong `taskDescription` khi không có tập tin mã nguồn nào bị sửa đổi, đồng thời giữ nguyên nghiêm ngặt các quy tắc ghi đè `hasCodeFiles` và `containsCodeChanges` để mọi thay đổi mã nguồn luôn được xác thực dưới dạng `"code_change"`.
3. **Lọc Tất định Khung mẫu `isPlanCliStub` & Khớp Giai đoạn theo Ranh giới Từ (Deterministic `isPlanCliStub` Filtering & Word-Boundary Phase Matching)**:
   - Loại trừ các tập tin khung mẫu chưa được sửa đổi sinh bởi `plan-cli.cjs create` khỏi `collectDeliverableArtifacts` và `extractCriteriaFromPlan`, thay thế phép kiểm tra chuỗi con `options.taskId.includes(phaseIdentifier)` bằng biểu thức chính quy ranh giới từ `/\bphase[-_\s]*0*${escapedId}\b/i`, và loại trừ thư mục `plans/reports/` khỏi `isPlanFile`.

## Kết quả Triển khai & Xác minh (`/ck:cook --tdd` — Implementation & Verification Results)
1. **Giai đoạn 1 — Hiệu chuẩn JEV Nguyên hàm Kép (`src/cook-expert-judge.ts`, `src/plan-evaluator.ts` — Phase 1: Dual-Primitive JEV Calibration)**:
   - Bổ sung `meets_criteria` (`type: "noul"`) song hành cùng `deliverables_verdict` (`type: "choice"`) trong `runPhaseMacroCheck`, xác thực `rawMeetsCriteria` nằm trong đoạn `[0, 1]` trước khi phân giải phán quyết (đóng băng an toàn khi lỗi / fail-closed), bảo toàn `meetsCriteriaNoul` đã hiệu chuẩn, phát thông tin chẩn đoán `P=${rawMeetsCriteria.toFixed(2)}` nhận biết theo loại nhiệm vụ, và đồng bộ ngưỡng `claude_isolation_adherence` trong `src/plan-evaluator.ts` với `resolveAutoApprovalThreshold()` (`0.80`).
2. **Giai đoạn 2 — Bộ Phân loại Nhiệm vụ Nhận thức & Dự phòng Nhật ký Làm việc (`typesafe-planner.ts`, `src/bicameral-consensus.ts` — Phase 2: Cognitive Task Classifier & Work-Log Fallback)**:
   - Xuất các mẫu `COGNITIVE_TASK_PATTERN` và chốt chặn `IMPLEMENTATION_LEAD_PATTERN` trong `inferTaskType`, đồng thời đồng bộ hóa `evaluateAdvisorIntent`, đảm bảo các nhiệm vụ nghiên cứu/động não/lập kế hoạch không thay đổi mã nguồn được phân loại chính xác là `"analysis_research"` và cung cấp `convo.agentWorkLog` khi `rawDeliverableArtifacts` rỗng, trong khi vẫn giữ nguyên cơ chế ghi đè chống giả mạo `"code_change"`.
3. **Giai đoạn 3 — Bộ Lọc Khung mẫu `plan-cli.cjs` & Chốt Bảo vệ Giai đoạn theo Ranh giới Từ (`src/evidence-collector.ts`, `typesafe-planner.ts` — Phase 3: `plan-cli.cjs` Stub Filter & Word-Boundary Phase Guard)**:
   - Xuất hàm `isPlanCliStub(content)` để lọc bỏ các bản mẫu `plan-cli.cjs create` chưa được chỉnh sửa trong `collectDeliverableArtifacts` và `extractCriteriaFromPlan`, thay thế `options.taskId.includes(phaseIdentifier)` bằng `/\bphase[-_\s]*0*${escapedId}\b/i`, và loại trừ `plans/reports/` khỏi `isPlanFile`.
4. **Giai đoạn 4 — Đo xa Báo cáo Nhiệm vụ & Triển khai Đường cơ sở (`typesafe-planner.ts`, `tools/sync-baseline.cjs` — Phase 4: Task Report Telemetry & Baseline Deployment)**:
   - Mở rộng `TaskReport.scores` và `formatTaskReport` với dữ liệu đo xa `verdict` và `task_type`, xác minh toàn bộ các bộ kiểm thử (`295 pass, 0 fail` tại không gian làm việc; `310 pass, 0 fail` tại môi trường đích trên 35 tập tin), và đồng bộ sang `C:/Users/thant/Projects/omp_extension` qua `node tools/sync-baseline.cjs`.
