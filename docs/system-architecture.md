# TypeSafe System One (Jev) Integration Architecture

Tài liệu kỹ thuật tổng hợp toàn diện về kiến trúc điều khiển, cơ chế Dual-Gate verification, quy trình kiểm soát can thiệp (interception), và nguyên nhân xử lý sự cố kết nối TypeSafe System One (`jev-latest`) trong `omp_extension`.

---

## 1. Tổng quan Kiến trúc (Architecture Overview)

`omp_extension` hoạt động như một lớp Middleware kiểm soát thực thi (Execution Guard & Verification Middleware) nằm giữa OMP Host Process và Agent. Extension tích hợp sâu vào lifecycle của Agent thông qua hệ thống event hooks (`session_start`, `before_tool_call`, `tool_call`).

```
                    ┌───────────────────────────┐
                    │      OMP Agent Core       │
                    └─────────────┬─────────────┘
                                  │ Tool Invocations
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   omp_extension Interception Layer                     │
├───────────────────────┬────────────────────────┬───────────────────────┤
│  1. Resource Shield   │  2. Decision Evaluator │  3. Dual-Gate Engine  │
│     (write / edit)    │        (ask)           │        (todo)         │
│  - Chặn sửa todo.json │  - System One probe    │  - Gate 1: Local 0-tok│
│  - Chặn hạ tầng TypeSafe│- Gắn risk/clarity badge│ - Gate 2: Jev Macro  │
└───────────────────────┴────────────────────────┴───────────────────────┘
                                  │
                                  ▼ Egress Redaction & 32KB Cap
                    ┌───────────────────────────┐
                    │   TypeSafe System One     │
                    │ https://api.typesafe.ai   │
                    │     model: jev-latest     │
                    └───────────────────────────┘
```

---

## 2. Session Pre-Flight Health Probe (`session_start`)

Mỗi khi phiên làm việc mới khởi động, extension thực thi quy trình chẩn đoán tiền trạm (`pre-flight probe` tại dòng 592–643 của `typesafe-planner.ts`):

1. **Kiểm tra môi trường & Quyền dự án**:
   - Xác thực biến môi trường `TYPESAFE_API_KEY` có giá trị không rỗng.
   - Nạp module `~/.claude/hooks/lib/typesafe-enabled-resolver.cjs`.
   - Kiểm tra thư mục dự án hiện tại với cấu hình `.ck.json` (`resolveTypeSafeEnabled(cwd)` phải trả về `enabled: true`).
2. **Ping Probe siêu nhẹ**:
   - Gửi payload JSON `< 200 bytes` trực tiếp đến `https://api.typesafe.ai/v1/systemone` với deadline timeout `3000ms`:
     ```json
     {
       "state": "ping",
       "questions": { "ping": { "type": "noul", "instructions": "ping" } },
       "model": "jev-latest"
     }
     ```
3. **Phát tín hiệu trạng thái**:
   - **HTTP 200 OK**: Kích hoạt thông báo UI `TypeSafe: ONLINE (jev-latest)` và nạp chỉ thị ngầm `PROMPT_INJECTION` vào lượt tiếp theo (`deliverAs: "nextTurn"`).
   - **HTTP 401 / 403**: Báo cảnh báo `TYPESAFE_API_KEY is invalid or expired`.
   - **HTTP 404**: Cảnh báo `models.yml baseUrl does not have an extraneous '/v1' suffix`.
   - **Timeout / Offline**: Cảnh báo `TypeSafe API unreachable`.

---

## 3. Ma trận Can thiệp & Phòng thủ (Interception Matrix)

| Event / Tool | Mục tiêu can thiệp | Hành vi điều khiển | Cơ chế xử lý vi phạm |
|---|---|---|---|
| `write`, `edit` | `todo.json`, `.todo*` | Chặn Agent sửa trực tiếp file trạng thái để tránh gian lận hoàn thành task | Hủy lệnh (`evt.cancel`), gửi thông báo `typesafe-compliance-escalation`, ném ngoại lệ |
| `write`, `edit` | File hạ tầng TypeSafe (`typesafe-planner.ts`, `models.yml`, v.v.) | Ngăn Agent tự ý làm suy yếu hoặc vô hiệu hóa bộ kiểm tra an toàn | Yêu cầu `TYPESAFE_ALLOW_MODIFICATION=1` hoặc `isHuman: true`. Nếu không có, lập tức hủy |
| `ask` | Câu hỏi hoặc quyết định gửi người dùng | Gửi nội dung câu hỏi đến TypeSafe System One để chấm điểm rủi ro (`risk_posture`) và độ rõ ràng (`clarity`) | Tự động chèn badge trực quan `[TypeSafe System One: Risk Score X.XX]` vào UI trước khi con người đọc |
| `todo drop/init`| Danh sách task đã cam kết | Ngăn Agent tự ý hủy task khó hoặc xóa vết | Bắt buộc phải có xác nhận của con người (`isHumanAuthorized`) |
| `todo done` | Đánh dấu hoàn thành task | Kích hoạt hệ thống Dual-Gate Verification | Kiểm tra 2 vòng nghiêm ngặt trước khi cho phép task hoàn thành |

---

## 4. Quy trình Dual-Gate Verification (`todo done`)

### Gate 1: Local Deterministic Micro-Check (Zero-Token, <150ms)
- Thu thập bằng chứng thực tế tại local (`TaskEvidenceCollector`):
  - Chạy `testCommand` thực tế (mặc định: `bun test`).
  - Kiểm tra `git status` và `git diff`.
- Kiểm tra tính toàn vẹn (Anti-Cheating):
  - Kiểm tra xem agent có **xóa assertion (`expect`/`assert`)** hoặc comment-out test suite hay không.
  - Kiểm tra xem working tree có sạch và test có pass với exit code `0` hay không.
- Nếu trượt Gate 1: **Từ chối ngay lập tức tại máy local**, không tốn bất kỳ token mạng nào.

### Gate 2: Semantic Macro-Check (TypeSafe System One - Jev)
- Chuẩn bị dữ liệu an toàn (`preparePayloadSafe`):
  - Lọc toàn bộ Anthropic key (`sk-ant-*`), token và private credentials.
  - Cắt tỉa payload đảm bảo $\le 32\text{ KB}$ để chống context rot.
- Gửi đánh giá ngữ nghĩa tới `https://api.typesafe.ai/v1/systemone` (`model: "jev-latest"`):
  - `architectural_drift`: Kiểm tra có xuất hiện `unapproved_deviation` hoặc `scope_creep` không.
  - `scope_arbiter`: Kiểm tra giữ nguyên phạm vi (`HOLD`) hay tự ý thu hẹp/mở rộng.
  - `meets_criteria`: Điểm đáp ứng tiêu chí cam kết (ngưỡng tối thiểu: $\ge 0.70$).
  - `risk_security_triage`: Đánh giá rủi ro an ninh phát sinh.
- Thực thi **Tighten-Only Lattice Policy**:
  - Kết quả từ TypeSafe chỉ được phép thắt chặt rào cản (nâng mức review, từ chối completion). Tuyệt đối không được phép tự nới lỏng hay bypass test.
- Xử lý khi Gate 2 từ chối:
  - Trả về XML hướng dẫn sửa sai có cấu trúc (`<remediation_protocol>`).
  - Nếu thất bại 3 lần liên tiếp trên cùng một task (**Stall Ratchet**): Lập tức ngắt chu kỳ tự động và chuyển giao cho con người (`escalateToUser`).

---


## 5. Sơ đồ Luồng Xử lý (Flowchart)

```mermaid
flowchart TD
    A[Agent gọi tool_call] --> B{Loại tool?}
    
    %% Case 1: Write/Edit
    B -->|write / edit| C{Mục tiêu file?}
    C -->|todo.json| C1[BỊ CHẶN: Cấm sửa trực tiếp todo.json]
    C -->|File TypeSafe Core| C2{Có Human Auth?}
    C2 -->|Không| C3[BỊ CHẶN: Cần human authorization]
    C2 -->|Có| C4[Cho phép thực thi]
    C -->|File dự án thường| C4

    %% Case 2: Ask
    B -->|ask| D[Gửi đề xuất tới TypeSafe Jev]
    D --> D1[Chấm điểm risk_posture & clarity]
    D1 --> D2[Gắn nhãn cảnh báo/rủi ro trực tiếp lên UI người dùng]

    %% Case 3: Todo
    B -->|todo| E{Hành động op?}
    E -->|drop / init| E1{Có Human Auth?}
    E1 -->|Không| E2[BỊ CHẶN: Không được tự ý hủy task cam kết]
    E1 -->|Có| F
    E -->|done / append / start| F[Kiểm tra Stall Ratchet: Số lần fail >= 3?]
    F -->|Đúng| F1[BỊ CHẶN: Escalation ngắt loop, báo human can thiệp]
    F -->|Sai| G[GATE 1: Evidence Collector & Local Micro-Check]
    
    %% Gate 1
    G --> G1{Gate 1 Pass?<br/>Tests Pass?<br/>Không xóa assertion?}
    G1 -->|Không| G2[BỊ CHẶN: Trả về lỗi vi phạm cục bộ 0-token]
    G1 -->|Đạt| H[GATE 2: Payload Safety & Redactor]

    %% Gate 2
    H --> H1[Scrub Secret Tokens + Giới hạn 32KB]
    H1 --> I[POST https://api.typesafe.ai/v1/systemone<br/>Model: jev-latest]
    I --> J{TypeSafe Jev Đánh Giá}
    J -->|drift != no_drift OR meets_criteria < 0.70| K[BỊ CHẶN: Gate 2 Macro-Check rejected]
    J -->|Lattice Policy Violated| K
    J -->|Approved: Đạt yêu cầu & không drift| L[CHẤP THUẬN: Task chính thức hoàn thành]
```

## 6. Sơ đồ Luồng Tuần Tự (Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Coding Agent
    participant Ext as OMP Extension (typesafe-planner)
    participant Local as Local Host (Git & Bun Test)
    participant Redact as Egress Sanitizer (<32KB)
    participant Jev as TypeSafe API (jev-latest)
    actor Human as Người Dùng

    Note over Ext,Jev: Giai đoạn 1: Session Pre-flight Probe
    Ext->>Jev: POST /v1/systemone (ping probe)
    Jev-->>Ext: HTTP 200 OK (model: jev-1.13.0)
    Ext->>Human: Toast: "TypeSafe: ONLINE (jev-latest)"

    Note over Agent,Human: Giai đoạn 2: Task Completion Verification
    Agent->>Ext: Gọi todo({ op: "done", task: "T-01" })
    
    rect rgb(240, 248, 255)
    Note over Ext,Local: GATE 1: Deterministic Local Micro-Check
    Ext->>Local: Chạy testCommand & git diff
    Local-->>Ext: Exit code 0, không xóa test
    Ext->>Ext: Gate 1 PASSED (<150ms, 0 tokens)
    end

    rect rgb(255, 245, 238)
    Note over Ext,Jev: GATE 2: TypeSafe Semantic Macro-Check
    Ext->>Redact: preparePayloadSafe(diff, requirements)
    Redact-->>Ext: Scrubbed payload (<= 32KB)
    Ext->>Jev: POST /v1/systemone (jev-latest, questions)
    Jev-->>Ext: Answers: meets_criteria, drift_guard, scope_mode
    Ext->>Ext: checkPolicy (Lattice Gate)
    
    alt Phát hiện Drift hoặc Score < 0.70
        Ext-->>Agent: HỦY: Gate 2 Rejection + Remediation Directives
    else Thất bại >= 3 lần liên tiếp
        Ext->>Human: Báo động Escalation (Stall Ratchet Hard Stop)
        Ext-->>Agent: HỦY: Dừng vòng lặp tự động
    else Đạt tất cả tiêu chuẩn
        Ext-->>Agent: Chấp thuận hoàn thành task
    end
    end
```

---

## 7. Phân tích Nguyên nhân TypeSafe Judge Không Hoạt Động

Nếu kiểm tra thấy TypeSafe Judge không hoạt động hoặc không gửi request tới `api.typesafe.ai`, kiểm tra 4 nguyên nhân gốc rễ sau:

| STT | Nguyên nhân | Cơ chế phát sinh | Biểu hiện & Dấu hiệu nhận biết | Giải pháp khắc phục |
|---|---|---|---|---|
| **1** | **Client-side Validation Chặn Cục Bộ** | `typesafe-api-client.cjs` kiểm tra schema trước khi gửi request mạng. `choice` bắt buộc `criteria` là Dictionary/Map; `score` bắt buộc là Array $\ge 2$ phần tử. | Lỗi `invalid_input: questions.<key>.criteria...`. **Không có HTTP request nào rời khỏi máy**. | Sửa payload truyền vào đúng chuẩn dictionary cho `choice` và array cho `score`. |
| **2** | **Lỗi Lặp `/v1` trong URL (Host Route)** | `~/.omp/agent/models.yml` cấu hình `baseUrl: https://api.typesafe.ai/v1`. OMP transport tự ghép `/v1/systemone` thành `/v1/v1/systemone`. | API trả về **HTTP 404 Not Found** (`{"detail":"Not Found"}`). | Đặt `baseUrl: https://api.typesafe.ai` (bỏ hậu tố `/v1`). |
| **3** | **Stale Cache & Cần Restart OMP** | Node.js cache module và OMP cache provider/model trong SQLite `~/.omp/agent/models.db`. | Sửa file `.yml` hoặc biến môi trường nhưng OMP vẫn dùng thông số cũ. | Khởi động lại (restart) hoàn toàn tiến trình `omp`. |
| **4** | **Test Suite Mặc Định Dùng Mock** | 100% test files trong `tests/*.test.ts` dùng `mockJudge` hoặc mock `fetch`. | Chạy `npm test` không bao giờ thấy request ra mạng hay tăng usage trên dashboard. | Hành vi chuẩn của unit test để đảm bảo tính cô lập và tốc độ chạy. |

---

## 8. Hướng dẫn Vận hành & Phục hồi Sự cố (Runbook)

### Gỡ khóa Stall Ratchet
Khi một task bị fail liên tiếp 3 lần và kích hoạt Stall Ratchet khóa phiên:
```json
{
  "op": "done",
  "task": "Tên_task_bị_khóa",
  "resetFailures": true
}
```

### Bật quyền can thiệp Hạ tầng Bảo vệ
Để chỉnh sửa các file thuộc lá chắn bảo vệ (`typesafe-planner.ts`, `models.yml`):
```bash
# PowerShell
$env:TYPESAFE_ALLOW_MODIFICATION="1"

# Bash / Linux
export TYPESAFE_ALLOW_MODIFICATION=1
```
*Lưu ý: Luôn khởi động lại phiên OMP sau khi gán biến môi trường.*
