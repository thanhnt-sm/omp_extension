# Nhật ký Kỹ thuật: Sửa lỗi Kiểm soát Cổng Vòng đời TypeSafe & Ủy quyền của Con người (Technical Journal: TypeSafe Lifecycle Gating & Human Authorization Fix)

**Ngày (Date):** 2026-10-07  
**Tác giả (Author):** Tác tử AI & Cộng tác viên Con người (AI Agent & Human Collaborator)  
**Trạng thái (Status):** Hoàn tất (Completed)  
**Thẻ (Tags):** `typesafe`, `lifecycle`, `gating`, `tdd`, `security`, `plan-cli`, `claude-isolation`

---

## 1. Tổng quan & Ngữ cảnh (Overview & Context)

Trong quá trình thực thi nhiệm vụ tự hành dưới bộ máy xác thực TypeSafe System One (TypeSafe System One verification engine), các tác tử đã gặp phải lỗi vi phạm bất biến dương tính giả nghiêm trọng (severe false-positive invariant violation) khi khởi tạo kế hoạch và danh sách công việc ban đầu (`op: "init"`). Logic đánh chặn của trình lập kế hoạch đã kiểm tra vô điều kiện mảng `dropOrInit` và từ chối mọi thao tác `init` nếu không có ủy quyền đã xác minh từ con người—ngay cả khi danh sách nhiệm vụ đang hoàn toàn trống rỗng.

Hoạt động kiểm thử xâm nhập đội đỏ (adversarial red-teaming) còn phát hiện thêm hai lỗ hổng nghiêm trọng:
1. **Cửa hậu Hoàn thành Kế hoạch (The Plan Completion Backdoor):** Trong khi thao tác `todo done` bị kiểm soát cổng kép nghiêm ngặt (Gate 1 kiểm thử cục bộ + Gate 2 đồng bộ ngữ nghĩa), tác tử lại có thể lách qua toàn bộ cơ chế kiểm soát cổng bằng cách sửa trực tiếp `plan.md` thành `status: completed` hoặc gọi lệnh `plan-cli.cjs check` trực tiếp trong `bash`.
2. **Khoảng trống Không có Độ bao phủ Kiểm thử (The Zero Test Coverage Void):** Logic đánh chặn của `handleTodoInterception`, các quy tắc vi phạm bất biến (invariant violation rules), và các chốt bảo vệ hủy/đặt lại nhiệm vụ (drop/reset guards) hoàn toàn chưa có độ bao phủ kiểm thử tự động trong `tests/`.

---

## 2. Các Thay đổi Trọng tâm & Quyết định Kiến trúc (Key Changes & Architectural Decisions)

### A. Nới lỏng Bất biến khi Danh sách Nhiệm vụ Rỗng — Tự do Khởi tạo từ Trạng thái Rỗng sang Giao kết (Empty Task List Invariant Relaxation — Empty-to-Contracted Freedom)
- Theo dõi các nhiệm vụ đã giao kết đang hoạt động thông qua tập hợp `activeContractedTasks` trong `typesafe-planner.ts`.
- Nới lỏng kiểm tra vi phạm bất biến khi `dropOrInit.length === 1 && dropOrInit[0].op === "init" && activeContractedTasks.size === 0`.
- Bảo toàn các yêu cầu ủy quyền con người nghiêm ngặt (`isHuman: true`, `authorized: true`, hoặc `allowJudgeModification: true`) bất cứ khi nào đã có nhiệm vụ đang hoạt động hoặc khi có nhiệm vụ bị hủy bỏ (`drop`).

### B. Hướng dẫn Khắc phục Có thể Hành động (`NEXT ACTIONS FOR AGENT` — Actionable Remediation Guidance)
- Làm giàu toàn bộ thông báo từ chối (Vi phạm Bất biến / Invariant Violations, lỗi kiểm thử Vi kiểm Cổng 1 / Gate 1 Micro-Check test failures, lệch ngữ nghĩa Vĩ kiểm Cổng 2 / Gate 2 Macro-Check semantic drift, và chặn Đóng Kế hoạch / Plan Closure blocks) bằng các chỉ dẫn Markdown có cấu trúc nêu chi tiết các bước hành động tiếp theo.
- Ngăn chặn các vòng lặp thử lại vô tận (infinite retry loops) và hiện tượng kẹt chốt chặn (stall ratchets) bằng cách cung cấp cho mô hình các lộ trình khắc phục rõ ràng, không mơ hồ.

### C. Đánh chặn Trực tiếp Tập tin Kế hoạch & Công cụ `plan-cli` (Direct Plan File & Plan-CLI Interception)
- Đánh chặn các lệnh gọi công cụ `write` và `edit` nhắm tới `plans/**/*.md` cố tình đặt `status: completed` trong khi vẫn còn nhiệm vụ chưa hoàn thành.
- Đánh chặn các lệnh gọi công cụ `bash` thực thi `plan-cli.cjs check` trong khi các nhiệm vụ đã giao kết vẫn đang hoạt động.

### D. Bộ Kiểm thử Hồi quy TDD Toàn diện (Comprehensive TDD Regression Suite)
- Tạo mới `tests/typesafe-lifecycle-gating.test.ts` với 6 trường hợp kiểm thử chuyên sâu bao phủ:
  - Nới lỏng khi khởi tạo mới từ đầu (Fresh bootstrap relaxation).
  - Từ chối đặt lại/hủy bỏ khi có nhiệm vụ đang hoạt động (Active task reset/drop rejection).
  - Ghi đè bằng ủy quyền của con người (Human authorization overrides).
  - Định dạng thông điệp hướng dẫn khắc phục có thể hành động (Actionable remediation message formatting).
  - Đánh chặn hoàn thành trực tiếp trên tập tin kế hoạch (Plan file completion interception).
  - Đánh chặn lệnh `bash` gọi `plan-cli` (Plan-CLI bash command interception).

---

## 3. Xác minh Bất biến & Cô lập (Invariants & Isolation Verification)

- **Cô lập Claude (`claude_account_untouched` = 1.0 — Claude Isolation):** Không có bất kỳ sửa đổi nào được thực hiện đối với `~/.claude`, các điểm móc toàn cục (global hooks), bản kê khai MCP (MCP manifests), hoặc thông tin xác thực của người dùng.
- **Tính Toàn vẹn Kiểm thử (Test Integrity):** Không có câu lệnh khẳng định kiểm thử nào bị làm yếu đi hoặc bỏ qua để đạt trạng thái xanh.
- **Kết quả Xác minh (Verification Results):**
  - `tests/typesafe-lifecycle-gating.test.ts`: **6 đạt (`passed`)**, 0 thất bại (`failed`).
  - `tests/cook-interception-bridge.test.ts`: **9 đạt (`passed`)**, 0 thất bại (`failed`).
  - `tests/redteam-vulnerabilities.test.ts`: **7 đạt (`passed`)**, 0 thất bại (`failed`).
  - `tests/typesafe-integrity.test.ts`: **1 đạt (`passed`)**, 0 thất bại (`failed`).
  - `tests/typesafe-planner.test.ts`: **4 đạt (`passed`)**, 0 thất bại (`failed`).
  - Điểm Rà soát Mã nguồn (Code Review Score): **9.5/10 (Đã phê duyệt / Approved)**.

---

## 4. Trạng thái & Chiêm nghiệm (Status & Reflection)
- Các thay đổi đã được ghi nhận vào nhánh `master` tại mã commit `2341651` (`fix(gating): relax initial todo init and gate plan completion lifecycle`).
- Toàn bộ bộ kiểm thử được xác minh đạt trạng thái xanh với tất cả 6 bài kiểm thử hồi quy đều vượt qua.
- Hướng dẫn `NEXT ACTIONS` có tính hành động cao giúp chấm dứt hiệu quả tình trạng tác tử vùng vẫy lặp đi lặp lại (agent thrashing) khi vi phạm bất biến, đồng thời cung cấp chỉ dẫn leo thang xin ủy quyền con người một cách minh bạch.
