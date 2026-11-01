# ADR-20261030-runtime-compatibility-and-doc-parity: Đồng bộ Tài liệu theo Bản kê Schema v2, Tách rời Hoàn toàn khỏi .claude & Tương thích Môi trường Node/Bun Đa Nền tảng (Doc Parity to Schema v2 Manifest, Complete .claude Independence, and Multi-Runtime Node/Bun Compatibility)

- **Trạng thái (Status):** Đã quyết định (Decided)
- **Ngày (Date):** 2026-10-30
- **Hội đồng thẩm định (Council):** Lĩnh vực Kỹ thuật Phần mềm & Hạ tầng (Software Engineering & Infrastructure Domain), 4 lăng kính chuyên gia: Chi phí (Cost), Độ trung thực Tài liệu (Docs-Fidelity), Kỹ thuật Phần mềm (Engineering), Bảo mật & Cách ly (Security & Isolation) + Tổng hợp Phán quyết (Adjudicator)

---

## 1. Câu hỏi Đặt ra (Question)

Kho lưu trữ `omp_extension` cần xử lý triệt để các bất cập nào về tính tương thích môi trường thực thi (runtime compatibility), sự lệch pha tài liệu (documentation drift) sau khi nâng cấp lên Bản kê Schema v2 (Manifest Schema v2), và các lỗi cú pháp kết xuất đồ họa Mermaid v11, nhằm bảo đảm hệ thống vận hành ổn định 100% trên cả Node.js (kể cả các phiên bản LTS cũ như Node 14.19.3) và Bun (v1.4.0+)?

---

## 2. Bối cảnh & Phát hiện Thực nghiệm (Context & Empirical Findings)

Qua đợt rà soát toàn diện mã nguồn, bộ kiểm thử, tài liệu kỹ thuật và chuỗi công cụ đồng bộ (`tools/oneclick-omp.bat`, `tools/verify-omp-global.cjs`, `tools/sync-baseline.cjs`), Hội đồng đã ghi nhận các sự kiện thực nghiệm sau:

1. **Lỗi Không tương thích ES2022 trên Môi trường Node Kế thừa (ES2022 Incompatibility on Legacy Node Host)**:
   - Trên máy trạm Windows hiện tại, Node.js toàn cục ở phiên bản `v14.19.3`. Phương thức `Object.hasOwn` (được bổ sung từ Node 16.9.0 / ES2022) chưa tồn tại (`typeof Object.hasOwn === "undefined"`).
   - Trong `tests/sync-baseline.test.ts:578`, mã kiểm thử đã tạo kịch bản thăm dò con dùng `Object.hasOwn(process.env, name)`, dẫn đến lỗi `TypeError: Object.hasOwn is not a function` khi tiến trình con PowerShell kích hoạt `node.exe`. Đây là bài kiểm thử duy nhất bị thất bại (`1 fail / 960 tests`).
   - Tương tự, trong các tệp CommonJS dùng chung (`src/typesafe-policy-client.cjs:21`, `src/typesafe-api-client.cjs:307`), việc gọi `Object.hasOwn` gây rủi ro ném ngoại lệ nếu được nạp bởi tiến trình con Node cũ.

2. **Lệch pha Tài liệu Nghiêm trọng về Số lượng Gốc Quản lý (Severe Documentation Drift on Managed Roots)**:
   - Báo cáo bàn giao `plans/reports/261030-claude-independence-and-exclusion-handoff.md` và mã nguồn `tools/sync-baseline.cjs` đã chính thức nâng cấp Bản kê lên **Schema Version 2**: tách rời hoàn toàn khỏi `.claude`, loại bỏ gốc `global_claude`, và chỉ quản lý duy nhất **2 gốc hợp lệ**:
     - `target`: `C:/Users/thant/Projects/omp_extension` (513 tệp).
     - `global_omp_agents`: `~/.omp/agent/agents/` (2 tệp: `advisor.md`, `ck-advisor.md`).
   - Tổng số tệp quản lý đồng bộ đạt `515/515 tệp` khớp 100% SHA-256.
   - Tuy nhiên, hàng loạt tài liệu cốt lõi (`SAD.md`, `codebase-summary.md`, `solution-explanation.md`, `deployment-guide.md`, `system-architecture.md`, `AGENTS.md`) vẫn mô tả kiến trúc cũ với "3 gốc quản lý (`target`, `global_claude`, `global_omp_agents`)" và đề cập đến việc đọc cấu hình từ `~/.claude/.ck.json` thay vì `~/.omp/agent/typesafe.json`.

3. **Lỗi Cú pháp Phân tích Sơ đồ Mermaid v11 (Mermaid v11 Syntax Parse Crashes)**:
   - `docs/operations-and-user-guide.md:137`: Chứa dấu chấm phẩy `;` bên trong thông điệp của sơ đồ tuần tự (`sequenceDiagram`), khiến bộ phân tích Mermaid coi là kết thúc câu lệnh và gây lỗi vỡ khung hình.
   - `docs/project-roadmap.md:12-32`: Sơ đồ dòng thời gian (`timeline`) chứa dấu hai chấm `:` bên trong dòng `title` và các dòng `section`, gây lỗi `Cannot read properties of undefined (reading 'events')`.
   - `docs/solution-explanation.md:202-203`: Nhãn cạnh chứa dấu ngoặc đơn chưa được bao bọc trong ngoặc kép `|"..."|` (`|Đạt (Pass)|`), gây lỗi phân tích `Expecting ..., got 'PS'`.

---

## 3. Các Phương án Cân nhắc (Alternatives Considered)

| Phương án (Option) | Mô tả Chi tiết (Description) | Đánh giá Đánh đổi (Trade-off Evaluation) |
|---|---|---|
| **Phương án 1 (Ép buộc Nâng cấp Node 18+)** | Yêu cầu người dùng hoặc CI/CD bắt buộc cài đặt Node.js $\ge 18$ và cập nhật PATH toàn máy. | **Từ chối (Rejected)**: Vi phạm tính độc lập, gây phiền toái cho môi trường lập trình viên đã cấu hình sẵn Node LTS cũ; không giải quyết được tính di động (portability) của kho mã nguồn. |
| **Phương án 2 (Thay thế An toàn Ngược & Chuẩn hóa Đồng bộ Tài liệu)** | (1) Thay thế toàn bộ `Object.hasOwn` thành `Object.prototype.hasOwnProperty.call` trong toàn bộ mã kiểm thử và CJS; (2) Cập nhật toàn bộ tài liệu kiến trúc sang Schema v2 (2 gốc quản lý, độc lập `.claude`); (3) Sửa triệt để các lỗi cú pháp Mermaid v11. | **Được chọn (Selected)**: Đảm bảo khả năng tương thích 100% trên cả Node 14/16/18/20/22 và Bun 1.4+, đưa tỷ lệ vượt qua bài kiểm thử lên 100% (`960/960 pass`), xóa bỏ hoàn toàn sự lệch pha tài liệu, và khôi phục hiển thị trực quan hoàn hảo. |

---

## 4. Đánh giá Đa Lăng kính Chuyên gia (Multi-Lens Expert Evaluation)

### 4.1 Lăng kính Chi phí & Vận hành (Cost & Operations Lens)
- **Phán quyết (Verdict)**: **TIẾP TỤC (GO)** — Độ tin cậy: `0.98`.
- **Phân tích**: Việc tương thích ngược không làm tăng dung lượng mã nguồn hoặc chi phí tính toán ($0 token egress, 0 độ trễ mạng). Ngăn ngừa việc bảo trì tốn kém do lỗi vỡ môi trường trên máy trạm của lập trình viên.

### 4.2 Lăng kính Độ trung thực Tài liệu (Docs-Fidelity Lens)
- **Phán quyết (Verdict)**: **TIẾP TỤC (GO)** — Độ tin cậy: `0.99`.
- **Phân tích**: Bắt buộc phải đồng bộ tài liệu khớp chính xác với mã nguồn thực tế của `tools/sync-baseline.cjs` (Schema Version 2). Việc để tài liệu nói "3 gốc" trong khi mã nguồn chỉ chạy "2 gốc" là vi phạm nghiêm trọng nguyên tắc "Nguồn Sự thật Duy nhất" (Single Source of Truth). Sửa toàn bộ lỗi cú pháp Mermaid giúp tài liệu đạt chuẩn hiển thị cao nhất theo `ck:ui-ux-pro-max`.

### 4.3 Lăng kính Kỹ thuật Phần mềm (Software Engineering Lens)
- **Phán quyết (Verdict)**: **TIẾP TỤC (GO)** — Độ tin cậy: `0.97`.
- **Phân tích**: `Object.prototype.hasOwnProperty.call(obj, prop)` là thành ngữ JavaScript chuẩn mực, an toàn tuyệt đối từ ES3 tới ES2026. Kết quả thực nghiệm kiểm chứng: bài kiểm thử `tests/sync-baseline.test.ts` từ chỗ thất bại đã vượt qua hoàn toàn với 39/39 pass, nâng tổng số bài kiểm thử lên 960/960 pass.

### 4.4 Lăng kính Bảo mật & Cách ly (Security & Isolation Lens)
- **Phán quyết (Verdict)**: **TIẾP TỤC (GO)** — Độ tin cậy: `0.99`.
- **Phân tích**: Tách rời hoàn toàn khỏi `.claude` là quyết định bảo mật đúng đắn, ngăn chặn việc rò rỉ hoặc đọc nhầm tệp cấu hình của công cụ khác. Bất biến Vàng (Golden Invariant: không bao giờ ghi đè proxy bất biến và không sửa trực tiếp tệp toàn cục) được bảo vệ nguyên vẹn.

---

## 5. Quyết định của Hội đồng (Adjudicator Decision)

**QUYẾT ĐỊNH: CHẤP THUẬN TOÀN DIỆN PHƯƠNG ÁN 2 (Full Adoption of Option 2)**.

1. **Chuẩn hóa Tương thích Thực thi (Runtime Compatibility Standardization)**:
   - Sử dụng `Object.prototype.hasOwnProperty.call` trong toàn bộ các tệp kiểm thử và mô-đun thời gian chạy để tương thích hoàn toàn với Node.js $\ge 14$ và Bun $\ge 1.0$.
2. **Chuẩn hóa Tài liệu Schema v2 (Documentation Schema v2 Alignment)**:
   - Đồng bộ hóa toàn bộ các tệp tài liệu trong `docs/` và `AGENTS.md` theo Bản kê Schema v2: 2 gốc quản lý duy nhất (`target` và `global_omp_agents`), cấu hình đặt tại `~/.omp/agent/typesafe.json`.
3. **Khắc phục Lỗi Cú pháp Mermaid v11 (Mermaid Syntax Rectification)**:
   - Sửa chữa toàn bộ các điểm nghẽn cú pháp trong `docs/operations-and-user-guide.md`, `docs/project-roadmap.md`, `docs/solution-explanation.md` theo quy chuẩn `ck:mermaidjs-v11`.

---

## 6. Điều kiện Kích hoạt Mở lại Quyết định (Reopen Triggers)

Quyết định này chỉ được mở lại để xem xét khi:
1. Dự án chính thức nâng trần môi trường tối thiểu lên Node.js $\ge 20$ và loại bỏ hoàn toàn các phụ thuộc CommonJS cũ.
2. OMP Host thay đổi cơ chế nạp phần mở rộng (ví dụ: chuyển từ Loader Proxy Trampoline sang nạp nhị phân trực tiếp).
3. Có yêu cầu kỹ thuật mới phát sinh cần quản lý thêm gốc thứ 3 ngoài `target` và `global_omp_agents`.
