# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mục tiêu workspace

Workspace này là nơi xây dựng các chỉnh sửa, nâng cấp và tối ưu cho [oh-my-pi (omp)](https://github.com/can1357/oh-my-pi). Thay đổi được áp dụng và kiểm chứng ở đây trước, rồi mới cài ra omp toàn cục (global) qua bộ `tools/`, theo cách giống cài extension/plugin.

Sản phẩm hiện tại là `omp-typesafe-extension`: cổng kiểm chứng (verification gate) dựa trên TypeSafe System One (Jev). Có ba thành phần cài được, và **độc lập với nhau**:

| Thành phần | Cài bằng | Đích |
|---|---|---|
| Extension (`typesafe-planner.ts` + `src/`) | `tools/sync-baseline.cjs` | `~/Projects/omp_extension` (gốc `target`) |
| Agent định nghĩa sẵn (`agents/advisor.md`, `ck-advisor.md`) | `tools/sync-baseline.cjs` | `~/.omp/agent/agents/` (gốc `global_omp_agents`) |
| Vai trò native judge (`modelRoles.judge`) | `tools/native-judge-setup.cjs` | `config.yml` của profile omp |

Ngoài phạm vi các script: binary omp, credential, provider, các khóa khác trong `config.yml`, và skills `ck:*`.

## Lệnh thường dùng

Không có bước build, typecheck hay linter (repo không có `tsconfig`/ESLint/Biome). Bun chạy TypeScript trực tiếp, nên `bun test` là kiểm tra tự động duy nhất.

```bash
bun install
bun test                                  # toàn bộ suite
bun test tests/atomic-judge.test.ts       # một file
bun test tests/atomic-judge.test.ts -t "<regex tên test>"   # một test

bun run verify:workspace            # ngoại tuyến: cấu hình lớp workspace, những gì global còn thiếu, trạng thái dirty
bun run verify:workspace --runtime  # khởi động omp thật, xác nhận bản được nạp (có thể gọi 1 HTTP health)
bun run sync:dry-run     # chỉ đọc: liệt kê hành động sync dự kiến
bun run verify:global    # ngoại tuyến: loader, manifest SHA-256, resolver, redactor; báo lỗi khi workspace còn thay đổi chưa sync
bun run verify:live      # có gọi HTTP thật, có thể tính phí
bun run oneclick         # kiểm tra → sync nếu cần → hậu kiểm (Windows)
bun run sync:global      # giao dịch sync trực tiếp, chạy toàn bộ test tại đích (khoảng 6–8 phút)

bun tools/native-judge-setup.cjs --check --config ~/.omp/agent/config.yml   # exit 1 = chưa khớp, không phải lỗi
bun tools/native-judge-setup.cjs --apply --config ~/.omp/agent/config.yml
bun run judge:start      # mở omp kèm policy judge-first (opt-in, không phải cưỡng chế)
bun run ck:pm            # đối soát plans/: có GHI vào plan (backfill checkbox); --ledger chỉ tạo lại ledger
```

Lưu ý môi trường:
- `node` trên PATH máy này là v14.19.3, thấp hơn mức Node ≥ 18 mà docs yêu cầu. Ưu tiên `bun` để chạy tools.
- Theo `docs/install-global-and-other-machine.md`, suite có thể gọi API thật khi môi trường chứa `TYPESAFE_API_KEY`. Không coi `bun test` là miễn phí trong trường hợp đó.
- `docs/code-standards.md` mục 6 yêu cầu test ngoại tuyến và tất định, dùng `createVerificationHome()` để không chạm profile thật. Đường live hiện được gác bằng `OMP_LIVE_TYPESAFE_TESTS=1` (`tests/atomic-jev-eval-control.test.ts`).
- Không xóa assertion hay thêm `.skip`/`xit` để test qua: `analyzeDiffForTestEvasion` (`src/ast-analyzer.ts`) sẽ gắn cờ các mẫu này.

## Luồng workspace → global

```
D:/100.Software/Github/omp_extension      ← chỉ sửa ở đây
        │  1. omp tại gốc repo = omp global + extension workspace (.omp/config.yml)
        │     → test và trải nghiệm thay đổi, restart omp để nạp code mới
        │  2. bun test → verify:workspace → tools/sync-baseline.cjs (khóa, backup, journal, test cô lập, rollback)
        ▼
~/Projects/omp_extension (target)         ← không sửa tay
        ▲  export { default } from ".../typesafe-planner.ts"
~/.omp/agent/extensions/typesafe-planner.ts   ← loader 1 dòng, không script nào được ghi
```

**Lớp workspace (workspace layer):** `.omp/config.yml` tắt loader global theo tên (`extension-module:typesafe-planner`) và nạp `tools/omp-workspace-loader.ts`. Settings, plugin, skills, auth và model vẫn đến từ global. Lý do và các phương án đã thử nằm trong `docs/decisions/ADR-20261106-workspace-layer-fail-closed-loader.md`.

| Cách chạy | Extension được nạp |
|---|---|
| `omp` tại gốc repo | Bản workspace |
| `omp` trong thư mục con của repo, hoặc ở repo khác | Bản `target` (omp chỉ đọc `.omp` của đúng cwd) |
| `omp --config tools/omp-target-gate-overlay.yml` tại gốc repo | Bản `target`; dùng khi gate workspace đang hỏng, hoặc để kiểm chứng sau khi deploy |

Các ràng buộc dễ vấp:

- **Golden Invariant:** không sửa trực tiếp loader, `target` hay `~/.omp/agent/agents/`. Không trỏ loader vào thư mục phát triển. Sửa loader sẽ phá module resolution của `./src/*`.
- **Không nạp thẳng `./typesafe-planner.ts` trong `extensions:`.** Đường nạp đó gắn `?mtime`, khác với đường nạp qua loader 1 dòng của bản deploy; loader workspace giữ hai đường này giống nhau. Thêm `extensions:` mà thiếu `disabledExtensions` thì cả hai bản cùng chạy.
- **Nếu extension workspace lỗi import hoặc không đăng ký gate,** loader chặn mọi tool trừ nhóm chỉ đọc. Muốn sửa bằng omp thì dùng overlay ở bảng trên.
- **Giới hạn đã biết:** nếu chính file loader bị mất hoặc không import được, phiên tại gốc repo chạy **không có gate** và không báo lỗi. `bun run verify:workspace` phát hiện được trường hợp này, nhưng không ngăn được; bash và `eval` cũng có thể sửa các file này.
- **Sau khi sửa code hoặc sync phải khởi động lại phiên omp**, vì module extension được cache trong tiến trình. Restart omp tại gốc repo chỉ kiểm tra bản workspace; muốn kiểm chứng `target` đã nạp thì dùng overlay hoặc một cwd khác.
- **Sync dùng allowlist và lấy từ working tree, không phải từ commit.** Được deploy: `typesafe-planner.ts`, `package.json`, `.gitignore`, mọi file `.md` ở gốc, và các cây `agents`, `.omp/agents`, `docs`, `src`, `tests`, `plans`, `scripts`, `tools`. `.omp/config.yml` không được deploy; test mới vì thế phải qua được cả khi thiếu file này. Thư mục gốc mới phải thêm vào `RECURSIVE_ROOTS`. Đích global mới phải sửa `ALLOWED_GLOBAL_COPIES` trong `sync-baseline.cjs` và `ALLOWED_AGENT_DESTINATIONS` trong `verify-omp-global.cjs`.
- **`agents/` và `.omp/agents/` phải giống hệt nhau:** lớp workspace dùng `.omp/agents/`, còn sync đẩy `agents/` ra global. Có test giữ điều này.
- **Trạng thái sync:** chỉ `DEPLOYED_VERIFIED` là thành công. `RECOVERED` nghĩa là đã thất bại và đã phục hồi. `RECOVERY_INCOMPLETE` thì giữ nguyên lock, backup, journal và xử lý theo `docs/deployment-guide.md`. Không dùng `--bootstrap` để né conflict, không đặt `OMP_SKIP_VERIFY_TESTS=1` khi deploy thật.
- **Không dùng `scripts/` để deploy.** Đó là các script di trú cũ; đường ghi ra `target` duy nhất là `sync-baseline.cjs`.
- **Mỗi lớp bằng chứng chỉ chứng minh phần của nó.** `verify:*` xanh không chứng minh mã đã nạp hay định tuyến native judge. Xem bảng trong `docs/verification-and-healthcheck-guide.md`.
- **Máy sạch:** không script nào tạo loader; người vận hành phải tự cài, nếu không preflight sẽ dừng. Extension còn cần `~/.omp/agent/typesafe.json` và `TYPESAFE_API_KEY`. Đường dẫn đổi được qua `OMP_WORKSPACE_DIR`, `OMP_HOME_DIR`, `OMP_TARGET_DIR`, `OMP_EXTENSION_POINTER`.
- **`omp plugin` (install/link) là cơ chế gốc của host mà repo chưa dùng:** `package.json` không có manifest plugin. Chuyển sang đó sẽ đổi mô hình loader + sync, nên cần ADR trong `docs/decisions/`.
- **Thành phần global mới:** đi qua allowlist của sync, hoặc script `--check`/`--apply` có backup như `native-judge-setup.cjs`. Không ghi tay vào `~/.omp`.

**Ranh giới với Claude:** omp được nạp skills/CLAUDE.md/MCP từ `~/.claude`, nhưng không được ghi ngược vào đó và không dùng auth của Claude. Đừng thêm `~/.claude` vào `tools.restrictedFolders`, vì nó chặn cả việc nạp skill. `sync-baseline.cjs` từ chối mọi đường dẫn có `.claude`.

## Kiến trúc

`typesafe-planner.ts` là điểm nhập rất lớn: đăng ký các tool `typesafe_*`, bọc tool gốc (write/edit/ask/todo/bash) và móc vào sự kiện vòng đời của host. Logic miền nằm trong `src/`.

**Luồng hoàn tất nhiệm vụ theo giai đoạn (Staged Task Verification):** đây là trục chính của hệ thống.

```
typesafe_bind_task → typesafe_collect_evidence → typesafe_review_task → typesafe_prepare_advisor → todo(op="done")
```

Mọi việc tốn kém (test, HTTP, subagent) chạy ở các bước chuẩn bị. Preflight của `todo done` chỉ xác nhận trạng thái `APPROVED_PENDING_COMMIT` khớp với mục tiêu và lịch sử nhánh, không gọi mạng.

| Tầng | Module | Vai trò |
|---|---|---|
| Hook & chặn tool | `typesafe-planner.ts`, `src/advisor-host.ts`, `src/anti-blocking-*.ts` | Lỗi trong `tool_call` trả về `block: true` |
| Hợp đồng & lịch sử | `src/host-history.ts`, `src/contract-runtime.ts`, `src/task-contract*.ts` | Lịch sử nhánh omp là nguồn sự thật, trạng thái gắn với `incarnationId` |
| Bằng chứng | `src/evidence-*.ts`, `src/task-evidence-runtime.ts`, `src/judge-evidence-packet.ts` | Thu thập theo nhiệm vụ, thác ngân sách byte xuống 32 KiB trước khi gửi đi |
| Đồng thuận lưỡng viện (Bicameral Consensus) | `src/task-verification-*.ts`, `src/verification-gate.ts`, `src/advisor-*.ts` | Biểu điểm `M` của Jev cộng biên nhận từ Advisor chỉ đọc độc lập |
| Thẩm phán nguyên tử | `src/atomic-*.ts`, `src/evaluation-host.ts` | Chia kiểm chứng thành các vị từ vi hạt |
| Lõi dùng chung | `src/typesafe-*.cjs` | Client HTTP, policy, redaction, môi trường tiến trình con, đọc file an toàn |
| EGC | `src/egc*.ts` | Cổng commit dựa trên bằng chứng |

Quy ước chi phối khi sửa code:

- **Hai tầng module:** TS chạy trong tiến trình omp. `src/typesafe-*.cjs` không phụ thuộc gói npm nào và chỉ dùng built-in của Node. Đổi chữ ký trong `typesafe-child-env.cjs` hoặc `typesafe-evidence-file.cjs` thì sửa `.d.cts` tương ứng trong cùng commit.
- **Fail-closed và tighten-only:** lỗi hoặc thiếu bằng chứng phải dẫn đến chặn. Phán quyết AI chỉ được thắt chặt chính sách, không nới lỏng. Docs nhắc `validateRoutingTightenOnly`, nhưng hàm này không còn tồn tại trong `src/`.
- **Cấu hình bật/tắt của resolver chỉ đến từ `~/.omp/agent/typesafe.json`.** `typesafe-enabled-resolver.cjs` không đọc cấu hình trong repo, và `excludeProjects` đưa dự án về omp thuần. Tuy nhiên ở tầng host, `.omp/config.yml` của bất kỳ repo nào vẫn có thể tắt extension global bằng `disabledExtensions`, nên đừng coi resolver là chốt chặn repo không tin cậy.
- **Tham số tool được đóng băng sâu (`freezeContractValue`)** và dữ liệu đi ra phải qua `typesafe-redact.cjs`, vốn giữ nguyên các bộ đếm token.
- **Mã trạng thái và mã từ chối là chuẩn chung:** xem `docs/code-standards.md` mục 5 trước khi thêm mã mới.

## Tài liệu và kế hoạch

- **Ngôn ngữ:** `README.md`, `AGENTS.md`, `docs/**` phải viết 100% bằng tiếng Việt, thuật ngữ gốc tiếng Anh đặt trong ngoặc đơn, ký hiệu code để trong backtick. Xem `AGENTS.md` mục 3.
- **Tra cứu:** bản đồ tài liệu nằm trong `README.md`. Các con số trong docs (số file, số test, dòng code) có thể đã cũ, nên kiểm tra lại với code.
- **Quyết định kiến trúc:** ghi ADR trong `docs/decisions/` và cập nhật chỉ mục `docs/decisions/README.md`.
- **Kế hoạch:** đọc `plans/plan-ledger.json` và `plans/README.md` trước khi lập plan để không làm lại việc đã xong.
