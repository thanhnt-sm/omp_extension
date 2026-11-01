# Rà soát và sửa cài đặt judge/TypeSafe (Judge Installation Audit and Repairs)

## Kết luận hiện hành

Native `judge()`/`judgeBatch()` thực sự chạy bằng `typesafe/jev-1.14.0`. Extension vẫn có HTTP transport riêng; chưa di chuyển native-only vì `ExtensionContext` upstream đã rà soát không cấp callback judge. Không dựng bridge giả, không đổi M hoặc ngưỡng, H vẫn quan sát (Shadow).

## Các lỗi đã sửa trong workspace

- `src/host-history.ts`: host lọc metadata `i` trước registered execute nhưng lưu trường đó trong tool history. Digest witness vì thế khác history và bind/collect bị từ chối. Join hiện chấp nhận exact payload hoặc payload chỉ loại đúng `i` dạng chuỗi; task, phase và mọi argument có thẩm quyền vẫn khớp chính xác. Regression kiểm đổi task/phase bị từ chối.
- Bind phục hồi thực tế bằng transport chuẩn `write xd://typesafe_bind_task`, không tạo lịch sử giả hoặc bỏ gate; host đã trả `BOUND` với xác nhận thực thi thật. Collector qua transport này đã qua rào observation, trả các thiếu sót packet/verification thật thay vì `OWNED_PROJECT_EXECUTE_OBSERVATION_REQUIRED`.
- `src/advisor-public-context.ts`: digest SHA-256 công khai do host sinh/xác thực bị bộ lọc entropy nhầm là secret. Chỉ che tạm các digest đã xác thực khi kiểm privacy rồi giữ nguyên identity; đường dẫn và credential vẫn phải qua redaction fail-closed. Regression kiểm hash nguồn và question hash giữ nguyên, credential/path nhạy cảm vẫn bị từ chối.
- `tools/verify-omp-global.cjs`: mặc định ngoại tuyến, mạng chỉ opt-in qua `--live`/`--require-live`; help trước I/O, từ chối argument lạ; JSON `verificationScope` tách đĩa/HTTP/native judge/mã đã nạp/quyền ngữ nghĩa. Không còn tuyên bố `READY & VERIFIED` như runtime proof.
- `tools/oneclick-omp.ps1`: giữ mã lỗi verifier cuối; fixture xác nhận lần hai exit `7` thì wrapper exit `7`, không in thành công.
- `tools/sync-baseline.cjs` và verifier: mặc định target `<home>/Projects/omp_extension`, giữ overrides. Thay đổi kiểm deployment plan sau lock đã tồn tại trong working tree và được giữ nguyên, không quy nguồn gốc cho worker của phiên.
- `tools/todo-remediation-smoke.ts`: hỗ trợ host `18.13.2` đã được kiểm hành vi, không chỉ ghim `18.12.3`.
- `tests/atomic-jev-eval-control.test.ts`: API thật chỉ chạy khi `OMP_LIVE_TYPESAFE_TESTS=1`; có key không còn tự biến unit suite thành request mạng có phí.
- Tài liệu README và hướng dẫn cài đặt/kiểm chứng được sửa theo ranh giới thực tế; digest trên đĩa và `ONLINE` không chứng minh loaded code, semantic approval hoặc native completion.

## Bằng chứng đã chạy

| Kiểm tra | Kết quả | Giới hạn |
|---|---|---|
| OMP | `18.13.2` | Binary CLI được gọi |
| Setup role | `typesafe/jev-1.14.0`, `match: yes` | Tệp profile đã chọn |
| Native typed judge | Choice `blue`, bool `.96`, score `.99` | Fixture tổng hợp |
| Hai native batch | Mỗi batch 2/2, 0 lỗi; metadata `typesafe/jev-1.14.0` | Không là calibration hoặc approval |
| Full suite trước sửa invocation/privacy | 941 pass, 4 skip, 0 fail; 5389 assertions; 309.25s | Baseline trước các sửa sau đó |
| Sync module sau tối ưu syscall | 38 pass, 0 fail; 475 assertions; 163.13s | Không tăng deadline hoặc bỏ test; lần trước 223.97s |
| Setup module | 7 pass, 0 fail; 32 assertions | Setup tool |
| Host/contract/Advisor baseline | 40 pass, 0 fail; 226 assertions | Bốn module |
| Host/contract/source/integration sau sửa join | 31 pass, 0 fail; 201 assertions | Bốn module |
| Privacy/Advisor regression | 23 pass, 0 fail; 62 assertions | Ba module |
| Installation tool regressions | 6 pass, 0 fail; 42 assertions | Help/unknown/offline/oneclick subprocess thật |
| Atomic opt-in module | 10 pass, 0 fail; 76 assertions; không live | Chứng minh mặc định hermetic |
| CLI todo smoke | PASS trên `18.13.2`: init thật, chặn done chưa duyệt, giữ goal, 0 real provider calls | Không phải positive completion approval |
| Full suite sau tối ưu syscall | 950 pass, 4 skip, 0 fail; 5424 assertions; 267.14s | Dưới deadline 300s hiện hữu |
| Triển khai sau tối ưu | `DEPLOYED_VERIFIED`; suite cô lập 950 pass, 4 skip, 0 fail; 267.88s | Backup `C:/Users/thant/Projects/omp_extension_backup_2026-10-28T15-01-45-341Z` |
| Hậu kiểm trên đĩa | 503/503 tệp khớp; không mismatch hoặc action chờ; proxy PASS | `nativeJudge`, `loadedCode`, `semanticAuthority` vẫn `NOT_VERIFIED` trong verifier |

Không lặp lại lỗi smoke version cũ như bằng chứng source vẫn hỏng: lỗi ghim version đã sửa và smoke sau đó PASS. Test pass không thay native receipt hoặc parent integration.

## Phần native lifecycle chưa hoàn tất

Tool chuẩn trong phiên hiện tại vẫn dùng module đã nạp từ target cũ cho tới restart. Do đó sửa workspace chưa tự sửa public Advisor runtime hiện tại. Không retry semantic rejection không đổi. Chỉ dùng transport được source công bố khi cần; không giả descriptor/receipt.

Collector chuẩn đã chạy lại `workspace-tests` trên source sau tối ưu: không còn `VERIFICATION_COMMAND_FAILED`, omissions rỗng và trạng thái chuyển `CURATION_REQUIRED`. Packet vẫn vượt budget và chưa bao phủ criterion gốc; cần curation đúng `uncoveredCriterionIds`, exact cached source spans và artifact budget. Không retry packet lớn không đổi, không dùng parity hoặc log bash thay receipt. Đây chưa phải M/Advisor approval hoặc settled Core completion.

Mọi todo giữ nguyên mục tiêu và incarnation; chưa có matching settled Core completion cho các mục audit. `todo(unblock)` chỉ mở trạng thái quản lý, không chứng minh `todo(done)`. Không đánh dấu xong bằng prose, block/drop hoặc scope change.

## Phục hồi và tiếp tục

Chủ sở hữu (Owner): host OMP và integration owner workspace này. Sau kiểm thử và promotion giao dịch, restart để nạp join/privacy mới; chạy bind/collect/review chuẩn trên exact incarnation, prepare Advisor và thực thi đúng native descriptor trả về, review lại dùng cached M, rồi native done chỉ khi gate cho phép. Nếu thiếu extension judge callback thật, giữ `HOST_BRIDGE_REQUIRED` riêng cho migration, không làm giả tính hoàn tất.

Kiểm tra độc lập (Independent Review) cho `validatePublicReferences` vẫn chưa hoàn tất: reviewer bị lỗi schema trước kết luận. Regression hiện có kiểm hash nguồn/question hash và chặn credential/path nhạy cảm; chưa đủ để tuyên bố toàn bộ evidenceRef của task review đã được kiểm độc lập. Giữ yêu cầu review này sau restart, không dùng smoke `hashPreserved` hoặc test pass làm receipt Advisor.

Báo cáo recovery lịch sử: `plans/reports/typesafe-recovery/2a790d1d-d63b-466a-80c4-e08506da2beb.md`. Không coi bản ghi chuẩn bị recovery là settled Core lifecycle change.

## Nguồn chính thức

- https://github.com/can1357/oh-my-pi/blob/main/docs/tools/eval.md
- https://github.com/can1357/oh-my-pi/blob/main/docs/models.md
- https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/extensibility/extensions/types.ts
- https://docs.typesafe.ai/concepts/how-to-build-with-system-one
- https://docs.typesafe.ai/confidence

Giữ deterministic rules/control flow/side effects trong code; câu hỏi hẹp, state liên quan tối thiểu, độc lập cùng state gom request; nhiều state dùng batch. Không lấy ngưỡng ví dụ tài liệu thay operating point đã phê duyệt. Upstream `main` có thể khác binary đang chạy.
