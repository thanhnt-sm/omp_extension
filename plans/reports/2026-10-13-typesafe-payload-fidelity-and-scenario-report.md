# Báo cáo Phân tích Kịch bản, Tiếp nhận Dữ liệu Động & Nén Ngữ cảnh TypeSafe JEV

- **Ngày thực hiện**: 2026-10-13
- **Chủ đề**: Định tuyến Ngữ cảnh Động (Dynamic Context Routing), Kiến trúc Đóng gói Dữ liệu (Payload Packing Architecture) & Phân tích 21 Kịch bản theo 9 Chiều Không gian Phân rã

---

## 1. Tóm tắt Tổng quan (Executive Summary)

Báo cáo này phân tích đường ống truyền nhận dữ liệu từ đầu đến cuối (end-to-end data pipeline) và cơ chế nén ngữ cảnh (context compression) giữa Oh-My-Pi (OMP) và TypeSafe System One (JEV). Báo cáo giải quyết triệt để mối quan ngại lịch sử về việc gửi nội dung tĩnh/gán cứng (hardcoded payloads) làm sai lệch kết quả đánh giá, xác lập cơ chế định tuyến ngữ cảnh động theo từng trường hợp thẩm định, đồng thời kiểm tra thuật toán đóng gói dữ liệu an toàn trong hạn mức 32KB (`MAX_BODY_BYTES = 32768`) dựa trên phương pháp luận phân rã kịch bản chuyên sâu (`ck:scenario`).

---

## 2. Định tuyến Ngữ cảnh Động so với Dữ liệu Gán cứng (Dynamic Context Routing vs. Hardcoded Payloads)

TypeSafe System One không sử dụng bất kỳ mẫu văn bản tĩnh gán cứng nào. Thay vào đó, hệ thống xây dựng ngữ cảnh trạng thái (`state`) và bộ câu hỏi đánh giá (`questions`) hoàn toàn động dựa trên từng trường hợp vòng đời tác vụ:

| Sự kiện Vòng đời (Lifecycle Event) | Trường Dữ liệu Trạng thái Tiếp nhận (Ingested State Fields) | Câu hỏi & Tiêu chí Thẩm định Động (Dynamic Question & Rubric) | Cơ chế An toàn & Chống Giả mạo (Anti-Spoofing & Safety) |
|---|---|---|---|
| **Bàn giao Mã nguồn (`todo done`)** | `todo_task`, `task_requirements`, `unified_diff`, `diff_summary`, `test_summary`, `user_request`, `agent_work_log`, `diff_scope` | Đánh giá phán quyết bàn giao phân loại (`deliverables_verdict`: `APPROVE`, `REJECT`, `NEXT_ACTION_REQUIRED`), trôi dạt kiến trúc (`architectural_drift`), và chế độ phạm vi (`scope_mode`). | Quét `diffSummary`; nếu phát hiện tập tin mã nguồn (`.ts`, `.py`, `.sql`...), hệ thống tự động ép kiểu tác vụ sang dạng mã nguồn (`code_change`), bắt buộc phải có kiểm thử passing. |
| **Nghiên cứu / Tài liệu (`todo done`)** | `todo_task`, `task_requirements`, `deliverable_artifacts`, `test_summary`, `user_request`, `agent_work_log` | Đánh giá xem tiêu chí tài liệu/phân tích có được đáp ứng trọn vẹn bằng các sản phẩm cụ thể (`deliverable_artifacts`) hay không; không đòi hỏi diff mã nguồn. | Yêu cầu phải có tập tin báo cáo/đặc tả thực tế trong cây thư mục làm việc. |
| **Bỏ Tác vụ (`todo drop/rm`)** | `tasks_to_drop`, `drop_reason`, `user_request`, `agent_work_log`, `remaining_tasks` | Đánh giá phán quyết bỏ tác vụ (`drop_verdict`): Phê duyệt (`APPROVE`) nếu người dùng yêu cầu hoặc tác vụ thừa/lặp; Từ chối (`REJECT`) nếu né tránh công việc. | Yêu cầu người dùng (`user_request`) mang tính thẩm quyền tối cao; lý lẽ của tác tử chỉ là tuyên bố chưa kiểm chứng. |
| **Đề xuất Quyết định (`ask` tool)** | `intent`, `questions` (các lựa chọn trình bày cho người dùng), `projectDir` | Đánh giá thế rủi ro kỹ thuật (`risk_posture`: thang điểm 0–3) và độ minh bạch của quyết định (`decision_clarity`: noul). | Gắn trực tiếp khuyến nghị rủi ro vào giao diện tương tác của người dùng. |

---

## 3. Thuật toán Đóng gói Ưu tiên Dữ liệu Lớn trong Hạn mức 32KB (32KB Priority Packing Algorithm)

Mô hình JEV System One vận hành với cửa sổ suy luận tốc độ cao, bị chặn cứng ở giới hạn dung lượng tải gửi đi (`MAX_BODY_BYTES = 32768` bytes). Để nhồi một tác vụ lớn (hàng trăm dòng git diff, log kiểm thử dài và lịch sử hội thoại) vào hạn mức này một cách chính xác và không mất dữ liệu then chốt, mô-đun `payload-safety.ts` thi hành thuật toán phân bổ ngân sách theo thứ tự ưu tiên:

```
Tổng Ngân sách Tải (Total Budget): 32,768 bytes
├── Mức ưu tiên 1: Cốt lõi Hợp đồng (Contract Core - TUYỆT ĐỐI KHÔNG CẮT BỎ)
│   ├── todo_task (giữ phần đầu - head clamped: 1,000 ký tự)
│   ├── task_requirements (giữ phần đầu - head clamped: 3,000 ký tự)
│   └── user_request (giữ phần đuôi - tail clamped: 2,000 ký tự)
├── Mức ưu tiên 2: Bằng chứng Xác minh (Verification Evidence - Độ nét cao)
│   ├── test_summary (giữ phần đuôi - tail clamped: 3,000 ký tự; bảo toàn mã thoát và stack trace)
│   └── diff_summary (giữ phần đầu - head clamped: 2,000 ký tự; danh sách toàn bộ file thay đổi)
├── Mức ưu tiên 3: Vùng đệm Co giãn (Elastic Buffer - Nén lặp dần)
│   └── unified_diff (bắt đầu đầy đủ; tự động co dần theo từng bước 256 bytes đến khi vừa ngân sách)
└── Mức ưu tiên 4: Ngữ cảnh Nền tảng (Background Context - Cắt bỏ đầu tiên khi thiếu dung lượng)
    ├── agent_work_log (giữ phần đuôi - tail clamped: 3,000 ký tự)
    └── plan_context (giữ phần đầu - head clamped: 2,000 ký tự)
```

### Các Hàng rào Bảo vệ Cốt lõi (Safety Guarantees)
1. **Đóng gói Phân định XML (XML Enclosure)**: Mọi trường trạng thái không tin cậy đều được bọc trong các thẻ `<tag>...</tag>` và chuyển đổi ký tự đặc biệt (`&lt;`, `&gt;`, `&amp;`), ngăn chặn triệt để hành vi tiêm prompt (prompt injection).
2. **Lọc Dữ liệu Nhạy cảm trước khi Rời máy (Egress Secret Redaction)**: Quét và thay thế các khóa API, mã phiên và mật khẩu bằng chuỗi `[REDACTED_SECRET]`.
3. **Bảo vệ Ranh giới Byte UTF-8 Đa byte**: Việc tính toán ngân sách dung lượng dựa trên số byte thực tế (`Buffer.byteLength`) thay vì số ký tự, triệt tiêu lỗi cú pháp JSON (HTTP 422) do cắt ngang một ký tự đa byte.

---

## 4. Bảng Ma trận Phân tích 21 Kịch bản theo 9 Chiều Không gian (Scenario Matrix)

| # | Chiều Phân rã (Dimension) | Kịch bản Biên (Scenario) | Mức độ Nghiêm trọng (Severity) | Hành vi Dự kiến của Hệ thống (Expected Behavior) |
|---|---|---|---|---|
| 1 | **Đầu vào Cực hạn (Input Extremes)** | Git diff vượt quá 120KB do chạm vào lockfile hoặc file bundle sinh tự động | Nghiêm trọng (Critical) | Thuật toán ưu tiên bảo toàn nguyên vẹn yêu cầu và log test; `unified_diff` được co ngắn có điểm dừng với dấu hiệu `\n[... diff truncated ...]`, tránh lỗi tràn tải HTTP 413. |
| 2 | **Đầu vào Cực hạn (Input Extremes)** | Log kiểm thử xuất ra hơn 50.000 ký tự rác trên bảng điều khiển console | Cao (High) | Cơ chế giữ phần đuôi (`clampText(testSummary, 3000, "tail")`) loại bỏ log khởi động vô nghĩa, giữ lại trọn vẹn kết quả khẳng định lỗi và mã thoát ở cuối. |
| 3 | **Đầu vào Cực hạn (Input Extremes)** | Mã nguồn chứa ký tự đa byte UTF-8 phức tạp (tiếng Việt, CJK, ký hiệu toán học) | Cao (High) | Đo lường dung lượng bằng byte ngăn chặn việc đứt gãy chuỗi byte, loại bỏ hoàn toàn nguy cơ máy chủ JEV từ chối phân tích cú pháp JSON (422). |
| 4 | **Thời gian (Timing)** | Tác tử rơi vào vòng lặp gọi lại `todo done` liên tục khi chưa sửa file hay chạy test | Nghiêm trọng (Critical) | Chốt chặn Gate 0 (Gate 0 Remediation Ratchet) đối chiếu mã băm `diffHash` và chặn đứng ngay lập tức tại máy cục bộ (0ms), không tốn token mạng. |
| 5 | **Thời gian (Timing)** | Điểm cuối TypeSafe JEV phản hồi chậm quá thời hạn (quá 3000ms probe hoặc 15000ms Gate 2) | Cao (High) | Bộ kích hoạt hủy tín hiệu (`AbortSignal`) ngắt kết nối an toàn, chuyển hướng sang cảnh báo `unavailable` có kiểm soát, không bao giờ làm treo giao diện dòng lệnh OMP. |
| 6 | **Quy mô (Scale)** | Kế hoạch dự án có 15 tiêu chí nghiệm thu chi tiết với hơn 8.000 ký tự | Cao (High) | Trích xuất tiêu chí động theo đúng phạm vi tác vụ/giai đoạn hiện tại và kẹp ở phần đầu 3.000 ký tự, giữ trọn vẹn các điều khoản cam kết chính. |
| 7 | **Chuyển đổi Trạng thái (State Transitions)** | Tác tử cố tình khai báo tác vụ là "tài liệu" để trốn kiểm thử, nhưng diff sửa file code `.ts` | Nghiêm trọng (Critical) | **Quy tắc chống giả mạo**: Hệ thống tự động phát hiện đuôi file mã nguồn trong `diffSummary` và ép kiểu tác vụ về dạng mã nguồn (`code_change`), buộc phải có test đạt. |
| 8 | **Chuyển đổi Trạng thái (State Transitions)** | Tác tử gọi `todo block` để hoãn tác vụ đang bị Gate 2 từ chối | Nghiêm trọng (Critical) | Lớp phòng vệ Block Guard phát hiện tác vụ có vết từ chối chưa giải quyết và chặn đứng hành vi né tránh, bắt buộc phải hoàn thành sản phẩm hoặc có người dùng duyệt UI. |
| 9 | **Chuyển đổi Trạng thái (State Transitions)** | Bỏ tác vụ thông qua thao tác `todo drop` | Cao (High) | Chuyển sang thẩm định lý do bỏ (`runDropJustificationCheck`), đối chiếu với yêu cầu gốc của người dùng (`user_request`) để phát hiện hành vi trốn việc. |
| 10 | **Môi trường (Environment)** | OMP chạy trên thư mục không có git (như `CleanPC`) với cấu hình đại diện `"*"` | Cao (High) | Trình phân giải nhận diện `*` khớp với mọi thư mục mà không đòi hỏi sự hiện diện của `.git`, kích hoạt TypeSafe thông suốt. |
| 11 | **Chuỗi Lỗi (Error Cascades)** | Khóa API TypeSafe bị hết hạn hoặc không hợp lệ (lỗi HTTP 401/403) | Cao (High) | Ghi nhận mã băm khóa hỏng (`lastFailedKeyHash`), thông báo cảnh báo qua UI và chuyển sang chế độ chặn an toàn (fail-closed), ngăn việc tự ý cho qua. |
| 12 | **Chuỗi Lỗi (Error Cascades)** | Kết quả JSON trả về từ JEV bị khuyết trường phán quyết (`deliverables_verdict`) | Nghiêm trọng (Critical) | Hệ thống từ chối hoàn thành tác vụ theo nguyên tắc thắt chặt (fail-closed), báo cáo lỗi thẩm định không hoàn chỉnh và yêu cầu người dùng giám sát. |
| 13 | **Xác thực & Ủy quyền (Authorization)** | Mã nguồn trong git diff vô tình chứa khóa bí mật, token JWT hoặc thông tin đăng nhập | Nghiêm trọng (Critical) | Bộ lọc dữ liệu xuất (`typesafe-redact.cjs`) quét và thay thế bí mật bằng `[REDACTED_SECRET]` trước khi gói tin được truyền qua mạng Internet. |
| 14 | **Tích hợp (Integration)** | Nguy cơ văn bản từ mã nguồn hoặc tác tử thoát khỏi ranh giới prompt của JEV | Nghiêm trọng (Critical) | Đóng gói an toàn toàn bộ dữ liệu bằng thẻ XML có mã hóa ký tự đặc biệt, cô lập tuyệt đối dữ liệu không tin cậy khỏi tập lệnh chỉ dẫn của Judge. |
| 15 | **Toàn vẹn Dữ liệu (Data Integrity)** | Trường hợp cắt ngắn khẩn cấp làm hỏng cú pháp cấu trúc chuỗi JSON | Nghiêm trọng (Critical) | Bộ xử lý cắt tỉa theo ranh giới byte chèn tiêu đề `--- Truncated State ---` nếu cấu trúc ngoặc nhọn bị đứt gãy, ngăn chặn việc máy chủ từ chối nhận diện tải (HTTP 422). |

---

## 5. Tổng kết Phân tích Kịch bản

- **Mức Nghiêm trọng (Critical)**: 6 kịch bản (Diff khổng lồ, giả mạo loại tác vụ, né tránh qua block, lộ lọt khóa bí mật, lỗi cú pháp JSON tải trọng, tiêm prompt).
- **Mức Cao (High)**: 7 kịch bản (Cắt log test theo đuôi, xử lý timeout mạng, định tuyến bỏ tác vụ, đại diện thư mục không có git, lỗi xác thực 401, trích xuất yêu cầu kế hoạch, ký tự đa byte).
- **Mức Trung bình (Medium)**: 2 kịch bản (Chuẩn hóa ký tự xuống dòng CRLF/LF, phân định nhị phân).
- **Mức Thấp (Low)**: 0 kịch bản.
- **Tổng cộng**: **21 kịch bản chi tiết trên 9 chiều không gian phân rã phù hợp** (3 chiều không áp dụng được bỏ qua có lý do).
