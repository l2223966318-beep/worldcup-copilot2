const http = require("node:http");

const ORIGIN = process.env.VERCEL_API_ORIGIN || "https://worldcup-copilot2.vercel.app";
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 30000);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const incomingPath = req.url || "/";
    const apiPath = incomingPath.startsWith("/api")
      ? incomingPath
      : `/api${incomingPath.startsWith("/") ? incomingPath : `/${incomingPath}`}`;
    const target = new URL(apiPath, ORIGIN);

    const headers = {};
    for (const [key, value] of Object.entries(req.headers || {})) {
      const lower = key.toLowerCase();
      if (["host", "content-length", "connection"].includes(lower)) continue;
      if (Array.isArray(value)) headers[key] = value.join(", ");
      else if (typeof value === "string") headers[key] = value;
    }
    headers.accept = headers.accept || "application/json";

    const method = (req.method || "GET").toUpperCase();
    let body;
    if (!["GET", "HEAD"].includes(method)) {
      const buffer = await readBody(req);
      if (buffer.length) body = buffer;
    }

    const upstream = await fetch(target, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect: "follow"
    });

    res.statusCode = upstream.status;
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    const cacheControl = upstream.headers.get("cache-control");
    if (cacheControl) res.setHeader("cache-control", cacheControl);
    res.setHeader("x-worldcup-api-proxy", "cloudbase");

    const payload = Buffer.from(await upstream.arrayBuffer());
    res.end(payload);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      sourceStatus: "error",
      message: controller.signal.aborted
        ? "CloudBase API proxy timed out; the client should use its local fallback."
        : "CloudBase API proxy could not reach the upstream API; the client should use its local fallback."
    }));
  } finally {
    clearTimeout(timer);
  }
});

server.listen(9000, "0.0.0.0", () => {
  console.log("WorldCup API proxy listening on port 9000");
});
