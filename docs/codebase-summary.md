# Codebase Summary: omp_extension

Tóm tắt cấu trúc, các thành phần cốt lõi và kiến trúc bảo vệ của `omp_extension`.

---

## 1. Mục đích Dự án (Project Purpose)

`omp_extension` cung cấp giải pháp tích hợp giữa Oh-My-Pi (OMP) và TypeSafe System One (`jev-latest`), đóng vai trò như một lớp phòng vệ chấp hành (Compliance & Execution Guard) ngăn chặn các hành vi gian lận test, ảo giác hoàn thành task, và trôi dạt kiến trúc (architectural drift) từ các mô hình AI.

---

## 2. Bản đồ Cấu trúc Mã nguồn (Source Code Map)

### Extension & Entry Points
- `typesafe-planner.ts`: Điểm tích hợp chính với OMP runtime. Đăng ký các công cụ (`typesafe_judge`, `typesafe_rerank`, `typesafe_evaluate_multi`), lắng nghe sự kiện (`session_start`, `before_tool_call`), bảo vệ file `todo.json`, và quản lý vòng đời Dual-Gate Verification.

### Thư mục `src/` (Core Logic)
- `src/verification-gate.ts`: Thực thi hệ thống kiểm chứng kép Dual-Gate (Gate 1 Deterministic Preconditions + Gate 2 Semantic Evaluation) và sinh hướng dẫn khắc phục fallback (`generateFallbackRemediation`).
- `src/cook-expert-judge.ts`: Định nghĩa các hàm đánh giá chuyên sâu (Micro-Check, Macro-Check, Scope Arbiter, Drift Guard, Risk/Security Triage).
- `src/plan-evaluator.ts`: Đánh giá bản nháp kế hoạch (Plan Draft Elevation), kiểm tra cách ly bảo vệ thư mục `.claude/` (`checkClaudePlanIsolation`), và phân loại cấu trúc ban đầu (`preEvaluationTriage`).
- `src/payload-safety.ts`: Kiểm soát an toàn dữ liệu xuất (Egress), làm sạch (redact) các token nhạy cảm (`sk-ant-*`), và giới hạn kích thước payload $\le 32\text{ KB}$.
- `src/evidence-collector.ts`: Thu thập bằng chứng thực tế tại local (git status, git diff, và kết quả chạy test tự động).
- `src/auth-manager.ts`: Quản lý xác thực, hash token, giới hạn số lần retry khi gặp lỗi 401/403, và bảo vệ trạng thái auth.
- `src/xml-enclosure.ts`: Đóng gói an toàn các chuỗi dữ liệu không tin cậy vào các thẻ XML cách ly.
- `src/ast-analyzer.ts`: Phân tích cây cú pháp trừu tượng (AST) để phát hiện hành vi xóa assertion hoặc làm yếu bộ test.

### Thư mục `docs/` (Tài liệu Kỹ thuật)
- `docs/typesafe-judge-architecture.md`: Tài liệu toàn diện về kiến trúc điều khiển, sequence diagram, và hướng dẫn xử lý sự cố.
- `docs/typesafe-operations.md`: Runbook vận hành khẩn cấp (resetFailures, model configuration, allow modification).
- `docs/SAD.md` & `docs/SDD.md`: Tài liệu thiết kế kiến trúc hệ thống và đặc tả chi tiết.
- `docs/typesafe-red-team-report.md`: Báo cáo đánh giá bảo mật và kiểm thử tấn công (Red-Team).

---

## 3. Quy chuẩn & Ràng buộc Kỹ thuật

- **Tighten-Only Lattice Policy**: Đánh giá từ TypeSafe chỉ được phép tăng cấp độ kiểm duyệt hoặc từ chối, tuyệt đối không được phép tự động phê duyệt hoặc bỏ qua kiểm thử.
- **Claude Zero-Touch Isolation**: Mọi kết nối phân tích ngữ nghĩa đi thẳng đến endpoint của TypeSafe (`https://api.typesafe.ai/v1/systemone`), không chạm vào token hoặc file cấu hình của Anthropic/Claude.
- **Fail-Closed Execution**: Khi mất mạng, lỗi auth, hoặc API không khả dụng, hệ thống chuyển sang chế độ an toàn (chặn tự động hoàn thành và yêu cầu xác nhận từ con người).
