# Kiểm toán cài lại và chuyển máy (Reinstall Portability Audit)

## Kết luận ngày 2026-10-28

Repo đã có công cụ ghim role native judge, launcher ưu tiên judge (judge-first) và đồng bộ extension giao dịch (transactional sync). **Chưa phải bản sao đầy đủ của OMP trên máy hiện tại**: không chứa binary OMP, credential, cấu hình provider/profile, bộ kỹ năng bên ngoài (external skills) hoặc lịch sử/cache. Không tuyên bố chuyển máy chỉ bằng một lệnh là tái tạo chính xác mọi trạng thái.

## Phạm vi rà soát

Nhánh khảo sát đã đọc runtime sources, tools, legacy scripts, tests, agent definitions và tài liệu vận hành; đây là kiểm toán mã nguồn (source audit), không phải đã chạy trên máy sạch. Điểm neo chính: `tools/sync-baseline.cjs:11-40,112-193,522-533`, `tools/verify-omp-global.cjs:66-157,277-294`, `src/typesafe-child-env.cjs:6-108`, `tools/promote-omp-global.ps1:145-223`, `tests/sync-baseline.test.ts`, `tests/typesafe-child-env.test.ts`. Dòng chỉ là gợi ý; đọc lại trước sửa.

## Thành phần có thể tái sử dụng

| Thành phần | Công cụ | Giới hạn |
|---|---|---|
| Role native Jev | `bun tools/native-judge-setup.cjs --apply --config <path>` | Chỉ đặt `modelRoles.judge=typesafe/jev-1.14.0`, bảo toàn giá trị khác; không cấu hình auth/provider |
| Chính sách ưu tiên judge | `node tools/native-judge-launch.cjs` | Nhắc lệnh tự nguyện (opt-in), không cưỡng chế mọi consumer/phiên |
| Nguồn extension và tài liệu | `node tools/sync-baseline.cjs` | Cần đích và loader đã chuẩn bị; không cài host hoặc skills |
| Kiểm tra kế hoạch đồng bộ | `node tools/sync-baseline.cjs --dry-run` | Exit 0 không đồng nghĩa mọi action đều NOOP |
| Kiểm tra extension | `node tools/verify-omp-global.cjs --json` | Ngoại tuyến mặc định; HTTP chỉ khi yêu cầu tường minh, không kiểm native judge |

## Cài native judge trên máy khác

1. Cài Node.js, Bun có `Bun.YAML` và OMP qua kênh chính thức: https://github.com/can1357/oh-my-pi . Phiên kiểm chứng thực tế dùng OMP `18.13.2`, Bun `1.4.0`; upstream main mới hơn có thể đòi Bun mới hơn. Không coi hai mức yêu cầu là cùng một bản phát hành.
2. Đặt credential TypeSafe bằng cơ chế auth/môi trường của OMP tại máy đích, không qua repo hoặc argument chứa khóa. Native judge không cần `.claude`; extension dùng consent riêng trong `~/.omp/agent/typesafe.json`, không import consent cũ.
3. Xác định profile và config bằng `omp config --help`, không sao chép config nguyên máy cũ. Chạy setup với đường dẫn tường minh theo [hướng dẫn native](native-judge-guide.md).
4. Chạy `omp models find jev --kind judge --json --no-extensions`; xác nhận catalog có model mong muốn. Không refresh catalog hoặc dump cấu hình như một bước ngầm.
5. Khởi chạy qua `node tools/native-judge-launch.cjs`, yêu cầu tác tử chạy smoke `judge()`/`judgeBatch()` trên state tổng hợp và ghi model của batch. Đúng nội dung nhưng thiếu metadata backend chưa đủ chứng minh định tuyến.
6. Nếu cần extension, làm riêng phần dưới. Không xóa HTTP client hay thay M/H chỉ vì native smoke thành công.

## Đồng bộ extension với đường dẫn máy đích

CJS mặc định target theo `OMP_HOME_DIR` hoặc home hiện tại: `<home>/Projects/omp_extension`. Đặt `OMP_TARGET_DIR` tường minh khi dùng đích khác. Quy trình không sửa loader bất biến.

```powershell
$env:OMP_WORKSPACE_DIR = (Get-Location).Path
$env:OMP_HOME_DIR = $HOME
$env:OMP_TARGET_DIR = Join-Path $HOME 'Projects/omp_extension'
$env:OMP_EXTENSION_POINTER = Join-Path $HOME '.omp/agent/extensions/typesafe-planner.ts'
node tools/sync-baseline.cjs --dry-run
# Chỉ sau khi đã xem actions và chấp nhận triển khai:
node tools/sync-baseline.cjs
```

Các directory workspace/target/home phải tồn tại đúng loại theo preflight. Loader phải là regular file đã được cài qua cơ chế host/người vận hành và có một dòng `export { default } from "<absolute-target>/typesafe-planner.ts";`. Repo kiểm tra loader nhưng không viết/sửa nó. Trên máy hiện tại giữ nguyên proxy bất biến; agent không tự tạo lại hoặc sửa.

Tùy chọn đã có: `OMP_BACKUP_DIR` chọn đường dẫn backup mới chưa tồn tại; `OMP_BUN_BIN` chọn executable Bun. Không đặt `OMP_SKIP_VERIFY_TESTS=1` để nhận thành công giả. Chỉ dùng `--bootstrap` khi người vận hành chủ động nhận quyền quản lý baseline chưa có manifest; không dùng như fallback khi có conflict.

Đích thành công là `DEPLOYED_VERIFIED`; `RECOVERED` là triển khai thất bại đã rollback, `RECOVERY_INCOMPLETE` cần phục hồi thủ công. Khởi động lại OMP sau triển khai vì module được cache trong tiến trình. Verifier ngoại tuyến mặc định; `--help` không gọi mạng. Digest trên đĩa không chứng minh mã đã nạp hoặc native judge hoạt động.

## Tệp được đóng gói và dữ liệu không chuyển

Inventory của sync bao gồm root Markdown, `typesafe-planner.ts`, `package.json`, `.gitignore`, cây `src`, `agents`, `.omp/agents`, `docs`, `tests`, `plans`, `scripts`, `tools`; một số private evaluation roots bị loại. Các tools native mới và policy `.txt` đi theo cây `tools`.

Manifest phiên bản 2 chỉ quản lý `target` và `global_omp_agents`; bản sao helper trong target được nạp tương đối, không qua `.claude`. Migration từ manifest phiên bản 1 xác thực metadata legacy rồi bỏ quyền quản lý các entry `global_claude`, không đọc/ghi/xóa tệp legacy. Verifier báo `MIGRATION_REQUIRED` trước migration và không chạy resolver cũ. Không cài skills, model/provider/auth config hoặc loader; consent extension phải được cấu hình tường minh.

Không đưa vào repo/bản sao chia sẻ: `.env`, auth store, config có khóa, backup chứa dữ liệu riêng tư, session/transcript/cache. Các model role không liên quan judge phải chọn theo provider thực có trên máy đích, không tự sao chép `codex-3rd/*` từ máy nguồn.

## Các khoảng trống còn lại

| Khoảng trống | Hệ quả và cách vận hành hiện tại |
|---|---|
| Đích triển khai tùy biến | Mặc định theo home; dùng `OMP_TARGET_DIR` nếu cần đích khác |
| Không có installer loader | Host/người vận hành chuẩn bị loader; giữ bất biến không ghi proxy toàn cục |
| Không có manifest/version bootstrap skills | Các `ck:*` ngoài repo phải được cài riêng; launcher native không đòi chúng |
| Không ghim binary OMP và dependency lock | Ghi phiên bản đã chạy, kiểm help/catalog/smoke trên máy đích; không tuyên bố reproducible binary build |
| Legacy deploy/text-rewrite scripts | Script sao chép trực tiếp `deploy-baseline-to-target.cjs` đã bị xóa; không dùng script vá planner như đường cài lại; chỉ dùng transaction `tools/sync-baseline.cjs` |
| Windows wrappers | `.bat`/PowerShell dành Windows; Node sync có overrides nhưng chưa kiểm chứng trên Linux/macOS trong phiên này |
| Extension host bridge | Native eval không cấp callback extension hoặc Advisor authority tự động; migration vẫn cần hợp đồng host thật |

Không thay M, raw probabilities hoặc threshold; H vẫn chỉ ứng viên quan sát (shadow). Những khoảng trống này là giới hạn công khai của khả năng chuyển máy, không phải kết quả triển khai thành công trên máy sạch.
