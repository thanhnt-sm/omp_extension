---
phase: 5
title: "Kiểm thử và triển khai"
status: pending
priority: P1
effort: "1d"
dependencies: [3, 4]
---

# Giai đoạn 5: Kiểm thử và triển khai

## Tổng quan
Xác minh riêng hai đích: Jev đã được dùng qua `judge` bản địa OMP (giai đoạn 1–2), và chỉ khi host cung cấp bridge thì extension mới được chuyển qua API host (giai đoạn 3–4). Không gộp native smoke với tuyên bố mã extension đã đổi.

Nếu Cổng C chưa đạt, giai đoạn này không chạy native todo smoke, extension smoke, sync hoặc deployment; chỉ ghi báo cáo kết quả giai đoạn 1–2 và trạng thái `HOST_BRIDGE_REQUIRED`. Native todo smoke chỉ thuộc nhánh giai đoạn 3–4 sau bridge, phiên mới sạch và có đường closure native hợp lệ.

## Yêu cầu
- Mỗi tệp kiểm thử bị ảnh hưởng phải chạy đầy đủ, không chỉ trường hợp dự kiến đổi kết quả; sau đó chạy toàn bộ `bun test` khi nhánh tương ứng đã đủ tiền đề.
- Chứng minh đường gọi thực: judge role → Jev; nếu đã chuyển extension thì hook → host bridge → Jev; todo → kết quả Core được đối soát. Không lấy `ONLINE` hay mã băm trên đĩa làm bằng chứng semantic/runtime load.
- Không sửa proxy trampoline toàn cục. Triển khai có giao dịch, backup và rollback; kiểm tra phạm vi sync trước tài nguyên `.claude` ngoài workspace.

## Kiến trúc
Giai đoạn này chỉ bắt đầu nhánh extension khi bridge đạt, giai đoạn 3–4 pass và phiên mới sạch. Native Jev smoke được lưu riêng từ giai đoạn 1–2. Thứ tự: consistency grep → affected test files → `bun test` → native judge/atomic smoke → nếu bridge đạt thì extension/todo smoke → dry-run sync → promotion được phép → hậu kiểm và restart khi cần.

## Tệp mã liên quan
- Bộ kiểm thử: tất cả `tests/*` tương ứng các tệp mã thực sự thay đổi, tối thiểu `tests/contract-runtime.test.ts`, `tests/task-evidence-runtime.test.ts`, `tests/typesafe-planner-integration.test.ts`, `tests/e2e-workflow.test.ts` nếu chúng bị ảnh hưởng.
- Công cụ sẵn có: `tools/verify-omp-global.cjs`, `tools/sync-baseline.cjs`, `tools/oneclick-omp.ps1`; chỉ dùng sau khi kiểm tra hợp đồng và tác động trên các gốc quản lý.
- Báo cáo: `plans/reports/261027-native-omp-judge-migration-execution-log.md`.

## Các bước thực hiện
1. Tìm toàn bộ callsite, signature và bản sao của mẫu đã sửa bằng `grep`/LSP; so sánh diff với lỗi thực, không cắt unrelated behavior. Không để lại shim, dead registration hoặc tài liệu sai.
2. Chạy toàn bộ test file bị ảnh hưởng, rồi `bun test`; không nới timeout, bỏ qua test hay sửa assertion để che lỗi. Ghi lệnh, số đạt/trượt và giới hạn chứng cứ.
3. Smoke native `choice`, `bool`, `score`, một state nhiều câu hỏi và hai state qua batch; xác minh provenance Jev từ host, không suy đoán từ kết quả. Lỗi/thiếu metadata ghi đúng trạng thái.
4. Chỉ khi bridge đã nạp và giai đoạn 3–4 pass: smoke semantic thật từ extension; kiểm tra `fetch` riêng không chạy, evidence thiếu → `EVIDENCE_REQUIRED`, dịch vụ lỗi → `UNAVAILABLE`, Advisor receipt bổ sung không dispatch lại input không đổi.
5. Chỉ khi bridge đạt và phiên mới sạch: smoke native todo trên mục thử có thể đóng hợp lệ; input chỉ có trường Core, preflight không side effect, hoàn tất chỉ công nhận tool result ổn định. Không dùng danh sách phiên hiện tại.
6. Nếu Cổng C thiếu, ghi riêng kết quả giai đoạn 1–2 và dừng; không chạy todo smoke, sync hoặc deployment extension.
7. Chạy `node tools/sync-baseline.cjs --dry-run` chỉ sau bridge, extension tests và todo smoke pass; kiểm tra đích `.claude` legacy/xung đột hash. Nếu đích ngoài phạm vi, dừng và không tự ghi đè file người dùng.
8. Nếu mọi điều kiện đạt, đồng bộ qua công cụ giao dịch; giữ backup/journal, kiểm tra SHA và hành vi host sau restart. Nếu verification fail, rollback bằng transaction tool; không chỉnh global proxy.

## Tiêu chí thành công
- [ ] Toàn bộ tệp kiểm thử liên quan và bộ `bun test` đạt, không nới assertion hay bỏ qua test.
- [ ] Native Jev có bằng chứng backend cùng output hợp lệ; extension bridge/todo smoke chỉ được xác nhận khi code mới thực sự nạp.
- [ ] Dry-run và triển khai không ghi trái phép vào `.claude`; có backup, verification và rollback path quan sát được.
- [ ] Nếu host thiếu bridge, báo riêng giai đoạn 1–2 và giữ giai đoạn 3–5 chưa hoàn tất; không chạy todo smoke/deploy extension.

## Đánh giá rủi ro
Sync manifest hiện hành có thể vẫn ghi lên gốc `.claude`. Không chạy deployment chỉ vì test xanh: kiểm tra diff/manifest/ownership và quyền trước. Bằng chứng digest là quan sát trên đĩa, không chứng minh mã đã nạp; smoke runtime phải theo sau restart.
