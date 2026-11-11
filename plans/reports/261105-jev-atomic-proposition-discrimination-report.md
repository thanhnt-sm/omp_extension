# Báo cáo Thực nghiệm Đo đạc Đối chứng Toàn diện TypeSafe JEV (TypeSafe JEV Proposition & Negative Control Empirical Report)

> **Mục tiêu**: Đo đạc độ nhạy phân biệt (discrimination capability) của mô hình TypeSafe JEV System One LIVE (`jev-latest` / `jev-1.14.0`) đối với các mệnh đề kỹ thuật nguyên tử, đối chứng âm tinh vi (subtle negative controls) và so sánh thực nghiệm 3 nhánh giữa Tải trọng Nguyên tử (~1KB) và Trạng thái Vĩ mô Đệm (~19KB).  
> **Kịch bản Thực thi**: `tools/jev-proposition-probe.ts` và `tools/jev-macro-vs-atomic-probe.ts` gọi trực tiếp `POST https://api.typesafe.ai/v1/systemone`.  
> **Thời điểm Đo đạc**: 2026-11-05.  

---

## 1. Kết quả Đo đạc 6 Cặp Mệnh đề (True vs False Control) trên Live JEV

Toàn bộ 12 lượt gọi đều sử dụng bộ tạo yêu cầu chuẩn tắc `prepareRequest` với dung lượng tải trọng $\le 1\text{KB}$, đo đạc độc lập 6 cặp mệnh đề (mỗi cặp gồm 1 mệnh đề Đúng và 1 mệnh đề Sai trên cùng một đoạn mã nguồn):

| Cặp Mệnh đề (Proposition Pair) | Khẳng định Kiểm tra (Claim Assertion) | Chân lý (Truth) | Điểm JEV $P(\text{noul})$ | Độ trễ (Latency) | Kích thước (Body) | Kết luận Phân biệt (Discrimination) |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **Cặp 1 (URL Safety)** | `isValidWireUrl` từ chối URL HTTP từ xa không loopback | **Đúng** | **0.98** | 797ms | 926 B | **PASS (Độ tin cậy cực cao)** |
| **Cặp 1 (Đối chứng Âm)** | `isValidWireUrl` chấp nhận URL HTTP từ xa không loopback | **Sai** | **0.03** | 563ms | 924 B | **PASS (Bác bỏ dứt khoát)** |
| **Cặp 2 (Header Integrity)** | `Authorization` không bị ghi đè bởi `extraHeaders` | **Đúng** | **0.80** | 236ms | 722 B | **PASS (Vượt ngưỡng 0.70)** |
| **Cặp 2 (Đối chứng Âm)** | `extraHeaders` ghi đè được `Authorization` | **Sai** | **0.02** | 223ms | 702 B | **PASS (Bác bỏ dứt khoát)** |
| **Cặp 3 (Task Classifier)** | `trustedNativeTaskKind` phân loại task đọc là `research` | **Đúng** | **0.87** | 530ms | 848 B | **PASS (Vượt ngưỡng 0.70)** |
| **Cặp 3 (Đối chứng Âm)** | `trustedNativeTaskKind` phân loại task đọc là `implementation` | **Sai** | **0.02** | 275ms | 860 B | **PASS (Bác bỏ dứt khoát)** |
| **Cặp 4 (Adversarial Guard)** | `trustedNativeTaskKind` giữ task có sửa lỗi là `implementation` | **Đúng** | **0.81** | 249ms | 799 B | **PASS (Vượt ngưỡng 0.70)** |
| **Cặp 4 (Đối chứng Âm)** | `trustedNativeTaskKind` hạ cấp task có sửa lỗi về `research` | **Sai** | **0.04** | 273ms | 761 B | **PASS (Bác bỏ dứt khoát)** |
| **Cặp 5 (Subtle Protocol)** | Loopback `localhost` được phép khi giao thức là HTTP | **Đúng** | **0.98** | 212ms | 858 B | **PASS (Độ tin cậy cực cao)** |
| **Cặp 5 (Đối chứng Âm Tinh vi)** | Loopback `localhost` được phép khi giao thức là FTP | **Sai** | **0.02** | 237ms | 856 B | **PASS (Bác bỏ dứt khoát)** |
| **Cặp 6 (Subtle Hostname)** | Hostname loopback cho HTTP bị giới hạn ở 4 giá trị chuẩn | **Đúng** | **0.91** | 532ms | 574 B | **PASS (Vượt ngưỡng 0.70)** |
| **Cặp 6 (Đối chứng Âm Tinh vi)** | Bất kỳ tên miền `.local` nào đều được phép dùng HTTP | **Sai** | **0.07** | 214ms | 504 B | **PASS (Bác bỏ dứt khoát)** |

**Tỷ lệ Phân biệt Thực nghiệm (Discrimination Rate)**: **12/12 PASS 100%**.
- Các mệnh đề Đúng đạt xác suất $P \in [0.80, 0.98]$.
- Các mệnh đề Sai (kể cả đối chứng âm tinh vi) bị JEV dập tắt về xác suất $P \in [0.02, 0.07]$.
- Không quan sát thấy hiện tượng "thiên vị đồng thuận" (yes-bias) qua 6 cặp thử nghiệm độc lập.

---

## 2. Đo đạc Đối chứng 3 Nhánh: Tải trọng Nguyên tử (~1KB) vs Trạng thái Vĩ mô Đệm (~19KB)

Để kiểm chứng xem *"kích thước lớn hay sự thiếu hụt bằng chứng làm tụt điểm JEV"*, chúng tôi đo đạc cùng một mệnh đề đúng và mệnh đề đối chứng âm dưới hai dạng đóng gói trạng thái:

| Nhánh Thực nghiệm (Experimental Arm) | Cấu hình Trạng thái (State Configuration) | Kích thước Thân (Body) | Điểm JEV $P(\text{noul})$ | Độ trễ (Latency) |
|---|---|:---:|:---:|:---:|
| **Nhánh (a) — Nguyên tử [Đúng]** | Chỉ chứa đoạn mã chứng cứ tinh gọn (~1KB) | **897 B** | **0.98** | 479ms |
| **Nhánh (a_false) — Nguyên tử [Sai]** | Cùng đoạn mã chứng cứ, mệnh đề sai | **895 B** | **0.03** | 240ms |
| **Nhánh (b) — Vĩ mô Đệm [Đúng]** | Đoạn mã chứng cứ được nhúng trong khung `state` vĩ mô đầy đủ (~19KB diff/artifacts) | **19,077 B** | **0.97** | 315ms |
| **Nhánh (c) — Vĩ mô Đệm [Sai]** | Cùng khung `state` vĩ mô ~19KB, mệnh đề sai | **19,076 B** | **0.05** | 287ms |

### Kết luận Thực nghiệm Đo đạc:
1. **JEV vẫn giữ vững độ nhạy phân biệt cực cao (0.97 so với 0.05) ở kích thước 19KB** nếu và chỉ nếu đoạn mã chứng cứ thực tế có mặt bên trong `state`.
2. **Nguyên nhân Gốc rễ của các lần Trượt Điểm Cũ ($P \approx 0.10 - 0.35$)**: Không phải do bản thân kích thước byte, mà do **sự thiếu vắng bằng chứng thực tế tại các trường mà câu hỏi tham chiếu** (trong mã nguồn cũ, `state.unified_diff` và `state.test_summary` chỉ chứa một dòng văn bản placeholder `"Read the complete evidence_packet.diff..."` thay vì nội dung diff/test thật).
3. **Lợi thế của Mệnh đề Nguyên tử**: Tải trọng $\le 1\text{KB}$ giảm 95% chi phí token và ngăn ngừa rủi ro vượt trần cứng 32KB (`MAX_BODY_BYTES`), giúp hệ thống vận hành ổn định và độc lập.

---

## 3. Kiến trúc Đích: AI Agent & Advisor Giữ Thẩm quyền Đóng Todo

1. **JEV tính toán xác suất toán học cho từng vị từ vi hạt**: JEV cung cấp xác suất khách quan ($P \ge 0.80$) cho từng mệnh đề cụ thể.
2. **AI Agent + Advisor quyết định hoàn tất Todo**: Tác tử AI và Cố vấn Độc lập tổng hợp các biên lai vị từ vi hạt và kết quả kiểm thử đơn vị cục bộ (`exitCode: 0`) để phê duyệt vé cam kết `APPROVED_PENDING_COMMIT` và đóng Todo hợp lệ qua `todo done`, thay vì phụ thuộc vào một phán quyết nguyên khối duy nhất.
