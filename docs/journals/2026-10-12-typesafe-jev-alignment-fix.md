# 2026-10-12: Thực thi Bản Sửa lỗi Đồng bộ TypeSafe JEV (TypeSafe JEV Alignment Fix Execution)

**Ngữ cảnh & Tác nhân kích hoạt (Context & Trigger):**
- Thực thi lệnh `/ck:cook --auto D:/100.Software/Github/omp_extension/plans/261012-typesafe-jev-alignment-fix/plan.md --tdd`
- Hiện thực hóa quyết định kiến trúc **ADR-20261012-typesafe-jev-alignment**: giải quyết triệt để tình trạng từ chối diện rộng tại Cổng 2 (pervasive Gate 2 rejections — điểm số $\le 0.13$) đối với các nhiệm vụ phân tích/nghiên cứu/tài liệu (analytical/research/doc tasks) mà không làm suy giảm tính toàn vẹn xác thực (verification integrity).

**Các Thay đổi Trọng tâm Đã Áp dụng (Key Changes Applied):**
1. **Tiêm Ngữ cảnh Tầng 1 — `src/evidence-collector.ts` & `src/cook-expert-judge.ts` (Tier 1 Contextual Injection):**
   - Cập nhật `extractCriteriaFromPlan` và `collectTaskEvidence` để phân giải các tiêu chí nghiệm thu (acceptance criteria) từ các tập tin giai đoạn ủy quyền `phase-*.md` khi `taskId` tham chiếu tới một giai đoạn cụ thể.
   - Mở rộng `MacroCheckContext` với hai trường `taskType` và `deliverableArtifacts`.
   - Bổ sung hàm `collectDeliverableArtifacts` trong `typesafe-planner.ts` để đóng gói các báo cáo/tài liệu vừa được tạo gần nhất trong phạm vi ngân sách token 8KB (8KB token budget).
2. **Tiêu chí Chấm điểm Đa nhãn Nhận biết Loại Nhiệm vụ Tầng 2 — `src/cook-expert-judge.ts` (Tier 2 Task-Aware Multi-Label Rubrics):**
   - Triển khai phân nhánh tiêu chí động (dynamic rubric branching): các nhiệm vụ `analysis_research` và `doc_specification` sẽ đánh giá mức độ thấu đáo của `deliverable_artifacts` thay vì đòi hỏi tính đầy đủ của bản khác biệt mã nguồn (`unified_diff` completeness).
   - Xây dựng cơ chế ghi đè chống giả mạo (anti-spoofing override): nếu các tập tin mã nguồn (`.ts`, `.js`, v.v.) xuất hiện trong bản khác biệt (diff), `taskType` sẽ bị ép kiểu tất định (deterministically forced) về `code_change`.
3. **Điểm móc Khuyến nghị Tiền trạm & Khôi phục Khóa chết Tầng 3 — `typesafe-planner.ts` (Tier 3 Pre-Flight Advisory Hook & Deadlock Recovery):**
   - Làm rõ tài liệu và lược đồ của công cụ `xd://typesafe_verify_completion` với giới hạn thử lại mang tính khuyến nghị (advisory retry limits — $\le 2$ lần thử).
   - Bổ sung `drop` và `rm` vào `isSafeFastPath` để giải quyết vòng lặp khóa chết (deadlock loop) khi tác tử từ bỏ hoặc hủy nhiệm vụ.
   - Tích hợp thông báo giao diện người dùng (`pi.sendMessage` — UI notifications) khi tác tử hủy bỏ một nhiệm vụ đã giao kết nhằm ngăn chặn hành vi trốn tránh âm thầm (silent evasion).
4. **Xác minh Hồi quy & An toàn (Regression & Safety Verification):**
   - Bổ sung các bài kiểm thử đơn vị và đối kháng (unit and adversarial tests) xuyên suốt `tests/evidence-collector.test.ts`, `tests/cook-expert-judge.test.ts`, `tests/typesafe-planner.test.ts`, `tests/adversarial-compliance.test.ts`, và `tests/e2e-workflow.test.ts`.
   - Bộ kiểm thử toàn diện (Full test suite): 185/185 bài kiểm thử đạt (passing) trên 28 tập tin kiểm thử ở cả không gian làm việc mã nguồn và không gian làm việc thời gian chạy đích (source and target runtime workspaces).
   - Triển khai thành công sang `C:\Users\thant\Projects\omp_extension` bằng công cụ `tools/sync-baseline.cjs` kèm bản sao lưu có gắn dấu thời gian (timestamped backup).
