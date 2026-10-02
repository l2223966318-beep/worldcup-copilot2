import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import ts from "typescript";

for (const [source, output] of [["lib/time/beijingTime.ts", "beijing-time.js"], ["lib/sports/sportradarClient.ts", "sportradar.js"], ["lib/ai/quality.ts", "quality.js"], ["lib/services/evidenceService.ts", "evidence.js"], ["lib/ai/requestGuard.ts", "ai-guard.js"], ["lib/services/hotTopicAiCache.ts", "hot-ai-cache.js"], ["lib/hot/normalizeHotAnalysis.ts", "hot-analysis.js"]]) {
  const code = readFileSync(new URL(`../${source}`, import.meta.url), "utf8")
    .replaceAll("@/lib/sports/normalizers", "./sports-payload").replaceAll("@/lib/time/beijingTime", "./beijing-time").replaceAll("@/lib/ai/quality", "./quality");
  const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  assert.ok(readFileSync(new URL(`../cloudfunctions/api-proxy/${output}`, import.meta.url), "utf8").endsWith(compiled), "generated runtime must match current TS source");
}
const reserve = http.createServer();
reserve.listen(0, "127.0.0.1");
await once(reserve, "listening");
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const env = { ...process.env, PORT: String(port), DEEPSEEK_API_KEY: "", SPORTRADAR_API_KEY: "" };
const child = spawn(process.execPath, ["index.js"], {
  cwd: fileURLToPath(new URL("../cloudfunctions/api-proxy/", import.meta.url)), env, windowsHide: true, stdio: "pipe",
});
let exited = false;
child.once("exit", () => { exited = true; });
child.stdout.resume(); child.stderr.resume();
try {
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 40 && !exited; i++) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) });
      assert.equal((await response.json()).version, "direct-v6.3.1-hot-analysis-fix");
      ready = true; break;
    } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.equal(ready, true, "full CommonJS runtime must boot successfully");
  for (const path of ["/api/hot/health", "/api/worldcup/health", "/api/ai/health"]) {
    assert.equal((await fetch(`${origin}${path}`)).status, 200);
  }
  assert.equal((await fetch(`${origin}/api/ai/hot-topic`, { method: "POST", body: "{broken" })).status, 400);
  assert.equal((await fetch(`${origin}/api/health`)).status, 200);
  console.log("CloudBase startup: generated files current, real child process boots, four health routes and request isolation passed.");
} finally {
  const exit = exited ? Promise.resolve() : once(child, "exit");
  if (!exited) child.kill();
  await exit;
}
