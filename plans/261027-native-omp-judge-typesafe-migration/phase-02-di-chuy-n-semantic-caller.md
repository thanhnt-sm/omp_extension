---
phase: 2
title: "Phán đoán nguyên tử qua eval"
status: pending
priority: P1
effort: "1d"
dependencies: [1]
---

# Giai đoạn 2: Phán đoán nguyên tử qua eval

## Tổng quan
Dùng trực tiếp `eval` và `judge()`/`judge_batch()` của OMP cho các câu hỏi nguyên tử nhỏ hơn todo, plan hoặc công việc Advisor. Không dựng tool, HTTP client, callback extension hoặc lifecycle quyền mới.

## Yêu cầu
- Mỗi câu hỏi chỉ đo một thuộc tính có thể kiểm chứng: phân loại (`choice`), xác suất đúng/sai (`bool`), hoặc mức độ (`score`). Ngữ cảnh (state) lấy từ bằng chứng công khai phù hợp, không nhúng bí mật.
- Các câu hỏi độc lập trên cùng state gộp trong một lần `judge`; nhiều state với cùng rubric dùng `judge_batch` (Python) hoặc `judgeBatch` (JavaScript), không loop thủ công.
- Mọi side effect, threshold, kiểm tra bằng chứng, diễn giải cấp todo/plan, và quyết định cần suy luận vẫn do code/parent/Advisor/human đảm nhiệm; không biến xác suất thành kết luận đã hoàn thành.

## Kiến trúc
`judge` là primitive tác tử (agent primitive) trong `eval`, không phải API hook của extension. Kết quả `bool` là xác suất `P(yes)` ở `.bool`, không phải literal boolean hay `.noul`. Hỏi hẹp, criteria tương phản và chỉ gửi dữ liệu cần thiết; khi không chắc chắn chuyển sang review/Advisor, không tự giảm threshold. Batch do host sở hữu, có item errors; tiêu thụ và `close()` theo tài liệu OMP.

## Tệp mã liên quan
- Không tạo file production. Đọc hướng dẫn [OMP eval](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/eval.md), [TypeSafe System One](https://docs.typesafe.ai/concepts/system-one) và [TypeSafe cách xây dựng](https://docs.typesafe.ai/concepts/how-to-build-with-system-one).
- Ghi ví dụ đã chạy và giới hạn nguồn gốc vào `plans/261027-native-omp-judge-typesafe-migration/reports/phase-02-atomic-judge.md` khi triển khai.

## Các bước thực hiện
1. Chọn ba quyết định nguyên tử thực tế nhưng không có quyền thao tác: ví dụ nhận diện criterion có bằng chứng, kiểm tra câu phản chứng, phân loại loại thiếu sót; tránh hỏi một câu chung “todo đã xong chưa?”.
2. Tạo một state có nguồn/trích dẫn rõ, tối thiểu dữ liệu; hỏi cùng lúc `bool` xác suất có bằng chứng, `choice` phân loại thiếu sót với ≥2 option, và `score` mức rủi ro với ≥2 mức. Đọc raw probabilities và không dùng confidence của `choice` thay cho `bool`.
3. Dùng hai state vô hại với cùng rubric qua batch; kiểm tra từng item `.ok`/`.error` và whole-run failure riêng, kết thúc batch đúng lifecycle.
4. Chạy một trường hợp không đủ bằng chứng: kết quả phải tiếp tục là thiếu bằng chứng, không semantic rejection hay todo completion. Trường hợp host outage được ghi `UNAVAILABLE` nếu phát sinh thực, không tự gây lỗi mạng.
5. Viết mẫu sử dụng cho `ck:cook` dưới dạng hướng dẫn, không tạo tool TypeSafe; yêu cầu judge output chỉ hỗ trợ quyết định nhỏ và không được sử dụng như receipt có thẩm quyền của lifecycle.

## Tiêu chí thành công
- [ ] Có kết quả quan sát được từ một state nhiều câu hỏi và hai state dùng batch trên native judge Jev đã xác minh ở Phase 1.
- [ ] Kết quả `bool` được đọc đúng dạng xác suất, câu hỏi `choice`/`score` đúng schema và lỗi từng batch item được phân biệt với lỗi toàn batch.
- [ ] Không có custom TypeSafe tool, không semantic approval thay evidence/Advisor/human, không thay native todo argument.

## Đánh giá rủi ro
Tài liệu TypeSafe nhận `noul`, nhưng prelude OMP nhận `bool`; ánh xạ phải dựa trên output thực. Nhiều state khác rubric không được gộp sai; khi backend không chứng minh native Jev thì chỉ ghi kết quả host, không tuyên bố hiệu chuẩn Jev.
