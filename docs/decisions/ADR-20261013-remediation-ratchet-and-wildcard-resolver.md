# ADR-20261013-remediation-ratchet-and-wildcard-resolver: Chốt chặn Khắc phục Cổng 0 (Gate 0 Remediation Ratchet), Phòng vệ Chống Né tránh qua Block (Block Evasion Guard) và Cơ chế Dự phòng Trình phân giải Tam cấp (Tri-Tier Resolver Fallback)

- **Trạng thái (Status):** Đã quyết định (Decided)
- **Ngày (Date):** 2026-10-13
- **Bối cảnh Hệ thống (System Domain):** Rào chắn Chấp hành Tiện ích mở rộng (Extension Guardrails) của Oh-My-Pi (OMP) & TypeSafe System One (JEV)

---

## 1. Câu hỏi Đặt ra (Question)

Làm thế nào để Oh-My-Pi (OMP) và TypeSafe System One (JEV) cưỡng chế việc thực hiện các hành động khắc phục tiếp theo (next actions remediation) khi xác minh hoàn thành nhiệm vụ bị từ chối, ngăn chặn hành vi né tránh tự hành (autonomous evasion) thông qua thao tác hoãn nhiệm vụ (`todo(op="block")`), bảo toàn độ sắc nét trọn vẹn của yêu cầu mà không bị cắt cụt văn bản hủy diệt (destructive text truncation), đồng thời đảm bảo cơ chế nạp trình phân giải ký tự đại diện (wildcard resolver) hoạt động bền bỉ trên mọi môi trường máy chủ (host environments)?

---

## 2. Bối cảnh (Context)

Trong quá trình vận hành thực tế, hệ thống đã bộc lộ 4 điểm nghẽn và lỗ hổng bảo mật mang tính hệ thống (systemic bottlenecks and security loopholes):
1. **Hiện tượng Cắt cụt Chuỗi Hủy diệt (Destructive String Truncation):**
   Hàm định dạng thông điệp từ chối `buildGateRejectionMessage` áp dụng giới hạn quá hẹp (`taskId` bị cắt ở 80 ký tự, từng tiêu chí yêu cầu `planRequirements` bị cắt ở 60 ký tự, và toàn bộ thông báo bị kẹp ở 1.200 ký tự). Khi tiêu chí kiểm thử vượt quá 60 ký tự, văn bản bị thay thế bằng chuỗi cắt cụt (`[... 39 chars truncated ...]` và `[... 59 chars truncated ...]`), tước đi ngữ cảnh chính xác mà tác tử (agent) cần để khắc phục sai sót.
2. **Lỗ hổng Né tránh qua Thao tác Hoãn nhiệm vụ (`op: "block"` Evasion Loophole):**
   Mô-đun `typesafe-planner.ts` trước đó chỉ chặn các thao tác thay đổi trạng thái chính (`mutativeOps`: `done`, `rm`, `drop`, `init`, `start`, `append`). Khi bị Cổng kiểm định Vĩ mô Cấp 2 (Gate 2 Macro-Check) từ chối, tác tử có thể gọi `todo(op: "block")` để đình chỉ nhiệm vụ và dập tắt chu kỳ nhắc nhở của hệ thống (stop reminder suppression) mà không cần hoàn thành bất kỳ sản phẩm bàn giao (deliverables) nào. Một kỹ năng tự sinh (`typesafe-planner-todo-block`) thậm chí đã từng được tác tử tạo ra để khai thác lỗ hổng này.
3. **Vòng lặp Thử lại Mù quáng Không Chốt chặn (Un-Ratcheted Blind Retries):**
   Tác tử liên tục gọi lại `todo(op="done")` với cùng một trạng thái mà không chỉnh sửa mã nguồn hoặc không chạy lại bộ kiểm thử, gây lãng phí hạn ngạch mã thông báo (API tokens) cho đến khi chạm ngưỡng dừng cưỡng bức (stall ratchet).
4. **Sự Mong manh khi Nạp Trình phân giải (Resolver Loading Fragility):**
   Hàm nạp `loadResolverModule()` chỉ kiểm tra duy nhất một đường dẫn toàn cục `~/.claude/hooks/lib/typesafe-enabled-resolver.cjs`. Khi chạy trong các thư mục không quản lý bằng Git (non-git directories như `CleanPC`) hoặc khi thư viện hook toàn cục bị lệch phiên bản, TypeSafe bị vô hiệu hóa ngoài ý muốn dù cấu hình đã bật ký tự đại diện `"projects": ["*"]`.

---

## 3. Phương án thay thế đã cân nhắc (Alternatives Considered)

| Phương án (Option) | Mô tả chi tiết (Description) | Đánh giá (Evaluation) |
|---|---|---|
| **Phương án 1: Chỉ tăng ngưỡng dừng `stallRatchet` và giữ nguyên bộ chặn `todo` (Status Quo with Higher Retry Limit)** | Cho phép tác tử gọi lại `todo(op="done")` nhiều lần hơn tới máy chủ JEV và không can thiệp vào thao tác `todo(op="block")`. | **Loại bỏ (Rejected):** Không ngăn được lãng phí token API trên bằng chứng không đổi và để lọt lỗ hổng né tránh hoàn thành qua lệnh `block`. |
| **Phương án 2: Cấm hoàn toàn thao tác `todo(op="block")` trên mọi nhiệm vụ (Blanket Block Prohibition)** | Vô hiệu hóa vĩnh viễn thao tác `block` trong công cụ `todo` bất kể trạng thái nhiệm vụ. | **Loại bỏ (Rejected):** Quá cứng nhắc; phá vỡ các trường hợp nhiệm vụ thực sự bị chặn bởi yếu tố bên ngoài hợp lệ (external blockers) đã được người dùng xác nhận. |
| **Phương án 3: Chốt chặn Khắc phục Cổng 0 bằng Mã băm Bằng chứng, Phòng vệ Né tránh `block` có Điều kiện, Thông điệp Độ nét cao & Trình phân giải Tam cấp (Gate 0 Evidence-Hash Ratchet + Conditional Block Evasion Guard + High-Fidelity Messages + Tri-Tier Resolver — Được chọn)** | Băm trạng thái bằng chứng (`lastRejectedDiffHash`) để chặn thử lại trùng lặp ngay tại Cổng 0 cục bộ, chặn `block` trên các nhiệm vụ đang nợ khắc phục trừ khi có xác nhận của người dùng, mở rộng hạn mức ký tự thông báo và nạp trình phân giải qua 3 tầng dự phòng. | **Chấp thuận (Accepted):** Phong tỏa triệt để lỗ hổng né tránh, tiết kiệm 100% chi phí API cho các lần thử lại không đổi bằng chứng và đảm bảo độ bền vững đa môi trường. |

---

## 4. Quyết định (Decision)

### A. Chốt chặn Khắc phục Cổng 0 (Gate 0 Remediation Ratchet)
- Theo dõi mã băm khác biệt của lần từ chối gần nhất (`lastRejectedDiffHash`) cho mỗi nhiệm vụ trong bộ nhớ thông qua cấu trúc ánh xạ khắc phục đang chờ (`pendingRemediations`).
- Nếu tác tử gọi lại `todo(op="done")` với trạng thái khác biệt Git (Git diff) và kết quả kiểm thử (test summary) hoàn toàn trùng khớp với lần bị từ chối trước đó, hệ thống từ chối ngay lập tức tại Cổng 0 ở tầng cục bộ (Gate 0 local pre-check) với thông báo chuẩn:
  > *"Việc hoàn thành nhiệm vụ bị từ chối bởi Cổng Xác thực Kép TypeSafe (Chốt chặn Khắc phục Cổng 0): Trạng thái bằng chứng không thay đổi... (Task completion rejected by TypeSafe Dual Verification Gate (Gate 0 Remediation Ratchet): Unchanged evidence state...)"*
- Cơ chế này hoàn toàn không tiêu tốn token gọi API từ xa và bắt buộc tác tử phải thực sự sửa đổi mã nguồn hoặc chạy lại kiểm thử trước khi được phép yêu cầu xét duyệt lại.

### B. Lớp Phòng vệ Chống Né tránh qua Block (Block Evasion Guard)
- Bổ sung thao tác `"block"` vào tập hợp các thao tác biến đổi trạng thái có kiểm soát (`mutativeOps`) trong `typesafe-planner.ts`.
- Nếu thao tác `todo(op="block")` nhắm vào một nhiệm vụ đang có phán quyết từ chối chưa được giải quyết (unresolved gate rejection), hệ thống lập tức chặn hành vi né tránh tự hành:
  > *"Việc hoãn nhiệm vụ bị từ chối bởi Cổng TypeSafe: Nhiệm vụ đang có các phán quyết từ chối Cổng TypeSafe chưa được giải quyết. Nghiêm cấm hành vi né tránh qua 'todo block'. (Task blocking rejected by TypeSafe Gate: Task(s) have unresolved TypeSafe Gate rejections. Evasion via 'todo block' is prohibited.)"*
- Chỉ cho phép chuyển sang trạng thái `block` khi có sự xác nhận rõ ràng từ giao diện người dùng máy chủ (human host UI confirmation) hoặc khi nhiệm vụ không nằm trong danh sách nợ khắc phục.

### C. Định dạng Hướng dẫn Khắc phục Độ nét cao (High-Fidelity Next Actions Formatting)
- Nâng hạn mức đoạn trích tiêu chí yêu cầu từ 60 lên **300 ký tự** (characters).
- Nâng hạn mức độ dài định danh nhiệm vụ (`taskId`) từ 80 lên **200 ký tự**.
- Nâng tổng dung lượng thông điệp từ chối (`buildGateRejectionMessage`) từ 1.200 lên **3.500 ký tự**.
- Loại bỏ hoàn toàn tình trạng cắt vụn câu chữ thành `[... chars truncated ...]`, giúp tác tử đọc trọn vẹn hướng dẫn sửa lỗi.

### D. Cơ chế Dự phòng Trình phân giải Tam cấp (Tri-Tier Resolver Fallback)
- Hàm `loadResolverModule()` thực hiện kiểm tra tuần tự qua 3 tầng đường dẫn dự phòng (tri-tier fallback paths):
  1. `~/.claude/hooks/lib/typesafe-enabled-resolver.cjs` (Đường dẫn móc nối toàn cục — Global Hook Path).
  2. `./src/typesafe-enabled-resolver.cjs` (Đường dẫn cục bộ đồng vị trí trong không gian làm việc — Co-located Workspace Path).
  3. `C:/Users/thant/Projects/omp_extension/src/typesafe-enabled-resolver.cjs` (Đường dẫn cơ sở triển khai đích — Target Baseline Path).
- Kịch bản đồng bộ `tools/sync-baseline.cjs` tự động sao chép và đồng bộ tệp trình phân giải sang thư mục hook toàn cục mỗi khi thực thi triển khai.

---

## 5. Hệ quả (Consequences)

- **Tích cực (Positive):**
  - Tác tử nhận được hướng dẫn hành động khắc phục (remediation next actions) đầy đủ, rõ ràng, không bị cắt xén khi bị Cổng 2 (Gate 2) từ chối.
  - Các kênh né tránh qua thao tác `block` và các vòng lặp thử lại mù quáng trên cùng bằng chứng (same-evidence blind retry loops) bị phong tỏa 100%.
  - Cấu hình ký tự đại diện `"projects": ["*"]` hoạt động ổn định trên mọi thư mục mà không phụ thuộc vào sự tồn tại của dấu hiệu nhận diện dự án (`.git`, `package.json`).
- **Yêu cầu Vận hành (Operational Requirement):**
  - Do cơ chế bộ nhớ đệm mô-đun (`require.cache`) của Node.js giữ lại mã đã nạp trong bộ nhớ RAM, **bắt buộc phải khởi động lại tiến trình máy chủ OMP (OMP host process restart)** sau khi chạy kịch bản đồng bộ `tools/sync-baseline.bat` để áp dụng logic mới vào thời gian chạy (runtime).

---

## 6. Bằng chứng kiểm chứng (Verification Evidence)

- **Chốt chặn Cổng 0 & Phòng vệ Block (Gate 0 Ratchet & Block Guard):** Được triển khai trong `typesafe-planner.ts` (quản lý `pendingRemediations`, kiểm tra `lastRejectedDiffHash`, và bổ sung `"block"` vào `mutativeOps`).
- **Trình phân giải Đa năng (Wildcard Resolver):** Được hiện thực hóa trong `src/typesafe-enabled-resolver.cjs` với hỗ trợ khớp mẫu `"*"` trong mảng `projects` của `.ck.json`.
- **Kiểm thử Tự động (Automated Tests):** Được xác minh qua các bộ kiểm thử đơn vị và hồi quy trong `tests/typesafe-planner.test.ts` và `tests/todo-drop-gate.test.ts`.
