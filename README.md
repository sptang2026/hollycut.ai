# Hollywood Cut

生成电影片场合影的 React + Vite 应用。正式站点：https://hollycut-ai.vercel.app/

## 本机直接启动

需要 Node.js 22.18+（推荐 Node.js 24）。在本机项目文件夹双击 **启动 Hollycut.command**，或运行：

```sh
npm ci
npm start
```

启动后自动打开 http://127.0.0.1:3000。浏览器直接进入主页面，服务端代理读取 `.env.local` 的 `KIE_API_KEY`。本机密钥已单独配置，不随 Git 同步。

其他电脑首次使用时，将 `.env.example` 复制为 `.env.local` 并自行填写 Key。不要把 Key 放进 `VITE_` 变量、源码、截图或 Git。文件应只允许当前用户读写（`chmod 600 .env.local`）。不要双击 `index.html`，页面需要本地服务提供 `/api/kie`。

仅当需要同一 Wi-Fi 下的手机访问本机服务时，运行 `npm run dev -- --host 0.0.0.0`。手机安装 PWA 请使用正式 HTTPS 地址。

## 手机 / PWA

- iPhone / iPad：Safari 打开正式站点 → 分享 → 添加到主屏幕。
- Android：Chrome 打开正式站点，点“添加到主屏幕”，或使用浏览器菜单安装。
- 首次联网打开后可离线进入页面、编辑指令。AI 生成和编辑仍需网络。
- Service Worker 只缓存打包生成的页面、脚本、样式和应用图标。API、用户照片、生成图片及第三方请求都不缓存。
- 新版本准备好后显示“更新页面”。正在生成或编辑时不可更新；更新前先保存成片。照片与成片只保留在当前页面内存，关闭或刷新页面不会恢复。
- 页面适配安全区、动态视口和触控；手机输入字号至少 16px，保留手势缩放。

## Vercel 部署与密钥

Vercel 项目 `hollycut-ai` 连接到本仓库，`main` 的推送通过 Vercel Git 集成部署。环境变量 `KIE_API_KEY` 必须以 **Sensitive** 类型配置到 Production / Preview。修改后需重新部署。

`api/kie.ts` 和本地 Vite 中间件共用服务端代理。上传文件使用唯一文件名；单次参考图大小限制 4MB。输入电影名不会自动创建付费任务。生成与编辑共享提交锁，已有成片在同一页面会话中保留。

`GET /api/kie?action=config` 仅返回 `{ "configured": true/false }`，不会返回 Key，也不代表完成了真实付费出图验证。

GitHub Actions 执行检查，GitHub Pages 已停止发布，因为静态托管无法运行私有 KIE 代理。

## 检查

```sh
npm run typecheck
npm test
npm run build
```

`npm run preview` 只预览生产前端与 PWA，不提供 KIE 代理；完整功能请使用 `npm start` 或 Vercel。

图像服务接口说明见 [docs/KIE_API.md](docs/KIE_API.md)。
