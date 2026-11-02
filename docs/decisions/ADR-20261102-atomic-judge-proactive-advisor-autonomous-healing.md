# Quyết định Kiến trúc: Hệ thống Thẩm phán Nguyên tử Jev, Cố vấn Chữa lành Tự động & Chốt chặn Middleware Chống Treo Todo (ADR-20261102: Atomic TypeSafe Jev Judge, Proactive Advisor Healing Loop, and Autonomous Anti-Blocking Middleware)

- **Trạng thái (Status)**: Đã chấp thuận (Accepted)
- **Ngày quyết định (Date)**: 2026-11-02
- **Khuôn khổ Thẩm định (Evaluation Framework)**: Hội đồng Độc lập TypeSafe & Tư duy Đột phá Kiến trúc (`ck:brainstorm` + `ck:problem-solving` + `ck:council`)
- **Tác động Kiến trúc (Architectural Scope)**: `typesafe-planner.ts`, `src/todo-lifecycle-authority.ts`, `src/advisor-host.ts`, `src/advisor-host-hooks.ts`, `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `agents/advisor.md`, `plans/261027-native-omp-judge-typesafe-migration/`

---

## 1. Bối cảnh & Vấn đề Thực tiễn (Context & Problem Statement)

Trong các phiên làm việc của AI Agent trên nền tảng OMP tích hợp TypeSafe Planner Extension, người dùng ghi nhận bốn triệu chứng tiêu cực gây gián đoạn quy trình phát triển phần mềm:

1. **Agent tra khảo người dùng quá nhiều (`ask` tool spam)**:
   - Mỗi khi gặp khó khăn về thuật toán, lỗi cú pháp, thất bại kiểm thử (`bun test` fail) hoặc thiếu bằng chứng, Agent ngay lập tức gọi công cụ `ask` để hỏi người dùng. Điều này phá vỡ tính tự chủ (autonomy), biến người dùng thành "máy gỡ lỗi" bất đắc dĩ.
2. **Vai trò của Judge (`typesafe.ai jev`) bị mờ nhạt và thụ động**:
   - Hiện tại, Jev Judge chỉ thực hiện một ping kiểm tra kết nối (`health probe`) duy nhất lúc khởi động phiên (`session_start`), sau đó nằm im chờ đợi ở cổng kiểm tra cuối cùng (`todo done`).
   - Các quyết định trung gian, các thay đổi mã nguồn nhỏ (micro-diffs) và các bước giải pháp không được kiểm tra ở cấp độ nguyên tử (atomic level), dẫn đến việc sai tích lũy (error compounding) thành lỗi lớn ở cuối phiên.
3. **Vai trò của Cố vấn (`advisor` / `ck:advisor`) vắng bóng khi bế tắc**:
   - Mặc dù tài liệu đặc tả `agents/advisor.md` đã có sẵn kịch bản chữa lành (`## Judge rejection remediation`), Agent chính không tự động kích hoạt Advisor khi gặp lỗi hoặc khi Judge từ chối.
   - Thiếu một đường ống khép kín (closed-loop pipeline) để Advisor tự động chẩn đoán nguyên nhân gốc rễ, đưa ra giải pháp kỹ thuật và tái lập kế hoạch (re-plan) cho Agent thực thi.
4. **Mọi `todo` đều bị đẩy vào trạng thái `blocked`**:
   - Khi `todo done` bị chốt chặn từ chối do chưa đạt kiểm thử hoặc thiếu bằng chứng, Agent hoảng loạn gọi `todo(op="block")`. Thao tác này kích hoạt `HUMAN_REQUIRED` trong `todo-lifecycle-authority.ts`, đóng băng toàn bộ tiến trình công việc và tạo nợ kỹ thuật lịch sử.

---

## 2. Giải pháp Kiến trúc Hợp nhất (Unified Architectural Solution)

Kết hợp toàn diện **Phương án 3 (Native OMP Judge Migration)** và **Phương án 2 (Chốt chặn Middleware Tự động Chữa lành)** theo chỉ đạo của người dùng:

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           VÒNG LẶP TỰ TRỊ TAM GIÁC                                │
│                   (Autonomous Triad Closed-Loop Engine)                           │
│                                                                                   │
│    ┌──────────────┐     Thực thi nhỏ      ┌─────────────────────────────┐        │
│    │              │ ────────────────────> │  Mã nguồn & Kiểm thử Đơn vị │        │
│    │   AI Agent   │                       │  (Code Edits & bun test)    │        │
│    │ (Orchestrator│ <──────────────────── └──────────────┬──────────────┘        │
│    │   / Worker)  │     Tái lập kế hoạch                 │ Phân tích AST & diff   │
│    └──────▲───────┘    (Re-plan & Actions)               ▼                       │
│           │                               ┌─────────────────────────────┐        │
│           │                               │   Thẩm phán Nguyên tử Jev   │        │
│           │                               │  (Atomic TypeSafe Jev Judge)│        │
│           │                               │   Choice / Bool / Score     │        │
│           │                               └──────────────┬──────────────┘        │
│           │                                              │                       │
│           │                                  Không đạt   │ Đạt (Pass)            │
│           │                             (REJECT / Score) │                       │
│    ┌──────┴───────────────┐                              ▼                       │
│    │ Cố vấn Kỹ thuật Độc  │ <────────────────────────────┘ ┌────────────────────┐│
│    │ lập (Read-Only       │    Triệu hồi tự động           │ Cổng Đích Lưỡng    ││
│    │ Independent Advisor) │  (Automatic Remediation)       │ viện & todo done   ││
│    │ - Root Cause Analysis│                                └────────────────────┘│
│    │ - Ranked Solutions   │                                                      │
│    │ - Concrete Re-plan   │                                                      │
│    └──────────────────────┘                                                      │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Các Trụ cột Thực thi Cốt lõi (Core Implementation Pillars)

### 3.1. Chốt chặn Middleware Chống Tra khảo & Chống Treo Todo (Anti-Spam & Anti-Blocking Middleware)
1. **Hook kiểm duyệt `ask` (`typesafe-planner.ts`)**:
   - Bắt mọi lời gọi `ask` tại `tool_call`.
   - Nếu câu hỏi chứa nội dung hỏi về cách sửa lỗi kỹ thuật, lỗi kiểm thử, quyết định triển khai mã nguồn hoặc phương án kiến trúc: **Chặn cuộc gọi `ask`** với thông điệp:
     `"BLOCKED: Kỹ sư/Agent không được hỏi người dùng về lỗi kỹ thuật hoặc lựa chọn code. BẮT BUỘC phải ủy thác cho TypeSafe Judge và Advisor tự phân tích và quyết định."`
   - Chỉ cho phép `ask` với các câu hỏi về ranh giới nghiệp vụ con người (human business domain requirements).
2. **Hook cấm `todo block` tự tiện (`src/todo-lifecycle-authority.ts`)**:
   - Từ chối mọi thao tác `todo(op="block")` và `todo(op="drop")` xuất phát từ nguyên nhân lỗi code, lỗi test, hoặc chưa vượt qua Judge.
   - Thao tác `block` chỉ được chấp nhận nếu có bằng chứng khách quan về thiếu hụt dịch vụ bên ngoài (external API outage) hoặc yêu cầu quyền con người được xác thực.

### 3.2. Thẩm phán Jev Nguyên tử (Atomic TypeSafe Jev Judge)
1. **Chuyển dịch sang Native Judge OMP**:
   - Sử dụng mô hình `typesafe/jev-1.14.0` đã đăng ký trong `modelRoles.judge` của OMP qua helper bản địa `judge()` và `judgeBatch()`.
2. **Đánh giá Nguyên tử từng bước (Atomic Incremental Verification)**:
   - Không đợi đến cuối phiên: Mỗi khi Agent hoàn tất một chỉnh sửa logic hoặc một hàm chức năng, diff và AST được gửi qua Judge để đánh giá 3 tiêu chí nguyên tử:
     - `bool`: Mã nguồn có bảo toàn hành vi và không vi phạm ranh giới bảo mật không?
     - `choice`: Thay đổi này có gây trôi dạt kiến trúc (`no_drift`, `minor_drift`, `severe_drift`) không?
     - `score`: Điểm số chất lượng và độ bao phủ của bài kiểm thử (thang điểm 0 - 3).
   - "Đúng ngay từ những phần nhỏ" giúp triệt tiêu hoàn toàn hiện tượng dồn lỗi tích tụ.

### 3.3. Tự động Kích hoạt Cố vấn Chữa lành (Proactive Advisor Remediation Engine)
1. **Cầu nối Tự động (Automatic Handshake Trigger)**:
   - Khi Judge trả về `REJECT`, điểm số dưới ngưỡng (`score < threshold`) hoặc `bun test` có mã thoát khác `0`: Extension tự động khởi tạo bản mô tả Cố vấn (`typesafe_prepare_advisor` descriptor) với `purpose: "consultation"`, `decision: "stuck"`, kèm toàn bộ diff, log lỗi kiểm thử và tiêu chí bị vi phạm.
2. **Hợp đồng Đầu ra Sắt đá của Advisor (`agents/advisor.md`)**:
   - Advisor là thực thể chỉ đọc (`read-only`), không sửa mã, tập trung 100% năng lực suy luận sâu để trả về:
     - `## Verdict`: Đánh giá mức độ nghiêm trọng.
     - `## Recommendation`: Giải pháp kỹ thuật chuẩn xác và danh sách hành động sửa lỗi tuần tự (dependency-ordered action items).
     - `## Ranked options`: So sánh 2-3 phương án kỹ thuật khả thi kèm ưu/nhược điểm.
     - `## Findings`: Chỉ rõ nguyên nhân gốc rễ tại chính xác dòng mã (`file:line`).
3. **Thực thi Triệt để (Autonomous Agent Re-Execution)**:
   - Agent nhận trực tiếp đề xuất từ Advisor, áp dụng vào kế hoạch, sửa mã nguồn, chạy lại `bun test` đến khi đạt exit code `0` và Judge phê duyệt hoàn toàn.

---

## 4. Kế hoạch Hành động & Các Giai đoạn Thực thi (Action Plan & Phased Roadmap)

Dự án sẽ được triển khai theo 4 giai đoạn chuẩn TDD:

| Giai đoạn (Phase) | Mục tiêu Trọng tâm | Tệp tác động | Kiểm chứng Chấp thuận (Acceptance) |
|---|---|---|---|
| **Phase 1: Middleware Guards** | Thêm chốt chặn cấm `ask` kỹ thuật & cấm `todo block` tự tiện; tự động nhúng Advisor descriptor khi lỗi. | `typesafe-planner.ts`, `src/todo-lifecycle-authority.ts` | Unit tests: Agent gọi `ask` kỹ thuật bị chặn; `todo block` vì test fail bị từ chối; payload trả về kèm chỉ dẫn gọi Advisor. |
| **Phase 2: Atomic Jev Judge** | Hiện thực hóa đánh giá nguyên tử diff/test qua Jev Judge (`judgeBatch` / `judge`), phản hồi cấu trúc tức thì. | `src/cook-expert-judge.ts`, `src/verification-gate.ts`, `src/semantic-judge-client.ts` | Unit tests: Mọi diff code trung gian đều được chấm điểm; phát hiện ngay vi phạm ở cấp vi mô. |
| **Phase 3: Proactive Advisor Dispatch** | Hoàn thiện cầu nối tự động triệu hồi Advisor khi Judge từ chối; Advisor lập re-plan và đẩy lại cho Agent. | `src/advisor-host-dispatch.ts`, `src/task-verification-advisor.ts`, `agents/advisor.md` | Integration test: Khi test fail -> Advisor được gọi tự động -> trả về 6 mục hợp đồng chuẩn -> Agent nhận re-plan. |
| **Phase 4: Verification & Deployment** | Chạy full test suite (`bun test`), đóng gói, đồng bộ bằng `oneclick-omp.bat` và xác minh toàn cầu 6 tầng. | Toàn bộ repo | Full suite: 100% pass; `tools/verify-omp-global.cjs` đạt parity tuyệt đối; sẵn sàng nạp phiên OMP mới. |

---

## 5. Kết luận & Cam kết (Conclusion & Guarantees)

Kiến trúc này chuyển đổi toàn diện vai trò của TypeSafe từ **"người gác cổng thụ động ở vạch đích"** thành **"bộ đôi Thẩm phán Nguyên tử & Cố vấn Đồng hành"**, bảo đảm:
- Người dùng không bao giờ bị làm phiền bởi những câu hỏi kỹ thuật vụn vặt.
- Các sai sót được dập tắt ngay từ cấp độ nhỏ nhất (atomic).
- Mọi khó khăn kỹ thuật đều được Advisor phân tích và giải quyết tự động cho đến khi đạt `bun test` hoàn hảo.
