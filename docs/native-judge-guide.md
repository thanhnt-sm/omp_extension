# Hướng dẫn Judge bản địa OMP (OMP Native Judge Guide)

## 1. Mục đích và ranh giới

Judge bản địa (native judge) là judgment API do OMP quản lý qua role `judge`. OMP chọn model/provider, credential, request, usage, cache và candidate chain; tác tử gọi helper `judge()` hoặc `judgeBatch`/`judge_batch` trong `eval` cho các phán đoán nhỏ, typed và không có side effect.

Đường này **khác** với HTTP path của `omp_extension`. Smoke native không chứng minh extension đã migrate, không xóa HTTP client riêng, không tạo callback `judge` cho `ExtensionContext`, và không biến output của `eval` thành Advisor receipt hoặc native todo approval. M/H policy hiện tại không đổi: **M unchanged; H shadow-only**.

Các hướng dẫn trong tài liệu này không yêu cầu bật mọi backend. Chỉ cần candidate native phù hợp trong role `judge`, credential resolution của OMP, và host/version có hỗ trợ surface cần dùng.

## 2. Hợp đồng phán đoán

### 2.1 State và câu hỏi

`judge(state, questions)` nhận state JSON không rỗng dạng string, object hoặc array. Mỗi request có thể có nhiều câu hỏi độc lập cùng nhìn một state:

- `choice`: chọn một nhãn trong `criteria`; kết quả native có nhãn được chọn, probabilities và confidence.
- `bool` trong OMP: xác suất điều kiện đúng nằm ở trường `.bool`, **không phải primitive boolean**.
- `noul` trong TypeSafe: khái niệm yes/no tương ứng; adapter không được tự đánh đồng field `.noul` với `.bool` nếu chưa chuyển đổi có chủ đích.
- `score`: chọn theo các level có thứ tự; kết quả có score và probabilities.
- `box`: thư viện upstream có định vị vật thể trong ảnh, nhưng bridge `eval` của bản đang kiểm chứng **từ chối** kiểu này; không dùng ví dụ Box như API eval hiện có.

Giữ control flow, side effects, quyền phê duyệt và quyết định todo ở code/host. Judge chỉ trả tín hiệu structured judgment; không tự thực hiện plan, không làm Advisor, không cấp human approval.

Ví dụ shape (minh họa hợp đồng, **chưa thực thi trong task này**):

```js
const answers = await judge(
  { candidate: "...", constraints: ["..."] },
  {
    route: {
      type: "choice",
      instructions: "Chọn route phù hợp nhất",
      criteria: { keep: "Giữ nguyên", revise: "Cần sửa" },
    },
    safe: {
      type: "bool",
      instructions: "State có đáp ứng điều kiện an toàn không?",
    },
    quality: {
      type: "score",
      instructions: "Chấm chất lượng theo level",
      criteria: ["thấp", "đạt", "tốt"],
    },
  },
);
```

### 2.2 Batch
Với nhiều state dùng cùng rubric, dùng host-owned `judge_batch` (Python) hoặc `judgeBatch` (JavaScript).

Hợp đồng API JavaScript trong môi trường `eval`:
```js
const batchHandle = await judgeBatch(items, questions);
const results = await batchHandle.results(); // Trả về Record<string, QuestionResults> theo index "0", "1", ...
```
*Lưu ý:* `batchHandle` không phải stream trực tiếp và không dùng qua helper `output(id)`; kết quả lấy qua phương thức `await batchHandle.results()`.

Không coi một item pass là parent integration pass. Không che lỗi item bằng synthetic answer; ghi rõ item error và fail-closed khi kết quả bắt buộc nhưng backend không khả dụng.
### 2.3 Text và one-hot

Text bridge render câu hỏi thành prompt keyword cho chat model. Khi parse thành công, output là one-hot: nhãn/level được chọn có xác suất `1`, phần còn lại `0`, confidence `1`. Đây không phải calibrated native distribution và không được gán nhãn là output Jev native.

Sau native candidate đầu tiên, source OMP hiện tại giữ native-only tail trong role chain: native failure không âm thầm rơi sang prompted chat để giả lập xác suất native. Nếu host/version đang chạy có behavior khác, phải kiểm tra source/runtime trước khi dựa vào nó. Đừng tự dựng extension HTTP fallback hoặc silent downgrade.

## 3. Cấu hình role Jev

Role native đã được lưu trong phiên nghiên cứu là `typesafe/jev-1.14.0`; OMP version thực tế được ghi nhận là `18.13.2`. Đây là **session observations**, không phải mặc định cho mọi profile hoặc mọi máy.

OMP quản lý model role, provider, auth và endpoint. Trước khi sửa:

1. Xác định config path/profile hiệu lực bằng cơ chế host được phép.
2. Khám phá `omp config --help` trước khi chọn profile; không hardcode một cú pháp chưa được host công bố.
3. Chỉ thay role nếu native probe thất bại vì cấu hình và có backup rõ ràng.
4. Không ghi credential vào repo, docs, transcript, artifact hoặc lệnh shell.
5. Không đọc raw config chứa secret, không sửa global proxy, không dùng `.claude/.ck.json` để thay native OMP auth.

Không cần enable tất cả backend. Candidate chain nên tối thiểu và có chủ đích; native Jev cần role/candidate judgment API tương thích, không chỉ một model chat có tên gần giống.

## 4. Setup tool an toàn

Workspace cung cấp setup tool native judge với contract sau:

```text
--check                 mặc định; chỉ kiểm tra và báo safe metadata
--apply                 yêu cầu ghi cấu hình theo phạm vi tool cho phép
--config <path>         chọn config path tường minh
```

Quy tắc vận hành:

- Bắt đầu bằng `--check`; không coi check là đã apply.
- Chỉ dùng `--apply` khi đã xác định đúng config path và đã có backup cần thiết.
- `--config <path>` phải trỏ tới config được người vận hành cho phép; không đưa raw credential vào argument hoặc file repo.
- Tool chỉ được đọc/ghi safe metadata theo contract; giá trị credential không được echo.
- Credential chỉ được tham chiếu bằng tên biến `TYPESAFE_API_KEY`; tuyệt đối không in giá trị hoặc dump environment.
- Profile selection qua `omp config` phải dựa trên help discovery của host. **Chưa thực thi** profile selection trong task này.

Setup tool không thay thế `tools/sync-baseline.cjs`. Setup/config backup phục vụ role/auth/configuration rollback; sync-baseline phục vụ đồng bộ workspace/deployment artifacts theo workflow riêng. Không dùng sync như backup credential và không dùng backup như deploy.

### 4.1 Cài lại và khởi chạy ưu tiên judge (judge-first)

Yêu cầu có `omp`, Node.js và Bun hỗ trợ `Bun.YAML` trên `PATH`; công cụ đã được thử với OMP `18.13.2`, Bun `1.4.0`. Repo không tự cài OMP hoặc credential. Chọn tệp cấu hình của profile cần dùng, không sao chép toàn bộ cấu hình máy cũ.

```sh
bun tools/native-judge-setup.cjs --check --config <config.yml>
bun tools/native-judge-setup.cjs --apply --config <config.yml>
node tools/native-judge-launch.cjs --dry-run --profile <profile>
node tools/native-judge-launch.cjs --profile <profile>
```

Nếu dùng profile mặc định, bỏ cặp `--profile <profile>`. Các lệnh tương ứng qua package là `bun run judge:check -- --config <config.yml>`, `bun run judge:apply -- --config <config.yml>`, `bun run judge:start`. Công cụ apply tạo backup byte gốc cạnh cấu hình khi có thay đổi; đã đúng model thì không ghi. YAML được serialize lại nên comment/định dạng không được giữ; các giá trị khác được giữ. Không commit backup có dữ liệu riêng tư.

Launcher nạp `tools/native-judge-policy.txt` qua `--append-system-prompt`, tìm tệp tương đối với chính script nên có thể chuyển checkout sang máy khác. Đây là chính sách nhắc lệnh tự nguyện (opt-in prompt policy), **không phải khóa cưỡng chế của host** và không tác động phiên mở bằng `omp` trực tiếp. Không thêm một cờ global “judge every eval”: host không công bố cờ đó.

Chính sách ưu tiên judge cho mọi quyết định ngữ nghĩa nhỏ còn bất định: phân loại, định tuyến, xếp hạng, đánh giá chất lượng. Phép tính, schema, so sánh xác định và I/O giữ bằng code. Nhiều câu hỏi độc lập cùng state gom một request; nhiều state dùng batch, giới hạn đồng thời 4 và retry item 0 làm lựa chọn bảo thủ của launcher, không phải mặc định OMP. Không ép thêm cuộc gọi khi không có bất định hoặc cần quyết định có thẩm quyền.

Lưu ý setup này chỉ ghim model role. Nó không chép provider, key, skills, lịch sử, callback extension hoặc toàn bộ host từ máy cũ. Xem [kiểm toán khả năng chuyển máy](reinstall-portability-audit.md) trước khi đồng bộ extension.


## 5. Smoke và cách đọc kết quả

Chỉ chạy smoke sau khi đã dùng state không nhạy cảm, xác định role hiệu lực và có log/metadata host đủ để biết backend. Kết quả đúng về nội dung nhưng không có provenance vẫn là thiếu bằng chứng backend.

Các observations được ghi nhận từ phiên trước:

| Smoke | Kết quả quan sát được | Cách diễn giải đúng |
|---|---|---|
| Native choice | `blue` | Native smoke cụ thể; không phải guarantee mọi state |
| Native typed bool | `1` | Xác suất/typed output; không đổi thành primitive boolean khi chưa adapter |
| Native score | `1` | Score của smoke cụ thể |
| Batch | even `.99`, odd `.01`; backend `typesafe/jev-1.14.0`; cost `.000023268` | Cost/probability của batch cụ thể |
| Batch sau ghim phiên bản | `12` chia hết cho `3`: `1`; `13` không chia hết cho `3`: `.01`; chi phí `.000023688` | Không suy rộng thành bảo đảm hiệu chuẩn (calibration) |

Các observations trên không phải command được chạy lại trong task viết docs. Không có executable result mới được phát minh ở đây.

## 6. Privacy, cost, cache

- **Privacy:** state/questions/images có thể gửi tới backend của role. Redact dữ liệu nhạy cảm và dùng fixture không nhạy cảm cho smoke. Không gửi key trong state.
- **Cost:** native attempt có usage/cost theo host/provider. Batch cost phụ thuộc request và model; không hardcode các số smoke làm giá chung.
- **Cache:** OMP có judgment answer cache/usage ledger theo source hiện tại. Cache hit không nên bị tính như upstream billed attempt; chi tiết cache identity/TTL phụ thuộc host/version và chưa benchmark trong task này.
- **Retry:** transport retry và semantic retry là khác nhau. Không lặp lại semantic rejection với cùng evidence; không hạ threshold để ép pass.
- **Images:** native image support có bounds/capability riêng. Box/images được tài liệu TypeSafe đánh dấu experimental/dreamer-ready; không dùng production guarantee nếu chưa kiểm tra model/version.

## 7. Box và images

Box cần image, trả edges `top`, `bottom`, `left`, `right` theo fraction và confidence; Box không có câu trả lời “not found”. Nếu absence quan trọng, ghép câu hỏi yes/no tương ứng và bỏ qua Box khi kết quả absence thấp. Text judge không trả lời Box.

`BoxQuestion.image` là index cục bộ vào `request.images`; `image` không được gửi như field wire thay thế cho ảnh. Instructions phải nêu target và ảnh cần tìm nếu có nhiều ảnh. Header/transport image và limits do native backend quyết định.

Trang Box là tham chiếu thư viện, không là hỗ trợ bridge. Parent đã gửi PNG tổng hợp 560×560 có hình vuông đỏ: bool `.98`, choice `square`, backend `typesafe/jev-1.14.0`, chi phí `$0.000049938`. Gọi lại cùng request để kiểm cache trả cùng kết quả, chi phí host báo `0`. Thử `type: "box"` bị bridge từ chối trước khi gọi provider.
## 8. Quy trình fallback và lỗi

1. Xác định candidate chain và backend native trước request.
2. Nếu native candidate không khả dụng, giữ trạng thái `UNAVAILABLE`/lỗi host đúng nguyên nhân; không tổng hợp xác suất giả.
3. Chỉ dùng native-only fallback giữa native candidates theo behavior của host. Không chuyển ngầm sang text one-hot sau khi đã chọn native path.
4. Extension HTTP path vẫn là boundary riêng; không gọi nó là native fallback.
5. Không coi `ONLINE`/transport success là semantic approval, không dùng judge output làm AdvisorReceipt, human approval, hay todo completion.

Nếu credential/provider/profile không được chứng minh, dừng với trạng thái thiếu bằng chứng phù hợp thay vì đoán role hoặc endpoint.

## 9. Cài lại (reinstall) và rollback

Trước reinstall/config mutation:

- Tạo backup explicit của config path được chọn, không commit backup có secret.
- Ghi nhận safe metadata: OMP version, role/model id, profile name nếu host cho phép, và digest/đường dẫn backup không nhạy cảm.
- Dùng setup tool `--check` để so sánh trước; `--apply` chỉ khi thay đổi đã được review.
- Sau thay đổi, kiểm tra role/capability bằng cơ chế host và smoke không nhạy cảm; nếu provenance không rõ thì ghi `BACKEND_UNVERIFIED`/`UNAVAILABLE`.
- Rollback bằng backup cấu hình hoặc transaction workflow tương ứng; không sửa global proxy trực tiếp.

Reinstall OMP và sync extension là hai lifecycle khác nhau. `tools/sync-baseline.cjs`/workflow sync hiện có chỉ xử lý phạm vi artifact/deployment của extension theo contract riêng; nó không backup hoặc rotate `TYPESAFE_API_KEY`, không chọn thay profile native, và không chứng minh native judge hoạt động.

## 10. Trạng thái kiểm chứng thực tế

- `bun test tests/native-judge-setup.test.ts`: 7 pass, 0 fail, 32 assertions sau khi kiểm tra mismatch exit code và bảo toàn giá trị YAML.
- `bun tools/native-judge-setup.cjs --check --config C:/Users/thant/.omp/agent/config.yml`: judge `typesafe/jev-1.14.0`, `match: yes`.
- Native choice/bool/score, batch, ảnh tổng hợp và cache đã chạy qua host thật. State rỗng, choice một nhãn và Box bị từ chối bằng lỗi cụ thể.
- Chưa kiểm định độ chính xác (accuracy/calibration) trên tập dữ liệu chuẩn, lỗi provider thật hoặc bridge extension. Không tuyên bố đã khám phá mọi khả năng upstream tương lai.
- Nguồn và giới hạn: [nhật ký nghiên cứu](research/omp-judge-sources.md).

## 11. Đối chiếu thực hành khuyến nghị (Best-Practice Audit)

Tài liệu [OMP eval](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/eval.md) và [OMP model/provider](https://github.com/can1357/oh-my-pi/blob/main/docs/models.md) xác nhận role `judge`, helper typed và batch do host quản lý. Kiểm tra mới trong phiên rà soát: OMP `18.13.2`, role trên đĩa `typesafe/jev-1.14.0`; native batch hai state hoàn tất, không lỗi, metadata model `typesafe/jev-1.14.0`. Đây là bằng chứng request cụ thể, không phải phê duyệt nhiệm vụ hay kiểm định hiệu chuẩn (Calibration).

Theo [TypeSafe: cách xây dựng với System One](https://docs.typesafe.ai/concepts/how-to-build-with-system-one), giữ code kiểm soát luồng và side effect; câu hỏi hẹp, typed, state liên quan tối thiểu; hỏi độc lập cùng state trong một request. Không gọi judge cho mọi phép tính hoặc mọi `eval` một cách máy móc. Theo [TypeSafe confidence](https://docs.typesafe.ai/confidence), xác suất và confidence khác nhau; ngưỡng phải kiểm định bằng dữ liệu miền ứng dụng, không lấy ví dụ trong docs làm ngưỡng production.

**Giới hạn chưa sửa:** extension vẫn gọi `typesafe-policy-client.cjs` và HTTP riêng qua `src/semantic-judge-client.ts`/`typesafe-planner.ts`, còn các công cụ semantic `typesafe_*`. Activation đã tách sang `~/.omp/agent/typesafe.json`, không đọc cấu hình Claude. Native role đúng không làm các caller HTTP tự di chuyển. `ExtensionContext` upstream được rà soát chưa công bố callback judge; không được tự thêm `ctx.judge` rồi tuyên bố là API host.

Biểu điểm M hiện được giữ nguyên theo hợp đồng; không tuyên bố đã đạt thiết kế nguyên tử đầy đủ (Atomic Design) chỉ vì có H. H vẫn là ứng viên quan sát (Shadow Candidate) cho đến xác nhận độc lập trên tập giữ lại của con người (Independent Human Holdout Adoption). Không tự sửa ngưỡng, rubric, cách tổng hợp hoặc xác suất để phù hợp một ví dụ tài liệu.

Đã khôi phục bind bằng transport chuẩn `xd://typesafe_bind_task`: host loại metadata `i` trước execute nhưng lịch sử còn trường đó, gây digest mismatch. Source đã sửa join chỉ bỏ qua đúng metadata này khi cần; thay đổi `task`/`phase` vẫn bị từ chối. Smoke native todo trên `18.13.2` đã chứng minh chặn completion chưa được duyệt và giữ nguyên nghĩa vụ; không phải bằng chứng completion đã được phê duyệt.

### Tương thích định danh tiến trình con trên OMP `18.13.3` (Allocated Child Identity Compatibility)

Binary được quan sát ở lượt tiếp tục là `18.13.3`. [Source đúng tag](https://github.com/can1357/oh-my-pi/blob/v18.13.3/packages/coding-agent/src/task/structured-subagent.ts) ưu tiên `identity.id`, tiếp theo `identity.label`, rồi mới `parentToolCallId:index` cho `spawnKey`. Adapter Advisor không được bắt buộc chỉ dạng fallback. Source workspace đã giữ observation trong dispatch frame và kiểm ID child thật khi route; vẫn kiểm parent/session/epoch/prompt và chỉ cho một spawn. Sáu module liên quan đạt 58 test; smoke điều khiển xác nhận ID được cấp phát hợp lệ tạo review, ID sai không gọi provider hoặc tạo receipt. Đây chưa là native Advisor receipt live; cần kiểm hành vi từ bản triển khai mới trước khi đóng todo.

Khi chuyển descriptor giữa công cụ, giữ nguyên structured result trong bộ nhớ, không chép `reviewHandle` từ output đã redacted. Chuyển nguyên `details.advisor.parameters` chỉ tránh sai lệch khi hiển thị; không bỏ các bước xác minh native dispatch hoặc cấp quyền completion.

