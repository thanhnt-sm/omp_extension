# ADR-20261106-workspace-layer-fail-closed-loader: Lớp Không gian làm việc (Workspace Layer) với Bộ nạp Thất bại-Đóng (Fail-Closed Loader) để Kiểm thử Mã Đang Phát triển Trước Khi Thăng cấp

Status: Decided (Đã Quyết định), kèm một quyết định mở dành cho người dùng (xem mục "Giới hạn được chấp nhận")  
Date: 2026-11-06  
Phạm vi (Scope): `.omp/config.yml`, `.gitattributes`, `tools/omp-workspace-loader.ts`, `tools/omp-target-gate-overlay.yml`, `tools/verify-omp-workspace*.cjs`

---

## Question (Câu hỏi Quyết định)

Làm thế nào để `omp` khởi động tại gốc kho này chạy **đúng cấu hình toàn cục** (cài đặt `settings`, trình cắm `plugins`, kỹ năng `skills`, xác thực `auth`) **cộng với** tiện ích mở rộng đang phát triển trong không gian làm việc, để kiểm thử và trải nghiệm trong `omp` thật *trước* khi thăng cấp (`sync`) — mà không làm suy yếu Bất biến Vàng (Golden Invariant) và không để một lỗi nạp *quan sát được* biến thành "không còn cổng nào"?

---

## Context (Bối cảnh Thực nghiệm)

Các sự kiện sau đã được xác lập trên `omp 18.17.0` (nguồn: phiên điều phối; riêng sự kiện 3 không được tái hiện trong phiên triển khai, xem mục Evidence):

1. Tệp `<cwd>/.omp/config.yml` của dự án được trộn đè (merge) lên cấu hình toàn cục; **mảng thay thế, không hợp nhất** (arrays replace). Chỉ tìm tại `cwd`, **không đi ngược lên thư mục cha**.
2. `disabledExtensions: [extension-module:typesafe-planner]` lọc bộ nạp môi trường (ambient loader) toàn cục theo tên suy diễn (derived name). Một đường dẫn cấu hình tường minh (`extensions:`) **không bị bộ lọc này chặn**.
3. Đường dẫn trực tiếp `./typesafe-planner.ts` được gắn thẻ `?mtime=`; khi đó `nodeRequire("./src/evaluation-host.ts")` trong `typesafe-planner.ts` (khối tạo `evaluationHost`) ném `require() async module`, khối `catch` nuốt lỗi và `typesafe_eval_host` rơi vào `UNAVAILABLE`.
4. Lỗi nhập (import failure) của một tiện ích được ghi nhận theo từng đường dẫn; **phiên vẫn chạy mà không có cổng** (no gate).
5. Bằng chứng nạp mã (runtime proof): khi `session_start`, tiện ích phát thông điệp tùy biến `typesafe-health` có JSON `kind: "runtime-origin"` và `entrypoint.origin`. Thông điệp này đọc được qua lệnh RPC `get_entries`.

---

## Options Considered (Các Phương án Được Xem xét)

| Phương án (Option) | Mô tả (Description) | Kết quả kiểm thử (Tested Result) |
|---|---|---|
| **A — Đường dẫn trực tiếp (Direct Path)** | `extensions: [./typesafe-planner.ts]` | **Loại**: bị gắn `?mtime=`, `typesafe_eval_host` thành `UNAVAILABLE` một cách im lặng (sự kiện 3). |
| **B — Trình trung chuyển (Trampoline)** | Tệp một dòng `export { default } from "<đường dẫn>"` như bộ nạp toàn cục | **Loại**: nạp được, nhưng nếu nhập tĩnh hỏng thì tiện ích biến mất và phiên chạy **không có cổng** (sự kiện 4). Không có điểm để chặn công cụ khi lỗi. |
| **C — `--trusted-extension <tệp-tuyệt-đối>`** | Danh sách cho phép mô-đun chỉ-định (exact module allowlist) | **Loại** (theo tài liệu thượng nguồn `docs/extension-loading.md`): là cờ dòng lệnh, không đặt được trong cấu hình; **bỏ qua cơ chế khám phá** nên mất các tiện ích/plugin toàn cục khác; không dùng chung với `-e`. Ưu điểm duy nhất: lỗi nạp làm dừng khởi động. |
| **D — Bộ nạp Thất bại-Đóng (Fail-Closed Loader)** *(được chọn)* | `.omp/config.yml` vô hiệu hóa bộ nạp môi trường của `typesafe-planner` và nạp `tools/omp-workspace-loader.ts`; bộ nạp này `await import(pathToFileURL(entry).href)` rồi gọi `.default(pi)` | **Chọn**: URL được tính toán (computed dynamic import) **không có thẻ `?mtime`**, khớp hành vi của trình trung chuyển; lỗi nạp được chuyển thành chế độ chặn công cụ thay vì mất cổng. |

---

## Decision (Quyết định)

**Chọn Phương án D.**

1. **`.omp/config.yml`** (byte chính xác, kiểm bằng `bun run verify:workspace`):
   ```yaml
   disabledExtensions:
     - extension-module:typesafe-planner
   extensions:
     - ./tools/omp-workspace-loader.ts
   ```
   Tệp này **chỉ tồn tại ở không gian làm việc**; `tools/sync-baseline.cjs` chỉ triển khai `.omp/agents/**` nên **không** đưa `.omp/config.yml` sang đích (có kiểm thử khẳng định). Vì mảng thay thế, `~/.omp/agent/config.yml` **không được** có `extensions`/`disabledExtensions` khác rỗng ở cấp cao nhất; trình xác minh cảnh báo điều này. `.gitattributes` đã có dòng `.omp/config.yml text eol=lf` để `core.autocrlf=true` không biến tệp thành CRLF và làm hỏng kiểm tra byte.
2. **Bộ nạp thất bại-đóng** `tools/omp-workspace-loader.ts` (nằm dưới `tools/` để kiểm thử được và các kiểm thử vẫn đạt tại đích triển khai, nơi cấu hình vắng mặt). Bộ nạp chuyển sang **chế độ suy giảm (degraded mode)** khi: nhập thất bại, không có xuất mặc định (default export) là hàm, hàm khởi tạo ném lỗi (kể cả sau khi đã đăng ký một phần), **hoặc hàm khởi tạo kết thúc mà không đăng ký trình xử lý `tool_call` nào** (nhập thành công nhưng không có cổng). Để đếm, bộ nạp bọc API máy chủ `pi` bằng một `Proxy` chỉ quan sát `on("tool_call", ...)`; mọi thành viên khác chuyển tiếp nguyên trạng tới máy chủ thật. Trong chế độ suy giảm, trình xử lý `tool_call` trả `{ block: true, reason }` cho **mọi công cụ ngoài danh sách cho phép chỉ-đọc** (`read`, `grep`, `glob`, `find`, `ast_grep`; không có `ls`). Công cụ lạ, công cụ MCP và sự kiện sai định dạng đều bị chặn. Vì `read`, `grep` và `ast_grep` có thể lấy URL (kể cả `skill://`), mọi `path`/`paths` chứa `://` bị chặn và đầu vào sai định dạng của `read` bị chặn. Lỗi được đưa ra qua `ui.notify`, thông điệp `typesafe-workspace-loader-error` và `stderr`.
3. **Lối thoát ổn định (Escape Hatch)**: `omp --config tools/omp-target-gate-overlay.yml` (`extensions: []`, `disabledExtensions: []`) chạy **cổng đã triển khai (target)** ngay từ gốc kho, để lỗi trong cổng không gian làm việc không khóa chính bản sửa của nó, và để có bằng chứng nạp mã sau thăng cấp. Phương án thay thế: khởi động `omp` từ một thư mục tạm (scratch cwd) không có `.omp/config.yml`.
4. **Bảo vệ chống tự vô hiệu hóa — chỉ là một lớp phòng ngừa một phần**: `.omp/config.yml` và `tools/omp-workspace-loader.ts` được thêm vào `PROTECTED_INTEGRITY_PATTERNS` trong `typesafe-planner.ts`. Chốt chặn này áp dụng cho `write`, `edit` và `ast_edit` (với `ast_edit`, chốt chặn đối chiếu các mục `paths`, gồm thư mục và mẫu glob, vì bước áp dụng thật là một `write` tới `xd://resolve` không mang đường dẫn). Chốt cũng coi là được bảo vệ mọi đường dẫn có `:` sau tiền tố ổ đĩa (luồng dữ liệu thay thế NTFS như `config.yml::$DATA`) và chuẩn hóa dấu chấm/khoảng trắng ở cuối. **Màn chắn ghi của EGC (`src/egc.ts`) KHÔNG được mở rộng**: `typesafe-planner.ts` không nhập EGC, EGC không hoạt động trong kho này, nó quét toàn bộ đầu vào (nên sẽ từ chối cả `cat .omp/config.yml` lẫn lệnh `native-judge-setup --check` được tài liệu hóa). **`bash` và `eval` không thể được sàng lọc đầy đủ**, nên kiểm tra byte/tồn tại của `bun run verify:workspace` là **phát hiện (detection), không phải ngăn chặn (prevention)**. Còn tồn tại các biệt danh Windows như tên 8.3 (`CONFIG~1.YML`) mà chốt chặn không đối chiếu.
5. **Gỡ đường vòng**: xóa `scripts/deploy-baseline-to-target.cjs` (đường dẫn cố định, chép trực tiếp, bỏ qua bản kê/nhật ký/hoàn tác). Duy nhất `tools/sync-baseline.cjs` được phép ghi vào đích.
6. **Trình xác minh** `bun run verify:workspace` kiểm ngoại tuyến: byte của `.omp/config.yml`; `tools/omp-workspace-loader.ts` tồn tại, là tệp thường và xuất mặc định là hàm (nhập mô-đun, không gọi hàm khởi tạo; hỏng thì thoát `1`); cấu hình toàn cục không che mảng; kế hoạch `sync --dry-run` được phân tích chặt (mỗi mục phải là `HÀNH_ĐỘNG_BIẾT_TRƯỚC:gốc_biết_trước/đường_dẫn`, nếu không là `CONFLICT`). `--runtime` chứng minh nguồn gốc nạp; một dự án bị loại trừ tường minh báo `EXCLUDED` nhưng **không bao giờ che được** lỗi bộ nạp.

Quy tắc **"không sửa trực tiếp bộ nạp toàn cục"** (`~/.omp/agent/extensions/typesafe-planner.ts`) **không đổi**.

---

## Giới hạn được chấp nhận (Accepted Limit) và Quyết định Mở

**Một tệp bộ nạp bị thiếu hoặc không nhập được khiến phiên tại gốc kho chạy KHÔNG có cổng nào.** Lý do: `disabledExtensions` trong `.omp/config.yml` đã gỡ cổng môi trường (ambient) bất kể bộ nạp có nạp được hay không; bộ nạp **không thể tự bảo vệ phép nhập của chính nó** (nếu nó không được nạp thì không có mã nào chạy để chặn công cụ). `bun run verify:workspace` **phát hiện** tình trạng này (kiểm tra `loader-file` và `--runtime` báo `FAIL`); nó không ngăn chặn.

**Quyết định mở dành cho người dùng**: một phương án dự phòng về cổng đích (target-gate fallback) sẽ đòi hỏi sửa `typesafe-planner.ts` (để cổng đích tự kích hoạt khi cổng không gian làm việc vắng mặt) **cộng với** một lần `sync`. Việc này chưa được làm và cần người dùng quyết định có chấp nhận thay đổi hành vi của cổng đã triển khai hay không.

---

## Evidence (Bằng chứng Quan sát được)

Tất cả dùng thông điệp `runtime-origin` qua RPC `get_entries`:

| Tình huống | Kết quả quan sát |
|---|---|
| `omp` tại gốc kho | đúng một nguồn gốc `file:///D:/100.Software/Github/omp_extension/typesafe-planner.ts`, **không** có `?mtime`; `sha256` của điểm vào và 4/4 mô-đun đóng gói khác rỗng; 199 lệnh (mô hình và plugin toàn cục còn nguyên) |
| `omp` tại thư mục tạm | đúng một nguồn gốc `file:///C:/Users/thant/Projects/omp_extension/typesafe-planner.ts` (đích) |
| `omp --config tools/omp-target-gate-overlay.yml` tại gốc kho | chỉ nguồn gốc đích (đường dẫn tuyệt đối và tương đối đều đạt) |
| `typesafe_eval_host` `action=identity` chạy trong tiến trình `omp` thật với mã nạp qua bộ nạp | trả `status: "available"` (máy chủ đánh giá phân giải được) |
| Điểm vào hỏng (đường dẫn không tồn tại) trong `omp` thật | phiên vẫn chạy, thông điệp `typesafe-workspace-loader-error` xuất hiện, không có nguồn gốc nào |

**Phép đối chứng (negative control) KHÔNG tái hiện được lỗi `?mtime`**: nhập động tính toán có thẻ `?mtime`, từ một tiện ích tạm nạp bằng `-e` trong tiến trình `omp` thật, vẫn cho `typesafe_eval_host` ở trạng thái `available`, tức không tái hiện lỗi `require() async module` ở sự kiện 3. Lỗi đó phụ thuộc đường nạp nội bộ của máy chủ đối với đường dẫn trong cấu hình, nên sự kiện 3 chỉ dựa vào kết quả của phiên điều phối, không do phép đối chứng này xác nhận. Việc chặn công cụ thực tế khi lỗi (cần một lượt gọi mô hình) chỉ được kiểm bằng kiểm thử đơn vị với `pi` giả, không bằng một lượt `omp` thật.

---

## Consequences (Hệ quả & Rủi ro)

- **Khởi động lại `omp` trong kho nay chạy mã không gian làm việc.** Bằng chứng nạp mã *sau thăng cấp* phải dùng lớp phủ (overlay) hoặc thư mục tạm; khởi động lại trong kho **không** chứng minh mã đã triển khai.
- **Sự thật của máy chủ (host fact)**: `.omp/config.yml` của *bất kỳ* kho nào cũng có thể vô hiệu hóa một tiện ích môi trường qua `disabledExtensions`. Câu "kho không đáng tin không thể tắt cổng" **chỉ đúng với bộ giải quyết (resolver)** (`typesafe-enabled-resolver.cjs` chỉ đọc công tắc từ cấu hình toàn cục), **không đúng với máy chủ**. Do đó cấu hình này được bảo vệ một phần (Decision 4) và được kiểm bằng byte (phát hiện).
- **Đặc quyền riêng tư của Cố vấn**: đoạn `.omp` nằm trong `PRIVATE_SEGMENTS` (`src/evidence-privacy.ts`), nên `.omp/config.yml` là nguồn riêng tư: Cố vấn từ chối phạm vi (`advisor_private_source_scope_denied`) và gói bằng chứng toàn diff trả `PRIVATE_DIFF_REQUIRES_SCOPED_PACKET` khi tệp này nằm trong `changedFiles`. Hệ quả: thay đổi `.omp/config.yml` **không thể được Cố vấn rà soát**; chính sách riêng tư **không** bị thay đổi. Giảm thiểu: nội dung kỳ vọng cố định trong `tools/verify-omp-workspace-lib.cjs` (ngoài vùng riêng tư, rà soát được) và kiểm byte. **Một `.omp/config.yml` chưa theo dõi (untracked) hoặc chưa commit có thể khiến các gói bằng chứng không phạm vi trả `PRIVATE_DIFF_REQUIRES_SCOPED_PACKET`, vì vậy phải commit tệp này cùng `.gitattributes`.** (Suy ra từ mã nguồn, chưa quan sát ở thời gian chạy.)
- Lần đồng bộ kế tiếp sẽ `PRUNE` `scripts/deploy-baseline-to-target.cjs` khỏi đích, và triển khai `tools/omp-*`/`tools/verify-omp-workspace*.cjs` cùng các kiểm thử mới.
- `tools/native-judge-launch.cjs` kế thừa `cwd` nên khi chạy từ gốc kho sẽ dùng mã không gian làm việc; `tools/todo-remediation-smoke.ts` dùng `--cwd` thư mục tạm cùng `--no-extensions -e` nên **không bị ảnh hưởng**.

---

## Reopen Triggers (Điều kiện Mở lại)

Khi `omp` thay đổi quy tắc hợp nhất cấu hình dự án (mảng, tìm cha), cơ chế thẻ `?mtime`, hoặc thêm khả năng khóa `disabledExtensions` ở cấp toàn cục; khi người dùng quyết định về phương án dự phòng cổng đích; hoặc khi cần Cố vấn rà soát `.omp/config.yml` (đòi hỏi biểu diễn công khai).
