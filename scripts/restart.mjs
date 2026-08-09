#!/usr/bin/env node
// 重启控制服务：杀掉旧进程，再重新启动后台服务
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

const root = new URL("..", import.meta.url);
const config = YAML.parse((await readFile(new URL("config.yaml", root), "utf8")).replace(/^\uFEFF/, "")) || {};
const port = config.serverPort || 37651;
const logging = process.argv.includes("logging") || process.argv.includes("--logging") || process.env.npm_config_logging === "true";

async function killOldService() {
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
    ], { stdio: ["ignore", "pipe", "pipe"] });
    ps.on("exit", () => resolve());
  });
}

async function startService() {
  const serverPath = fileURLToPath(new URL("src/server.js", root));
  const child = spawn(process.execPath, [serverPath], {
    detached: !logging,
    stdio: logging ? "inherit" : "ignore",
    windowsHide: !logging
  });
  if (!logging) child.unref();

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { method: "POST" });
      if (res.status === 404) {
        console.log(`服务已启动: http://127.0.0.1:${port}`);
        return;
      }
    } catch {
      // still waiting
    }
  }

  console.log("服务启动超时，请检查 node src/server.js");
}

await killOldService();
console.log("旧服务已关闭");
await startService();
