# Triển khai Phần mở rộng TypeSafe: Mẫu Trình trung chuyển Ủy nhiệm (TypeSafe Extension Deployment: The Proxy Pattern)

**Ngày (Date)**: 2026-10-03  
**Ngữ cảnh (Context)**: Lỗi Khởi động Phần mở rộng OMP (`typesafe-planner.ts` — OMP Extension Startup Failure)  
**Mục tiêu (Goal)**: Giải quyết các lỗi nhập đường dẫn tương đối (relative import failures) trong thư mục toàn cục `~/.omp/agent/extensions/` mà không vi phạm các ràng buộc kiến trúc chống nhân bản mã nguồn (architectural constraints against code duplication).

## Vấn đề (The Problem)
Phần mở rộng `typesafe-planner.ts` phụ thuộc vào nhiều mô-đun trong thư mục `src/` (`plan-evaluator`, `verification-gate`, `evidence-collector`, `cook-expert-judge`). Khi phần mở rộng được triển khai vào thư mục toàn cục `~/.omp/agent/extensions/`, các câu lệnh nhập tương đối (`./src/...` — relative imports) bị thất bại vì thư mục `src/` không tồn tại ở phạm vi toàn cục.

## Các Phương án Thay thế Bị Bác bỏ (Rejected Alternatives)
1. **Nhúng trực tiếp / Đóng gói gộp (Inlining/Bundling)**: Kế hoạch dự phòng ban đầu đề xuất nhúng trực tiếp khoảng ~1400 dòng mã của các mô-đun `src/` vào ngay bên trong tập tin phần mở rộng. Phương án này bị bác bỏ nghiêm ngặt vì vi phạm ràng buộc kiến trúc (dòng 75–81) vốn bắt buộc phải duy trì một nguồn chân lý duy nhất (single source of truth) cho logic biên tập che giấu (redaction) và xác thực (validation logic). Việc nhân bản đoạn mã này tạo ra rủi ro nghiêm trọng về hiện tượng trôi dạt logic âm thầm (silent logic drift) giữa OMP, MCP, và CLI.
2. **Vá bằng Biểu thức Chính quy / Gắn cứng Đường dẫn (Regex Patching/Hardcoding Paths)**: Việc sửa đổi trực tiếp tập tin mã nguồn tại không gian làm việc thượng nguồn (`~/tmp/typesafe-planner.ts`) để gắn cứng các đường dẫn tuyệt đối (`C:/Users/thant/tmp/...` — hardcode absolute paths) đã bị bác bỏ vì nó phá hủy tính khả chuyển (portability) của kho lưu trữ mã nguồn.

## Giải pháp: Mẫu Ủy nhiệm / Bàn đạp (The Solution: Proxy / Trampoline Pattern)
Để thỏa mãn đồng thời mọi ràng buộc (không nhân bản mã nguồn, bảo toàn tính khả chuyển của thượng nguồn, nạp thành công ở phạm vi toàn cục), chúng tôi áp dụng **Mẫu Trình trung chuyển Ủy nhiệm (Proxy / Trampoline Pattern)** cho phần mở rộng được triển khai.

Tập tin phần mở rộng toàn cục được triển khai (`~/.omp/agent/extensions/typesafe-planner.ts`) giờ đây chỉ là một dòng ủy nhiệm duy nhất (single-line proxy):
```typescript
export { default } from "C:/Users/thant/tmp/typesafe-planner.ts";
```

### Tại sao Cơ chế Này Hoạt động (Why This Works)
1. **Phân giải Bản địa (Native Resolution)**: Trình phân giải mô-đun của Bun/Node (module resolver) nạp tập tin ủy nhiệm, lập tức phân giải đường dẫn tuyệt đối trỏ tới không gian làm việc thượng nguồn, và thực thi tập tin gốc ngay trong ngữ cảnh bản địa của nó.
2. **Bảo toàn Nhập Tương đối (Relative Imports Intact)**: Vì tập tin được thực thi nằm vật lý tại `~/tmp/`, mọi câu lệnh nhập tương đối `./src/...` của nó đều được phân giải hoàn hảo tới `C:/Users/thant/tmp/src/...`.
3. **Không Tốn Chi phí Bảo trì (Zero Maintenance)**: Kịch bản hoặc quy trình triển khai không bao giờ cần phải phân tích cú pháp hay thay thế bằng biểu thức chính quy (regex-replace) các câu lệnh `import`. Kho lưu trữ thượng nguồn luôn giữ được sự nguyên vẹn và khả chuyển.

## Kết quả Đạt được (Outcomes)
- Lỗi khởi động `Cannot find module` được giải quyết vĩnh viễn.
- Công cụ giám định TypeSafe (`typesafe_judge`) thực thi thành công và kết nối thông suốt tới API.
- Các bài kiểm thử đầu-cuối (`bun test tests/e2e-workflow.test.ts` — end-to-end tests) vượt qua với mức độ tuân thủ 100%.
- Tính toàn vẹn kiến trúc (architectural integrity) được bảo toàn tuyệt đối.
