# Sổ tay Hướng dẫn Khôi phục & Hoàn tất Nghiệm thu Sau khi Khởi động lại Phiên OMP (Phase 1 Restart & Verification Runbook)

> **Mục tiêu (Objective)**: Hướng dẫn chi tiết các bước đối soát TypeSafe, thu thập chứng từ kiểm chứng và đóng danh mục Todo sau khi khởi động lại tiến trình chủ OMP (`OMP host restart`).  
> **Kế hoạch Thực thi (Target Plan)**: `plans/261103-unified-judge-jev-standardization/phase-01-multi-provider-wire-support.md`  
> **Ngày lập (Date)**: 2026-11-05  

---

## 1. Bối cảnh & Nguyên nhân Cần Khởi động lại (Context & Reason for Restart)

1. **Điểm nghẽn Phiên Hiện tại (Current Session Bottleneck)**:
   - Tiến trình chủ OMP lưu trữ trong RAM (`in-memory cache`) mã nguồn của tiện ích mở rộng tại thời điểm khởi động phiên.
   - Trong phiên hiện tại, lệnh kiểm chứng `workspace-tests` trong RAM vẫn là `bun test --only-failures` quét toàn bộ 74 tệp kiểm thử của kho mã, dẫn đến thời gian chạy vượt quá 300 giây và bị tiến trình chủ ngắt bằng mã lỗi `exit code 124` (Timeout), khiến `typesafe_review_task` bị từ chối (`REJECTED`).
2. **Giải pháp Đã Triển khai trên Đĩa (On-Disk Fix Applied)**:
   - Đã tạo mô-đun bộ chọn kiểm chứng tất định mới `src/test-asset-selector.ts` và kiểm thử `tests/test-asset-selector.test.ts` (4/4 PASS).
   - Đã sửa khuyết tật phân loại tác vụ `trustedNativeTaskKind` trong `src/task-contract-runtime-sources.ts`: bổ sung các động từ `đọc`, `đọc và phân tích`, `xác định` vào nhóm `research` kèm chốt chặn đối kháng (adversarial guard), giúp tác vụ đọc kế hoạch được phân loại chính xác là `research` thay vì bị ép chạy kiểm thử code.
   - Đã cấu hình `typesafe-planner.ts` sử dụng `selectVerificationTestAssets`, chỉ chạy 7 tệp kiểm thử cốt lõi bất biến (`CORE_VERIFICATION_TESTS`) kết hợp với các tệp kiểm thử ánh xạ trực tiếp từ tệp thay đổi thực tế (`git status`).
   - Lệnh kiểm chứng mới được kỳ vọng sẽ hoàn tất trong **khoảng 2 đến 4 giây** (ước tính dựa trên đo đạc các bộ test cốt lõi), chưa đo lường trực tiếp trong phiên chạy thật của tiến trình chủ.
   - Bản sao lưu mới nhất tại `C:\Users\thant\Projects\omp_extension_backup_2026-11-05T07-11-16-711Z` (trạng thái `deployed_unverified`).
3. **Yêu cầu Khởi động lại (Restart Requirement)**:
   - Cần khởi động lại phiên làm việc OMP để tiến trình chủ nạp logic `selectVerificationTestAssets` và `trustedNativeTaskKind` mới từ đĩa vào RAM.
---

## 2. Quy trình 5 Bước Nghiệm thu Sau khi Khởi động lại (Post-Restart 5-Step Resolution Loop)

Ngay sau khi người dùng khởi động lại phiên OMP, tác tử sẽ thực hiện tuần tự 5 bước sau để hoàn tất nghiệm thu và đóng Todo:

```
[1. typesafe_bind_task] ──► [2. typesafe_collect_evidence] ──► [3. typesafe_review_task]
                                     (commandId: workspace-tests)       (đạt APPROVED_PENDING_COMMIT)
                                                                                  │
[5. todo done (Đóng toàn bộ todo)] ◄──────────────────────────────────────────────┘
```

### Bước 1: Ràng buộc lại Nhiệm vụ (`typesafe_bind_task`)
```json
{
  "task": "Đọc và phân tích yêu cầu Phase 01 từ file kế hoạch",
  "phase": "Phase 1: Chuẩn bị & TDD Red"
}
```
*Kiểm tra chốt chặn (Verification Check)*: Phản hồi từ `typesafe_bind_task` phải hiển thị thuộc tính `"taskKind": "research"`. Nếu phản hồi vẫn hiển thị `"taskKind": "implementation"`, điều đó chứng tỏ tiến trình chủ OMP vẫn chưa nạp mã nguồn mới từ đĩa vào bộ nhớ RAM.
### Bước 2: Thu thập Bằng chứng kèm Chứng từ Kiểm chứng (`typesafe_collect_evidence`)
```json
{
  "task": "Đọc và phân tích yêu cầu Phase 01 từ file kế hoạch",
  "phase": "Phase 1: Chuẩn bị & TDD Red",
  "commandId": "workspace-tests",
  "artifactPaths": [
    "plans/reports/261105-phase-01-requirements-analysis.md"
  ]
}
```
*Lưu ý về hạn mức trần 4940 byte (`ArtifactSelectionManifest`)*: Tác vụ `research` chỉ truyền tệp báo cáo phân tích yêu cầu làm deliverable artifact (2.89KB < 4.94KB). Tuyệt đối không liệt kê các tệp mã nguồn lớn vào `artifactPaths` để tránh lỗi `MANDATORY_PACKET_PROOF_EXCEEDS_BUDGET`. Nếu cần chứng minh chi tiết dòng mã nguồn cụ thể, sử dụng tham số `selections` với các đoạn mã (spans) nhỏ gọn.

### Bước 3: Đánh giá Nhiệm vụ TypeSafe (`typesafe_review_task`)
```json
{
  "task": "Đọc và phân tích yêu cầu Phase 01 từ file kế hoạch",
  "phase": "Phase 1: Chuẩn bị & TDD Red"
}
```
Khi lệnh kiểm chứng chạy thành công trong ~3s và trả về `exitCode: 0`, cổng đánh giá sẽ chuyển từ `REJECTED` sang trạng thái chấp thuận `APPROVED_PENDING_COMMIT`.

### Bước 4: Tham vấn Cố vấn Độc lập (`typesafe_advisor`)
Thực hiện tham vấn Cố vấn chỉ đọc để xác nhận tính toàn vẹn của bằng chứng và hoàn tất biên lai lưỡng viện (`Bicameral Consensus Receipt`).

### Bước 5: Đóng Todo Hợp lệ (`todo done`)
Sau khi đã có vé cam kết `APPROVED_PENDING_COMMIT` và biên lai Cố vấn, cổng preflight sẽ mở khóa và cho phép đóng Todo thành công.

---

## 3. Các Điểm Cần Lưu ý & Bất biến An toàn (Open Invariants & Safety Rules)

1. **Bất biến Thư mục `.claude/`**:
   - Thư mục `.claude/` là vùng bất khả xâm phạm của người dùng, **tuyệt đối chỉ được phép đọc (`read-only`)**, không bao giờ được phép chỉnh sửa, tạo mới hoặc xóa.
   - Hai tệp ambient `.claude/agent-memory/debugger/MEMORY.md` và `omp-binary-introspection.md` đã bị mất trong sự cố xóa trước đó và không còn bản sao lưu cục bộ; không được cố gắng tạo lại dữ liệu giả mạo từ trí nhớ.
2. **Bộ chọn Kiểm chứng Dựa trên `git status`**:
   - `typesafe-planner.ts` sử dụng `statusEvidencePaths` từ lệnh `git status --porcelain -uall` để phát hiện các tệp mã nguồn thực tế bị sửa đổi, kết hợp với 7 tệp `CORE_VERIFICATION_TESTS`.
   - Tuyệt đối không dùng từ khóa trong văn bản todo để chọn tệp kiểm thử.
3. **Chính sách Mạng An toàn (`Cleartext Egress Prevention`)**:
   - `isValidWireUrl` trong `src/typesafe-enabled-resolver.cjs` chỉ chấp nhận giao thức `https:`. Giao thức `http:` chỉ được phép đối với loopback nội bộ (`localhost`, `127.0.0.1`, `::1`).
4. **Trạng thái Giao dịch Sao lưu & Các Mục Mở**:
   - Bản sao lưu mới nhất tại `C:\Users\thant\Projects\omp_extension_backup_2026-11-05T07-11-16-711Z` có trạng thái `deployed_unverified`.
   - Đã ghi nhận thao tác xóa tệp khóa lần 2 sau khi tiến trình đồng bộ chạm ngưỡng 300s.
   - Thư mục `plans/` tại đích sẽ được đối chiếu đồng bộ đầy đủ trong lần chạy `sync-baseline` tiếp theo.
   - Các kiểm thử so sánh A/B trực tiếp với JEV endpoint đối với cấu trúc lời nhắc câu hỏi sẽ được tiến hành độc lập.
