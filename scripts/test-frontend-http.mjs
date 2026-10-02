import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [fileURLToPath(new URL("./run-next.mjs", import.meta.url)),
  "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
    TMP: process.env.TMP, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    DEEPSEEK_API_KEY: "test-only-key", AI_ACCESS_TOKEN: "test-only-access-token-123456789" }
});
const exited = once(child, "exit");
let logs = "";
child.stdout.on("data", value => { logs += value; });
child.stderr.on("data", value => { logs += value; });

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`Production server exited before readiness: ${logs}`);
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, `Production server must serve the homepage: ${logs}`);
  for (const path of ["/", "/pitch", "/matches/example-final", "/hot-topics/example-topic", "/settings"]) {
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.ok(html.length > 1000, `${path} must not be an empty shell`);
    assert.ok(html.includes("WorldCup Copilot"), `${path} must retain product identity`);
  }
  const manifest = JSON.parse(readFileSync(new URL("../.next/app-build-manifest.json", import.meta.url), "utf8"));
  const assets = [...new Set(Object.values(manifest.pages).flat())];
  for (const asset of assets) {
    const response = await fetch(`${origin}/_next/${asset}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, asset);
    await response.arrayBuffer();
  }
  for (const name of ["background-hot-daily", "background-bilibili-cases", "background-volume-trend", "background-content-mix"]) {
    const response = await fetch(`${origin}/pitch/${name}.png`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, name);
    assert.match(response.headers.get("content-type"), /image\/png/);
    await response.arrayBuffer();
  }
  const video = await fetch(`${origin}/videos/worldcup-hero.mp4`, {
    headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(5000)
  });
  assert.equal(video.status, 206);
  assert.equal((await video.arrayBuffer()).byteLength, 1024);
  for (const route of ["match-workflow", "hot-topic", "hot-topic-workflow", "platform-draft", "review-draft"]) {
    const denied = await fetch(`${origin}/api/ai/${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(5000)
    });
    assert.equal(denied.status, 400, `${route} must accept anonymous access and validate input without a paid call`);
    assert.equal((await denied.json()).sourceStatus, "error");
    const invalid = await fetch(`${origin}/api/ai/${route}`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-AI-Access-Token": "test-only-access-token-123456789" },
      body: "{}", signal: AbortSignal.timeout(5000)
    });
    assert.equal(invalid.status, 400, `${route} must ignore legacy access headers and validate input`);
  }
  console.log(JSON.stringify({ pages: 5, bundles: assets.length, images: 4, videoRange: true,
    requestedBusinessEndpoints: 10, anonymousInputRejections: 5, legacyHeaderInputRejections: 5,
    browserInteractionsTested: false }));
} finally {
  if (child.exitCode === null) child.kill();
  await exited;
}
