# worldcup-api-proxy

CloudBase HTTP 云函数代理层。

控制台创建：
- 类型：HTTP 云函数
- 运行时：Node.js 18.x
- 上传 ZIP 时，ZIP 根目录直接包含 index.js、package.json、scf_bootstrap
- 超时：60 秒
- 内存：128MB 或 256MB

HTTP 网关：
- 路由：/api
- 资源类型：云函数
- 资源对象：worldcup-api-proxy
- 路径透传：开启
- 身份认证：关闭

可选环境变量：
- VERCEL_API_ORIGIN=https://worldcup-copilot2.vercel.app
- UPSTREAM_TIMEOUT_MS=30000
