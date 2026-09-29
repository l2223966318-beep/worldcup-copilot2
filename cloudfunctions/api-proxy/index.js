const express = require("express");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.text({ type: ["text/*"], limit: "2mb" }));

const ORIGIN = process.env.VERCEL_API_ORIGIN || "https://worldcup-copilot2.vercel.app";
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 30000);

app.use(async (req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const incomingPath = req.originalUrl || req.url || "/";
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
      if (typeof req.body === "string") {
        body = req.body;
      } else if (req.body !== undefined) {
        body = JSON.stringify(req.body);
        headers["content-type"] = headers["content-type"] || "application/json";
      }
    }

    const upstream = await fetch(target, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect: "follow"
    });

    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
    const cacheControl = upstream.headers.get("cache-control");
    const payload = Buffer.from(await upstream.arrayBuffer());

    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    if (cacheControl) res.setHeader("cache-control", cacheControl);
    res.setHeader("x-worldcup-api-proxy", "cloudbase");
    return res.send(payload);
  } catch (error) {
    const timedOut = controller.signal.aborted;
    return res.status(502).json({
      sourceStatus: "error",
      message: timedOut
        ? "CloudBase API proxy timed out; the client should use its local fallback."
        : "CloudBase API proxy could not reach the upstream API; the client should use its local fallback."
    });
  } finally {
    clearTimeout(timer);
  }
});

exports.main = app;
