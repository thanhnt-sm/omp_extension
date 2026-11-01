# Nhật ký Nguồn Judge Bản địa OMP (OMP Native Judge Sources)

> **Phạm vi (scope):** ghi lại các nguồn đã đọc, quan sát runtime được cung cấp trong phiên, và giới hạn bằng chứng cho judge bản địa của OMP. Đây không phải tuyên bố đã khảo sát toàn bộ Internet, không phải bằng chứng rằng `main` đã phát hành, và không thay thế tài liệu vận hành tại [`docs/native-judge-guide.md`](../native-judge-guide.md).
>
> **Ngày ghi nhận:** 2026-10-28. Nguồn upstream `main` được quan sát tại commit `c3b645cb275e03ac8a176fbfb0a877cfb3a2c2ef`; trạng thái release của commit này **chưa được chứng minh**.

## 1. Quy tắc bằng chứng (evidence policy)

Mỗi mục được gắn một trong các nhãn sau:

- **Đã đọc (read):** nội dung được lấy trực tiếp từ URL hoặc tệp trong phiên này.
- **Quan sát phiên (session observation):** kết quả smoke/config/runtime được cung cấp hoặc ghi nhận trong phiên; không mở rộng thành khả năng chung ngoài phiên.
- **Được tham chiếu nhưng chưa mở (referenced, not opened):** nguồn được nhắc tới nhưng không dùng nội dung của nó để suy luận.
- **Đầu mối chưa xác minh (unverified lead):** kết quả tìm kiếm hoặc nguồn bên thứ ba chưa được xác nhận là tài liệu chính thức.
- **Chưa thực thi (not exercised):** không có command/result thực tế trong phiên; không trình bày ví dụ như kết quả chạy.

Các tài liệu này không ghi API key, giá trị credential, raw config, environment dump, hay URL proxy riêng tư.

## 2. Nguồn upstream OMP đã đọc

### 2.1 Tài liệu model/provider

- **URL:** [`docs/models.md`](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md)
- **Nhãn:** Đã đọc (read), commit quan sát ở trên.
- **Phát hiện:** OMP phân loại `typesafe`, `openrouter-decisions`, `openai-decisions` và `workers-ai-systemone` là judgment APIs, không phải chat transports. Model judgment được chọn qua role `judge`. Tài liệu mô tả TypeSafe gửi System One tới `{baseUrl}/v1/systemone`, credential/auth qua host, cùng khả năng native judgment có hình ảnh. Tài liệu cũng mô tả Jev image/Box là experimental và các bound/format liên quan.
- **Giới hạn:** Đây là snapshot của `main` tại commit quan sát, không chứng minh bản OMP cài cục bộ có cùng mọi chi tiết, không chứng minh release, credential hợp lệ, hay backend được chọn trong một request cụ thể.

### 2.2 Tài liệu `eval`

- **URL:** [`docs/tools/eval.md`](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/tools/eval.md)
- **Nhãn:** Đã đọc (read), commit quan sát ở trên.
- **Phát hiện:** `eval` có helper `judge(state, questions)` và batch `judge_batch` (Python) / `judgeBatch` (JavaScript). State phải là string không rỗng, JSON object hoặc JSON array. Câu hỏi được typed thành `choice`, `bool`, `score`; `bool` trả xác suất trong trường `.bool`, không phải primitive boolean. Nhiều câu hỏi trên cùng state có thể đi trong một request; nhiều state dùng host-owned batch, giữ lỗi theo từng item và hỗ trợ drain/status/cancel/close.
- **Giới hạn:** Tài liệu không tự chứng minh smoke trong phiên này, không phải receipt hoàn thành task/todo, và không cấp callback `judge` cho extension.

### 2.3 Hợp đồng kiểu judgment

- **URL:** [`packages/ai/src/judgment/types.ts`](https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/ai/src/judgment/types.ts)
- **Nhãn:** Đã đọc (read), commit quan sát ở trên.
- **Phát hiện:** `JudgmentState` là string/object/array JSON; `Question` gồm `choice`, `noul`, `score`, `box`; kết quả typed có `choice` + probabilities + confidence, `noul` là xác suất yes, `score` là giá trị kỳ vọng theo level và probabilities, còn `box` trả edges + confidence. `BoxQuestion.image` là chỉ số cục bộ vào `request.images`.
- **Giới hạn:** Đây là source contract, không phải bằng chứng model Jev đã được chọn hoặc Box đã chạy trong phiên.

### 2.4 Native transport

- **URL:** [`packages/ai/src/judgment/native.ts`](https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/ai/src/judgment/native.ts)
- **Nhãn:** Đã đọc (read), commit quan sát ở trên.
- **Phát hiện:** `NativeJudge` nhận thông tin kết nối (connection) từ caller; role chain của OMP dùng registry để phân giải credential/header và model. Không có bằng chứng ở đây rằng native host nhận `TYPESAFE_DEFAULT_MODEL`; không dùng biến này thay `modelRoles.judge`. Transport có retry hữu hạn (bounded retry), khác với việc gọi lại phán quyết ngữ nghĩa không đổi.
- **Giới hạn:** Không đọc hoặc ghi giá trị environment/config; không chạy native request trong khi đọc source.

### 2.5 System One wire

- **URL:** [`packages/ai/src/judgment/systemone.ts`](https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/ai/src/judgment/systemone.ts)
- **Nhãn:** Đã đọc (read), commit quan sát ở trên.
- **Phát hiện:** TypeSafe wire gửi body `{state, model, questions}` tới `/v1/systemone`; image assets được tham chiếu trong state và gửi trong `assets`, với header nguy hiểm hình ảnh khi có ảnh. Box `image` được giữ cục bộ và bỏ khỏi wire question; wire vẫn gửi `type: "box"` và instructions.
- **Giới hạn:** Không dùng source để suy ra giới hạn ngoài snapshot đã đọc; không thực thi request hay xác minh provenance ở host cục bộ.

### 2.6 Text bridge

- **URL:** [`packages/ai/src/judgment/text.ts`](https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/ai/src/judgment/text.ts)
- **Nhãn:** Đã đọc (read), commit quan sát ở trên.
- **Phát hiện:** `TextJudge` render câu hỏi thành prompt keyword cho chat model. Choice, yes/no và score được parse từ text; mỗi câu trả **one-hot** (label/level được parse có xác suất `1`, phần còn lại `0`, confidence `1`). Text judge không trả lời Box.
- **Giới hạn:** Đây là fallback/text implementation trong source; không phải kết quả smoke của phiên và không nên được gọi là xác suất phân phối native.

### 2.7 Judge role chain của coding-agent

- **URL:** [`packages/coding-agent/src/judgment/index.ts`](https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/judgment/index.ts)
- **Nhãn:** Đã đọc (read), commit quan sát ở trên.
- **Phát hiện:** coding-agent resolve role `judge`, phân loại candidate native/local/online, ghi usage/telemetry/cache. Sau candidate native đầu tiên, `textJudgeRoleChain` chỉ giữ các native candidate; prompted chat model không được dùng để tái tạo calibrated native probability khi native judgment thất bại. Session-model fallback chỉ được nối khi chưa có native candidate theo logic source. Image/Box còn có filtering riêng.
- **Giới hạn:** Đây là hành vi source upstream; policy hiệu lực phải kiểm tra trên đúng host/version đang chạy. Không coi một source read là bằng chứng runtime.

## 3. Nguồn TypeSafe và nguồn liên quan

### 3.1 Box

- **URL:** [`TypeSafe Box primitive`](https://docs.typesafe.ai/primitives/box)
- **Nhãn:** Đã đọc (read).
- **Phát hiện:** Box là câu hỏi định vị object trong ảnh, trả bốn edges theo fraction của ảnh và confidence; request cần image và header `TypeSafe-Danger-Zone-Images: true`. Tài liệu đánh dấu Box/images là “Dreamer-ready”, chưa production-ready, và nói request/answer/limits có thể đổi. Box không có “not found”; tài liệu khuyến nghị ghép Noul để kiểm tra có object trước khi dùng box.
- **Giới hạn:** Không dùng curl example trong tài liệu để chạy request. Không có smoke Box trong phiên này.

### 3.2 Images

- **URL tham chiếu:** [`TypeSafe images primitive`](https://docs.typesafe.ai/primitives/images)
- **Nhãn:** Được tham chiếu nhưng chưa mở (referenced, not opened). URL trả HTTP 404 trong phiên đọc này, vì vậy không suy luận nội dung từ URL đó.
- **Giới hạn:** Không claim rằng toàn bộ images API/limits đã được xác minh qua trang này. Các giới hạn image được ghi ở đây chỉ khi có cùng nội dung trong source OMP đã đọc hoặc Box page đã đọc; mọi capability chưa có source trực tiếp phải coi là chưa xác minh.

### 3.3 Claude Agent Teams

- **URL:** [`Claude Code Agent Teams`](https://code.claude.com/docs/en/agent-teams)
- **Nhãn:** Đã đọc (read), nhưng là nguồn về Claude Code teams, không phải OMP native judge.
- **Phát hiện:** Agent teams experimental và disabled by default; cần user permission/configuration như `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, có shared task list/mailbox và teammates. Điều này không chứng minh OMP `judge`, không thay thế `judgeBatch`, và không được dùng làm native judge backend.
- **Giới hạn:** Nguồn này chỉ giúp phân biệt orchestration/permission với typed judgment; không có benchmark hay smoke được chạy.

### 3.4 Jev tutorial bên thứ ba

- **Nguồn:** kết quả tìm kiếm dẫn tới một “jev-tutorial” bên thứ ba (URL cụ thể không được xác minh là nguồn chính thức).
- **Nhãn:** Đầu mối chưa xác minh (unverified lead).
- **Giới hạn:** Không trích dẫn nội dung, không dùng làm căn cứ API/config/provenance, và không claim tutorial là official.

## 4. Quan sát thực tế của phiên (session smokes)

Các số liệu dưới đây là **quan sát phiên được cung cấp**, không phải kết quả được tái chạy trong lúc tạo tài liệu. Không có test/build/lint/live call nào được chạy trong task viết docs này.

| Surface | Quan sát | Giới hạn diễn giải |
|---|---|---|
| Native role | Role native đã lưu: `typesafe/jev-1.14.0` | Không suy ra mọi profile/host đều giống vậy |
| OMP version | `18.13.2` | Chỉ là version thực tế được nêu cho phiên |
| Native smoke | `choice` trả `blue`; typed bool trả `1`; score trả `1` | Không ghi raw state/credential; output không tự là todo/advisor receipt |
| Batch smoke | even `.99`, odd `.01`; backend `typesafe/jev-1.14.0`; cost `.000023268` | Cost là quan sát của batch cụ thể, không phải bảng giá chung |
| Batch sau ghim phiên bản | `12` chia hết cho `3`: `1`; `13` không chia hết cho `3`: `.01`; chi phí `.000023688` | Không suy rộng thành bảo đảm hiệu chuẩn (calibration) |
| Judge policy | M unchanged; H shadow-only | Native smoke không thay đổi authority/lifecycle policy |
| Extension path | Extension HTTP là path riêng | Native smoke không chứng minh extension đã migrate hoặc HTTP path đã xóa |

`choice`, `score`, và typed bool ở đây là output quan sát được của native smoke. Trong OMP contract, `bool` trả xác suất `.bool`; trong TypeSafe source contract, khái niệm tương ứng có thể được gọi là `noul`. Không đồng nhất hai field này khi viết adapter.

## 5. Hình ảnh, Box và giới hạn surface

- Text/native judgment và image judgment là các surface khác nhau. OMP source đã đọc cho thấy native image candidate cần image support/bounds; TypeSafe Jev image/Box được đánh dấu experimental ở tài liệu Box.
- Box chỉ dành cho native judge theo source type contract; text bridge từ chối Box.
- Không cần bật mọi backend để dùng native Jev. Chỉ cần role/candidate phù hợp và credential resolution của OMP; candidate chain/fallback phải theo host policy, không tự thêm backend.
- **Đã thực thi thêm tại parent:** PNG tổng hợp 560×560, hình vuông đỏ giữa nền trắng: bool `.98`, choice `square`, backend `typesafe/jev-1.14.0`, chi phí `$0.000049938`. Gọi lại cùng dữ liệu để kiểm cache trả kết quả giống nhau và host báo chi phí `0`.
- **Giới hạn Box đã kiểm:** bridge eval từ chối `type: "box"` với thông báo chỉ nhận `choice`, `bool`, `score`; không gửi yêu cầu Box tới provider. Nguồn bridge ghim commit: https://raw.githubusercontent.com/can1357/oh-my-pi/c3b645cb275e03ac8a176fbfb0a877cfb3a2c2ef/packages/coding-agent/src/eval/judgment-bridge.ts .

## 6. Privacy, cost, cache và fallback

- **Privacy:** state/questions/images có thể rời máy tới backend được role chọn. Chỉ dùng state không nhạy cảm cho smoke; không đưa API key/raw config vào repo, docs, transcript, hay artifact. Hãy kiểm tra redaction và quyền host trước khi gửi dữ liệu thật.
- **Cost:** source `coding-agent` ghi usage cho native attempts và cache hit; session smoke có cost cụ thể ở bảng trên. Không dùng các giá trị smoke làm giá cố định.
- **Cache:** source index mô tả answer cache cho native judgments và telemetry/usage phân biệt cache hit với billed attempt. Key/cache behavior cụ thể vẫn phụ thuộc bản host; chưa benchmark cache trong task docs này.
- **Fallback:** source upstream áp dụng native-only tail sau native candidate đầu tiên, để prompted chat không giả lập calibrated native probability. “Native-only fallback” ở đây là fallback giữa native candidates; không phải extension HTTP fallback và không phải quyền tự đổi sang text one-hot. Nếu host/version khác, xác minh behavior trước khi vận hành.

## 7. Cấu hình và cài lại

- Setup tool trong workspace có contract riêng: `--check` là mặc định, `--apply` là thao tác ghi rõ ràng, và `--config <path>` chọn config path. Tool chỉ báo/ghi safe metadata theo contract; không in credential.
- `TYPESAFE_API_KEY` chỉ được nhắc bằng tên biến; giá trị không được echo/raw-read trong tài liệu hoặc kiểm tra docs.
- Việc chọn profile qua `omp config` chỉ thực hiện sau khi khám phá `--help` trên host phù hợp. **Chưa thực thi** profile selection trong task này.
- Backup config explicit và `tools/sync-baseline.cjs`/các workflow sync hiện có là hai việc khác nhau: backup giữ khả năng rollback cấu hình; sync-baseline đồng bộ workspace/deployment artifacts theo contract riêng. Không coi sync là backup credential và không coi backup là deploy.

## 8. Những gì chưa được chứng minh (not exercised)

- Chưa chứng minh release/tag tương ứng với upstream `main` hoặc commit trên.
- Công cụ cài đặt đã chạy `--check` trên cấu hình máy hiện tại và trả judge ghim đúng phiên bản; module kiểm thử đạt 7 pass, 0 fail, 32 assertions. Không lưu credential.
- Parent đã chạy native typed/batch, ảnh tổng hợp, cache và từ chối input không hợp lệ; chưa kiểm lỗi provider thật, calibration trên tập dữ liệu chuẩn, hay cầu nối extension.
- Không lưu giá trị credential; cấu hình hiện tại đã được lưu qua `cfg://modelRoles/save` sau lựa chọn của người dùng.
- Chưa chứng minh `ExtensionContext` có callback judge chính thức; native `eval` helpers không tự cấp API đó cho extension.
- Chưa xác minh nội dung URL images TypeSafe do HTTP 404 trong phiên; không dùng trang đó để claim capability.
