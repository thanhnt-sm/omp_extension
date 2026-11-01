---
phase: 1
title: "Cấu hình Jev cho Judge bản địa"
status: pending
priority: P1
effort: "1d"
dependencies: []
---

# Giai đoạn 1: Cấu hình Jev cho Judge bản địa

## Tổng quan
Cài hoặc xác nhận Jev qua `judge` bản địa OMP trước khi động tới extension. Giai đoạn này độc lập với callback `judge` của `ExtensionContext` và không tạo custom TypeSafe tool.

## Yêu cầu
- Xác định đường dẫn cấu hình hiệu lực, role `modelRoles.judge`, danh mục model Jev, credential resolution và provider đang được host chọn; không suy ra từ `ONLINE` của extension.
- Ưu tiên cấu hình đã chạy đúng: chỉ sửa khi probe native thất bại vì cấu hình; sao lưu đúng tệp trước thay đổi. Không đọc/ghi `.claude/.ck.json`, không in key và không sửa global proxy.
- Dùng tài liệu chính thức [mô hình](https://github.com/can1357/oh-my-pi/blob/main/docs/models.md), [nhà cung cấp](https://github.com/can1357/oh-my-pi/blob/main/docs/providers.md), [cài đặt](https://github.com/can1357/oh-my-pi/blob/main/docs/settings.md), [đánh giá](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/eval.md). ID Jev và base URL lấy từ catalog/config **thực tế**, không hardcode từ báo cáo phiên cũ.

## Kiến trúc
OMP tự quản lý model role, TypeSafe provider, key, URL, request và fallback. Extension chưa tham gia. `judge` có question `choice`, `bool`, `score`; TypeSafe `noul` tương ứng câu hỏi `bool` của OMP. Nếu chuỗi có native judge nhưng không có native khả dụng sau lỗi, OMP không được âm thầm thay bằng xác suất synthetic của prompted model; kiểm tra hành vi trong bản host đang chạy.

## Tệp mã liên quan
- Chỉ đọc: `~/.omp/agent/config.yml`, `~/.omp/agent/models.yml` khi các đường dẫn này thật sự hiệu lực; xem profile/overlay qua `omp config path` và cài đặt hiệu lực.
- Không sửa mã extension. Ghi kết quả vào `plans/261027-native-omp-judge-typesafe-migration/reports/phase-01-native-judge.md` khi chạy.

## Các bước thực hiện
1. Xác nhận lệnh `omp config path`, cài đặt hiệu lực `modelRoles.judge`, role fallback, danh mục Jev và trạng thái auth qua cơ chế OMP. Không dùng `cfg://` nếu người dùng chưa yêu cầu thay cài đặt phiên hiện tại; ở phiên triển khai mới thực hiện cấu hình theo đúng quyền được cấp.
2. Đọc tệp model config hiệu lực; nếu có override `baseUrl`, xác minh OMP ghép `{baseUrl}/v1/systemone` trên đúng phiên bản trước khi sửa. Không sửa duplicate provider hay cache khi chưa thấy lỗi thực tế.
3. Nếu cần cấu hình, tạo bản sao lưu tệp mục tiêu, đặt native Jev làm `modelRoles.judge` bằng cơ chế OMP; key lưu qua OMP auth hoặc môi trường của host, không đưa vào repo. Kiểm tra role/model sau thay đổi; restart chỉ khi phiên bản host yêu cầu.
4. Gọi `judge()` qua `eval` với một state không nhạy cảm và ba câu hỏi hợp lệ: `choice` có ít nhất hai nhãn, `bool`, `score` có ít nhất hai mức. Kiểm tra output có xác suất trong miền hợp lệ và nguồn model Jev bằng metadata/usage do host công bố; chỉ output đúng về nội dung chưa chứng minh backend.
5. Kiểm tra lỗi credential/routing bằng error thực nếu phát sinh; không tạo outage cố ý làm hỏng phiên đang dùng. Dừng nếu không thể xác nhận backend native; ghi nguyên nhân và lệnh resume.

## Tiêu chí thành công
- [ ] Cấu hình và danh mục hiệu lực cho biết role `judge` chọn Jev native, credential do OMP quản lý và URL không bị nối sai phiên bản.
- [ ] Probe native `choice`, `bool`, `score` trả structured answers và có bằng chứng nguồn gốc Jev do host cung cấp; `ONLINE` riêng không được tính là đạt.
- [ ] Không tạo custom TypeSafe tool, không sửa `.claude` hoặc global trampoline; mọi thay đổi cấu hình đều có backup và rollback cụ thể.

## Đánh giá rủi ro
Provider selection có thể bị overlay/profile hoặc credential precedence ghi đè. So sánh cấu hình hiệu lực và nguồn chứng cứ host trước/sau; nếu backend không chứng minh được thì ghi thiếu bằng chứng, không đánh dấu phase hoàn tất.
