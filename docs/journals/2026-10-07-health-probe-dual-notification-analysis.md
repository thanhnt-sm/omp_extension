# Nhật ký Kỹ thuật: Phân tích Thông báo Kép của Thăm dò Sức khỏe Đầu phiên & Rà soát `ck:predict` (Technical Journal: Session Start Health Probe Dual-Notification Analysis & ck:predict Review)

**Ngày (Date):** 2026-10-07  
**Tác giả (Author):** Trợ lý Lập trình AI (AI Coding Assistant)  
**Chủ đề (Topic):** Giới hạn Phạm vi Ngoại lệ của Thăm dò Tiền trạm & Vòng đời Sức khỏe Hướng Sự kiện (Pre-Flight Probe Exception Scoping & Event-Driven Health Lifecycle)

---

## 1. Mô tả Sự cố (Issue Description)

Khi khởi động một phiên làm việc mới với phần mở rộng TypeSafe đã cài đặt, người dùng quan sát thấy hai thông báo liên tiếp nhưng mâu thuẫn nhau (two consecutive and contradictory notifications):

```
╭────────────────────────────────────────────────────────╮
│ 📦 typesafe-health                                     │
│ TypeSafe: ONLINE (jev-latest)                          │
╰────────────────────────────────────────────────────────╯

╭────────────────────────────────────────────────────────╮
│ 📦 typesafe-health                                     │
│ TypeSafe warning: TypeSafe API unreachable. Check      │
│ internet connection or proxy settings.                │
╰────────────────────────────────────────────────────────╯
```

Sau khi hai thông báo này xuất hiện lúc khởi động, không có thêm bất kỳ thông báo sức khỏe nào được hiển thị trong suốt phiên làm việc.

---

## 2. Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis)

### A. Tại sao Hai Thông báo Mâu thuẫn Lại Kích hoạt Tuần tự (Why Two Contradictory Notifications Fire Sequentially)
Sự cố nằm trong tập tin `typesafe-planner.ts` tại các dòng 606–675 bên trong bộ lắng nghe sự kiện `pi.on("session_start")` (event listener):

1. **Bước 1 — Thăm dò HTTP Thành công (Step 1 — HTTP Probe Succeeded):**
   Thăm dò tiền trạm (pre-flight probe) thực thi `fetch("https://api.typesafe.ai/v1/systemone", ...)` với một gói tin kiểm tra siêu nhỏ gọn (ultra-compact ping payload).
   Máy chủ TypeSafe phản hồi với mã **HTTP 200 OK**.
   Kết quả này kích hoạt nhánh `if (probeRes.ok)`:
   ```typescript
   extCtx.ui?.notify?.("TypeSafe: ONLINE (jev-latest)", "info");
   await pi.sendMessage({
     customType: "typesafe-health",
     content: "TypeSafe: ONLINE (jev-latest)",
     display: true,
   }).catch(() => {});
   ```
   Thông báo 1 (`TypeSafe: ONLINE (jev-latest)`) được đăng tải thành công.

2. **Bước 2 — Từ chối IPC Nội bộ Chưa được Xử lý (Step 2 — Unhandled Internal IPC Rejection):**
   Ngay sau khi đăng trạng thái trực tuyến, đoạn mã cố gắng tiêm các chỉ dẫn điều hướng nội bộ (internal steering instructions) vào hàng đợi lượt hội thoại (conversation turn queue):
   ```typescript
   await pi.sendMessage(
     { customType: "typesafe-planner", content: PROMPT_INJECTION, display: false },
     { deliverAs: "nextTurn" }
   );
   ```
   Khác với các lệnh gọi `pi.sendMessage` trước đó, lệnh gọi này **không được bảo vệ bởi `.catch(() => {})`**.
   Tại đúng thời điểm sự kiện `session_start` kích hoạt, hàng đợi lượt trò chuyện của máy chủ (host chat turn queue) có thể chưa được khởi tạo hoàn tất để nhận thông điệp với tùy chọn `{ deliverAs: "nextTurn" }`. Điều này khiến `pi.sendMessage` bị từ chối kèm một ngoại lệ Promise chưa được xử lý (unhandled Promise exception).

3. **Bước 3 — Phân loại Sai do Khối Catch Bao trùm Quá rộng (Step 3 — Broad Catch Block Misclassification):**
   Vì sự từ chối chưa được xử lý này xảy ra bên trong khối `try { ... }` bao trùm của thăm dò tiền trạm, luồng điều khiển nhảy thẳng tới khối `catch` bên ngoài (dòng 667):
   ```typescript
   } catch {
     const extCtx = ctx as unknown as { ui?: { notify?: (msg: string, type: string) => void } };
     extCtx.ui?.notify?.("TypeSafe warning: TypeSafe API unreachable. Check internet connection or proxy settings.", "warning");
     await pi.sendMessage({
       customType: "typesafe-health",
       content: "TypeSafe warning: TypeSafe API unreachable. Check internet connection or proxy settings.",
       display: true,
     }).catch(() => {});
   }
   ```
   Khối `catch` bên ngoài đã giả định sai lầm rằng mọi ngoại lệ bắt được đều là lỗi mạng (quá thời gian chờ `fetch` hoặc lỗi proxy), và do đó đăng tải thông báo thứ hai đầy mâu thuẫn.

### B. Tại sao Không có Thông báo Nào Khác Xuất hiện Thêm (Why No Further Notifications Appear)
1. **Điểm móc Tiền trạm Đơn phát (Single-Shot Pre-Flight Hook):** Thăm dò chỉ được gắn duy nhất vào `pi.on("session_start")`. Nó thực thi đúng một lần cho mỗi lần khởi tạo phiên làm việc.
2. **Không có Tiến trình Ngầm Thăm dò Định kỳ (Zero Polling Daemon):** Phần mở rộng chủ đích tránh dùng `setInterval` hoặc các tiến trình chạy ngầm (background daemons) để ngăn ngừa hao phí CPU, băng thông mạng và token.
3. **Đánh chặn Hướng Sự kiện (Event-Driven Interception):** Trong toàn bộ phần còn lại của phiên làm việc, TypeSafe vận hành theo yêu cầu (on-demand):
   - Điều tiết và đánh giá các quyết định của con người thông qua đánh chặn `ask` (`ask` interception).
   - Cổng Xác thực Kép (Dual Verification Gating) thông qua đánh chặn `todo done`.
   - Các lệnh gọi công cụ tường minh (`typesafe_judge`, `typesafe_rerank`, `typesafe_evaluate_multi`).

---

## 3. Phân tích Tiền khả thi Đa Góc nhìn (`ck:predict` — Multi-Persona Pre-Analysis)

## Báo cáo Dự đoán: Tách biệt Từ chối Thông điệp IPC Nội bộ khỏi Thăm dò Mạng Tiền trạm Đầu phiên (Prediction Report: Decouple Internal IPC Message Rejection from Session Pre-Flight Network Probe)

## Phán quyết: TIẾN HÀNH (Verdict: GO)

### Điểm Đồng thuận — Tất cả các Vai trò Đều Thống nhất (Agreements — all personas align)
- Việc đánh đồng lỗi từ chối kênh thông điệp IPC của máy chủ (host IPC message bus rejections) với lỗi mạng bên ngoài tạo ra cảnh báo dương tính giả (false positive alerts) làm suy giảm niềm tin của người dùng.
- Thăm dò tiền trạm phải cô lập lỗi mạng của `fetch()` tách biệt khỏi các thao tác `pi.sendMessage` diễn ra sau đó.

### Xung đột & Giải pháp (Conflicts & Resolutions)

| Chủ đề (Topic) | Kiến trúc sư (Architect) | Bảo mật (Security) | Hiệu năng (Performance) | Trải nghiệm Người dùng (UX) | Phản biện (Devil's Advocate) | Giải pháp (Resolution) |
|-------|-----------|----------|-------------|-----|-----------------|------------|
| **Bắt lỗi Thất bại của `PROMPT_INJECTION` (Catching `PROMPT_INJECTION` Failure)** | Tách biệt rõ ràng mối quan tâm (separation of concerns) giữa tầng truyền tải mạng và IPC. | An toàn: không làm suy yếu xác thực token hay các cổng xác thực nhiệm vụ. | Không ảnh hưởng tới độ trễ hay bộ nhớ. | Loại bỏ cảnh báo giả; giao diện hiển thị đúng trạng thái trực tuyến thực tế. | Nếu việc tiêm chỉ dẫn thất bại âm thầm, liệu tác tử có mất hướng dẫn không? | **Đã giải quyết (Resolved)**: Việc chặn cổng được cưỡng chế về mặt cấu trúc trong các điểm móc TypeScript; tiêm chỉ dẫn chỉ mang tính khuyến nghị bổ trợ (purely advisory). Bắt lỗi chuyển phát là hoàn toàn an toàn. |

### Tóm tắt Rủi ro (Risk Summary)

| Rủi ro (Risk) | Mức độ Nghiêm trọng (Severity) | Biện pháp Giảm thiểu (Mitigation) |
|------|----------|------------|
| Cảnh báo ngoại tuyến giả gây bối rối cho người dùng (False offline alert confuses user) | Trung bình (Medium) | Bọc `pi.sendMessage(PROMPT_INJECTION)` bằng `.catch(() => {})`. |
| Tự ý can thiệp vào hạ tầng bảo mật cốt lõi (Self-tampering with core security infrastructure) | Nghiêm trọng (Critical) | Bảo toàn Lá chắn Toàn vẹn Tập tin (File Integrity Shield) và các biện pháp chống giả mạo Vector 5 (Vector 5 anti-tamper safeguards); thực hiện bản vá dưới dạng chỉnh sửa của người vận hành. |

### Khuyến nghị (Recommendations)
1. Trong `typesafe-planner.ts` dòng 654–657, gắn thêm `.catch(() => {})` vào `pi.sendMessage(PROMPT_INJECTION)`.
2. Giữ nguyên Lá chắn Toàn vẹn Tập tin (File Integrity Shield) để ngăn chặn tác tử tự hành tự ý sửa đổi các điểm móc bảo mật (security hooks).

---

## 4. Bản Vá cho Người Vận hành (Manual Patch for Operator)

Áp dụng thay đổi sau vào `typesafe-planner.ts`:

```typescript
// Replace lines 654-657:
await pi.sendMessage(
  { customType: "typesafe-planner", content: PROMPT_INJECTION, display: false },
  { deliverAs: "nextTurn" }
).catch(() => {});
```
