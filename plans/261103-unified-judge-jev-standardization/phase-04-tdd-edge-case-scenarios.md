# Giai đoạn 4: Bộ Kiểm thử TDD Hồi quy Toàn diện & Xác thực Đa kịch bản Ma trận Biên

> **Mục tiêu**: Xây dựng bộ kịch bản kiểm thử biên (`tests/unified-triad-architecture.test.ts`) kiểm chứng 100% các tình huống tấn công, rớt mạng, rò rỉ khóa, và trốn tránh kiểm thử theo tiêu chuẩn `ck:scenario`.

> **Điều chỉnh (2026-11-11)**: SC-07 (tự động leo thang M→H dẫn tới chấp thuận) bị loại theo quyết định thu hẹp phạm vi ở giai đoạn 3; thay bằng kiểm thử biên quyền hạn H (`tests/h-authority-boundary.test.ts`). Trước khi viết SC-01..SC-06, đối chiếu với các test hiện có (`ast-analyzer`, `typesafe-evidence-file`, `typesafe-redact`, `anti-blocking-middleware`, retry 429/503) để tránh trùng lặp.

---

## 1. Ma trận Kịch bản Biên (`ck:scenario` Edge Case Matrix)

| Mã Kịch bản (Scenario ID) | Tên Kịch bản & Điều kiện Biên (Edge Scenario) | Hành vi Dự kiến (Expected Invariant) |
|---|---|---|
| **SC-01** | **Rớt Mạng Ngoại tuyến (Network Drop / 503)** | Thử lại lũy thừa qua `RETRY_POLICY`; nếu kiệt sức, chuyển sang cơ chế fail-closed an toàn và kích hoạt Cố vấn Độc lập chẩn đoán, không crash tiến trình. |
| **SC-02** | **Quá tải API (429 Rate Limit + Retry-After)** | Giãn cách chính xác theo tiêu đề `Retry-After` và cooldown 45s; bảo toàn thế hệ khóa API trong bộ nhớ. |
| **SC-03** | **Tấn công Gian lận Test AST (Test Evasion Attack)** | `ast-analyzer.ts` phát hiện hành vi xóa `expect`, sửa thành `expect(1).toBe(1)`, hoặc thêm `.skip` $\rightarrow$ chặn đứng ngay lập tức tại Cổng 1. |
| **SC-04** | **Tấn công Đường dẫn TOCTOU & Symlink** | `typesafe-evidence-file.cjs` từ chối liên kết tượng trưng (symlink), Windows junction, và hardlink $\rightarrow$ ngăn chặn rò rỉ dữ liệu ngoài workspace. |
| **SC-05** | **Rò rỉ Khóa Bí mật trong State hoặc Câu hỏi** | `typesafe-redact.cjs` khử bỏ 100% token nhạy cảm trước khi gửi đi; bảo toàn các số nguyên đếm token viễn trắc (`TELEMETRY_COUNT_KEYS`). |
| **SC-06** | **Tác tử Cố tình Spam `ask` hoặc Gọi `todo block`** | `anti-blocking-middleware.ts` dập tắt hoàn toàn `ask` spam về lỗi code; chặn `todo block` bừa bãi và tự động nhúng mô tả Cố vấn tự chữa lành. |
| **SC-07** | **Leo thang Tự động từ Macro M sang Atomic H** | Khi biểu điểm `M` không thể phân giải do mâu thuẫn tiêu chí con $\rightarrow$ Tầng 3 tự động phân tách đồ thị DAG vị từ vi hạt mà không cần can thiệp thủ công. |

---

## 2. Các Bước Thực thi Cụ thể (Implementation Steps)

- [x] Tạo tệp kiểm thử `tests/unified-triad-architecture.test.ts`.
- [x] Triển khai kiểm thử cho 6 kịch bản SC-01..SC-06 (chỉ phần còn thiếu theo mục "Đối chiếu độ phủ"); SC-07 đã bị loại và được thay bằng `tests/h-authority-boundary.test.ts`, nên số thực tế là 6 SC + 1 SC thay thế, không phải 7 bài.
- [x] Đảm bảo các ca kiểm thử chạy độc lập và cách ly: mỗi ca dùng `rateLimitState` riêng, `fetch`/đồng hồ/`sleep`/`random` được tiêm (inject), biến môi trường `TYPESAFE_API_KEY` được lưu và khôi phục. Tệp không tạo thư mục tạm, không chạm hồ sơ `~/.omp` hay `~/.claude` nên không cần `createVerificationHome()`.
- [x] Chạy kiểm thử tự động bằng `env -u TYPESAFE_API_KEY bun test tests/unified-triad-architecture.test.ts`: 21 pass / 0 fail, chạy hai lần cho kết quả giống nhau.

---

## 3. Tiêu chí Chấp thuận (Acceptance Criteria)

- [x] 6/6 kịch bản SC-01..SC-06 có độ phủ PASS (21 ca trong `tests/unified-triad-architecture.test.ts`, cộng độ phủ sẵn có của SC-04); SC-07 thay bằng `tests/h-authority-boundary.test.ts`, không tính vào "7/7".
- [x] Không có ca nào timeout (toàn tệp chạy dưới 0,2 giây, không sinh tiến trình `git`) và chạy chung với `typesafe-transport-retry`, `anti-blocking-middleware`, `ast-analyzer`, `payload-safety`, `multi-dialect-wire` vẫn 111 pass / 0 fail.

---

## 4. Đối chiếu độ phủ (Coverage Reconciliation)

Đã đọc nội dung assertion của từng test sẵn có (không chỉ đọc tên). Xếp loại: đã phủ (covered) / phủ một phần (partial) / thiếu (missing).

| SC | Test sẵn có (tệp: tên test) | Xếp loại | Phần còn thiếu → test bổ sung trong `unified-triad-architecture.test.ts` |
|---|---|---|---|
| SC-01 | `typesafe-transport-retry`: "retries only 429 and 529, then shares a credential cooldown" (503 gọi 1 lần), "a network failure is not retried", "network exceptions retain a real dispatch receipt", "fails a debate closed when the judge is unavailable"; `multi-dialect-wire`: "exhausts retries on persistent HTTP 429" | partial | Chưa có: hằng `RETRY_POLICY`; độ trễ backoff lũy thừa cụ thể; 503/rớt mạng ở tầng `judgeTypeSafe` (không throw, `http_503`/`network_error`, không rò chi tiết); ánh xạ sang `UNAVAILABLE` và việc không chèn remediation Advisor |
| SC-02 | `typesafe-transport-retry`: "reuses one prepared body ... honors retry-after" (chỉ `Retry-After: 1`, `random=0`), "A to B to A preserves A cooldown", "generation prevents stale A-B-A failure", "explicit caller rate-limit states remain isolated" | partial | Chưa có: `Retry-After` > 5 s (không thử lại), cooldown = `max(45 s, giá trị server)` và ranh giới `until` loại trừ cận trên (44 999 ms còn cooldown, 45 000 ms hết); `Retry-After` dạng HTTP-date; jitter; khóa trạng thái là SHA-256, không lưu khóa thô |
| SC-03 | `ast-analyzer` (xóa `expect`, `assert`, khối test, comment hóa, `expect(true).toBe(true)`, `.skip`/`.todo`/`xit`, cân bằng theo tệp); `verification-gate`: "Gate 1 exposes the shared test-evasion classification" (chỉ `test.todo`) | partial | Chưa có: sửa assertion thật thành `expect(1).toBe(1)` / `expect(0).toEqual(0)` (số lượng cân bằng nên chỉ bắt được qua tautology); đường Gate 1 với `testExitCode: 0` cho cả 4 kiểu trốn tránh → `REJECTED`; đối chứng: sửa assertion trung thực vẫn qua |
| SC-04 | `evidence-file-security`: "ancestor junctions and hardlink aliases are rejected", "junction root, junction intermediate parent ...", "final-component directory links ...", các seam TOCTOU (`before-open`, `after-open`, `hardlink-after-read`, `parent-after-read`...), "external and internal final-file symlinks" (`skipIf` khi thiếu quyền); `task-evidence-runtime`: "ordinary-named hardlinked artifact"; `evidence-collector`: "unsafe hardlinked snapshot" | covered | Không thêm. Lưu ý: trên máy này 2 ca bị `skip` (symlink tệp cần developer mode, FIFO chỉ POSIX); junction/hardlink vẫn chạy thật |
| SC-05 | `public-evidence-egress`: "redactEvidenceState preserves non-negative integer telemetry token counts ..." (đủ 4 biến thể); `payload-safety`: redact khóa Anthropic/AWS trong state + instructions + criteria, từ chối secret trong key; `egress-and-process-boundary` | partial | Chưa có kiểm chứng ở tầng dây (wire): thân request thực tế gửi qua `judgeTypeSafe` không chứa secret (Anthropic, AWS, `ghp_`, và chính API key đang chạy) nhưng vẫn giữ nguyên số đếm token; secret trong khóa câu hỏi bị từ chối trước khi gửi (`fetch` 0 lần) |
| SC-06 | `anti-blocking-middleware`: `interceptAskCall` (chặn, mọi câu hỏi đều được xét, `humanOwned` phải là `true` tường minh), todo block qua `todo-lifecycle-authority` (từ chối + gợi ý `typesafe_prepare_advisor`, cho phép blocker ngoài), `formatAdvisorAutoRemediation`, `shouldAppendAdvisorRemediation` | partial (nhỏ) | Chỉ test dạng `questions[]`; host thật còn chuyển `question` (chuỗi) và `i` (chuỗi) vào `interceptAskCall`. Bổ sung: cả 4 dạng payload, lặp 25 lần vẫn chặn (không có trạng thái), payload sai dạng không throw/không chặn |
| SC-07 | — | đã loại | Thay bằng `tests/h-authority-boundary.test.ts` (giai đoạn 3) |

### Ghi chú trung thực về sai khác giữa đặc tả và mã thực

1. **SC-01 nêu "503 thử lại lũy thừa"; mã thực chỉ thử lại 429 và 529** (`RETRY_POLICY.retryableStatus = [429, 529]`). 503, 5xx khác và rớt mạng trả fail-closed ngay sau 1 lần gọi; test khẳng định đúng hành vi này, không khẳng định thử lại 503.
2. **SC-01 nêu "kích hoạt Cố vấn chẩn đoán" khi kiệt sức; mã thực không làm vậy.** Lỗi hạ tầng map sang `UNAVAILABLE` (`semanticFailureDisposition`), và `shouldAppendAdvisorRemediation` cố ý trả `false` cho `UNAVAILABLE`/`HUMAN_REQUIRED` (chủ sở hữu là người vận hành dịch vụ, không phải Advisor). Test khẳng định chính sách thực. Nếu muốn đúng đặc tả thì cần quyết định thiết kế riêng, không thuộc giai đoạn này.
3. **SC-02 "cooldown 45s" khớp mã** (`RATE_LIMIT_COOLDOWN_MS = 45000`), nhưng thực tế là `max(45 s, Retry-After của server)`, và `Retry-After` > 5 s thì không thử lại mà đi thẳng vào cooldown. "Bảo toàn thế hệ khóa" được kiểm chứng ở mức hành vi (cooldown của khóa A sống sót qua A→B→A), không khẳng định số thế hệ nội bộ.
4. **SC-03 là heuristic theo dòng, không phải AST thật.** Ban đầu chỉ bắt tautology với `true|false|0|1|chuỗi`; đã mở rộng (2026-11-11) sang mọi số, `null`/`undefined`, và cùng một định danh hoặc đường dẫn thuộc tính ở hai vế (`expect(2).toBe(2)`, `expect(x).toBe(x)`); lời gọi hàm (`f()`) không bị gắn cờ vì có thể khác nhau hợp lệ. Test: `tests/ast-analyzer.test.ts`.
5. Tệp test mới dài 218 dòng, vượt ngưỡng ~200 dòng gợi ý; chấp nhận vì là tệp kiểm thử nhóm theo SC, tách ra sẽ làm mất ngữ cảnh đối chiếu.
