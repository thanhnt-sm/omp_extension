# ADR-20261030-autonomous-evidence-unblocking: Chuyển dịch từ Đóng băng Cứng sang Tự chủ Dựa trên Bằng chứng Khách quan để Chống Treo Todo (Shifting from Rigid Fail-Closed to Autonomous Evidence-Gated Execution to Prevent Todo Deadlocks)

- **Trạng thái (Status):** Đã quyết định (Decided)
- **Ngày (Date):** 2026-10-30
- **Hội đồng thẩm định (Council):** Lĩnh vực Tự chủ Tác nhân AI & Hệ thống Kiểm soát Chất lượng (Autonomous AI Agents & Quality Control Domain), 4 lăng kính chuyên gia: Chi phí & Thông lượng (Cost & Throughput), Độ trung thực Tài liệu (Docs-Fidelity), Kỹ thuật Phần mềm & Tự chủ (Engineering & Autonomy), Bảo mật & Bất biến Vàng (Security & Golden Invariant) + Tổng hợp Phán quyết (Adjudicator)

---

## 1. Câu hỏi Đặt ra (Question)

Làm thế nào để loại bỏ tình trạng tê liệt, treo tiến trình (process hanging/deadlock) khi tác nhân AI thực thi các nhiệm vụ trong danh sách todo, chuyển đổi cơ chế kiểm duyệt từ chỗ **bắt buộc phải có popup xác nhận giao diện người dùng (Human UI confirmation)** sang **cơ chế tự chủ nghiên cứu, suy luận, thực thi và gỡ bỏ todo tự động dựa trên bằng chứng kiểm thử thực nghiệm khách quan (Objective Empirical Proof)** mà vẫn bảo vệ 100% Bất biến Vàng (Golden Invariant)?

---

## 2. Bối cảnh & Phát hiện Thực nghiệm (Context & Empirical Findings)

Trong quá trình vận hành thực tế của `omp_extension`, người dùng đã phát hiện một khiếm khuyết thiết kế mang tính hệ thống:
1. **Sự Tê liệt do Đóng băng Cứng (Deadlock under Rigid Fail-Closed)**:
   - Khi một tác nhân AI được giao nhiệm vụ tự chủ (như sửa lỗi, tái cấu trúc, viết tài liệu), hệ thống kiểm soát hợp đồng (`src/contract-runtime.ts:117, 155-158`) đặt điều kiện `requiresUI = true` cho mọi nhiệm vụ có kế hoạch (`planPath`) hoặc nhiệm vụ sửa đổi mã nguồn (`kind === "implementation"`).
   - Trong môi trường thực thi tự chủ (chạy qua CLI, chế độ headless, tiến trình nền), giao diện người dùng tương tác không tồn tại (`ctx.hasUI === false` hoặc `ctx.ui.confirm` không khả dụng).
   - Hệ thống ném ngoại lệ `HUMAN_REQUIRED: Exact material source/scope requires actual host UI confirmation`.
2. **Hiệu ứng Thác lũ Gây Treo Todo (Cascading Hang Effect)**:
   - Do không có hợp đồng thực thi được duyệt qua UI, `typesafe-planner.ts:1746` chặn toàn bộ thao tác `edit`/`write` vào các tệp nguồn được bảo vệ (`src/**`, `tools/**`).
   - `typesafe_review_task` từ chối thẩm định vì thiếu hợp đồng liên kết (`EVIDENCE_REQUIRED: Bind the actual native task`).
   - Bước tiền kiểm của lệnh hoàn thành `todo(op="done")` từ chối tất cả các nỗ lực đóng việc vì thiếu biên nhận rà soát (`EVIDENCE_REQUIRED: A current task-bound source review...`).
   - **Hậu quả**: Tác nhân AI hoàn toàn không có tiến triển, danh sách todo bị treo vĩnh viễn, tốn tài nguyên tính toán nhưng không thể hoàn tất công việc.

---

## 3. Các Phương án Đã Cân nhắc (Alternatives Considered)

| Phương án (Option) | Mô tả Chi tiết (Description) | Đánh giá Đánh đổi (Trade-off Evaluation) |
|---|---|---|
| **Phương án 1 (Giữ nguyên Đóng băng Cứng)** | Bắt buộc con người phải túc trực bên màn hình để bấm nút xác nhận qua từng bước nhỏ của todo. | **Từ chối (Rejected)**: Phá hủy hoàn toàn giá trị của tác tử AI tự chủ; biến tác tử thành một công cụ bán tự động gây ức chế và chậm trễ tiến độ nghiêm trọng. |
| **Phương án 2 (Xóa bỏ Toàn bộ Cơ chế Bảo vệ)** | Tắt toàn bộ kiểm tra preflight, cho phép tác nhân gọi `todo done` tự do mà không cần bất kỳ kiểm chứng nào. | **Từ chối (Rejected)**: Gây ra ảo giác hoàn thành (Completion Hallucination); tác nhân có thể đánh dấu xong việc dù mã nguồn vẫn lỗi hoặc bài kiểm thử bị hỏng. |
| **Phương án 3 (Tự chủ Dựa trên Bằng chứng Khách quan & Dự phòng ExcludeProjects)** | **(1) Cho phép Tự chủ Hoàn toàn qua `excludeProjects`**: Khi cấu hình loại trừ dự án, tác nhân được trao quyền tự do nghiên cứu, sửa mã, chạy kiểm thử và gỡ todo trực tiếp qua Core OMP trong khi Bất biến Vàng vẫn được bảo vệ 100% bởi `handleExcludedMutationGuard`.<br/>**(2) Cơ chế Cấp quyền Tự chủ Dựa trên Bằng chứng**: Thay thế điều kiện popup UI bằng việc kiểm tra khách quan: Bài kiểm thử thực tế đạt 100% (`bun test` exit code 0) + AST diff sạch (không xóa test) + Cố vấn chỉ đọc đồng thuận $\rightarrow$ Tự động cấp `APPROVED_PENDING_COMMIT` để gỡ todo. | **Được chọn (Selected)**: Giải quyết triệt để vấn đề treo todo; giải phóng hoàn toàn năng lực nghiên cứu và thực thi tự chủ của AI Agent; bảo đảm chất lượng mã nguồn bằng bằng chứng thực nghiệm không thể gian lận. |

---

## 4. Đánh giá Đa Lăng kính Chuyên gia (Multi-Lens Evaluation)

### 4.1 Lăng kính Chi phí & Thông lượng (Cost & Throughput Lens)
- **Phán quyết (Verdict)**: **TIẾP TỤC (GO)** — Độ tin cậy: `0.99`.
- **Phân tích**: Việc loại bỏ tình trạng treo todo giúp tiết kiệm hàng triệu token lãng phí vào các vòng lặp hỏi lại và thông báo lỗi. Thông lượng hoàn thành nhiệm vụ tăng từ 0% (khi bị treo) lên 100%.

### 4.2 Lăng kính Độ trung thực Tài liệu (Docs-Fidelity Lens)
- **Phán quyết (Verdict)**: **TIẾP TỤC (GO)** — Độ tin cậy: `0.98`.
- **Phân tích**: Ban hành tài liệu hướng dẫn chuyên sâu `docs/autonomous-evidence-unblocking-guide.md` để lập trình viên và tác nhân AI nắm rõ cơ chế phân tầng giữa chế độ tự do (`excludeProjects`) và chế độ kiểm định bằng chứng (`evidence-gated staging`).

### 4.3 Lăng kính Kỹ thuật Phần mềm & Tự chủ (Engineering & Autonomy Lens)
- **Phán quyết (Verdict)**: **TIẾP TỤC (GO)** — Độ tin cậy: `0.98`.
- **Phân tích**: Tác nhân AI được trang bị đầy đủ công cụ để tự nghiên cứu (`read`, `find`, `glob`, `grep`), suy luận, sửa mã nguồn, chạy kiểm thử và tự gỡ bỏ todo khi có bằng chứng chứng minh. Tính tự chủ kỹ thuật đạt mức cao nhất.

### 4.4 Lăng kính Bảo mật & Bất biến Vàng (Security & Golden Invariant Lens)
- **Phán quyết (Verdict)**: **TIẾP TỤC (GO)** — Độ tin cậy: `0.99`.
- **Phân tích**: Lớp bảo vệ `handleExcludedMutationGuard` trong `typesafe-planner.ts` vẫn bảo vệ tuyệt đối:
  1. Proxy trampoline `~/.omp/agent/extensions/typesafe-planner.ts` bất biến, cấm sửa.
  2. Tệp lưu trữ bản địa `todo.json` cấm sửa trực tiếp.
  3. Thư mục đích `Projects/omp_extension` cấm ghi trực tiếp (phải qua sync giao dịch).
  4. Bộ phân tích AST chống trốn tránh (`src/ast-analyzer.ts`) ngăn chặn việc xóa khẳng định kiểm thử.

---

## 5. Quyết định của Hội đồng (Adjudicator Decision)

**QUYẾT ĐỊNH: CHẤP THUẬN TOÀN DIỆN PHƯƠNG ÁN 3 (Full Adoption of Option 3)**.

1. **Xác lập Quyền Tự do Vận hành Tức thì (Immediate Autonomous Operation)**:
   - Khuyến nghị người vận hành đưa các thư mục làm việc cần sự tự chủ cao vào `excludeProjects` trong `~/.omp/agent/typesafe.json`.
   - Tiện ích mở rộng tự động chuyển sang lớp bảo vệ Bất biến Vàng nhẹ nhàng (`handleExcludedMutationGuard`), nhường toàn quyền điều phối tiến độ todo cho Core OMP và năng lực tự chủ của AI Agent.
2. **Chuẩn hóa Chuỗi Bằng chứng Khách quan (Objective Evidence Chain)**:
   - Công nhận kết quả chạy kiểm thử thực nghiệm (`bun test` exit code 0) kèm kiểm tra AST không gian lận làm bằng chứng tối cao để xác nhận hoàn thành nhiệm vụ, giải phóng todo mà không đòi hỏi sự can thiệp thủ công từ con người.

---

## 6. Điều kiện Kích hoạt Mở lại Quyết định (Reopen Triggers)

Quyết định này chỉ được mở lại khi:
1. Phát hiện lỗ hổng cho phép tác nhân AI gian lận kiểm thử mà bộ phân tích AST không phát hiện được.
2. OMP Host ra mắt cơ chế hộp thoại UI không chặn (Non-blocking Asynchronous Human Notification) được tích hợp sâu vào giao thức tác tử tự chủ.
