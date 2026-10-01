# CloudBase 完整恢复候选版 v6.1

版本标识：`direct-v6.1-complete`。基于用户提供的 v5 完整源码，复用仓库 Sportradar 客户端，合并本地多源热点修复，并于 2026-10-01 对照用户提供的当前 v6 index.js 补齐兼容差异。这不是从云端 API 导出的备份，也不代表已经发布或验证了真实付费调用。

## 保留与修复

- 保留热点分析、热点生成/审核、赛事分析、平台稿件、稿件审核五个 AI handler 和原业务提示词。
- 请求体限制 256 KiB，错误 JSON 返回 400、超大请求返回 413，异步业务异常返回安全的 500，不因单个请求退出进程。
- Sportradar 优先；赛事缓存 5 分钟，有进行中比赛时 60 秒，失败冷却 30 秒。失败时最多使用 30 分钟以内旧快照，并标注 `stale` 和原更新时间。
- 同一实例共享请求，今日和直播列表在配置赛季后复用全赛季缓存。请求默认间隔 1100 ms，普通 Soccer 时间线不默认请求 Soccer Extended。
- 无 Key、无赛季或源失败时可使用免费赛程；各比赛 `source.provider` 标记实际来源，不把免费或经典样例称为 Sportradar。找不到 SR 详情时返回 503 或明确的简略快照，不用另一个比赛冒充。
- 按北京时间筛选；配置赛季严格排除其他年份。点球大战结束和延期状态已修正。
- 热点接入 UAPI、DailyHot、Tavily、TopHubData、RedFox。配置型供应商没有 Key 时返回未配置，不伪装成功。每条保留供应商与来源链接。
- 热点缓存 60 秒、共享请求、过滤非足球内容、中英文队名匹配、合并重复链接。关键词匹配仍不保证每条都属于特定场次，响应标注 `team-related`。
- `/api/hot/health` 和 `/api/worldcup/health` 只看配置与最近状态，绝不调用上游；AI health 不带 `probe=1` 也不调用模型。
- 保留旧的 GET `/api/source-debug` 入口，但改为被动诊断：保留配置对象，`sportradar.attempted=false`、`ok=null`，通过 `recent` 显示最近请求的缓存结果。不会像旧版一样每次打开都探测 SR，也不返回上游原始错误或真实 Key。
- AI 模型按请求指定、`DEEPSEEK_MODEL`、`DEEPSEEK_MODEL_FAST`、默认值顺序选择；AI health 报告相同的环境配置。保留禁用 thinking、原生 JSON 输出及空结果重试。

## 打包和发布

先运行 `npm.cmd run build:cloudbase-sports`，再用 Python 执行 `scripts/package-cloudbase.py`。新包为 `deliverables/cloudbase/worldcup-api-v6.1-complete.zip`。

ZIP 根目录应有八个文件：`index.js`、`package.json`、`scf_bootstrap`、`hot-sources.js`、`sports-service.js`、`sports-payload.js`、`sportradar.js`、`beijing-time.js`。没有额外 npm 运行时依赖；启动脚本是 LF 且有 Unix 可执行权限。不要只复制 index.js，否则 require 模块缺失仍会造成启动失败。

1. 先从控制台备份**当前线上版本**，保留环境变量、HTTP 路由和运行时配置。
2. 将完整 ZIP 上传到原函数 `worldcup-api-proxy1`，不改现有路由，不新建另一个同名服务。Node.js 18+，PORT 默认 9000。
3. 保留真实密钥在函数环境变量中。完整 SR 赛程必须配置 `SPORTRADAR_API_KEY` 和 `SPORTRADAR_WORLD_CUP_SEASON_ID`；不要凭旧截图猜 Key 是否有效。变量模板见 `.env.example`，不要上传真实 .env。
   旧 v6 在没有赛季变量时硬编码 `sr:season:101177`，本候选版不继承未经确认的默认赛季。发布前必须由管理员确认并显式配置正确赛季；此流程不会自动修改环境变量。
4. 检查四个不付费的健康接口，再人工打开赛事、热点、生成、审核页面。健康成功或配置存在不能证明付费业务实际调用成功。

```powershell
npm.cmd run check:cloudbase -- https://scti-test-2026-d6g3udtld9f8e08f5-1455712258.ap-shanghai.app.tcloudbase.com
```

版本须为 `direct-v6.1-complete`。加 `--data` 才检查热点实际数据，可能消耗热点源额度。脚本不主动调用 AI 或 Sportradar。

原始 `worldcup-api-v5-rollback.zip` 只作为用户已交接源码的存档，不包含最新 SR 或多源热点；真正回退应优先使用发布前新备份的线上代码。

## 尚未解决的限制

缓存、冷却和调用间隔均按温热函数实例独立，冷启动及多实例不会共享，也不是账号总费用上限。公网 AI 仍保留原来的服务端 Key 调用方式，上线前应在网关配置鉴权、账户级限流与费用告警，不应长期无鉴权开放。

真实 Sportradar 订阅有效期、赛事覆盖和 Key 权限需要在用户账号验证；真实 DeepSeek、多源热点也尚未通过本轮付费实测。DailyHot 默认旧地址此前连接失败，需要部署后单独确认。普通赛季赛程只含基础数据，详细事件和统计依赖对应订阅覆盖。

仓库网页仍使用 Next.js 14.2.16；2026-10-01 npm audit 报告 11 个受影响依赖（含 1 个 critical）。这不是本八文件后端的运行时依赖；前端安全升级须独立验证，不能把本后端检查通过称为网页漏洞已修复。

参考：[Soccer 赛季赛程](https://developer.sportradar.com/soccer/reference/soccer-season-schedule)、[普通 Soccer 时间线](https://developer.sportradar.com/soccer/reference/soccer-sport-event-timeline)、[试用调用限制](https://developer.sportradar.com/soccer/docs/soccer-ig-tracking-standings)。
