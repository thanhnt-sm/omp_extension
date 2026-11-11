# RCA — `google-antigravity/gemini-3.8-flash` lỗi "Request was aborted"

- Ngày: 2026-11-04 · Người phân tích: debugger (read-only) · omp 18.16.0 (Windows, Bun-compiled `omp.exe`)
- Phạm vi: session `01a1a0ed-ec6c-77c0-af46-70b113e7c3a6` + toàn bộ `~/.omp/agent/sessions/**`; log `~/.omp/logs/omp.2026-11-04.*.log`
- Bí mật: không in token/refresh token; email đã che.

## 1. Tóm tắt điều hành

| Mục | Nội dung |
|---|---|
| Triệu chứng | Turn kết thúc `stopReason:"error"`, `errorMessage:"Request was aborted"`, `contentBlocks:0`, `ttft=0`, `duration≈60 010 ms`. Auto-retry 10/10 trên **cùng credential** rồi "Retry budget exhausted". |
| Tác động | 18.16.0 + thinking `high`: 335 abort / 269 ok (~55% turn lỗi) từ 2026-11-03 07:00 UTC. Trước đó (18.13–18.15): 0,1–0,4%. |
| Nguyên nhân gốc | **Watchdog "first event" 60 s của omp** (catalog compat `streamFirstEventTimeoutMs: 60000` cho `google-antigravity/gemini-3.8-flash`) được áp cả vào pha chờ **HTTP response headers**. Server Antigravity giữ headers cho tới gần hết generation (TTFT≈duration), và từ 2026-11-03 latency đuôi tăng vọt (p90 13 s → 43–52 s; nhiều request >60 s). Timer bắn → `fetchWithRetry` (`ws()`) **nuốt lý do timeout** và ném `Error("Request was aborted")`. |
| Vì sao không rotate | Lỗi bị phân loại Abort/timeout, không phải `AccountPolicy`/`UsageLimit` → không gọi `authStorage.limits.rotate`; session còn `credential_pin` → retry y nguyên account đó. |
| Không liên quan | Plugin `pi-antigravity` (provider id `"antigravity"`, khác `"google-antigravity"`), `omp-multi-auth` (chỉ rewrite system prompt), usage fetch (vẫn trả về đủ 6 account), schema/contract API (không có 400; response vẫn parse OK khi tới kịp). |
| Fix ưu tiên | **Chỉ cần config**: `providers.streamFirstEventTimeoutSeconds: 300` trong `~/.omp/agent/config.yml` (hoặc `/settings` → Providers → Timeouts). Đã kiểm chứng bằng repro. |
| Mức ưu tiên | P1 (model mặc định của mọi role bị ảnh hưởng). |

## 2. Dòng thời gian (UTC; local = UTC+7)

| Thời điểm | Sự kiện | Nguồn |
|---|---|---|
| 10-29 → 11-02 | 18.13.3–18.15.0, `high`: TTFT p50 4–8 s, p90 8–14 s, max 57,9 s; abort hiếm, **luôn đúng 60 s** → trần 60 s đã có từ trước | thống kê sessions |
| 11-03 04:35 | `omp.exe` cập nhật 18.15.0 → 18.16.0 (mtime 11:35 local; bản cũ `omp.exe.1793680516555.5612.0.bak` = 18.15.0) | `ls ~/AppData/Local/omp` |
| 11-03 04–06h | 18.16.0 `high`: p50 9–14 s, 0 abort | thống kê theo giờ |
| 11-03 07h → | p50 21 s (07h) → 43 s (08h) → 60 s (12h); abort 18→86/giờ | thống kê theo giờ |
| 11-03 10:25 | session 01a1a0ed: 4 abort liên tiếp, cred 12, mỗi lần 60 009–60 014 ms | session JSONL dòng 27–31 |
| 11-04 11:31–11:53 | 18:31–18:53 local: 19 abort liên tiếp, cred 20, `agent.continue scheduled` → lỗi sau đúng ~60,06 s; 2 lần cạn retry budget | `omp.2026-11-04.38704.log` dòng 42–171; session dòng 161–184 |
| 11-04 ~12:59 | Repro A: `PI_STREAM_FIRST_EVENT_TIMEOUT_MS=5000` → 11/11 attempt "Request was aborted" sau **5,03 s** | `omp.2026-11-04.20208.log` |
| 11-04 ~13:02 | Repro B: `PI_STREAM_FIRST_EVENT_TIMEOUT_MS=300000` → thành công ("hi") | scratchpad `repro2.out` |
| 11-04 ~13:05 | A/B trực tiếp (timer 300 s): low ttft 33,5 s · medium 3,8 s · high 7,3 s / 7,1 s → latency server thất thường | scratchpad `ab_*.jsonl` |

## 3. Chuỗi bằng chứng

### 3.1 Request đi qua provider built-in, không phải plugin
- Log ghi `provider:"google-antigravity"`, session ghi `"api":"google-gemini-cli"`.
- `pi-antigravity` đăng ký `PROVIDER_ID = "antigravity"` — `~/.omp/plugins/node_modules/pi-antigravity/src/models/models.ts:6`. Timeout của nó là 180 s/120 s (`src/stream/stream.ts:1147-1149`) và sinh lỗi có tên ("no response headers within …") → **không phải** nguồn lỗi.
- omp built-in: `packages/ai/src/providers/google-gemini-cli.ts` (trích từ `omp.exe`), nhánh `u = e.provider === "google-antigravity"`.

### 3.2 Nguồn giá trị 60 s
- `~/.omp/agent/models.db` → `model_cache[provider_id='google-antigravity']`, model `gemini-3.8-flash`: `"compat": {..., "streamFirstEventTimeoutMs": 60000}`; `materialization_policy app-18.16.0:builder-1:rules-1-…` (rule catalog built-in, key `stream-first-event-timeout-ms` trong `packages/catalog/src/compat/rules.json`).
- Provider (`google-gemini-cli.ts`, bundle 18.16.0):
  ```js
  const ie = n?.streamFirstEventTimeoutMs ?? Wm(undefined, e.compat.streamFirstEventTimeoutMs ?? Fe /*300000*/);
  ...
  const k = pg(Se, ie);           // armPreResponseTimeout: AbortSignal.any([caller, timer(ie)])
  C = await ws(`${T}/v1internal:streamGenerateContent?alt=sse`, { ..., signal: k.signal, timeout: false });
  ```
  `Wm()` (`packages/ai/src/utils/idle-iterator.ts`) = `ya(env.PI_STREAM_FIRST_EVENT_TIMEOUT_MS, r)` → không có env/setting thì `ie = 60000`.
- Không có override nào của user: `config.yml`, `models.yml`, env (`PI_*`, `OMP_*`, `ANTIGRAVITY*`) đều trống.

### 3.3 Vì sao message là "Request was aborted" (che mất lỗi thật)
- `packages/utils/src/fetch-retry.ts` (`ws`, export `fetchWithRetry`):
  ```js
  try { c = await E(T, g); }
  catch (a) {
    if (m?.aborted) throw new Error("Request was aborted");   // m = signal = pg() combined signal
  ```
  Timer `pg` abort với `DOMException("The operation timed out.","TimeoutError")` nhưng `ws` ném Error chung → mất nguyên nhân.
- Nếu lỗi xảy ra ở pha body, message sẽ là `"Cloud Code Assist stream timed out while waiting for the first event"` (iterator `dc`). Message thực tế là "Request was aborted" ⇒ **timeout ở pha chờ headers**.
- `stopReason:"error"` (không phải `"aborted"`) ⇒ caller signal không bị hủy; abort là timer cục bộ.
- Repro A chứng minh nhân quả: đổi timer → chu kỳ lỗi đổi theo (5,03 s).

### 3.4 Server giữ headers lâu (yếu tố kích hoạt)
- Turn thành công: `ttft ≈ duration` (vd. 57 929/58 411 ms; 53 011/53 803 ms) → server gần như không flush byte nào cho tới cuối.
- Phân bố TTFT `high`: 18.15.0 p50 7,7 s / p90 13,8 s; 18.16.0 p50 27,2 s / p90 51,7 s. Không phụ thuộc kích thước prompt (<20k…≥120k đều p50 24–30 s) hay credential (cred 12 p50 19,9 s; cred 20 p50 39,2 s).
- Chỉ số TTFT thành công bị "kiểm duyệt" ở 60 s (max 59,8 s) → đuôi thật >60 s chưa đo được.

### 3.5 Vì sao không rotate account / không fallback
- Retry saga (bundle `coding-agent`, gần chuỗi "Retry budget exhausted after"):
  ```js
  const m = Oe(c, L.AccountPolicy);
  ...
  if (m && k) { T = (await authStorage.limits.rotate(k.provider, sessionId, {...})).switched; }
  ```
  Rotate chỉ với `AccountPolicy`; nhánh usage-limit (`#T.get(e)` → `switchedCredential`) chỉ cho UsageLimit. Abort/timeout không thuộc cả hai.
- `isHardErrorFallbackEligible`: `if (Oe(n, L.Abort) || Oe(n, L.UserInterrupt)) return false;` → không đi fallback chain.
- `packages/coding-agent/src/session/credential-pin.ts` + entry `credential_pin` (session dòng 17) → account bị ghim theo session.
- Thực tế: 10 retry liên tiếp đều `credentialId: 20`.
- `omp-multi-auth` 1.3.0 không có logic rotate theo lỗi; với `google-antigravity` chỉ hook `before_provider_request` rewrite fingerprint (`extensions/multi-auth.ts:24-28`, `lib/providers.ts:190-230`).
- Phụ: `retry.fallbackChains["google-antigravity/*"]` trỏ `gemini-4-argon-high` không tồn tại (log 18:28:41 warn) và mục thứ 2 là chính `gemini-3.8-flash` → fallback chain vô dụng dù có được kích hoạt.

## 4. Giả thuyết đã loại trừ

| Giả thuyết | Kết luận | Bằng chứng |
|---|---|---|
| Plugin `pi-antigravity` lỗi / contract đổi | Loại | Provider id khác (`antigravity`); không nằm trong đường request |
| Usage fetch antigravity hỏng | Loại | "Usage fetch resolved" có đủ 6 report `google-antigravity`, `limits:4` (log dòng 17, 39, 69…) |
| Sai endpoint / host | Loại | Cùng endpoint `daily-cloudcode-pa`, thành công xen kẽ cùng session; module headers/discovery 18.15↔18.16 giống hệt về ngữ nghĩa |
| Request schema bị reject im lặng / SSE format đổi | Loại | Không có dump 400 nào từ 2026-10-26; response thành công parse đầy đủ (toolUse, output tokens) |
| Hết quota / 429 | Loại | Không có 429; lỗi là timer cục bộ; usage còn hạn mức |
| Caller (agent) chủ động abort | Loại | `stopReason:"error"`, không phải `"aborted"`; abort do user có `errorId` khác (67112960, "Operation aborted") |
| Code provider thay đổi ở 18.16.0 | Loại (cho phần provider) | Diff đã chuẩn hóa identifier: `google-gemini-cli.ts`, `google-shared.ts`, `discovery/antigravity.ts`, `wire/gemini-headers.ts` chỉ khác tên minified |
| Bun fetch implicit timeout (issue upstream #16991) | Loại | Đường Antigravity gọi `ws(..., { timeout: false })`; #16991 chỉ áp cho `google-generative-ai` native |

## 5. Đề xuất fix (xếp hạng)

### #1 (khuyến nghị) — Config, không động vào code
Thêm vào **khối `providers:` đã có** trong `~/.omp/agent/config.yml` (không tạo khóa `providers:` thứ hai):
```diff
 providers:
   openai-codex:
     codeMode: "on"
+  streamFirstEventTimeoutSeconds: 300
```
Hoặc tương đương qua `/settings` → tab Providers → Timeouts → "Stream First Event Timeout" = 5 minutes.
- Đường đi: `packages/coding-agent/src/session/settings-stream-fn.ts` → `const A = M(qBe.get(e))` (giây ×1000) → `streamFirstEventTimeoutMs: n?.streamFirstEventTimeoutMs ?? A` → provider `ie = n?.streamFirstEventTimeoutMs ?? …` ⇒ **đè** compat 60000.
- 300 s = mặc định gốc của provider (`Fe = 300000`), vẫn phát hiện được kết nối treo. Có thể dùng 180 nếu muốn phát hiện treo nhanh hơn (max TTFT quan sát 59,8 s nhưng đã bị cắt ở 60 s).
- Lưu ý: setting áp cho **mọi provider** (first-event watchdog toàn cục). Chấp nhận được vì mặc định của hầu hết provider vốn là 300 s.
- Kiểm chứng: Repro B (timer 300 s) thành công; Repro A chứng minh biến này điều khiển đúng timer gây lỗi.

### #1b — Biến môi trường (thay thế, đã kiểm chứng trực tiếp)
`PI_STREAM_FIRST_EVENT_TIMEOUT_MS=300000` (Windows User env). Chỉ hiệu lực khi setting ở trên = `-1` (Auto). Ưu tiên #1 vì nằm trong config omp, dễ thấy/dễ gỡ.

### #2 — Giảm thiểu phụ (tùy chọn)
- Dọn `retry.fallbackChains`: bỏ `google-antigravity/gemini-4-argon-high` (không tồn tại) để fallback có ý nghĩa nếu sau này được kích hoạt.
- Không khuyến nghị đổi thinking level: A/B cho thấy latency thất thường theo thời điểm (low 33,5 s vs high 7 s), không gắn cứng với level.

### #3 — Báo upstream omp (`can1357/oh-my-pi`), không patch được cục bộ (code nằm trong binary)
1. `packages/utils/src/fetch-retry.ts` — giữ lý do abort thay vì message chung:
   ```diff
   -    if (m?.aborted)
   -      throw new Error("Request was aborted");
   +    if (m?.aborted)
   +      throw m.reason instanceof Error ? m.reason : new AbortError();
   ```
   (áp cho cả 2 chỗ: đầu vòng lặp và trong `catch`). Kèm: `armPreResponseTimeout` (`pg`) nên abort với lỗi có tên kiểu "no response headers within Nms" thay vì `TimeoutError` chung.
2. Catalog rule `stream-first-event-timeout-ms = 60000` cho Antigravity Gemini Flash quá chặt so với hành vi server (headers giữ tới cuối generation). Đề xuất bỏ rule hoặc ≥180 s, hoặc tách timer header-phase khỏi first-event budget.
3. Timeout ở pha headers nên đủ điều kiện failover endpoint (sandbox) và/hoặc rotate credential thay vì retry 10 lần cùng account bị ghim.

### Không khuyến nghị
- Nâng cấp plugin: `pi-antigravity` 0.11.0, `omp-multi-auth` 1.3.0, `@oh-my-pi/pi-coding-agent` 18.16.0 đều là bản `latest` trên npm (kiểm tra 2026-11-04) — không có bản sửa.
- Patch `node_modules`: lỗi không nằm trong plugin nào.
- Chuyển sang provider `antigravity/*` của `pi-antigravity`: cần login riêng, mất 6 account đang có của omp-multi-auth; chỉ cân nhắc nếu #1 không đủ.

## 6. Ngăn tái diễn / giám sát
- Theo dõi tỷ lệ `errorMessage == "Request was aborted" && stopReason == "error" && duration ≈ streamFirstEventTimeoutMs` theo model trong session JSONL — dấu hiệu timeout bị che, không phải user hủy.
- Theo dõi phân bố `ttft` của `google-antigravity/*`; cảnh báo khi p90 > 50% timeout đang cấu hình.
- Lỗ hổng thiết kế: (a) message lỗi che nguyên nhân; (b) timeout không kích hoạt rotation/failover; (c) trần catalog không có cảnh báo khi bị chạm.

## 7. Câu hỏi chưa giải quyết
1. Latency đuôi tăng từ 2026-11-03 là thay đổi phía server Antigravity hay do request của 18.16.0 khác 18.15.0 ở lớp agent (tool set, system prompt…)? Code provider/discovery/header giống hệt và suy giảm diễn ra dần theo giờ → nghiêng về phía server, nhưng chưa chạy 18.15.0 (`.bak`) để A/B vì có thể migrate `models.db`/`agent.db`.
2. Đuôi thật của TTFT (>60 s) chưa đo được do bị cắt; sau khi áp #1 nên thu thập lại `ttft` để chọn giá trị timeout cuối cùng.
3. Version Antigravity hub trong User-Agent lấy động từ manifest auto-updater (`gemini-headers.ts`, `Nae()`) — chưa xác minh version đó có đổi quanh 11-03 hay không.
4. Lỗi timeout ở endpoint `daily` có fail-over sang `sandbox` không (duration chủ yếu đúng 60 s ⇒ có vẻ không); các turn 70–110 s có thể là lần thử endpoint thứ hai — chưa xác nhận.
