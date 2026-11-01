# Bàn giao tham vấn runtime (Runtime Consultation Handoff)

## Mục tiêu được giữ nguyên

Bảy mục native todo trong các pha `Khảo sát`, `Đánh giá`, `Kết luận` vẫn mở, không tạo lại danh sách hoặc đổi hiện thân (Incarnation). Người dùng đã cho phép thực thi và sửa lỗi; quyền đó không thay receipt M/Advisor hoặc kết quả Core đã quyết toán (Settled Core Result).

## Quan sát mới

1. `todo view` đọc đúng bảy mục.
2. `typesafe_prepare_advisor` qua transport `xd://typesafe_prepare_advisor` ban đầu trả `advisor_consultation_source_scope_denied`.
3. Làm mới snapshot bằng `typesafe_collect_evidence` cho mục đầu tiên thành công ở lớp observation; trả `EVIDENCE_REQUIRED`: thiếu `VERIFICATION_RECEIPT_REQUIRED`, packet vượt budget, chưa đủ criterion. Snapshot mới chứa report đã sửa sau receipt trước, nên không lấy receipt cũ thay thế.
4. Chuẩn bị consultation lại trên snapshot mới trả `advisor_public_reference_redaction_required`.
5. Chọn mục thứ hai chưa có bound evidence record vẫn trả lỗi redaction. Không có native descriptor để thực thi, không có receipt Advisor.
6. Gọi hàm thực `prepareAdvisorConsultationContext` từ source workspace trong tiến trình eval mới, không cấp authorizedFiles, dùng câu hỏi công khai và credential fixture tổng hợp: PASS; public reference giữ nguyên identity; không cấp native authority.

Các quan sát này chứng minh đường source local và tool runtime chưa có hành vi tương đương trên consultation tối thiểu; chưa đủ để xác định toàn bộ nguyên nhân cache/host adapter. Không sửa sanitizer thêm hoặc tuyên bố runtime đã restart chỉ dựa vào ngày phiên.

## Đối chiếu source

- `src/task-verification-advisor.ts:72-81`: task-bound review yêu cầu state/contract/record/packet hoàn chỉnh.
- `src/task-verification-advisor.ts:93-110`: consultation là nhánh riêng để chẩn đoán thiếu proof, không yêu cầu packet hoàn chỉnh; vẫn kiểm source scope/identity/privacy.
- `src/task-verification-advisor.ts:66,104`: tập authorizedFiles lấy từ snapshot được host xác thực, không từ caller tự khai.
- `src/advisor-public-context.ts:67-74`: kiểm đường dẫn và SHA hiện hành.
- `src/advisor-public-context.ts:79-83`: reference câu hỏi được sinh từ digest và qua privacy validation.

Không quy lỗi redaction cho thiếu receipt chỉ vì hai lỗi cùng xuất hiện. Không coi consultation là quyền task completion.

## Owner, bước tiếp và điều kiện mở lại

- Chủ sở hữu (Owner): người vận hành host OMP và integration owner.
- Hành động tiếp theo (Next Action): khởi động lại tiến trình OMP, tiếp tục cùng lịch sử; kiểm consultation tối thiểu trên tool runtime mới trước khi chạy command dài. Nếu vẫn lỗi, điều tra host adapter và public source references bằng Advisor độc lập thật, không hạ privacy guard.
- Điều kiện mở lại (Release Condition): preparation trả native descriptor hợp lệ; thực thi descriptor tạo settled Advisor receipt thật. Sau đó chạy collector với `commandId=workspace-tests` để nhận receipt mới cho tree hiện hành; curation đúng schema, giữ criterion và đầy đủ nguồn bắt buộc.
- Lệnh tiếp tục (Resume Command): `todo view`; `typesafe_prepare_advisor` với `purpose="consultation"`, `decision="stuck"`, chọn đúng mục từ Core và câu hỏi chẩn đoán công khai. Không tự điền authorizedFiles/receipt/approval flags ngoài schema. Nếu preparation đạt, thực thi chính native task trả về.

## Những gì đã kiểm chứng trước đó

Source sửa và tối ưu đã triển khai giao dịch; full suite tại đích 950 pass, 4 skip, 0 fail trong 267.88s, không tăng deadline 300s. Hậu kiểm tại thời điểm đó 503/503 tệp khớp, không action chờ. Đây là bằng chứng trên đĩa và tests, không thay authority M/Advisor/Core. Các report mới sau đó chưa được sync lại; không tuyên bố parity cũ bao gồm chúng.

Không retry semantic rejection không đổi, không đánh dấu done hoặc block toàn bộ để làm sạch nhắc việc. Không có matching settled Core completion trong lượt này.
