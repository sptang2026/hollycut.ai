# KIE 图像生成 API 接入文档

> 记录 hollycut.ai 项目调用 KIE (kie.ai) 图像 API 的完整用法，供日后切换/新增模型（如 gpt-image-2）参考。
> 当前线上使用 **nano-banana-2**。相关代码：`services/geminiService.ts`

---

## 1. 认证
- 所有请求头：`Authorization: Bearer <KIE_API_KEY>`
- **key 严禁写入前端代码**。本项目由服务端读取 `KIE_API_KEY`，前端通过 `/api/kie` 调用，不再要求访客输入或使用 localStorage 保存密钥。
- key 获取/重置：https://kie.ai/api-key

## 2. 基础地址
| 用途 | URL |
|------|-----|
| API 主机 | `https://api.kie.ai/api/v1` |
| 文件上传（不同主机） | `https://kieai.redpandaai.co/api/file-stream-upload` |
| 余额查询（不消耗额度） | `GET https://api.kie.ai/api/v1/chat/credit` |

## 3. 通用流程（异步任务模型）
```
[图生图才需要]上传参考图 → createTask → 拿 taskId → 轮询 recordInfo → 下载结果
```

### 3.1 上传参考图
```http
POST https://kieai.redpandaai.co/api/file-stream-upload
Content-Type: multipart/form-data
字段: file(二进制), uploadPath(任意,如"hollycut/sources"), fileName
```
响应：
```json
{ "code": 200, "data": { "downloadUrl": "https://tempfile.redpandaai.co/...", ... } }
```
⚠️ **字段是 `data.downloadUrl`，不是 `fileUrl`**（社区文档写错，已踩坑）。
URL 有效期 3 天。

### 3.2 创建任务
```http
POST https://api.kie.ai/api/v1/jobs/createTask
{ "model": "<模型名>", "input": { ... } }
```
响应 `data.taskId`。

### 3.3 轮询结果
```http
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<taskId>
```
每 3 秒一次，直到 `data.state`：
- `success` → `data.resultJson` 是**字符串**，`JSON.parse` 后取 `.resultUrls[0]`
- `fail` → `data.failMsg`
- 其他（waiting/queuing/generating）→ 继续轮询
- 结果 URL **20 分钟过期**，需及时下载

### 3.4 下载结果
`fetch(resultUrl)` → blob → base64（前端展示/保存）。

---

## 4. 模型清单

### nano-banana-2（当前线上）
单端点，**根据是否带 `image_input` 自动切换**文生图/图生图。
```json
{
  "prompt": "...",
  "image_input": ["https://..."],   // 可选；有=图生图/编辑
  "aspect_ratio": "9:16",            // 1:1|9:16|16:9|3:4|4:3|2:3|3:2|4:5|5:4|21:9|auto
  "resolution": "2K",                // 1K|2K|4K
  "output_format": "png"             // png|jpg
}
```
实测：2K 约 12 credits/张，约 28 秒出图。

### gpt-image-2（OpenAI，**待接入**）
⚠️ **与 nano-banana 字段不同**：用 `input_urls`（非 `image_input`），且需 `nsfw_checker: false`。

**文生图** — `model = gpt-image-2-text-to-image`
```json
{ "prompt": "...", "nsfw_checker": false }
```

**图生图** — `model = gpt-image-2-image-to-image`
```json
{ "prompt": "...", "input_urls": ["https://..."], "nsfw_checker": false }
```

> ⚠️ gpt-image-2 部分基于 KIE 文档，**未实测**。接入前需确认：
> - `input_urls` 字段名是否准确
> - 上传得到的 `downloadUrl` 能否被 gpt-image-2 接受
> - 支持的参数（aspect_ratio / size 等）
> - credit 消耗与出图时长

---

## 5. 关键坑（实测总结）
1. 上传返回 `downloadUrl`，**非** `fileUrl`
2. `resultJson` 是字符串，必须 `JSON.parse`
3. 结果 URL **20 分钟过期**
4. nano-banana 用 `image_input`，gpt-image-2 用 `input_urls`（字段名不同，别复用同一套 input）
5. **CORS**：KIE 反射请求 Origin，前端可直连（`hollycut-ai.vercel.app`、`landlessway.github.io` 均已验证通过）
6. 余额查询 `GET /chat/credit` 不消耗额度

---

## 6. 未来接入 gpt-image-2 的步骤
1. 先实测 `gpt-image-2-image-to-image`：用 `input_urls` + 上传的 `downloadUrl` 跑通一次
2. 在 `services/geminiService.ts` 加模型分支（按所选模型用 `image_input` 或 `input_urls`，并补 `nsfw_checker`）
3. 前端加模型选择 UI（可选）
4. 注意两个字段名差异，避免复用同一套 input 结构
