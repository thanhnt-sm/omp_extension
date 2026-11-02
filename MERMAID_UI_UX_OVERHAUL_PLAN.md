---
title: "Kế hoạch Rà soát, Sửa lỗi Cú pháp và Chuẩn hóa Trực quan Toàn bộ Sơ đồ Mermaid v11 theo Chuẩn UI/UX Pro Max"
status: completed
priority: P1
effort: "completed"
supersededBy: "261102-atomic-judge-proactive-advisor-healing"
completedInCycle: "2026-11-02"
verificationSuite: "tests/atomic-jev-judge.test.ts, tests/proactive-advisor-dispatch.test.ts"
---
# Kế hoạch Rà soát, Sửa lỗi Cú pháp và Chuẩn hóa Trực quan Toàn bộ Sơ đồ Mermaid v11 theo Chuẩn UI/UX Pro Max

## Context
Toàn bộ kho mã nguồn hiện có 72 khối sơ đồ Mermaid trải rộng trên `README.md`, `docs/**` và `plans/**`, nhưng qua kiểm chứng thực tế bằng trình phân tích và kết xuất DOM `Mermaid v11` (`v11.12.0+` trên nhân Chromium), có **4 sơ đồ bị lỗi cú pháp nghiêm trọng không thể hiển thị (parse/render crash)**, **3 sơ đồ hiển thị sai ký tự thoát `\\`**, **1 sơ đồ dùng emoji làm biểu tượng cấu trúc (vi phạm quy tắc `no-emoji-icons` của `ck:ui-ux-pro-max`)**, **6 sơ đồ dùng từ khóa `graph` cũ thay vì `flowchart`**, **18 sơ đồ bị biến dạng tỷ lệ khung hình cực đoan** (`viewBox` rộng tới `5260px` với `AR = 12.06–14.35` hoặc cao tới `5104px` với `AR = 0.22–0.34` do các nút rời rạc trong `subgraph` bị Dagre xếp chồng dọc), và **10 tệp tài liệu cốt lõi (`AGENTS.md`, `docs/typesafe-red-team-report.md`, `docs/typesafe-judge-research.md`, 7 tệp `docs/decisions/ADR-*.md`) chưa có sơ đồ Mermaid**. Kế hoạch này sửa triệt để 100% lỗi cú pháp/hiển thị, tái cấu trúc bố cục theo chuẩn thị giác `ck:ui-ux-pro-max` (bảng màu ngữ nghĩa độ tương phản WCAG AAA $\ge 7:1$, tỷ lệ khung hình hài hòa `0.45 <= AR <= 3.5`), bổ sung sơ đồ Mermaid chi tiết cho toàn bộ các tài liệu còn thiếu, và đồng bộ hóa 6 tầng sang môi trường toàn cục OMP.

---

## Approach

### Bước 1: Chuẩn hóa Hệ thống Thiết kế Thị giác Mermaid v11 (`ck:ui-ux-pro-max` + `ck:mermaidjs-v11`)
Áp dụng thống nhất bộ quy tắc thị giác và cú pháp sau cho mọi sơ đồ được sửa hoặc thêm mới trong `README.md`, `AGENTS.md`, `docs/**/*.md`, và `plans/**/*.md`:

1. **Bảng màu Token Ngữ nghĩa Tương phản Cao (`classDef` — Đạt chuẩn WCAG AAA $\ge 7:1$ trên nền tối & sáng)**:
   ```mermaid
   classDef host fill:#0f172a,stroke:#38bdf8,color:#f8fafc,stroke-width:1.5px
   classDef core fill:#1e3a8a,stroke:#60a5fa,color:#f8fafc,stroke-width:1.5px
   classDef gate fill:#065f46,stroke:#34d399,color:#f8fafc,stroke-width:1.5px
   classDef advisor fill:#581c87,stroke:#c084fc,color:#f8fafc,stroke-width:1.5px
   classDef warn fill:#7c2d12,stroke:#fb923c,color:#f8fafc,stroke-width:1.5px
   classDef danger fill:#7f1d1d,stroke:#f87171,color:#f8fafc,stroke-width:1.5px
   classDef muted fill:#1e293b,stroke:#64748b,color:#f8fafc,stroke-width:1px
   ```
   - Trong `stateDiagram-v2`, khai báo `classDef` ở đầu sơ đồ và gán bằng lệnh `class <StateId> <className>` ở cuối sơ đồ.
2. **Quy tắc Cú pháp Chống Lỗi Phân tích (`Zero Parse-Error Invariants`)**:
   - **Trong `flowchart`**: Mọi nhãn nút (`[...]`, `([...])`, `{...}`, `[(...)]`, `[[...]]`) và nhãn cạnh (`-->|"..."|`) có chứa dấu ngoặc đơn `(...)`, dấu hai chấm `:`, dấu chấm phẩy `;`, hoặc ký tự toán học `<`, `>`, `=` **bắt buộc** bọc trong dấu ngoặc kép `"..."`. Dùng `<br/>` để ngắt dòng (tối đa `55–65` ký tự/dòng); không dùng `\\` trong đường dẫn (dùng `/` như `tools/oneclick-omp.bat`).
   - **Trong `sequenceDiagram`**: Tuyệt đối **không dùng dấu chấm phẩy `;`** bên trong văn bản thông điệp sau dấu `:` (vì trình phân tích `sequenceDiagram` coi `;` là ký tự kết thúc câu lệnh `NEWLINE`). Thay `;` bằng dấu gạch ngang dài `—` hoặc dấu phẩy `,`. Dùng `<br/>` để ngắt các thông điệp dài `> 75` ký tự thành 2 dòng gọn gàng.
   - **Trong `timeline`**: Tuyệt đối **không dùng dấu hai chấm `:`** bên trong dòng `title` hoặc dòng `section` (vì trình phân tích `timeline` coi `:` là ký tự phân tách `{time_period} : {event}`, gây lỗi `Cannot read properties of undefined (reading 'events')` khi gặp `:` trong `section`). Thay `:` trong `title`/`section` bằng `—`.
   - **Trong `flowchart TB` có nhiều `subgraph` phân tầng**: Khi một `subgraph` chứa các nút thành phần cùng tầng (`N1`, `N2`, `N3`) mà cạnh ngoài chỉ nối `SubgraphA --> SubgraphB`, bắt buộc khai báo `direction LR` bên trong `subgraph` **và** nối các nút ngang hàng bằng liên kết vô hình `N1 ~~~ N2 ~~~ N3` (hoặc nối trực tiếp các nút giữa các tầng) để bộ giải bố cục Dagre xếp chúng nằm ngang thay vì chồng dọc thành cột cao `> 3000px`.
   - **Cấm Emoji làm Biểu tượng Cấu trúc (`no-emoji-icons`)**: Không dùng emoji (`👤`, `🖥️`, `🤖`, `🛡️`, v.v.) trong nhãn nút; sử dụng hình học nút chuẩn của Mermaid v11 (`([...])` cho Tác nhân/Người vận hành, `[[...]]` cho Mô-đun Lõi/Trình điều phối, `[(...)]` cho Kho lưu trữ/Nhánh lịch sử, `{{...}}` cho Cổng kiểm định/Khiên bảo vệ, `{...}` cho Quyết định rẽ nhánh).

---

### Bước 2: Sửa Triệt để 4 Lỗi Cú pháp Gây Hỏng Preview (`[FAIL]`) và 10 Lỗi Cú pháp/Ký tự Phụ
1. **`docs/operations-and-user-guide.md`**:
   - **Sơ đồ #2 (`sequenceDiagram` tại dòng 118 — Đang lỗi `Parse error on line 19` do dấu `;`)**:
     - Thay dòng `Rev-->>Agent: REVIEW_REQUIRED (Gate 1 Pass + Gate 2 M Rubric Pass; chờ Advisor)` thành:
       `Rev-->>Agent: REVIEW_REQUIRED<br/>(Cổng 1 Đạt + Cổng 2 Biểu điểm M Đạt — chờ Cố vấn Độc lập)`
     - Bổ sung khối `rect rgb(15, 23, 42)` / `rect rgb(6, 78, 59)` phân tách rõ 3 pha: (1) Ràng buộc & Thu thập Bằng chứng, (2) Đồng thuận Lưỡng viện M + Advisor, (3) Tiền kiểm 0ms & Cam kết Nhánh.
   - **Sơ đồ #1 (`flowchart LR` tại dòng 9 — Đang lỗi hiển thị `\\` và quá rộng `2571px`)**:
     - Chuyển từ `flowchart LR` sang `flowchart TB` với `direction LR` bên trong 3 `subgraph` (`Setup`, `Execution`, `Recovery`), thay `tools\\oneclick-omp.bat` bằng `tools/oneclick-omp.bat`, thay `\n` bằng `<br/>`, và áp dụng `classDef host/core/gate/warn/danger`.
2. **`docs/project-roadmap.md`**:
   - **Sơ đồ #1 (`timeline` tại dòng 10 — Đang lỗi `Cannot read properties of undefined (reading 'events')` do dấu `:` trong `title` và `section`)**:
     - Thay toàn bộ dấu `:` bên trong dòng `title` và 4 dòng `section` bằng dấu `—`:
       - `title Tiến hóa Kiến trúc omp_extension (Architectural Evolution — 2026-10-05 đến 2026-10-26+)`
       - `section Giai đoạn I — Khởi nguyên Tầng Nhanh & Bộ tiêu chí (Phase I — Fast-Tier & Rubric Genesis)`
       - `section Giai đoạn II — Chốt chặn, Đồng thuận Lưỡng viện & Hiệu chuẩn (Phase II — Ratchets, Bicameral Consensus & Calibration)`
       - `section Giai đoạn III — Hợp đồng Giai đoạn, Cố vấn Gốc & Bản bóng H (Phase III — Staged Contracts, Native Advisor & Shadow H)`
       - `section Giai đoạn IV — Gia cố Đội đỏ & Đồng bộ Toàn cục Một Chạm (Phase IV — Red-Team Hardening & One-Click Global Sync)`
   - **Sơ đồ #2 (`flowchart TB` tại dòng 69 — Đang cao `3274px`, `AR = 0.24`)**:
     - Trong mỗi `subgraph P1..P6`, thêm `direction LR` và nối các nút con cùng giai đoạn bằng liên kết vô hình (`P1A ~~~ P1B`, `P2A ~~~ P2B`, `P3A ~~~ P3B ~~~ P3C`, `P4A ~~~ P4B ~~~ P4C`, `P6A ~~~ P6B`) kèm `classDef` phân tầng theo nhóm bảo mật/kiểm chứng/triển khai, giảm chiều cao từ `3274px` xuống `~1150px` (`AR ≈ 1.35`).
3. **`docs/solution-explanation.md`**:
   - **Sơ đồ #4 (`flowchart TD` tại dòng 195 — Đang lỗi `Parse error on line 7: Expecting ..., got 'PS'` do thiếu ngoặc kép ở nhãn cạnh chứa ngoặc đơn)**:
     - Sửa `Verify -->|Đạt (Pass)| Commit[...]` thành `Verify -->|"Đạt (Pass)"| Commit[...]` và `Verify -->|Lỗi (Fail / Fault)| Rollback[...]` thành `Verify -->|"Lỗi (Fail / Fault)"| Rollback[...]`.
     - Chuyển bố cục thành 2 hàng ngang gọn gàng (`Preflight -> Lock -> Replan -> Backup` và `Write -> Verify -> Commit / Rollback`) kèm `classDef core/gate/danger`.
   - **Sơ đồ #1 (`flowchart LR` tại dòng 42 — Đang bị xếp dọc ngược `418x1539`, `AR = 0.27`)**:
     - Đổi khung ngoài thành `flowchart TB`, đặt `direction LR` bên trong `subgraph Naive` và `subgraph TypeSafe`, nối `Naive -.->|"Khắc phục bằng Ảnh chụp Tương đối (Task-Relative Snapshot)"| TypeSafe`, và tô màu `danger` cho `Naive`, `gate` cho `TypeSafe` (`viewBox ≈ 1530 x 458`).
   - **Sơ đồ #3 & #5 (`stateDiagram-v2` tại dòng 125 và 230)**:
     - Bổ sung `classDef` ngữ nghĩa (`core`, `gate`, `warn`, `danger`) cho các trạng thái quyết định.
4. **`docs/source-code-logic-flow.md`**:
   - **Sơ đồ #5 (`sequenceDiagram` tại dòng 234 — Đang lỗi `Parse error on line 29` do dấu `;` trong thông điệp)**:
     - Thay dòng `EGC->>Ledger: Cập nhật best/fp; tăng stalls nếu fp không đổi hoặc score >= best (khóa ở maxStalls=2)` thành:
       `EGC->>Ledger: Cập nhật best/fp — tăng stalls nếu fp không đổi<br/>hoặc score >= best (khóa ở maxStalls=2)`
   - **Sơ đồ #1, #2, #3, #4, #6 (`sequenceDiagram` đang quá rộng từ `2308px` đến `4219px` do các dòng thông điệp dài `100–131` ký tự)**:
     - Ngắt dòng bằng `<br/>` cho tất cả nhãn `participant` và thông điệp vượt quá `65` ký tự để thu hẹp chiều rộng `viewBox` của cả 6 sơ đồ tuần tự xuống `< 1950px`, giúp chữ hiển thị to, rõ nét trên mọi màn hình mà không phải cuộn ngang.
5. **`docs/verification-and-healthcheck-guide.md`**:
   - **Sơ đồ #1 (`flowchart TB` tại dòng 11)** và **Sơ đồ #2 (`flowchart TD` tại dòng 144)**:
     - Thay toàn bộ `tools\\sync-baseline.bat` và `tools\\oneclick-omp.bat` bằng `tools/sync-baseline.bat` và `tools/oneclick-omp.bat`, thay `\n` bằng `<br/>`, và gắn `classDef` màu xanh ngọc (`gate`) cho nhánh `PASS`/`ONLINE`, màu cam (`warn`) cho nhánh `SKIPPED`, màu đỏ (`danger`) cho các nhánh `FAIL` kèm nút hành động sửa lỗi màu xanh dương (`core`).

---

### Bước 3: Tái cấu trúc Bố cục 18 Sơ đồ Bị Biến dạng Tỷ lệ (`TOO_WIDE` / `TOO_TALL`) & Chuẩn hóa Thẩm mỹ Toàn bộ Tài liệu Hiện có
1. **`README.md` (`#1:L9`)**:
   - Thêm `direction LR` và liên kết `Agent ~~~ Branch ~~~ UI` trong `subgraph Host`, nối `Contract --> Evidence --> Consensus --> Shield` trong `subgraph Extension`, và `Jev ~~~ Advisor ~~~ VerifyHome` trong `subgraph External`. Áp dụng `classDef host/core/gate/advisor/warn` đồng bộ.
2. **`docs/SAD.md` (`#1:L20`, `#2:L38`, `#3:L68`, `#4:L307`)**:
   - Áp dụng bảng màu `classDef` cho cả 4 sơ đồ kiến trúc; trong `#1:L20` chuyển sang `flowchart TB` phân tầng trên-dưới để giảm chiều ngang từ `1864x526` (`AR = 3.54`) về `~1350x680` (`AR ≈ 2.0`).
3. **`docs/codebase-summary.md` (`#1:L20`, `#2:L35`)**:
   - Trong `#2:L35`: Nâng cấp `graph LR` thành `flowchart TB` với `direction LR` bên trong các `subgraph` (`Dev`, `Sync`, `Roots`, `Loader`) và liên kết `~~~` giữa các nút ngang hàng, giảm chiều rộng từ `2426px` (`AR = 3.56`) xuống `~1450px` (`AR ≈ 1.8`), kèm `classDef`.
4. **`docs/data-flow-and-states.md` (`#1:L11`, `#2:L59`, `#3:L102`, `#4:L179`)**:
   - **Sơ đồ #1 (`#1:L11` — Đang rộng `5260x436`, `AR = 12.06`)**: Đổi từ `flowchart LR` sang `flowchart TB`; mỗi `Stage1..Stage5` là một hàng ngang (`direction LR`) có các nút con liên kết rõ ràng, đưa kích thước từ `5260x436` về `~1350x980` (`AR ≈ 1.38`).
   - **Sơ đồ #2 (`#2:L59` — Đang rộng `3360x1453`)**: Ngắt dòng `<br/>` ở mức `<= 55` ký tự cho tất cả tiêu đề `subgraph` và nút `M1..M4`, `C1..C3`, `D1..D2`; nhóm `M1..M4` thành 2 cặp hợp lý để giảm chiều rộng từ `3360px` xuống `~1550px`.
   - **Sơ đồ #3 (`#3:L102` — Đang cao `934x1998`, `AR = 0.47`)**: Chuyển chuỗi thác nước 10 nút đơn điệu thành bố cục 3 tầng ngân sách song song (`Tầng Bộ nhớ & Ảnh chụp: 32 MiB -> 8 MiB`, `Tầng Ngữ cảnh & Tệp Đĩa: 256 KiB / 128 KiB / 64 KiB`, `Tầng Gói Mạng & Trích xuất: 32 KiB -> 16 KiB -> 12 KiB -> 4,940 B -> 4 KiB`) với `classDef`, giảm chiều cao xuống `< 950px` (`AR ≈ 1.4`).
   - **Sơ đồ #4 (`#4:L179` — `stateDiagram-v2`)**: Ngắt dòng các nhãn chuyển trạng thái dài `> 60` ký tự và gắn `classDef` màu trạng thái.
5. **`docs/deployment-guide.md` (`#1:L13`, `#2:L83`, `#3:L119`)**:
   - **Sơ đồ #1 (`#1:L13` — Đang cao `2121x2422`)**: Thêm `WS_Code ~~~ WS_Tests ~~~ WS_Docs ~~~ WS_Tools` trong `DevLayer`, đổi `SyncEngine` sang `direction LR` (`Preflight --> LockStage --> BackupJournal --> VerifyHome`), thay `tools\\oneclick-omp.bat` bằng `tools/oneclick-omp.bat`, giảm chiều cao từ `2422px` xuống `~1050px` (`AR ≈ 1.6`).
   - **Sơ đồ #2 (`#2:L83` — `sequenceDiagram`)**: Ngắt dòng `<br/>` các thông điệp dài để giảm chiều rộng từ `2478px` xuống `< 1750px`.
   - **Sơ đồ #3 (`#3:L119` — `stateDiagram-v2`)**: Thêm `classDef` phân biệt trạng thái tiền kiểm, ghi giao dịch, thành công (`gate`) và hoàn tác (`danger`).
6. **`docs/design-guidelines.md` (`#2:L66`, `#3:L115`, `#4:L151`)**:
   - **Sơ đồ #2 (`#2:L66` — Cao `2038px`)**: Tinh gọn nhãn và bố cục nhánh rẽ của `M` & `Advisor` để chiều cao `< 1450px`.
   - **Sơ đồ #3 (`#3:L115` — Rộng `2847px`)**: Ngắt dòng `<br/>` cho các thông điệp trong `sequenceDiagram` để chiều rộng `< 1800px`.
   - **Sơ đồ #4 (`#4:L151` — `AR = 11.06`, `1836x166`)**: Tách chuỗi 6 nút ngang thành 3 `subgraph` ngữ nghĩa (`1. Chuẩn bị & Điều phối`, `2. Hộp cát Chỉ đọc Cô lập`, `3. Quyết toán Nhánh`) xếp theo bố cục 2 tầng hài hòa (`AR ≈ 2.1`).
7. **`docs/model-specification.md` (`#1:L19`, `#2:L86`)**:
   - Áp dụng `classDef` ngữ nghĩa (`core`, `gate`, `warn`, `danger`) cho cả 2 sơ đồ và ngắt dòng tiêu đề `subgraph Sanitization`.
8. **`docs/project-overview-pdr.md` (`#2:L85`, `#3:L104`)**:
   - **Sơ đồ #2 (`#2:L85` — `AR = 6.43`, `2352x366`)**: Nhóm 7 bước vào 3 `subgraph` giai đoạn (`Giai đoạn 1: Khởi tạo & Ràng buộc`, `Giai đoạn 2: Bằng chứng & Đồng thuận Lưỡng viện`, `Giai đoạn 3: Cam kết Nhánh 0ms`) trong `flowchart TB` để đạt `AR ≈ 2.0`.
   - **Sơ đồ #3 (`#3:L104` — Đang cao `3534px`, `AR = 0.30`)**: Thêm `direction LR` và liên kết `~~~` giữa các nút trong từng tầng `L1..L4` (`H1 ~~~ H2 ~~~ H3`, `A1 ~~~ A2 ~~~ A3 ~~~ A4`, `B1 ~~~ B2 ~~~ B3 ~~~ B4`, `C1 ~~~ C2 ~~~ C3 ~~~ C4`) kèm `classDef`, giảm chiều cao từ `3534px` xuống `902px` (`AR = 1.50`).
9. **`docs/source-code-modeling.md` (`#1:L13` đến `#12:L481`)**:
   - **Sơ đồ #1 (`#1:L13`)**: Loại bỏ toàn bộ 9 emoji (`👤`, `🖥️`, `🤖`, `🧐`, `🛡️`, `📦`, `📂`, `🔗`, `☁️`), đổi `graph TD` thành `flowchart TB`, dùng hình dạng nút ngữ nghĩa (`([...])`, `[[...]]`, `[(...)]`, `{{...}}`).
   - **Sơ đồ #2, #3, #5, #6**: Đổi toàn bộ `graph TB/TD/LR` thành `flowchart TB/LR`. Trong `#3:L94` (đang `2833x3804`), tổ chức các miền `D1..D9` theo 3 tầng kiến trúc rõ ràng với `direction LR` và `~~~` bên trong mỗi miền, giảm chiều cao từ `3804px` xuống `< 1400px`. Trong `#6:L318` (`AR = 7.59`), nhóm thành 2 tầng `subgraph` để giảm `AR` xuống `~1.8`.
   - **Sơ đồ #7 đến #12 (`stateDiagram-v2`)**: Bổ sung `classDef` ngữ nghĩa và rút gọn nhãn chuyển trạng thái quá dài trong `#9:L401`.
10. **`docs/source-code-specification.md` (`#1:L48` — Đang rộng `3864x308`, `AR = 12.55`)**:
    - Đổi từ `flowchart LR` 1 hàng 12 nút sang `flowchart TB` gồm 3 `subgraph` theo pha vòng đời (`1. Điểm móc Khởi tạo & Phiên`, `2. Điểm móc Tác tử con & Nhà cung cấp`, `3. Điểm móc Thực thi Công cụ & Kết thúc Lượt`) với `direction LR` bên trong, đưa `AR` từ `12.55` về `~1.6`.
11. **`docs/system-architecture.md` (`#1:L13`, `#2:L164`, `#3:L204`)**:
    - **Sơ đồ #1 (`#1:L13` — Đang cao `5104px`, `AR = 0.34`!)**: Thêm `direction LR` và liên kết `~~~` giữa các nút con trong cả 8 tầng (`Host`, `Authority`, `Evidence`, `Consensus`, `Shadow`, `Transport`, `EGC`, `Deploy`) + `classDef` phân tầng, giảm chiều cao từ `5104px` xuống `~1450px` (`AR ≈ 1.25`).
    - **Sơ đồ #2 (`#2:L164` — Đang cao `4555px`, `AR = 0.22`!)**: Tổ chức thành 4 `subgraph` giai đoạn (`Giai đoạn 1: Ràng buộc & Thu thập Bằng chứng`, `Giai đoạn 2: Chốt chặn Cổng 0, Cổng 1 & Biểu điểm M`, `Giai đoạn 3: Thẩm định Cố vấn & Trọng tài Lưỡng viện`, `Giai đoạn 4: Tiền kiểm 0ms & Đối soát Nhánh`) và gộp các nhánh từ chối song song để giảm chiều cao từ `4555px` xuống `< 1600px` (`AR ≈ 0.85`).
    - **Sơ đồ #3 (`#3:L204` — Đang rộng `3484px`)**: Ngắt dòng `<br/>` cho các thông điệp dài trong `sequenceDiagram` để giảm chiều rộng xuống `< 1900px`.
12. **`docs/typesafe-operations.md` (`#1:L9` — Đang cao `1922px`, `AR = 0.28`)**:
    - Thay cạnh `Authorities --> Invariant` bằng liên kết trực tiếp từ 4 nguồn thẩm quyền `A1 & A2 & A3 & A4 --> I1` kèm `classDef`, đưa `viewBox` từ `530x1922` (`AR = 0.28`) về `1276x370` (`AR = 3.45` — 4 nguồn thẩm quyền xếp ngang hàng trực quan).
13. **`docs/decisions/README.md` (`#1:L26`, `#2:L142`)**, **`docs/journals/2026-10-26-typesafe-review-fix-and-vietnamese-docs-standardization.md` (`#1:L26`)**, và **6 sơ đồ trong `plans/**`**:
    - Trong `docs/decisions/README.md#1:L26` (cao `1966px`, `AR = 0.30`): nhóm 8 mốc ADR theo 4 giai đoạn tiến hóa (`Giai đoạn I..IV`) để cân bằng tỷ lệ khung hình (`AR ≈ 0.85`).
    - Trong `docs/journals/2026-10-26...#1:L26`: chuyển sang bố cục 2 hàng có `classDef` và bổ sung bước重 dùng đệm `M` + `AdvisorReceipt`.
    - Trong `plans/261014-typesafe-todo-done-verdict-fidelity/plan.md#1:L40` (`AR = 14.35`) và `plans/reports/261014-brainstorm-todo-done-verdict-fidelity.md#1:L56` (`AR = 0.32`) cùng 4 tệp `plans/261003-typesafe-stability-guardrails/phase-01..04.md`: áp dụng `classDef` và cân bằng bố cục để đạt `0.45 <= AR <= 3.5`.

---

### Bước 4: Bổ sung Sơ đồ Mermaid Mới Chi tiết cho 12 Tài liệu Cốt lõi Còn Thiếu
1. **`AGENTS.md` (Hiện có 0 sơ đồ Mermaid — Đang dùng hộp ASCII thô tại dòng 14–29)**:
   - Thay khối ASCII tại Mục 2 bằng sơ đồ `flowchart TB` có `classDef` minh họa đầy đủ: (1) Không gian Phát triển (`D:/100.Software/Github/omp_extension`) $\rightarrow$ `bun test`, (2) Động cơ Đồng bộ Giao dịch Một chạm (`tools/oneclick-omp.bat` / `tools/sync-baseline.cjs` + sao lưu + `verify-omp-global.cjs`), (3) Ba Gốc Triển khai (`target`, `global_claude`, `global_omp_agents`), và (4) Bất biến Vàng — Trình trung chuyển Ủy nhiệm 1 dòng (`~/.omp/agent/extensions/typesafe-planner.ts`).
2. **`docs/typesafe-red-team-report.md` (Hiện có 0 sơ đồ Mermaid)**:
   - Bổ sung sơ đồ `flowchart TB` tại đầu Mục 1–2 ánh xạ trực tiếp **4 Phát hiện Lỗ hổng Red-Team (Findings 1–4)** sang **3 Cơ chế Phòng vệ Kiến trúc (Remediation Defenses 1–3)**:
     - `F1 (Tiêm Trạng thái & Nhầm lẫn Ký tự Phân cách)` & `F2 (Đốt Token Tiền Đánh giá)` $\rightarrow$ `D1 (Phân loại Cấu trúc Tất định 0-Token & Bao đóng XML encloseUntrusted)`.
     - `F3 (Vòng lặp Thất bại ở Mô hình Nhỏ)` $\rightarrow$ `D2 (Giao thức Khắc phục Thẻ XML <remediation> & <immutable_constraints>)`.
     - `F4 (Lách Kiểm thử & Xóa Khẳng định)` $\rightarrow$ `D3 (Bộ Phân tích AST src/ast-analyzer.ts & Tranh biện 5 Nhân cách runMultiPersonaDebate)`.
3. **`docs/typesafe-judge-research.md` (Hiện có 0 sơ đồ Mermaid)**:
   - Bổ sung sơ đồ `flowchart TB` tổng hợp **Kiến trúc Kế thừa Nghiên cứu Mã nguồn Mở Ba Trụ cột (Tri-Pillar Open-Source Research Inheritance)**:
     - Trụ cột 1 (`PlanBench / AgentBench / WebArena`) $\rightarrow$ `Tiền kiểm Cấu trúc Tất định (runStructuralTriage)`.
     - Trụ cột 2 (`NVIDIA Garak / Microsoft PyRIT / Promptfoo`) $\rightarrow$ `Ranh giới Bao đóng XML & Chống Tiêm lệnh (xml-enclosure.ts + ast-analyzer.ts)`.
     - Trụ cột 3 (`ChatEval / Microsoft AutoGen AgentEval`) $\rightarrow$ `Tranh biện Đa Nhân cách & Đồng thuận Lưỡng viện (debate-evaluator.ts + bicameral-consensus.ts)`.
4. **`docs/SDD.md` (Hiện dài 490 dòng nhưng chỉ có 1 sơ đồ nhỏ ở Mục 4.3)**:
   - **Bổ sung Sơ đồ mới tại Mục 1.1 (`flowchart TB`)**: Mô hình hóa **Kiến trúc Thẩm quyền Lịch sử Nhánh Máy chủ & 8 Lược đồ Nhật ký Tùy chỉnh (`ctx.sessionManager.getBranch()`)**, chỉ rõ cách `isHostOwnedEntry` xác thực từng loại bản ghi (`tool-execution.v1`, `contract.v1`, `contract.source.v1`, `contract.confirmation.v1`, `task-verification-facts.v1`, `lifecycle-recovery.v1`, `typesafe:advisor:host:v1`, `egc-ledger`).
   - **Bổ sung Sơ đồ mới tại Mục 6.1–6.2 (`flowchart TD`)**: Mô hình hóa **Đường ống Biên tập Bảo mật `redactDeep`, Ngoại lệ `TELEMETRY_COUNT_KEYS` và Thuật toán Điền nước Tìm kiếm Nhị phân (`preparePayload <= 32,768B`)**.
   - **Cải tiến Sơ đồ hiện có tại Mục 4.3 (`stateDiagram-v2` — Đang có `AR = 0.22`)**: Bổ sung `classDef`, nhánh từ chối/thu hồi stage khi không gian làm việc bị bẩn trước khi chốt, và ngắt dòng nhãn chuyển trạng thái để đưa `AR` lên `~0.65`.
5. **`docs/source-code-specification.md` (Hiện dài 265 dòng nhưng chỉ có 1 sơ đồ ở Mục 1.3)**:
   - **Bổ sung Sơ đồ mới tại Mục 1.1 (`sequenceDiagram`)**: Mô hình hóa **Chu trình Khởi tạo Phiên (`getRuntimeOriginProof`) & Trình bọc Thực thi Công cụ Phổ quát (`registerTool` $\rightarrow$ `freezeContractValue` $\rightarrow$ `invocations.run` $\rightarrow$ `publicResult`)**.
   - **Bổ sung Sơ đồ mới tại Mục 2.1 (`flowchart TD`)**: Mô hình hóa **Cây Quyết định Thứ tự Ưu tiên 6 Bước của `resolveTypeSafeEnabled` (`src/typesafe-enabled-resolver.cjs`)** từ kiểm tra `TYPESAFE_API_KEY`, đọc cô lập `~/.claude/.ck.json`, công tắc ngắt toàn cục (`global-kill-switch`), kiểm tra chuỗi đường dẫn thực `excludeProjects` (`realpath` + `worktree`), đến danh sách trắng `projects` (`"*"`).
6. **Toàn bộ 7 Hồ sơ Quyết định Kiến trúc `docs/decisions/ADR-*.md` (Hiện cả 7 tệp đều có 0 sơ đồ Mermaid)**:
   - Bổ sung 1 sơ đồ Mermaid v11 chuẩn `ck:ui-ux-pro-max` vào Mục Quyết định (Decision) của từng tệp ADR:
     - `docs/decisions/ADR-2026-10-05-predict-model-tier.md`: `flowchart LR` mô tả định tuyến phân tầng mô hình (`jev-fast` $\rightarrow$ dự phòng an toàn `jev-latest` giữ nguyên Bất biến Chỉ Thắt chặt) + tách mô-đun `src/debate-evaluator.ts` (5 nhân cách) + `PROTECTED_INTEGRITY_PATTERNS`.
     - `docs/decisions/ADR-20261012-typesafe-jev-alignment.md`: `flowchart TB` mô tả Khung Ba Trụ cột (Tầng 1 Tiêm ngữ cảnh đầy đủ `planRequirements` + `deliverableArtifacts`, Tầng 2 Bộ tiêu chí phân loại theo `TaskType`, Tầng 3 Mốc cố vấn tiền trạm không chặn).
     - `docs/decisions/ADR-20261013-remediation-ratchet-and-wildcard-resolver.md`: `flowchart TD` mô tả Chốt chặn Khắc phục Cổng 0 (`lastRejectedDiffHash`), Phòng vệ Chống Né tránh `todo(op="block")`, và Trình phân giải Tam cấp (Tri-Tier Resolver Fallback).
     - `docs/decisions/ADR-20261013-typesafe-bicameral-judge-alignment.md`: `flowchart TB` mô tả Kiến trúc Đồng thuận Lưỡng viện (Thùy 1 Advisor + Thùy 2 JEV), ma trận phân xử tự động thực thi vs leo thang con người khi xung đột, và xóa bỏ ngưỡng cứng `0.80`/`0.30`.
     - `docs/decisions/ADR-20261014-typesafe-jev-advisor-overhaul.md`: `flowchart TB` đối chiếu 4 Chuỗi Khiếm khuyết Pháp y (Cắt đầu trạng thái, Lệch một đơn vị `attemptCount >= 3`, Mã chết `AUTO_REJECT`, Bỏ sót tệp `??` và `op.list`) với 4 Cơ chế Sửa chữa Tận gốc.
     - `docs/decisions/ADR-20261015-advisor-judge-jev-true-calibration.md`: `flowchart LR` mô tả Đường ống Hiệu chuẩn Thực sự dựa trên JEV (Điểm số bằng chứng đa tín hiệu liên tục + Nhánh `DISALLOW` hạng nhất + Trạng thái JSON phạm vi nhiệm vụ con + Từ điển `criteria: Record<string, string>`).
     - `docs/decisions/ADR-20261019-jev-atomic-advisor-direction.md`: `flowchart TB` mô tả Kiến trúc Hai Nhánh Đường cơ sở Sản xuất `Repaired-M` + Cố vấn Chỉ đọc Gốc Thực thụ so với Ứng viên Chạy ngầm `Bounded Hybrid-H` và Cổng Thống trị Tập Holdout (`strictDominanceGates`).

---

## Critical files & anchors
- `docs/operations-and-user-guide.md` (`:9-36`, `:118-148`) — Sửa lỗi cú pháp dấu `;` trong `sequenceDiagram` dòng 136 và lỗi `\\` + bố cục quá rộng ở sơ đồ dòng 9.
- `docs/project-roadmap.md` (`:10-31`, `:69-102`) — Sửa lỗi cú pháp dấu `:` trong `title`/`section` của `timeline` dòng 10 và tái cấu trúc bố cục `flowchart TB` cao `3274px` ở dòng 69.
- `docs/solution-explanation.md` (`:42-55`, `:195-203`) — Sửa lỗi cú pháp thiếu ngoặc kép quanh nhãn cạnh `|Đạt (Pass)|` dòng 201 và đảo trục bố cục so sánh `Naive` vs `TypeSafe` dòng 42.
- `docs/source-code-logic-flow.md` (`:18-315`) — Sửa lỗi cú pháp dấu `;` tại dòng 262 của `sequenceDiagram` #5 và chuẩn hóa độ rộng cả 6 sơ đồ tuần tự.
- `docs/system-architecture.md` (`:13-70`, `:164-254`) — Tái cấu trúc sơ đồ kiến trúc 8 tầng (đang cao `5104px`) và sơ đồ luồng quyết định (đang cao `4555px`) bằng `direction LR` + `~~~` + `classDef`.

---

## Verification
1. **Kiểm chứng Tự động 100% Khối Mermaid bằng Trình phân tích & Kết xuất `Mermaid v11` Thực tế trên Chromium**:
   - Chạy kịch bản kiểm chứng trong `eval` (sử dụng `browser` headless Chromium nạp `https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js`) quét toàn bộ các tệp `.md` trong kho lưu trữ (`README.md`, `AGENTS.md`, `docs/**/*.md`, `plans/**/*.md`):
     - **Tiêu chí 1 (Zero Parse/Render Errors)**: `100%` khối `mermaid` (tất cả ~86 khối sau khi bổ sung) vượt qua `await mermaid.parse(code)` và `await mermaid.render(id, code)` mà không có bất kỳ lỗi cú pháp hay biểu tượng `error-icon` nào (`failed === 0`).
     - **Tiêu chí 2 (Zero Escaping / Emoji / Legacy Defects)**: `0` khối chứa `\\` hiển thị lặp trong nhãn DOM, `0` khối chứa emoji cấu trúc, `0` khối dùng từ khóa `graph ` cũ.
     - **Tiêu chí 3 (Harmonious Layout & Aspect Ratio)**: Mọi sơ đồ trong `README.md`, `AGENTS.md`, và `docs/**/*.md` đều có kích thước `viewBox` cân đối (`0.45 <= aspectRatio <= 3.5`, `width <= 2200px`, `height <= 1850px`).
2. **Kiểm chứng Quy chuẩn Tài liệu Tiếng Việt & Giới hạn Dòng (`omp-extension-docs-and-oneclick-verify`)**:
   - Xác nhận `README.md < 300` dòng và mọi tệp `docs/**/*.md < 800` dòng.
3. **Kiểm thử Đơn vị, Đồng bộ Giao dịch & Xác minh 6 Tầng Toàn cục**:
   - Chạy `bun test` tại `D:/100.Software/Github/omp_extension` (`exitCode === 0`).
   - Chạy `node tools/sync-baseline.cjs` để đồng bộ toàn bộ tài liệu đã cập nhật sang `C:/Users/thant/Projects/omp_extension` và cập nhật `.sync-manifest.json`.
   - Chạy `node tools/verify-omp-global.cjs --live` và xác nhận cả 6 tầng đều `PASS` (`0` pending actions trong `--dry-run`, `overallOk: true`).
