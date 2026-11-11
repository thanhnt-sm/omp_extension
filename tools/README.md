# Baseline Deployment Tools

This directory contains utility scripts to back up and deploy the verified TypeSafe baseline from this workspace to the active OMP projects directory.

## Files

- **`sync-baseline.cjs`**: Managed deployment transaction. It is the only tool that writes the target/global allowlisted files.
- **`promote-omp-global.ps1`**: Guided Windows operator helper. It checks the immutable loader, opens Notepad if the operator must repair that external proxy, runs preflight, then runs the managed transaction.
- **`sync-baseline.bat`**: Double-click launcher for the guided helper.

## Run

Double-click:

```cmd
tools\sync-baseline.bat
```

Or run with an STA PowerShell process:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\tools\promote-omp-global.ps1
```

The helper never writes the global OMP loader proxy. If that proxy is invalid, it opens the file and tries to copy the exact required one-line statement to the clipboard; the operator must paste, save, and close Notepad. If another process locks the clipboard, the statement remains printed in the helper for manual entry. It then runs a read-only preflight before any deployment write.

To validate without deploying:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\tools\promote-omp-global.ps1 -DryRun
```

### One-time ownership bootstrap

Use bootstrap only when an operator explicitly adopts an existing unmanifested target/global baseline into this workspace. It snapshots every managed preimage, writes the manifest, verifies the target, and rejects any later bootstrap attempt once a manifest exists:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\tools\promote-omp-global.ps1 -Bootstrap
```

After `DEPLOYED_VERIFIED`, restart OMP. A restarted isolated native scratch-session smoke remains the P6 runtime-proof requirement.

## Lớp Không gian làm việc (Workspace Layer)

Các tệp dưới đây cho phép `omp` khởi động tại gốc kho chạy cấu hình toàn cục cộng với mã đang phát triển, trước khi thăng cấp. Chúng **không** ghi vào `~/.omp` và **không** thay thế `sync-baseline.cjs`. Quyết định: `docs/decisions/ADR-20261106-workspace-layer-fail-closed-loader.md`.

- **`omp-workspace-loader.ts`**: bộ nạp thất bại-đóng (Fail-Closed Loader) được `.omp/config.yml` tham chiếu. Nhập động `typesafe-planner.ts` bằng URL tính toán (không thẻ `?mtime`) rồi gọi `.default(pi)`. Khi lỗi, chặn mọi công cụ ngoài danh sách chỉ-đọc cục bộ (`read`, `grep`, `glob`, `find`, `ast_grep`; mọi `path`/`paths` chứa `://` bị từ chối) và đưa lỗi ra `ui.notify`, thông điệp `typesafe-workspace-loader-error` và `stderr`.
- **`omp-target-gate-overlay.yml`**: lối thoát ổn định (Escape Hatch). Chạy `omp --config tools/omp-target-gate-overlay.yml` tại gốc kho để dùng cổng **đã triển khai**; dùng khi cổng không gian làm việc hỏng, và để lấy bằng chứng nạp mã sau thăng cấp.
- **`verify-omp-workspace.cjs`** (cùng `verify-omp-workspace-lib.cjs`, `verify-omp-workspace-runtime.cjs`): `bun run verify:workspace [--runtime] [--json]`. Mặc định ngoại tuyến và chỉ đọc. `--runtime` khởi động `omp` RPC hai lần và có thể gọi HTTP kiểm tra sức khỏe một lần mỗi lần khởi động. Mã thoát: `0` đạt, `1` kiểm tra hỏng, `2` sai cách dùng hoặc chạy ở đích triển khai.

`.omp/config.yml` chỉ tồn tại ở không gian làm việc và không được đồng bộ sang đích; các tệp trong `tools/` ở trên thì có.

Ảnh hưởng tới công cụ khác:

- `native-judge-launch.cjs` kế thừa thư mục hiện tại (`cwd: process.cwd()`): chạy từ gốc kho dùng mã không gian làm việc, chạy từ nơi khác dùng mã đã triển khai.
- `todo-remediation-smoke.ts` khởi động `omp` với `--cwd` là thư mục tạm cùng `--no-extensions -e <typesafe-planner.ts>` nên không nạp `.omp/config.yml` và không bị ảnh hưởng.
