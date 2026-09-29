# worldcup-api-proxy

CloudBase HTTP 云函数，用于把静态国赛版页面的 `/api/*` 请求转发到现有 Vercel API。

推荐 CloudBase 设置：

- 函数类型：HTTP 云函数
- 运行时：Node.js 18
- 超时：60 秒
- 内存：128 MB 或 256 MB
- HTTP 网关路径：`/api`
- 开启「路径透传」
- 关闭网关鉴权（国赛公开演示）
- 环境变量（可选）：
  - `VERCEL_API_ORIGIN=https://worldcup-copilot2.vercel.app`
  - `UPSTREAM_TIMEOUT_MS=30000`

由于 HTTP 网关按最长前缀匹配，`/api` 路由会覆盖静态托管根路由 `/`，而其它页面和静态资源仍由静态托管提供。

这是过渡层：浏览器只访问腾讯 CloudBase，云函数服务器侧访问 Vercel API。后续可再把真实数据和 AI 服务直接迁入 CloudBase 云函数，彻底移除 Vercel 依赖。
