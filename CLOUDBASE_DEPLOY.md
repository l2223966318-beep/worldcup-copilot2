# CloudBase 零服务器部署（国赛版）

本项目已经适配 CloudBase 云托管，推荐使用 **云托管 + Dockerfile**，原因：

- 支持 Next.js 14 App Router、SSR 和 `app/api/*`。
- 仓库含约 36 MB 的首页视频，CloudBase 云函数普通代码包有 50 MB 限制；云托管本地代码包限制更宽松，更适合本项目。
- 不需要自购 VPS，也不需要 Nginx/Caddy 运维。
- 可以直接获得腾讯云默认公网域名，先不购买自定义域名也能答辩。

## 控制台部署（推荐）

1. 登录腾讯云并创建 CloudBase 免费环境。
2. 进入该环境的「云托管」。
3. 新建服务，服务名建议：`worldcup-copilot`。
4. 选择「通过 Git 仓库部署」。
5. 仓库：
   `l2223966318-beep/worldcup-copilot2`
6. 分支：
   `china-deploy`
7. 构建方式：Dockerfile。
8. Dockerfile 路径：`Dockerfile`。
9. 服务端口：`3000`。
10. 开启公网访问。
11. 第一次先不配置任何 API Key，确认首页、示例比赛和本地 fallback 能完整跑通。

部署完成后，CloudBase 会给出默认公网访问域名。把这个域名作为国赛在线入口。

## 环境变量

需要真实 AI / 实时数据时，再在 CloudBase 服务配置中添加：

- `DEEPSEEK_API_KEY`
- `SPORTRADAR_API_KEY`（必填，腾讯云切到 Sportradar 真数据只需要这一项）
- `SPORTRADAR_WORLD_CUP_COMPETITION_ID`（可选覆盖；默认 `sr:competition:16`）
- `SPORTRADAR_WORLD_CUP_SEASON_ID`（可选覆盖；默认 `sr:season:101177`）
- `TAVILY_API_KEY`
- 其他热点源 Key

不要把真实 Key 提交到 GitHub。

配置并重新部署后，可访问 `/api/source-debug` 检查 Sportradar 是否成功连接，再访问 `/api/worldcup/fixtures` 验证世界杯赛程/结果是否来自真实数据源。

## 国赛现场建议

主入口：CloudBase 默认域名。

兜底：答辩电脑本地运行。

```bash
npm ci
npm run dev
```

浏览器打开：

```text
http://localhost:3000
```

项目已有本地示例数据和外部 API fallback，所以核心演示不应依赖单一第三方服务。
