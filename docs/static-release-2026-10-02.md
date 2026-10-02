# 国赛静态前端发布（更新于 2026-10-03）

## 范围

- 同步 main v6.3 的事实核验、缓存、缺失值展示、来源说明和国赛预置演示。
- 保留既有静态详情地址 `/matches/?id=...`、`/hot-topics/?id=...`，不加入动态 Next.js API 路由。
- 在读取比赛 ID 前不请求赛事或自动分析；访客默认使用服务器 AI，不需要填写共享口令或个人 Key。
- 服务器模型 Key 不包含在静态文件中。公共 AI 调用会消耗服务器额度，保留缓存、请求合并与调用保护。
- 升级为 main 已验证的 Next.js 15.5.27 / React 19.3.0 依赖；Node.js 22 构建。

## 发布顺序

1. 将静态前端修改合并到 `competition-static`；`Competition static build` 运行回归、构建和静态资源检查，保存 `worldcup-v6.3-static-site` 产物。
2. 仓库变量 `CLOUDBASE_FRONTEND_AUTO_DEPLOY=true` 时，构建成功自动触发 main 上的 `CloudBase Frontend Release`。首次验证前保持关闭；也可在 main 手动选择 `deploy`。
3. 保留 `cloudbase-production` 正常审批。发布流程确认原站点路由、目标存储桶及最新提交，先保存覆盖文件的加密备份，再上传资源、页面和版本标记。
4. 发布流程逐文件核对 SHA-256，并从原产品网址读取 `frontend-release.json` 校验版本。验收通过才算网站更新，不以构建成功代替发布成功。
5. 后端仍从 main 独立发布，不因前端更新而改动业务 Key 或 API 路由。正常发布不需要下载 ZIP 再到控制台上传。

## 边界

此分支只构建并保存静态产物，不接触托管上传凭据；上传由 main 的受保护工作流处理，凭据保存在 GitHub 加密配置中。旧哈希资源保留，不删除存储桶或改动授权策略。配置和备份说明见 [前端发布指南](https://github.com/l2223966318-beep/worldcup-copilot2/blob/main/docs/cloudbase-frontend-release.md)。

首次授权需针对真实托管位置配置 TCB 读取及 COS 文件读取、上传权限。创建策略不等于关联用户，必须绑定到实际部署子用户。策略核对时不发送 SecretId 或 SecretKey。

版本与文件校验不代替实际设备的视觉、交互及国内网络访问验证。

已通过本地静态构建与路由检查；其他测试和线上结果以本次执行记录为准，不把历史案例称为实时数据。
