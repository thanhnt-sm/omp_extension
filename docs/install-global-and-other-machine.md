# Cài judge vào OMP toàn cục và máy khác (Global Installation)

## Chọn đúng script

| Mục đích | Script chạy từ gốc repo |
|---|---|
| Ghim native judge cho profile OMP | `bun tools/native-judge-setup.cjs --apply --config <config.yml>` |
| Kiểm tra role native judge | `bun tools/native-judge-setup.cjs --check --config <config.yml>` |
| Mở OMP ưu tiên judge (judge-first) | `node tools/native-judge-launch.cjs` |
| Triển khai extension vào đích và các tệp global được quản lý | `node tools/sync-baseline.cjs` |
| Windows: triển khai extension có hướng dẫn | `powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\tools\promote-omp-global.ps1` |

**Native judge và extension là hai thành phần khác nhau.** Chỉ cần Jev cho `eval judge()` thì làm phần 1; không cần triển khai extension. Script setup không cài binary OMP, không tạo credential, không sửa provider và không sao chép toàn bộ cấu hình máy cũ.

## 1. Cài native judge toàn cục trên máy hiện tại

Mở PowerShell tại thư mục repo. Kiểm tra điều kiện tiên quyết (prerequisites):

```powershell
omp --version
bun --version
node --version
omp config path
```

Phiên đã kiểm chứng trả OMP `18.13.2`, Bun `1.4.0`; đây là quan sát phiên, không phải bảo đảm cho mọi phiên bản mới. `omp config path` trên máy hiện tại trả `C:\Users\thant\.omp\agent`, tức thư mục chứa cấu hình profile mặc định.

Chọn tệp `config.yml` của đúng profile. Với profile mặc định của máy hiện tại:

```powershell
$config = Join-Path $HOME '.omp/agent/config.yml'
bun tools/native-judge-setup.cjs --check --config $config
bun tools/native-judge-setup.cjs --apply --config $config
bun tools/native-judge-setup.cjs --check --config $config
```

Kết quả mong đợi sau apply:

```text
selected judge: "typesafe/jev-1.14.0"
match: yes
```

`--check` trả mã thoát (exit code) `1` khi chưa khớp; đây là kết quả kiểm tra, không phải lỗi phải bỏ qua. `--apply` tạo backup cạnh tệp gốc khi có thay đổi; đã đúng thì không ghi lại. Các giá trị khác được giữ nhưng định dạng/comment YAML có thể thay đổi do serialize. Không commit backup cấu hình vào repo.

Credential `TYPESAFE_API_KEY` phải được cấu hình riêng qua cơ chế auth/môi trường OMP, có sẵn cho tiến trình khởi chạy. Không in khóa, không đặt khóa vào argument, repo hoặc chat. Native judge không phụ thuộc `.claude`; extension dùng `~/.omp/agent/typesafe.json` của profile mặc định, không đọc hoặc import cấu hình Claude.

Role judge trên máy này đã được lưu toàn cục thành `typesafe/jev-1.14.0`. Chạy lại setup chỉ để kiểm tra hoặc phục hồi; không cần cài lại OMP.

## 2. Mở phiên ưu tiên judge

```powershell
node tools/native-judge-launch.cjs
```

Hoặc:

```powershell
bun run judge:start
```

Launcher nạp `tools/native-judge-policy.txt` bằng `--append-system-prompt`. Nó ưu tiên native judge cho mọi quyết định ngữ nghĩa nhỏ còn bất định, gom câu hỏi cùng state và batch nhiều state. Phép tính/schema/so sánh xác định vẫn dùng code; không gọi model để thay phép tính có kết quả chính xác.

Đây là chính sách tự nguyện (opt-in prompt policy), không phải cưỡng chế host. Các phiên mở bằng `omp` trực tiếp không tự nhận policy launcher. Role native judge đã lưu vẫn có hiệu lực với profile đã cấu hình.

Với profile đặt tên (named profile), chọn config tương ứng và mở cùng profile:

```powershell
node tools/native-judge-launch.cjs --profile <ten-profile>
```

Không truyền `<ten-profile>` nguyên văn; thay bằng tên thực tế. Xem `omp --help` và `omp config --help` của máy đích trước chọn đường dẫn profile; không mặc định mọi profile dùng `$HOME/.omp/agent/config.yml`.

## 3. Cài trên máy khác

1. Cài OMP từ [nguồn chính thức](https://github.com/can1357/oh-my-pi), Node.js và Bun hỗ trợ `Bun.YAML`. Repo không cung cấp trình cài binary host.
2. Clone/copy repo sang thư mục mong muốn và mở terminal tại gốc repo. Không mang theo `.env`, auth store, backup có khóa, session hoặc cache.
3. Cấu hình credential TypeSafe bằng kênh riêng trên máy đích. Các provider/model hội thoại phải tồn tại độc lập; không sao chép các role `codex-3rd/*` của máy cũ.
4. Chạy `omp config path`, chọn file YAML của profile đích. Làm phần 1 với đường dẫn đó; script chỉ đổi `modelRoles.judge`, không ghi đè các model role khác.
5. Kiểm tra catalog:

```powershell
omp models find jev --kind judge --json --no-extensions
```

6. Mở qua launcher ở phần 2. Yêu cầu tác tử chạy smoke native dưới đây; script shell không tự cung cấp helper `judge`, helper chỉ có trong `eval` của OMP.

```js
const b = await judgeBatch(
  { even: { number: 4 }, odd: { number: 3 } },
  { even: { type: "bool", instructions: "Is number an even integer?" } },
  { concurrency: 2, retries: 0, minOk: 2, intent: "Jev installation smoke" }
);
for await (const item of b.drainIter()) print(item);
print(await b.status());
await b.close();
```

Đọc kết quả: hai item thành công, số chẵn có xác suất cao hơn số lẻ; metadata batch phải chỉ ra backend thực tế `typesafe/jev-1.14.0`. Không đặt xác suất cố định làm kỳ vọng cho mọi lần gọi. Có lỗi auth/network thì xử lý đúng lỗi, không gọi lại semantic request không đổi để ép kết quả. `ONLINE` hoặc role đã cấu hình không thay bằng chứng metadata backend.

## 4. Cài extension global bằng bộ tools hiện hữu

Chỉ làm nếu muốn dùng thêm extension TypeSafe của repo. Không dùng bước này để thay native judge setup.

### Chuẩn bị đích và loader

Đích workspace/target/home phải tồn tại theo preflight. Loader global phải đã được cài qua host/người vận hành dưới dạng regular file, trỏ một dòng tới `<target>/typesafe-planner.ts`. Script repo chỉ kiểm tra, **không tạo hoặc sửa loader bất biến**. Nếu máy sạch chưa có loader, dừng tại điều kiện này và thực hiện qua cơ chế cài extension của host/người vận hành; không gọi sync lặp lại để né lỗi.

Trên máy hiện tại tuyệt đối không sửa `C:/Users/thant/.omp/agent/extensions/typesafe-planner.ts`.

### Cấu hình đường dẫn máy đích và triển khai

CJS mặc định target theo home hiện tại; đặt overrides tường minh khi muốn chọn đường dẫn khác:

```powershell
$env:OMP_WORKSPACE_DIR = (Get-Location).Path
$env:OMP_HOME_DIR = $HOME
$env:OMP_TARGET_DIR = Join-Path $HOME 'Projects/omp_extension'
$env:OMP_EXTENSION_POINTER = Join-Path $HOME '.omp/agent/extensions/typesafe-planner.ts'
node tools/sync-baseline.cjs --dry-run
```

Đọc danh sách actions. Khi đúng đích và người vận hành chấp nhận triển khai:

```powershell
node tools/sync-baseline.cjs
```

Hoặc dùng trợ giúp Windows thay lệnh sync trực tiếp:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\tools\promote-omp-global.ps1
```

Không chạy cả hai liên tiếp như hai bước bắt buộc. `--bootstrap` chỉ dành việc chủ động nhận quản lý baseline chưa có manifest; không dùng để né conflict. Không đặt `OMP_SKIP_VERIFY_TESTS=1` cho triển khai thật.

Kết quả thành công: `DEPLOYED_VERIFIED`, có backup/journal. Khởi động lại phiên OMP sau triển khai vì module extension được cache trong tiến trình. Extension còn cần activation global theo [hướng dẫn vận hành](operations-and-user-guide.md); native role không tự bật extension.

`tools/verify-omp-global.cjs --json` mặc định ngoại tuyến; `--live`/`--require-live` mới gọi HTTP, `--help` không kiểm đích. Nó không chứng minh native judge routing hay mã đã nạp; `bun run oneclick` điều phối extension Windows, không cài native role, credential, skills hoặc OMP binary.

### Hậu kiểm và phục hồi (Verification and Recovery)

Khi chủ động chấp nhận một phép thăm dò HTTP có thể tính phí, chạy với cùng các biến `OMP_*` phía trên:

```powershell
node tools/verify-omp-global.cjs --json
```

Đọc từng check và mã thoát, không chỉ chuỗi `ONLINE`. Đây là hậu kiểm extension, không thay smoke native ở phần 3. Khởi động lại OMP sau triển khai thành công; nếu đang điều tra lỗi, giữ lại log đã lọc và đường dẫn backup/journal trước khi mở phiên mới.

- **Phục hồi native role:** dừng phiên đang dùng cấu hình; chọn đúng backup `.bak.<timestamp>` do setup in ra. Người vận hành khôi phục file cấu hình từ backup đó sau khi kiểm tra không có thay đổi mới cần giữ, rồi chạy lại `--check` để quan sát role và mở phiên OMP mới. Backup chứa toàn bộ cấu hình cũ, không chỉ role judge; không ghi đè mù quáng hoặc đưa backup vào repo.
- **Phục hồi extension:** transaction tự rollback khi triển khai lỗi. `RECOVERED` nghĩa là triển khai thất bại nhưng đã phục hồi; không coi là cài thành công. `RECOVERY_INCOMPLETE` cần giữ nguyên lock, backup và journal, dừng đồng bộ rồi xử lý theo [hướng dẫn triển khai](deployment-guide.md). Repo chưa cung cấp một lệnh rollback thủ công tổng quát; không bịa lệnh và không xóa lock để ép chạy tiếp.


## 5. Đã kiểm chứng và giới hạn

Trên máy nguồn đã chạy: installer trực tiếp, package forwarding check/apply trên fixture tạm, launcher version/dry-run, native typed/batch/ảnh/cache. Full suite quan sát: 941 pass, 4 skip, 0 fail; suite hiện hữu có gọi live API khi môi trường chứa key, vì vậy không dùng nó làm kiểm tra miễn phí/ngầm định trên máy đích.

Chưa kiểm chứng cài trên máy sạch hoặc Linux/macOS; các lệnh PowerShell ở đây dành Windows. Repo chưa đóng gói external `ck:*` skills hoặc ghim binary OMP. Không tuyên bố tái tạo nguyên máy từ một script.

Đọc thêm: [hướng dẫn native judge](native-judge-guide.md), [nguồn nghiên cứu](research/omp-judge-sources.md), [kiểm toán chuyển máy](reinstall-portability-audit.md).
