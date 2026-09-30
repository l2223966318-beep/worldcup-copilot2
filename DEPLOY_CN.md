# 中国大陆网络环境部署方案

这套部署方式的目标不是依赖 Vercel，而是让 WorldCup Copilot 可以部署到一台普通 Linux 云服务器。

推荐两阶段：

1. 决赛前：优先部署到腾讯云/阿里云中国香港节点。无需 ICP 备案，国内浏览器可直接访问，适合快速上线。
2. 长期版本：完成 ICP 备案后再迁移到中国大陆节点，并接入大陆 CDN/EdgeOne。

## 1. 服务器要求

推荐：
- Ubuntu 22.04/24.04 或厂商 Docker 镜像
- 2 核 2 GB 起步
- 20 GB 磁盘以上
- 开放 TCP 22、80、443
- 中国香港节点可先不备案

## 2. 安装 Docker

如果购买的是带 Docker 的应用镜像可跳过。

Ubuntu 示例：

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

重新登录 SSH 后检查：

```bash
docker --version
docker compose version
```

## 3. 拉取代码

```bash
git clone -b china-deploy https://github.com/l2223966318-beep/worldcup-copilot2.git
cd worldcup-copilot2
```

## 4. 配置运行环境

```bash
cp .env.deploy.example .env.runtime
```

按需填写 `.env.runtime` 中的 API Key。比赛现场为了可靠性，即使外部数据源不可用，项目仍保留本地示例/回退数据。

配置域名：

```bash
cat > .env <<'EOF'
DOMAIN=worldcupcopilot.cn
EOF
```

如果域名还没买或 DNS 尚未生效，可以先用服务器 IP 测试应用容器。

## 5. 启动

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f --tail=100
```

健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

注意：默认 compose 中应用端口只暴露给 Caddy；若要直接在服务器本机测试，可使用：

```bash
docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(console.log)"
```

## 6. 域名 DNS

在域名服务商处添加：

- 主机记录：@
- 类型：A
- 值：中国香港服务器公网 IP

可选再添加：

- 主机记录：www
- 类型：CNAME
- 值：worldcupcopilot.cn

DNS 生效后，Caddy 会自动申请 HTTPS 证书并反向代理到 Next.js。

## 7. 决赛前检查

至少用以下网络各测一次：
- 中国移动 4G/5G
- 中国联通 4G/5G
- 中国电信 4G/5G
- 酒店/学校 Wi-Fi

重点检查：
- 首页首次打开时间
- 赛事列表
- 比赛详情页
- AI 内容生成
- 热点页
- Word/Markdown 导出
- /api/health

## 8. 现场兜底

不要让答辩依赖单一外部 API。

建议：
- 保留当前本地示例数据和 fallback
- 答辩前一天完成一次完整演示路径
- 准备浏览器已打开页面作为二级兜底
- 同时准备本地运行版本：`npm ci && npm run dev`

## 为什么这个项目适合直接迁移

当前项目是标准 Next.js 14 App Router，服务端 API 由 `app/api` 提供；外部世界杯数据、DeepSeek、Tavily 等都从服务端请求，前端无需直接连接这些海外/第三方 API。迁移到香港或大陆服务器后，浏览器只需要访问你自己的域名。

仓库中原有的 World Cup 服务还包含缓存与本地 fallback，因此真正需要改造的重点是部署层，而不是重写业务代码。
