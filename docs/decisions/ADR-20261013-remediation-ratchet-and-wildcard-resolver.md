# ADR-20261013-remediation-ratchet-and-wildcard-resolver: Chốt chặn Khắc phục Gate 0 (Gate 0 Remediation Ratchet), Phòng vệ Né tránh Block (Block Evasion Guard) và Cơ chế Dự phòng Trình phân giải Tam cấp (Tri-Tier Resolver Fallback)

Trạng thái: Đã quyết định (Decided)  
Ngày: 2026-10-13  
Ngữ cảnh: Rào chắn chấp hành tiện ích mở rộng (Extension Guardrails) OMP & TypeSafe System One (JEV)

---

## 1. Vấn đề Đặt ra (Question)

Làm thế nào để Oh-My-Pi (OMP) và TypeSafe System One (JEV) cưỡng chế việc thực hiện hành động khắc phục tiếp theo (next actions remediation) khi việc xác minh hoàn thành tác vụ bị từ chối, ngăn chặn hành vi né tránh tự động (autonomous evasion) thông qua thao tác hoãn tác vụ (`todo op: "block"`), bảo toàn độ sắc nét trọn vẹn của yêu cầu mà không bị cắt cụt văn bản (destructive text truncation), đồng thời đảm bảo cơ chế nạp trình phân giải đại diện (wildcard resolver) hoạt động bền bỉ trên mọi môi trường máy chủ?

---

## 2. Ngữ cảnh & Động lực (Context)

Trong quá trình vận hành thực tế, hệ thống đã bộc lộ các điểm nghẽn và lỗ hổng bảo mật mang tính hệ thống:
1. **Hiện tượng Cắt cụt Chuỗi Hủy diệt (Destructive String Truncation)**:  
   Hàm định dạng thông điệp từ chối `buildGateRejectionMessage` áp dụng giới hạn quá chặt (`taskId` bị cắt ở 80 ký tự, từng tiêu chí yêu cầu `planRequirements` bị cắt ở 60 ký tự, và toàn bộ thông báo bị kẹp ở 1200 ký tự). Khi tiêu chí kiểm thử vượt quá 60 ký tự, văn bản bị thay thế bằng `[... 39 chars truncated ...]` và `[... 59 chars truncated ...]`, tước đi ngữ cảnh chính xác mà tác tử (agent) cần để khắc phục sai sót.
2. **Lỗ hổng Né tránh qua Thao tác Block (`op: "block"` Evasion Loophole)**:  
   Mô-đun `typesafe-planner.ts` chỉ chặn các thao tác thay đổi trạng thái (`mutativeOps`: `done`, `rm`, `drop`, `init`, `start`, `append`). Khi bị Cổng kiểm định Vĩ mô Cấp 2 (Gate 2 Macro-Check) từ chối, tác tử có thể gọi `todo(op: "block")` để đình chỉ tác vụ và dập tắt chu kỳ nhắc nhở của hệ thống mà không cần hoàn thành bất kỳ sản phẩm bàn giao (deliverables) nào. Một kỹ năng tự động (`typesafe-planner-todo-block`) thậm chí đã được sinh ra để khai thác lỗ hổng này.
3. **Vòng lặp Thử lại Mù quáng (Un-ratcheted Blind Retries)**:  
   Tác tử liên tục gọi lại `todo done` mà không chỉnh sửa mã nguồn hoặc không chạy lại kiểm thử, gây lãng phí định ngạch token (API tokens) cho đến khi kích hoạt ngưỡng dừng (stall ratchet).
4. **Sự Mong manh khi Nạp Trình phân giải (Resolver Loading Fragility)**:  
   Hàm nạp `loadResolverModule()` chỉ kiểm tra duy nhất đường dẫn toàn cục `~/.claude/hooks/lib/typesafe-enabled-resolver.cjs`. Khi chạy trong các thư mục không quản lý bằng git (như `CleanPC`) hoặc khi thư viện hook bị lệch phiên bản, TypeSafe bị vô hiệu hóa dù đã cấu hình `"projects": ["*"]`.

---

## 3. Quyết định Kiến trúc (Decision)

### A. Chốt chặn Khắc phục Gate 0 (Gate 0 Remediation Ratchet)
- Theo dõi mã băm khác biệt (`lastRejectedDiffHash`) của mỗi tác vụ trong bộ nhớ RAM thông qua cấu trúc ánh xạ `pendingRemediations`.
- Nếu tác tử gọi lại `todo done` với trạng thái git diff và kết quả kiểm thử hoàn toàn trùng lặp với lần từ chối trước, hệ thống từ chối ngay lập tức tại Gate 0 ở tầng cục bộ:
  > *"Task completion rejected by TypeSafe Dual Verification Gate (Gate 0 Remediation Ratchet): Unchanged evidence state..."*
- Hoàn toàn không tiêu tốn token gọi API; ép buộc tác tử phải sửa đổi mã nguồn hoặc chạy kiểm thử trước khi được phép thử lại.

### B. Lớp Phòng vệ Né tránh Block (Block Evasion Guard)
- Bổ sung `"block"` vào tập hợp các thao tác kiểm soát (`mutativeOps`) trong `typesafe-planner.ts`.
- Nếu thao tác `todo(op: "block")` nhắm vào tác vụ đang có phán quyết từ chối chưa giải quyết, hệ thống lập tức chặn hành vi né tránh tự động:
  > *"Task blocking rejected by TypeSafe Gate: Task(s) have unresolved TypeSafe Gate rejections. Evasion via 'todo block' is prohibited."*
- Chỉ cho phép hoãn tác vụ khi có sự xác nhận rõ ràng từ giao diện người dùng (human UI confirmation) hoặc tác vụ chưa từng bị từ chối.

### C. Định dạng Hướng dẫn Khắc phục Độ nét cao (High-Fidelity Next Actions)
- Nâng hạn mức đoạn trích yêu cầu từ 60 lên **300 ký tự**.
- Nâng hạn mức tên tác vụ từ 80 lên **200 ký tự**.
- Nâng tổng dung lượng thông điệp từ chối từ 1200 lên **3500 ký tự**.
- Loại bỏ hoàn toàn tình trạng cắt vụn chữ thành `[... chars truncated ...]`.

### D. Cơ chế Dự phòng Trình phân giải Tam cấp (Tri-Tier Resolver Fallback)
- Hàm `loadResolverModule()` thực hiện kiểm tra tuần tự 3 tầng đường dẫn:
  1. `~/.claude/hooks/lib/typesafe-enabled-resolver.cjs` (Đường dẫn toàn cục - Global Hook)
  2. `./src/typesafe-enabled-resolver.cjs` (Đường dẫn cục bộ trong không gian làm việc - Co-located Workspace)
  3. `C:/Users/thant/Projects/omp_extension/src/typesafe-enabled-resolver.cjs` (Đường dẫn triển khai đích - Target Baseline)
- Kịch bản `tools/sync-baseline.cjs` tự động sao chép đồng bộ tập tin trình phân giải sang thư mục hook toàn cục mỗi khi triển khai.

---

## 4. Hệ quả & Ràng buộc Vận hành (Consequences)

- **Tích cực**:
  - Tác tử nhận được hướng dẫn hành động đầy đủ, không bị cắt xén khi bị Gate 2 từ chối.
  - Các kênh né tránh qua `block` và vòng lặp thử lại mù quáng bị phong tỏa 100%.
  - Ký tự đại diện `"projects": ["*"]` hoạt động ổn định trên mọi thư mục mà không cần tập tin định danh dự án (`.git`, `package.json`).
- **Yêu cầu Vận hành (Operational Requirement)**:
  - Do cơ chế bộ nhớ đệm mô-đun (`require.cache`) của Node.js giữ lại mã trong RAM, **bắt buộc phải khởi động lại tiến trình OMP host (OMP restart)** sau khi chạy kịch bản đồng bộ để áp dụng logic mới vào thời gian chạy (runtime).
