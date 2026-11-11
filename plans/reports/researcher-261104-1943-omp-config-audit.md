# Audit cấu hình omp 18.16.0 (Windows) - 2026-11-04

Phạm vi: chỉ đọc. Không có giá trị bí mật nào được sao chép (token/key đã che).
Nguồn chính: docs chính thức can1357/oh-my-pi (`docs/secrets.md`, `approval-mode.md`, `auth-broker-gateway.md`, `config-usage.md`, `hooks.md`, `non-compaction-retry-policy.md`, `environment-variables.md`, `settings.md`, `marketplace.md`, `.github/SECURITY.md`), cộng với `omp config list` thực tế trên máy. Độ tin cậy: docs repo chính thức = cao; không có case study production độc lập nào được tìm thấy (hạn chế).

## 1. Hiện trạng

- `~/.omp/agent/config.yml` (108 dòng): 14 role model, hầu hết trỏ `google-antigravity/gemini-3.8-flash:high`; judge = `typesafe/jev-1.14.0`; advisor = `anthropic/claude-sonnet-5-5`. Bật: secrets, advisor, prewalk, autolearn, memory mnemopi, task isolation, `dev.autoqa` + consent granted.
- `retry.fallbackChains.default` = `codex-3rd/gpt-5.6-luna` (nhà cung cấp bên thứ ba qua `models.yml`).
- `models.yml`: 4 provider. `typesafe` và `zai-paas` dùng `!printenv` (tốt). `codex-3rd` (baseUrl `api.aixingialaire.shop`, reseller không rõ) và `anthropic` có `apiKey` **literal** trong file.
- `agent/.env`: chứa `TYPESAFE_API_KEY`. ACL chỉ user `thant` (tốt, hơn các file khác).
- Plugins (`~/.omp/plugins/package.json`): `omp-multi-auth ^1.3.0`, `pi-antigravity ^0.11.0` (alias npm), `pi-commandcode-provider ^0.6.0`. Lockfile ghim đúng 1.3.0 / 0.11.0 / 0.6.0; `bun.lock` 70KB có. Không phát hiện script postinstall/preinstall trong 3 package.
- Extension toàn cục `agent/extensions/typesafe-planner.ts` = 1 dòng re-export tới `C:/Users/thant/Projects/omp_extension/typesafe-planner.ts` (đúng thiết kế AGENTS.md). Còn file `.ts.disabled` 6KB cũ.
- `agent/agents/`: `advisor.md`, `ck-advisor.md` (bản sao tự quản, không tham chiếu `.claude`).
- `managed-skills/`: 10 skill do omp quản lý (không phụ thuộc Claude).
- Dung lượng: `~/.omp/cache` 818MB, `agent/sessions` 378MB, `agent/blobs` 125MB, `natives` 125MB, `stats.db` 213MB + WAL 72MB, `agent/memories` 100MB, `logs` 8.7MB.
- Workspace: `.omp/agents/` (rỗng cấu hình), `AGENTS.md`, `.gitignore` đã loại `.env`. `zuey-pi-setup` là repo snapshot của **pi** (không phải omp) của tác giả khác (mrgoonie): khôi phục `~/.pi/agent/settings.json` + 24 extension. Không liên quan trực tiếp tới cấu hình omp này; không cần đụng.

## 2. Phát hiện theo mức độ

### Security

| # | Mức | Phát hiện | Bằng chứng |
|---|-----|-----------|-----------|
| S1 | Cao | `models.yml` chứa 2 `apiKey` literal (codex-3rd, anthropic). Nếu `~/.omp` được backup/đồng bộ hoặc agent đọc file, key lộ. Hai provider còn lại đã dùng `!printenv`, cho thấy cách đúng đã biết. | `models.yml` dòng 16, 21 (giá trị đã che) |
| S2 | Cao | Fallback `default` -> `codex-3rd` (reseller `api.aixingialaire.shop`, `openai-completions`). Mọi prompt/code/context sẽ chuyển sang endpoint bên thứ ba không rõ chủ sở hữu mỗi khi model default lỗi. Đây là đường rò dữ liệu tự động, không cần người duyệt. | `config.yml` `retry.fallbackChains.default`; `models.yml` |
| S3 | Cao | `tools.approvalMode` = `yolo` (mặc định theo docs): read/write/exec tự động duyệt, không prompt. Kết hợp extension auto-load + project `.mcp.json`/hooks/skills được nạp khi mở repo, repo lạ có thể chạy lệnh. | `omp config get tools.approvalMode` = yolo; docs `approval-mode.md` |
| S4 | Trung bình | `dev.autoqa` bật, `autoqaConsent: granted`, endpoint `https://qa.omp.sh/v1/grievances`. Gửi báo cáo "tool issue" tự động ra ngoài. Nội dung gửi chưa xác minh được. | `omp config list`; docs `settings.md` dòng 154 (`PI_AUTO_QA`) |
| S5 | Trung bình | `telemetry.otlpExportEnabled = true` (mặc định, không nằm trong config.yml). Docs không mô tả điểm đến; thường chỉ xuất khi có biến OTEL endpoint. Chưa xác minh. | `omp config list`; docs không có trang telemetry |
| S6 | Trung bình | `logs/http-400-requests/*.json` (146KB) lưu **toàn bộ body request** gồm system prompt + 5 user message, gửi tới `api.commandcode.ai`. Chứa nội dung phiên (có thể có email/đường dẫn). Không tự xoay vòng. | file `1793007174802-...json` |
| S7 | Trung bình | `stats.db` 213MB + WAL 72MB, `agent/sessions` 378MB, `blobs` 125MB: lưu lịch sử prompt/đầu ra dạng rõ. Không có chính sách xóa. | `ls -la ~/.omp` |
| S8 | Thấp-TB | ACL Windows: `auth-broker.token`, `models.yml`, `agent.db` kế thừa quyền đọc cho `CodexSandboxUsers` (`(I)(RX)`) và Administrators. Docs nói token tạo với mode 0600, nhưng trên Windows POSIX mode không có hiệu lực; ACL kế thừa mới quyết định. Có tiến trình Codex sandbox cùng máy đọc được. | `icacls` |
| S9 | Thấp | Plugin caret range (`^1.3.0`, `^0.11.0`, `^0.6.0`): `omp plugin update`/cài lại có thể kéo bản mới của mã bên thứ ba (đều là gói cộng đồng, không phải của can1357). Lockfile đang ghim nên rủi ro hiện tại thấp. | `plugins/package.json`, `omp-plugins.lock.json` |
| S10 | Thấp | `secrets.enabled: true` (đúng, giữ). Docs: mặc định disabled; bật là đúng cho dữ liệu nhạy cảm. Lưu ý docs: system prompt tĩnh/định nghĩa tool tĩnh/ảnh không được che. | `docs/secrets.md` |
| S11 | Thấp | `logs/omp.*.log` ghi 8 ký tự đầu của access/refresh token (băm cắt) cho google-antigravity. Rủi ro thấp, nhưng không nên chia sẻ log. | log 2026-11-01.20184 |

### Correctness

| # | Mức | Phát hiện |
|---|-----|-----------|
| C1 | Trung bình | `retry.fallbackChains` có 2 khóa chồng lấn cho Antigravity: `google-antigravity/*` -> `[gemini-4-argon-high, gemini-3.8-flash]` và khóa riêng `google-antigravity/claude-opus-5-5`. Role `plan` lại dùng `claude-opus-4-6` (không khớp khóa nào ngoài glob `*`). Fallback `openai-codex/*` -> antigravity trong khi mọi role đã là antigravity: nếu antigravity chết thì vòng lặp fallback vô nghĩa. |
| C2 | Trung bình | Toàn bộ 12/14 role chung 1 provider/model (`google-antigravity/gemini-3.8-flash:high`): điểm lỗi duy nhất. Khi `Request was aborted` xảy ra mọi tác vụ phụ (commit, memory, task, web, tiny...) sập cùng lúc. Role nhẹ (`tiny`, `smol`, `commit`, `memory`, `widget`) dùng `:high` lãng phí. |
| C3 | Trung bình | `providers.streamFirstEventTimeoutSeconds = -1` và `streamIdleTimeoutSeconds = -1`: **không có timeout** stream (mặc định -1 theo `omp config list`; docs env nói `0` cũng tắt). Kết nối treo sẽ chờ vô hạn rồi mới bị abort phía upstream. Liên quan trực tiếp lỗi "Request was aborted" (chỉ ghi chú, RCA do agent khác). |
| C4 | Trung bình | `retry.maxRetries = 10`, `maxDelayMs = 300000` (5 phút), `rateLimitWalksChain = false`, `waitForUsageReset = false`. Với 10 lần thử + backoff tới 5 phút, 1 request lỗi có thể chiếm hơn 30 phút trước khi rơi sang fallback. Fallback chỉ được dùng khi lỗi cứng hoặc hết retry; xem docs `non-compaction-retry-policy.md`. |
| C5 | Thấp | Xoay vòng tài khoản: omp có round-robin credential theo provider (nhiều key/OAuth, session affinity, backoff theo credential). Log cho thấy >=6 credential `google-antigravity` (id 12-17) refresh đồng thời. Plugin `omp-multi-auth` và `pi-antigravity` cùng cấp auth cho antigravity có thể chồng chéo với cơ chế gốc; chưa xác định plugin nào thực sự chịu trách nhiệm xoay. |
| C6 | Thấp | `plan.defaultOnStartup: true` nhưng `plan.enabled: false` (mâu thuẫn ý nghĩa; cần xác nhận hành vi thực). `plan.autosaveDir` chứa token `<YYMMDD-plan-name-folder>`: không chắc omp nội suy token này. |
| C7 | Thấp | `advisor.syncBacklog: "1"` kiểu chuỗi trong khi key số/bool. `settings.json.bak` (68B) chỉ chứa `shellPath` đã được chuyển vào `config.yml`. |

### Bloat

| # | Mục | Ghi chú |
|---|-----|---------|
| B1 | `~/.omp/cache` 818MB | Có thể xóa an toàn (cache dựng lại). |
| B2 | `stats.db` 213MB + WAL 72MB | Dữ liệu thống kê/telemetry cục bộ. Không có khóa giới hạn rõ trong `omp config list`. Có thể xóa khi omp tắt (mất lịch sử thống kê). |
| B3 | ~90 file `logs/omp.*.log` | Nhiều file 200-500 byte; vài file 300-500KB. Xoay tay. |
| B4 | `agent/extensions/typesafe-planner.ts.disabled` | Bản cũ 6KB, dư thừa. |
| B5 | `skills.enableClaudeUser/Project: true` | Nạp 99 skill từ `~/.claude/skills` vào danh mục skill của omp: phình mô tả/ngữ cảnh, đồng thời tạo phụ thuộc chéo sang Claude (xem mục 3). |
| B6 | `agent/memories` 100MB (mnemopi) + `memory.backend: mnemopi` + `autolearn` | Lưu ký ức theo dự án; cần biết để xóa khi cần. `memories.enabled=false` nhưng backend mnemopi vẫn bật (hai cơ chế khác nhau). |

## 3. Cô lập khỏi Claude Code

omp **đọc** (không thấy bằng chứng docs về ghi) các nguồn Claude theo `docs/config-usage.md`: nguồn `~/.claude` (hoặc `$CLAUDE_CONFIG_DIR`) và `<cwd>/.claude` có priority 80. Các điểm cần đóng:

| Nguồn | Hiện trạng | Hành động |
|-------|-----------|----------|
| Skills người dùng `~/.claude/skills` (99 mục) | `skills.enableClaudeUser: true` (đặt tường minh trong config.yml) | Đặt `false` |
| Skills dự án `<cwd>/.claude/skills` | `skills.enableClaudeProject: true` (mặc định) | Đặt `false` |
| Commands người dùng | `commands.enableClaudeUser: false` (mặc định, đã ổn) | Giữ |
| Commands dự án `<cwd>/.claude/commands` | `commands.enableClaudeProject: true` | Đặt `false` |
| Hooks `~/.claude/hooks` | Có 3+ file `.cjs`. Docs hooks: chỉ nạp `.ts/.js` từ `hooks/pre|post/`; `.cjs` ngoài cấu trúc này không được nạp. Chưa xác minh thực nghiệm. | Giữ nguyên Claude; kiểm chứng bằng `omp --no-extensions` so sánh |
| Context files `CLAUDE.md` | `D:\100.Software\Github\CLAUDE.md` và `.claude/rules/*` ở thư mục cha được nạp thành context (`context-file:user:CLAUDE.md` trong docs extension-loading) | Dùng `--no-context-files` hoặc chuyển nội dung sang `AGENTS.md`; hoặc chấp nhận (chỉ đọc) |
| MCP | Docs nói lần chạy đầu omp thừa hưởng MCP từ `.claude`, `.cursor`... `mcp.enableProjectConfig: true`. Chưa kiểm tra có MCP nào trong `~/.claude.json`/`.mcp.json` được nạp. | Cần xác nhận (`omp` -> `/mcp`), đặt `mcp.enableProjectConfig: false` nếu không dùng |
| Biến môi trường | `CLAUDE_CONFIG_DIR`, `CLAUDE_BASH_*`, `CLAUDE_CODE_*` là alias omp đọc; không phát hiện biến nào bị omp ghi. | Không đặt `CLAUDE_CONFIG_DIR` trong shell khi chạy omp |
| Import tường minh | `--from-claude` chỉ nhập phiên khi gọi | Không dùng |
| Plan `claudeResets.*` | Chỉ liên quan tín dụng Anthropic, không chạm `~/.claude` | Không đổi |
| Ghi ngược | Docs không nêu omp ghi vào `~/.claude`. Workspace tự có guard "không chạm ~/.claude" (README). | Giám sát: so sánh mtime `~/.claude` trước/sau 1 phiên omp |

Không có cấu hình omp nào tạo symlink/chia sẻ file với `~/.claude`; `agent/agents/ck-advisor.md` là bản sao độc lập. Cách cô lập hoàn toàn mạnh nhất: chạy omp với `--profile <tên>` + `--no-skills --no-context-files` hoặc `omp --config overlay.yml`; nhưng profile cô lập cả auth/session nên cần đăng nhập lại (needs-confirmation).

## 4. Đề xuất cấu hình tối thiểu (diff trước -> sau)

Nhãn: SAFE = không đổi hành vi cốt lõi hoặc đảo ngược dễ; CONFIRM = cần người dùng xác nhận.

### config.yml (`C:/Users/thant/.omp/agent/config.yml`)

1. Cô lập Claude (SAFE)
```diff
 skills:
-  enableClaudeUser: true
+  enableClaudeUser: false
+  enableClaudeProject: false
   customDirectories: []
+commands:
+  enableClaudeProject: false
```
Lý do: tách bạch khỏi Claude, giảm phình skill. Nguồn: `docs/config-usage.md`, `omp config list`.

2. Tắt gửi dữ liệu ra ngoài (CONFIRM, vì tác giả chủ động consent)
```diff
 dev:
-  autoqa: true
-  autoqaConsent: granted
+  autoqa: false
+  autoqaConsent: denied
+telemetry:
+  otlpExportEnabled: false
```
Lý do: loại báo cáo tự động ra `qa.omp.sh` và xuất OTLP. Nguồn: `settings.md` dòng 154; `omp config list`.

3. Loại đường rò fallback bên thứ ba (CONFIRM)
```diff
 retry:
   fallbackChains:
     default:
-      - codex-3rd/gpt-5.6-luna
+      - google-antigravity/gemini-3.8-flash
```
Lý do (S2). Nếu vẫn cần codex-3rd, giữ nhưng xác minh chủ sở hữu endpoint. Nguồn: `non-compaction-retry-policy.md`.

4. Gọn chuỗi fallback và giảm thời gian treo (CONFIRM, liên quan lỗi Request aborted, chỉ ghi chú)
```diff
 retry:
+  maxRetries: 4
+  maxDelayMs: 60000
+  rateLimitWalksChain: true
   fallbackChains:
     google-antigravity/*:
       - google-antigravity/gemini-4-argon-high
       - google-antigravity/gemini-3.8-flash
-    openai-codex/*:
-      - google-antigravity/gemini-3.8-flash
-    google-antigravity/claude-opus-5-5:
-      - google-antigravity/gemini-3.8-flash
+providers:
+  streamFirstEventTimeoutSeconds: 60
+  streamIdleTimeoutSeconds: 120
```
Lý do: giá trị hiện tại: 10 lần thử, trần 5 phút, timeout stream vô hạn (-1). Số mới là đề xuất khởi đầu; **cần thử nghiệm** vì chưa có dữ liệu production. Giữ `providers.openai-codex.codeMode: "on"` như cũ. Nguồn: `omp config list` (retry.*, providers.stream*), `environment-variables.md` dòng 374-377.

5. Phê duyệt tool (CONFIRM, đổi hành vi hàng ngày)
```diff
+tools:
+  approvalMode: write
+  restrictedFolders:
+    - ~/.claude
+    - ~/.ssh
```
Lý do: `write` tự duyệt đọc/ghi, chỉ hỏi khi `exec` (bash/browser/subagent); `restrictedFolders` luôn hỏi kể cả yolo, bảo vệ `~/.claude`. Nguồn: `approval-mode.md`. Lưu ý: workflow dùng nhiều subagent có thể bị hỏi liên tục; nếu quá phiền thì giữ `yolo` nhưng vẫn thêm `restrictedFolders` (SAFE).

6. Đa dạng hóa role nhẹ (CONFIRM) - ví dụ giảm `:high` -> `:low` cho `tiny`, `smol`, `commit`, `memory`, `widget`. Không đề xuất tên model cụ thể vì chưa biết hạn mức; chỉ nêu: tách ít nhất `judge`/`advisor` khỏi antigravity (đã làm), và cân nhắc `tiny`/`commit` sang provider khác.

7. Dọn dẹp nhỏ (SAFE)
```diff
-  syncBacklog: "1"
+  syncBacklog: 1
```
Chỉ nếu `omp config get advisor.syncBacklog` xác nhận kiểu số; không thì giữ.

### models.yml (`C:/Users/thant/.omp/agent/models.yml`) - CONFIRM
```diff
   codex-3rd:
     baseUrl: https://api.aixingialaire.shop/v1
-    apiKey: <literal>
+    apiKey: !printenv CODEX3RD_API_KEY
   anthropic:
-    apiKey: <literal>
+    apiKey: !printenv ANTHROPIC_API_KEY
```
Đồng thời đặt 2 biến vào `agent/.env` (đã có ACL hạn chế) và **xoay (rotate) hai key hiện tại** vì đã từng nằm trong file thường. SAFE về kỹ thuật, nhưng cần người dùng cấp key mới.

### plugins/package.json - CONFIRM
```diff
-    "omp-multi-auth": "npm:omp-multi-auth@^1.3.0",
-    "pi-antigravity": "npm:pi-antigravity@^0.11.0",
-    "pi-commandcode-provider": "^0.6.0"
+    "omp-multi-auth": "npm:omp-multi-auth@1.3.0",
+    "pi-antigravity": "npm:pi-antigravity@0.11.0",
+    "pi-commandcode-provider": "0.6.0"
```
Lý do: ghim phiên bản chính xác; lockfile đã ở đúng các bản này nên không đổi bản đang chạy. Nếu `pi-commandcode-provider` không còn dùng (log lỗi 400 chỉ từ commandcode, 26/10), gỡ bằng `omp plugin uninstall` (CONFIRM).

### typesafe.json - giữ nguyên
`projects: ["*"]` bật cho mọi dự án (kể cả dự án khách hàng). Nếu có dữ liệu nhạy cảm, đổi thành danh sách cụ thể (CONFIRM).

### Dọn dẹp tệp (CONFIRM, chỉ khi omp đã đóng)
- Xóa `logs/http-400-requests/*` (S6) và log cũ > 7 ngày.
- Xóa `cache/` (818MB), `agent/extensions/typesafe-planner.ts.disabled`.
- `stats.db*`: xóa nếu không cần thống kê (mất lịch sử).
- Siết ACL (SAFE về mặt chức năng): `icacls "%USERPROFILE%\.omp" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F" /grant:r "SYSTEM:(OI)(CI)F"` rồi kiểm tra omp vẫn chạy. Lệnh này loại `CodexSandboxUsers`; nếu Codex CLI cần đọc `.omp`, nó sẽ mất quyền (CONFIRM).

## 5. Xếp hạng ưu tiên thực hiện

1. S1 + models.yml: chuyển key literal sang `!printenv` và xoay key (đóng rò rỉ khóa).
2. S2: bỏ/xác minh fallback `codex-3rd` (đóng rò prompt sang bên thứ ba).
3. Cô lập Claude (mục 4.1 + 4.1 commands): rủi ro thấp, đáp ứng yêu cầu "không ảnh hưởng Claude Code".
4. `tools.restrictedFolders` (SAFE) rồi cân nhắc `approvalMode: write`.
5. Tắt autoqa/OTLP (S4, S5).
6. Timeout stream + giảm retry (C3, C4) kết hợp với RCA của agent khác.
7. Dọn log/cache, siết ACL, ghim plugin (S6-S9, B1-B4).

## Hạn chế của nghiên cứu

- Không có trang telemetry/autoqa trong docs: nội dung payload `qa.omp.sh` và đích OTLP chưa xác minh.
- Chưa chạy thử thực nghiệm để chứng minh omp không ghi vào `~/.claude`, hay hook `.cjs` bị bỏ qua, hay MCP từ `.claude` có được nạp không.
- Chưa kiểm tra mã nguồn 3 plugin cộng đồng (chỉ xác nhận không có script cài đặt); không đánh giá chuỗi cung ứng sâu.
- Giá trị timeout/retry đề xuất là điểm khởi đầu, chưa có số liệu production.
- Không có nguồn độc lập ngoài docs/README chính thức và repo; chưa đối chiếu cộng đồng.

## Câu hỏi chưa giải quyết

1. `codex-3rd` (`api.aixingialaire.shop`) là dịch vụ ai quản lý, có chủ ý dùng cho dữ liệu dự án không?
2. `autoqa` gửi chính xác trường nào tới `qa.omp.sh`? Người dùng đã consent nhưng có biết nội dung không?
3. `telemetry.otlpExportEnabled=true` có đích xuất mặc định nào không, hay chỉ khi đặt `OTEL_EXPORTER_OTLP_ENDPOINT`?
4. omp có nạp MCP server từ `~/.claude.json` hoặc `D:\100.Software\Github\.mcp.json` không (kiểm tra `/mcp`)?
5. Plugin nào thực sự điều khiển xoay tài khoản antigravity: `omp-multi-auth`, `pi-antigravity` hay round-robin gốc? Có cần cả hai?
6. Chấp nhận `approvalMode: write` với workflow nhiều subagent hay giữ `yolo` + `restrictedFolders`?
7. `typesafe.json` `projects: ["*"]`: có muốn giới hạn khỏi dự án khách hàng (PVC, msProject...) không?
8. Codex CLI có cần đọc `~/.omp` (để quyết định có loại `CodexSandboxUsers` khỏi ACL không)?
