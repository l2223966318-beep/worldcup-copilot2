import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const readinessStages = [
  { id: "hot-sources", label: "热点源", script: "test:cloudbase-sources" },
  { id: "hot-workflow", label: "热点分析与内容生成", script: "test:hot-topic" },
  { id: "evidence-review", label: "事实证据审核", script: "test:evidence-review" },
  { id: "sportradar", label: "Sportradar 赛事数据", script: "test:sportradar-today" },
  { id: "cloudbase-api", label: "腾讯云 API 合约", script: "test:cloudbase-api" },
  { id: "product-entrypoints", label: "产品入口", script: "test:product-entrypoints" },
  { id: "pitch", label: "国赛答辩页", script: "test:pitch" },
  { id: "live-cloudbase", label: "腾讯云线上真实链路", live: true },
];

function npmInvocation(script) {
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", script],
    display: `npm run ${script}`,
  };
}

function liveInvocation(origin) {
  return {
    command: process.execPath,
    args: ["scripts/check-cloudbase.mjs", origin, "--data"],
    display: `node scripts/check-cloudbase.mjs ${origin} --data`,
  };
}

function tail(text, max = 1200) {
  const value = String(text ?? "").trim();
  return value.length <= max ? value : `…${value.slice(-max)}`;
}

export async function defaultExec({ command, args }) {
  return await new Promise(resolveResult => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => resolveResult({ status: 1, stdout, stderr: error.message }));
    child.on("close", code => resolveResult({ status: code ?? 1, stdout, stderr }));
  });
}

export async function runReadiness({ env = process.env, exec = defaultExec } = {}) {
  const results = [];
  for (const stage of readinessStages) {
    if (stage.live && !env.CLOUDBASE_PUBLIC_ORIGIN) {
      results.push({
        id: stage.id,
        label: stage.label,
        status: "SKIP",
        detail: "未设置 CLOUDBASE_PUBLIC_ORIGIN；未探测线上腾讯云。",
      });
      continue;
    }

    const invocation = stage.live
      ? liveInvocation(env.CLOUDBASE_PUBLIC_ORIGIN)
      : npmInvocation(stage.script);
    const result = await exec(invocation);
    const ok = result.status === 0;
    results.push({
      id: stage.id,
      label: stage.label,
      status: ok ? "PASS" : "FAIL",
      detail: ok
        ? tail(result.stdout) || "通过"
        : tail(result.stderr || result.stdout) || `退出码 ${result.status}`,
    });
  }

  const summary = {
    passed: results.filter(item => item.status === "PASS").length,
    failed: results.filter(item => item.status === "FAIL").length,
    skipped: results.filter(item => item.status === "SKIP").length,
  };
  return { summary, results };
}

function printReport(report) {
  for (const item of report.results) {
    console.log(`${item.status.padEnd(4)}  ${item.label} (${item.id})`);
    if (item.status !== "PASS" && item.detail) {
      console.log(`      ${item.detail.replaceAll("\n", "\n      ")}`);
    }
  }
  console.log(
    `\nSummary: ${report.summary.passed} PASS / ${report.summary.failed} FAIL / ${report.summary.skipped} SKIP`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const report = await runReadiness();
  printReport(report);
  if (report.summary.failed > 0) process.exitCode = 1;
}
