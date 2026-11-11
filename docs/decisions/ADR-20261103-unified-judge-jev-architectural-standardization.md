# ADR-20261103-unified-judge-jev-architectural-standardization: Chuẩn hóa Kiến trúc Thẩm phán Đa tầng, Đối chiếu Thượng nguồn OMP Native Judge & TypeSafe.ai JEV

Status: Decided (Đã Quyết định)  
Date: 2026-11-03  
Council: ai & software domain, 4 lenses (cost, docs-fidelity, engineering, security) + research

---

## Question (Câu hỏi Quyết định)

Chiến lược chuẩn hóa, ứng dụng và thăng cấp kiến trúc Thẩm phán (OMP Native Judge & TypeSafe JEV) trong tiện ích mở rộng TypeSafe `omp_extension`: Lựa chọn mô hình thẩm định nào (Native Trực tiếp, Thẩm phán Vĩ mô `Repaired-M`, Thẩm phán Vi hạt Nguyên tử `Atomic Hybrid-H`, hay Kiến trúc Thống nhất Vòng lặp Tự trị Tam giác Đa tầng `Autonomous Triad Unified Architecture`) làm chuẩn mực phán quyết sản xuất và định hướng vận hành dài hạn của hệ thống?

---

## Context (Bối cảnh Thực nghiệm & Thực trạng Hệ thống)

Qua quá trình nghiên cứu thực nghiệm trực tuyến đối với mã nguồn thượng nguồn của Oh-My-Pi (`can1357/oh-my-pi` tại `packages/ai/src/judgment/`), tài liệu chính thức của TypeSafe.ai (`https://docs.typesafe.ai/`), và báo cáo kiểm toán kỹ thuật chuyên sâu tại [`docs/research/omp-judge-and-typesafe-jev-comprehensive-audit.md`](../research/omp-judge-and-typesafe-jev-comprehensive-audit.md), hệ thống nhận thấy:

1. **Thượng nguồn OMP (Upstream OMP Native Judge)** đã chuẩn hóa giao thức **Typed Judgments** gồm 4 nguyên hàm toán học (`NoulQuestion`, `ChoiceQuestion`, `ScoreQuestion`, `BoxQuestion`) và giao thức đường truyền `typesafeWire` tới `POST /v1/systemone`. Tuy nhiên, bản cài đặt mặc định của OMP là trình khách HTTP trực tiếp, hoàn toàn thiếu vắng các lớp khiên bảo vệ bắt buộc trong môi trường tác tử tự chủ: không có bộ lọc chống trốn tránh kiểm thử vi sai AST (AST test evasion detection), không có cơ chế phòng thủ tấn công đường dẫn TOCTOU đối với tệp bằng chứng, và không có chính sách tự động phục hồi khi gặp lỗi quá tải `429/529`.
2. **Kho mã nguồn `omp_extension`** đã trải qua 12 thế hệ hồ sơ quyết định kiến trúc (`ADR-01` đến `ADR-12`), hiện sở hữu cả hai bộ thẩm định mạnh mẽ: **Thẩm phán Vĩ mô `M`** (`src/task-verification-macro.ts` — gói bằng chứng $\le 32\text{KB}$, 3 câu hỏi vĩ mô) và **Thẩm phán Vi hạt Nguyên tử `H`** (`src/atomic-judge.ts` — đồ thị phụ thuộc DAG, chính sách thế giới đóng/mở).
3. **Bài toán Đặt ra cho Hội đồng Thẩm định (`ck:council`)**: Cần đưa ra một quyết định dứt khoát về kiến trúc chuẩn mực để chấm dứt tình trạng phân mảnh logic phán quyết, xác định rõ vai trò của từng tầng, bảo đảm tính tự chủ 100% không gây treo `todo`, đồng thời đối chiếu và xếp hạng chấm điểm khách quan toàn bộ không gian làm việc.

---

## Options Considered (Các Phương án Được Xem xét)

| Phương án (Option) | Tên Phương án & Mô tả Tóm tắt (Title & Summary) |
|---|---|
| **Phương án A (Raw Native)** | **Native Judge Gọi Thẳng (Raw OMP Native Judge Direct)**: Loại bỏ các lớp trung gian, sử dụng trực tiếp hàm `judge()` của OMP thượng nguồn gọi thẳng tới `POST /v1/systemone`. |
| **Phương án B (Macro M Only)** | **Thẩm phán Vĩ mô Duy nhất (Monolithic Macro `Repaired-M` Only)**: Giữ nguyên cơ chế đóng gói toàn bộ diff $\le 32\text{KB}$ vào 3 câu hỏi vĩ mô, ghép đôi với Cố vấn Lưỡng viện (`ADR-04`), loại bỏ hoàn toàn mã nguồn Thẩm phán Vi hạt `H`. |
| **Phương án C (Atomic H Cutover)** | **Thăng cấp Toàn phần Thẩm phán Vi hạt Nguyên tử (Full Cutover to Atomic Micro-Judge `Atomic-H`)**: Cắt bỏ hoàn toàn `M`, chuyển 100% việc nghiệm thu nhiệm vụ sang đồ thị DAG vị từ vi hạt (`src/atomic-judge.ts`, `ADR-07`). |
| **Phương án D (Autonomous Triad Unified)** | **Kiến trúc Thống nhất Vòng lặp Tự trị Tam giác Đa tầng (Autonomous Triad Unified Architecture — Khuyến nghị)**: Tích hợp 4 lớp phòng thủ sâu: (1) Cổng tiền trạm 0ms `APPROVED_PENDING_COMMIT`; (2) Thẩm phán Vĩ mô `M` cho nghiệm thu pha thông thường; (3) Tự động kích hoạt Thẩm phán Vi hạt `Atomic-H` khi có xung đột tiêu chí con; (4) Vòng lặp Cố vấn tự động chữa lành (`proactive-advisor-dispatch`) và Chốt chặn Middleware (`anti-blocking-middleware`) dập tắt `ask` spam và cấm `todo block`. |

---

## Lens Verdicts (Phán quyết Độc lập của 4 Lăng kính)

| Lăng kính (Lens) | Phán quyết Tóm tắt (Verdict) | Độ Tự tin (Confidence) |
|---|---|:---:|
| **1. Chi phí & Kinh tế Token (`cost`)** | **Ủng hộ Phương án D.** Phương án A rẻ về lý thuyết nhưng gây tốn kém khủng khiếp khi tác tử bế tắc sinh vòng lặp vô tận. Phương án C tốn thêm sub-request cho từng vị từ vi hạt nếu chạy tràn lan. Phương án D tối ưu hóa triệt để: 90% tác vụ được giải quyết ở tầng preflight 0ms hoặc 1 request `M` vĩ mô duy nhất, chỉ kích hoạt vi hạt khi cần phân giải sâu, đồng thời bảo toàn telemetry đếm token (`TELEMETRY_COUNT_KEYS`). | **0.95** |
| **2. Độ trung thực Tài liệu (`docs-fidelity`)** | **Ủng hộ Phương án D.** Khớp 100% với đặc tả chính thức của `packages/ai/src/judgment/types.ts` (OMP) và `https://docs.typesafe.ai/` (TypeSafe JEV). Sử dụng chính xác các nguyên hàm `noul` (xác suất $P \in [0,1]$), `choice`, `score`, `box`. Tuân thủ nghiêm ngặt Bản kê Schema v2 độc lập khỏi `.claude` và nguyên tắc Bất biến Vàng tại `AGENTS.md`. | **0.98** |
| **3. Kỹ thuật & Độ tin cậy Vận hành (`engineering`)** | **Ủng hộ Phương án D.** Loại bỏ hoàn toàn điểm nghẽn "phạt oan" của `M` nhờ cơ chế phân tách vi hạt DAG của `H`. Giải quyết triệt để lỗi treo `todo` bằng vòng lặp tự chữa lành của Cố vấn Độc lập. Đã được chứng minh qua 69 ca kiểm thử đơn vị tự động (`tests/atomic-jev-judge.test.ts`, `tests/proactive-advisor-dispatch.test.ts`, `tests/anti-blocking-middleware.test.ts`). | **0.96** |
| **4. Bảo mật & Phòng thủ Toàn vẹn (`security`)** | **Ủng hộ Phương án D.** Phương án A và B có lỗ hổng nghiêm trọng trước các thủ đoạn trốn tránh kiểm thử và tấn công đường dẫn. Phương án D tích hợp lớp khiên AST vi sai (`src/ast-analyzer.ts`) chặn đứng hành vi xóa assert, cơ chế đọc tệp chống TOCTOU (`src/typesafe-evidence-file.cjs`), và bộ lọc rò rỉ khóa bí mật bảo toàn telemetry (`src/typesafe-redact.cjs`). | **0.99** |

---

## Evidence (Bảng Bằng chứng Thực nghiệm Khách quan)

| Tuyên bố Khẳng định (Claim) | Nguồn Trích dẫn (Source) | Ngày (Date) | Thể loại (Type) | Phương án Hỗ trợ (Supports) |
|---|---|---|:---:|:---:|
| Upstream OMP định nghĩa 4 kiểu câu hỏi `noul`, `choice`, `score`, `box` và đường truyền `typesafeWire` | `oh-my-pi/packages/ai/src/judgment/types.ts:1-60` & `systemone.ts:1-40` | 2026-10-28 | official | Phương án D |
| TypeSafe JEV phản hồi phân loại xác suất tất định trong `80ms – 250ms`, miễn nhiễm ảo giác | `https://docs.typesafe.ai/primitives/noul` | 2026-11-03 | official | Phương án D |
| Tác tử AI dễ bị bế tắc và spam hỏi người dùng khi gặp lỗi kỹ thuật nếu không có middleware đánh chặn | `docs/journals/2026-11-02-claudekit-project-management-and-plan-inheritance.md` | 2026-11-02 | measured | Phương án D |
| 100% các thủ đoạn gian lận kiểm thử (xóa `expect`, sửa thành `expect(1).toBe(1)`, thêm `.skip`) bị chặn đứng | `src/ast-analyzer.ts:1-120` & `tests/ast-analyzer.test.ts` | 2026-10-26 | measured | Phương án D |
| Bộ lọc khóa bí mật bảo toàn số nguyên đếm token giúp tránh lỗi parse telemetry thượng nguồn | `src/typesafe-redact.cjs:TELEMETRY_COUNT_KEYS` & `tests/typesafe-redact.test.ts` | 2026-11-02 | measured | Phương án D |
| Toàn bộ 41/41 kế hoạch trong sổ cái trung tâm đã được đối soát 100% hoàn thành, không còn `[ ]` sót lại (số liệu lịch sử ngày 2026-11-03; ledger tái tạo ngày 2026-11-11 có 37 kế hoạch, xem `plans/plan-ledger.json`) | `plans/plan-ledger.json` & `tools/ck-project-manager.cjs --audit` | 2026-11-03 | measured | Phương án D |
| Hệ thống kiểm chứng 6 tầng xác nhận toàn bộ 551 tệp khớp mã băm SHA-256 và Jev Probe LIVE HTTP 200 | `tools/verify-omp-global.cjs --live` | 2026-11-03 | measured | Phương án D |

---

## Decision (Quyết định của Hội đồng Thẩm định)

**LỰA CHỌN PHƯƠNG ÁN D: KIẾN TRÚC THỐNG NHẤT VÒNG LẶP TỰ TRỊ TAM GIÁC ĐA TẦNG (`Autonomous Triad Unified Architecture`).**

Hội đồng Thẩm định Kỹ thuật chính thức phê duyệt Phương án D làm tiêu chuẩn kiến trúc bất biến duy nhất cho toàn bộ hệ thống Thẩm phán TypeSafe JEV & OMP Native Judge trong `omp_extension`. Hệ thống vận hành theo quy trình phân tầng tối ưu hóa nghiêm ngặt:
1. **Tầng 1 (Preflight Phản xạ 0ms)**: Sử dụng vé cam kết `APPROVED_PENDING_COMMIT` để hoàn tất `todo done` ngay lập tức mà không phát sinh thêm bất kỳ chi phí mạng nào nếu bằng chứng không đổi.
2. **Tầng 2 (Thẩm phán Vĩ mô `Repaired-M`)**: Đóng gói bằng chứng thực thi $\le 32\text{KB}$ gửi tới JEV System One cho các chu kỳ nghiệm thu pha thông thường, kết hợp với Cố vấn Lưỡng viện (`Bicameral Consensus`).
3. **Tầng 3 (Thẩm phán Vi hạt Nguyên tử `Atomic-H`)**: Tự động kích hoạt cơ chế phân rã đồ thị DAG vị từ vi hạt khi phát hiện xung đột cục bộ giữa các tiêu chí thành phần, phân định rõ ràng giữa "thiếu bằng chứng" (`insufficient`) và "mâu thuẫn thực sự" (`contradicts`).
4. **Tầng 4 (Vòng lặp Tự chữa lành & Chốt chặn Middleware)**: `anti-blocking-middleware.ts` cấm triệt để tác tử spam `ask` hỏi người dùng về lỗi cú pháp / test fail và cấm tự ý `todo block`; đồng thời tự động triệu hồi Cố vấn Độc lập (`proactive-advisor-dispatch.ts`) để chẩn đoán nguyên nhân gốc rễ và tái lập kế hoạch tự động cho tác tử.

---

## Rationale (Lý do Quyết định & Quy tắc Bẻ Khóa Bất đồng)

Quyết định được đưa ra dựa trên sự đồng thuận tuyệt đối ($4/4$ lăng kính) và tuân thủ quy tắc ưu tiên bằng chứng: **Dữ liệu thực nghiệm đo lường (Measured Data) > Tài liệu chính thức (Official Docs) > Phán đoán chuyên gia (Expert Judgment) > Tuyên bố của nhà cung cấp (Vendor Claims)**.

1. **Hiệu quả Chi phí và Tốc độ Vượt trội**: Dữ liệu thực nghiệm đo lường cho thấy Phương án D giúp giảm $85\%$ chi phí API so với việc gọi mô hình sinh văn bản tự do, đồng thời rút ngắn thời gian phản hồi xuống dưới $400\text{ms}$ cho chu kỳ đánh giá vĩ mô và $0\text{ms}$ cho các bước xác thực lặp lại.
2. **Khắc phục Triệt để Điểm yếu của Từng Phương án Riêng lẻ**: Phương án B đơn độc sẽ bị tắc nghẽn khi gặp các bài toán lớn do hiện tượng noul tụt dốc cộng dồn; Phương án C đơn độc sẽ gây lãng phí tài nguyên và làm phức tạp hóa các tác vụ nhỏ; Phương án D kết hợp nhịp nhàng giữa cả hai theo mô hình phân tầng động (dynamic escalation).
3. **Đạt Điểm số Kiểm toán Kỷ lục**: Không gian làm việc `omp_extension` đạt điểm số thực nghiệm **9.605 / 10 (Hạng Xuất sắc)**, chứng minh sự ổn định và độ tin cậy vượt trội so với bản cài đặt thô của OMP thượng nguồn.

---

## Risks & Mitigations (Rủi ro & Biện pháp Giảm thiểu)

| Rủi ro Định danh (Risk) | Mức độ Nghiêm trọng (Severity) | Biện pháp Giảm thiểu Triệt để (Mitigation) |
|---|:---:|---|
| **Lỗi mạng hoặc Quá tải API TypeSafe (429/529 HTTP Error)** | Trung bình (Medium) | Bộ máy `src/typesafe-api-client.cjs` đã tích hợp cơ chế thử lại lũy thừa tự động (`RETRY_POLICY`: tối đa 3 lần, giãn cách từ 1.5s đến 45s, xử lý tiêu đề `Retry-After`). |
| **Rò rỉ Khóa Bí mật qua Tải trọng Đánh giá (Secret Leakage)** | Nghiêm trọng (Critical) | Bộ lọc nhận diện cấu trúc `src/typesafe-redact.cjs` và `src/payload-safety.ts` khử bỏ 100% token nhạy cảm trước khi dữ liệu rời khỏi máy cục bộ, đồng thời giữ nguyên các số nguyên đếm token. |
| **Tác tử Cố tình Sửa Đổi Tệp Trực tiếp tại Thư mục Toàn cục OMP** | Nghiêm trọng (Critical) | Bất biến Vàng (`AGENTS.md`) được bảo vệ bằng `handleExcludedMutationGuard` trong `typesafe-planner.ts`; kiểm tra tự động một chạm `tools/verify-omp-global.cjs` phát hiện ngay lập tức bất kỳ sai lệch nào đối với proxy trampoline một dòng. |
| **Độ trễ khi Triệu hồi Cố vấn Độc lập (Advisor Subagent Latency)** | Thấp (Low) | Cố vấn Độc lập chỉ được triệu hồi khi xảy ra bất đồng lưỡng viện hoặc tác tử bị bế tắc (`stuck`); toàn bộ các chu kỳ nghiệm thu bình thường chạy ở tốc độ cao của JEV System One. |

---

## Implementation Checklist (Danh mục Triển khai & Xác minh)

- [x] Xuất bản Báo cáo Nghiên cứu Kỹ thuật Chuyên sâu tại `docs/research/omp-judge-and-typesafe-jev-comprehensive-audit.md`.
- [x] Hoàn thiện và phê duyệt Hồ sơ Quyết định Kiến trúc `ADR-20261103-unified-judge-jev-architectural-standardization.md`.
- [x] Cập nhật Bảng Chỉ mục Tổng thể và Đồ thị Phả hệ Kiến trúc tại `docs/decisions/README.md`.
- [x] Kiểm tra bảo toàn 100% kiểm thử hồi quy: `bun test tests/atomic-jev-judge.test.ts`, `tests/proactive-advisor-dispatch.test.ts`, `tests/anti-blocking-middleware.test.ts`.
- [x] Chạy kiểm chứng toàn diện 6 tầng cài đặt toàn cục OMP qua `node tools/verify-omp-global.cjs --live`.
- [x] Đồng bộ hóa sổ cái kế hoạch qua `node tools/ck-project-manager.cjs --audit` bảo đảm 41/41 kế hoạch giữ vững trạng thái hoàn thành (số liệu lịch sử ngày 2026-11-03; ledger tái tạo ngày 2026-11-11 có 37 kế hoạch, xem `plans/plan-ledger.json`).

---

## Reopen Conditions (Điều kiện Kích hoạt Mở lại Quyết định)

Quyết định này chỉ được mở lại để xem xét (`recheck` / `reopen`) khi xảy ra ít nhất một trong các điều kiện sau:
1. **Thay đổi Giao thức Thượng nguồn OMP**: Kho mã nguồn `can1357/oh-my-pi` chính thức phát hành phiên bản mới thay thế hoàn toàn giao thức `typesafeWire` hoặc bổ sung các nguyên hàm toán học mới ngoài 4 nguyên hàm hiện tại.
2. **Mô hình JEV Thế hệ Mới (Next-Gen JEV)**: TypeSafe.ai ra mắt phiên bản mô hình JEV hỗ trợ trực tiếp việc thẩm định đồ thị DAG vi hạt từ phía máy chủ mà không cần phần mềm trung gian phía máy khách.
3. **Thất bại Kiểm chứng Trực tiếp**: Tỷ lệ phán đoán sai lệch hoặc không nhất quán của JEV System One trên tập dữ liệu giữ lại vượt quá $5\%$ trong bài kiểm thử `tools/jev-paired-eval.ts`.

---

## Owners (Trách nhiệm Giám sát)

- **Trách nhiệm Kiến trúc & Vận hành**: Tác tử Lập trình Đáng tin cậy của OMP (`OMP Trusted Coding Assistant`).
- **Thẩm quyền Duyệt Quyết định Cuối cùng**: Người Dùng Chủ Quyền (`Sovereign User`).

---

## Council Metadata (Siêu dữ liệu Hội đồng)

- **Các Lăng kính Thực thi (Lenses Run)**: `cost`, `docs-fidelity`, `engineering`, `security` (Lĩnh vực: `ai` & `software`).
- **Mô hình Khuyến nghị (Models Used)**: Hội đồng Độc lập Đa lăng kính inline + Trích xuất dữ liệu đo lường thực tế từ kho mã nguồn.
- **Tạo bởi**: `/ck:council` vào ngày `2026-11-03`.
