# 前端安全升级记录

验证日期：2026-10-01。代码候选版本，不代表线上已经更新。

## 改动

- Next.js 14.2.16 升级到 15.5.27，配套 eslint-config-next 同步升级。版本选择依据：[官方安全更新](https://nextjs.org/blog/september-2026-security-release)。
- React / React DOM 同步升级到 19.3.0，类型包更新到 React 19；现有 Recharts 2.15.4 支持这一版本。
- 更新 PostCSS 到 8.5.28，并只覆盖 Next.js 内部的旧 PostCSS 依赖；间接依赖补丁通过普通 npm audit fix 更新，没有使用 force 或 legacy-peer-deps。
- 赛事详情 GET 接口按 [官方迁移说明](https://nextjs.org/docs/app/guides/upgrading/version-15) 等待异步 params，防止比赛 ID 丢失。
- 本机 Windows C 盘工作目录映射到 E 盘。直接 next start 曾返回 500；从真实路径启动返回 200。run-next.mjs 统一真实工作目录，保留普通 npm run dev / build / start 用法。
- 新增只读 GitHub PR 检查：安装、漏洞检查、lint、build、页面 HTTP 检查和 19 组前端回归。没有发布步骤、部署环境或 secrets 引用。

## 验证

- 原工作目录：全部 29 组非浏览器测试通过，包含新增异步参数和 HTTP 检查；额外发布工作流检查通过，完整构建和 lint 通过。
- 独立副本：从公开 GitHub main 15316bcf6052d0309e79916f0dbb2ce840cad890 的文件清单核对源文件，替换本机不同的首页、答辩页等无关改动，再覆盖本次升级文件。没有复制本机 .env、额外 demo 页面或其脚本。
- 独立副本 npm ci 重装成功，19 组前端回归、生产构建和 lint 通过。npm audit 包含开发依赖，已知漏洞为 0。
- HTTP 检查：5 个页面返回 200，48 个脚本/样式资源可读取，4 张材料图片可读取，开屏视频 Range 请求返回 206、1024 字节。
- 请求只发往临时本机服务器的页面和静态资源，不请求业务 API；测试结束关闭服务器。

## 限制

- 浏览器控制工具权限检查此前失败，未绕过限制。因此没有验证真实浏览器 hydration、点击交互、图表绘制、桌面/手机截图或视频自动播放。
- 独立副本刻意不包含 .env 配置，不能代替正式部署环境的配置验收。
- npm audit 的 0 仅表示当日漏洞库未报告当前依赖存在已知漏洞，不代表整个产品无安全风险。
- ESLint 8、Recharts 2 和 next lint 存在维护/弃用提示，本次不做额外大版本重构。后续升级应单独验证图表、lint 配置和交互。
- 腾讯云代码更新和前端正式发布仍需原有审批，本次不执行。
