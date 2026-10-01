# GitHub 管理腾讯云后端

## 这次完成了什么

已准备完整 v6.1 后端、离线回归测试、打包脚本和手动发布流程。以后可以先在 GitHub 审阅代码，再通过 Actions 发布到原函数，不必反复手工复制 index.js。

**这不是上线完成。** 当前浏览器控制台访问被安全检查拒绝，本次没有绕过限制，没有执行腾讯云登录、备份、更新或线上验证。正式发布需要另行建立并批准部署权限；一个环境变量不构成权限授权。

固定目标：上海 / `scti-test-2026-d6g3udtld9f8e08f5` / `worldcup-api-proxy1`。仅更新 `$LATEST` 的代码，不修改函数密钥、运行时、HTTP 路由、触发器或别名。若路由指向已发布版本或别名，更新 `$LATEST` 不会自动切换路由，需要先由管理员核对。

发布前会通过 GetFunction 的 Environment.Variables 核对配置，不打印变量值、不探测付费数据源。无法读取完整变量列表时停止；已启用 SPORTRADAR_API_KEY 时，必须显式配置 SPORTRADAR_WORLD_CUP_SEASON_ID，格式为 sr:season:数字。缺失、空白或格式错误都会在下载备份和更新代码之前停止。此检查只确认配置存在和格式，不证明赛季属于世界杯，也不证明上游账户有访问权限；管理员仍需核对赛季来源。没有配置 Sportradar 密钥的备用数据模式保持可用。

## 首次接通需要管理员操作

1. 在 `l2223966318-beep/worldcup-copilot2` 审阅并合并发布流程 PR。工作流必须位于默认分支才能从 Actions 页面手动运行。不要把本地其他演示改动一起覆盖到网站分支。
2. 打开仓库 Settings > Environments，创建 `cloudbase-production`。先设置 Required reviewers 和仅允许 `main` 发布，再配置部署凭据。**仅在 YAML 写 environment 名称并不会自动建立审批保护。** 如果账户无法设置保护，不要配置正式发布凭据。
3. 经独立授权后，使用腾讯云专用子账号或临时凭据，仅允许 `scf:GetFunction`、`scf:GetFunctionAddress`、`scf:UpdateFunctionCode` 三项操作，不附加管理员、SCF 全权限或其他预设宽权限策略。官方 CAM 权限表将这些 SCF 接口列为操作级权限，使用 `resource: ["*"]` 可能覆盖账号下所有 SCF 函数，不能宣称凭据只对原环境或单个函数有效。原环境和函数锁定仅由本项目脚本实施；管理员必须明确接受云端授权范围，否则先调整部署方案，不创建或关联该策略。不要使用主账号全权限 Key，也不要把 Key 发进聊天或提交源码。
4. 在该 GitHub Environment 的 Secrets 保存 `TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY`；临时凭据另存 `TENCENTCLOUD_SESSION_TOKEN`。保存 `CLOUDBASE_BACKUP_KEY`：管理员自行生成的随机 32 字节密钥，标准 Base64 编码，并在私有密码库另存一份。它用于加密线上代码备份，丢失后无法恢复备份。
5. 只有部署权限已正式批准且上述保护已配置，才在 Environment 的 Variables 设置 `CLOUDBASE_RELEASE_AUTHORIZED=true`。此开关只是额外防误操作，不能解除平台安全拒绝。DeepSeek、Sportradar 等业务 Key 仍保留在原腾讯云函数环境变量中，不转存到此流程。

## 日常流程

1. 修改代码并审阅 PR，不会自动发布腾讯云。工作流仅支持 `workflow_dispatch`，没有 push 或 PR 自动发布触发器。
2. Actions > CloudBase Backend Release > Run workflow，选择 `main`，先保持 `dry_run=true`。验证后端、打包、模拟请求与启动测试、前端构建，并提供候选 ZIP；**不会调用腾讯云 API**。
3. 核对候选包和权限后，才可另行运行 `dry_run=false`，确认框准确填写 `worldcup-api-proxy1`，等待 Environment 审批。不是在本次受限会话中执行这个步骤。
4. 正式流程先下载当前线上代码并加密保存，再更新代码，最后检查四个被动健康接口和版本 `direct-v6.1-complete`。备份下载或保存失败会停止更新；验收失败会保留加密备份，不自动回滚覆盖其他人的改动。
5. 被动健康检查不调用付费模型或 Sportradar。检查通过只证明新版本路由和诊断结构可用，不证明真实数据、订阅权限、生成质量正常；即使 Key 未配置也可能通过结构检查。正式上线仍需经授权核验赛事、热点、分析、生成、审核的实际业务和来源标签。

## 本地离线检查

在项目根目录运行，先安装项目原有依赖：

```powershell
npm.cmd run build:cloudbase-sports
python scripts/package-cloudbase.py --current-only
npm.cmd run test:cloudbase-release
node scripts/test-cloudbase-workflow.mjs
npm.cmd run preview:cloudbase-release
```

预览输出应为 `mode=preview` 和 `networkCalls=0`。此命令不要求云凭据。正式 SDK 位于 `scripts/cloudbase-deploy`，与网站和函数运行时依赖隔离，版本通过独立 lockfile 固定。

## 备份与失败处理

候选 ZIP 保留 7 天；正式发布的 `encrypted-live-backup-*` artifact 保留 30 天，仅包含 `.zip.enc`，不上传明文线上源码。管理员应及时归档加密备份及密钥到各自的私有位置。

`scripts/release-cloudbase.mjs` 导出 `decryptBackup(bytes, keyText)`，可在本地离线解密备份。恢复需要管理员核对备份版本、当前运行状态和路由后，另行批准上传原函数。不要用历史 v5 包替代发布前的真实线上备份；代码 ZIP 不包含环境变量、路由及运行时配置，这些需管理员另行保管。

本次仅以模拟 SDK/HTTP 验证发布步骤，尚未验证真实 CloudBase 对 SCF SDK 的访问权限和下载地址。如果目标类型、权限、版本或健康检查不符，流程会停止，不能据此宣称已经发布成功。

参考：[SCF CAM 权限表](https://cloud.tencent.com/document/product/598/70005)、[腾讯云代码更新接口](https://cloud.tencent.com/document/api/583/18581)、[代码下载接口](https://cloud.tencent.com/document/product/583/37164)、[GitHub 环境保护](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)。
