#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { buildActionPath, parseCliArgs } from "./command-protocol.js";
import { sanitizeUserMessage } from "./messages.js";

const config = YAML.parse((await readFile(new URL("../config.yaml", import.meta.url), "utf8")).replace(/^\uFEFF/, "")) || {};
const { action, args } = parseCliArgs(process.argv);

if (!action) {
  console.error(`用法: ${config.commandPrefix} start|refresh|login|off|next|prev|pause|mute|unmute|like|favorite|search|quickly`);
  process.exit(2);
}

const baseUrl = `http://127.0.0.1:${config.serverPort}`;
const request = (method, path) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: "127.0.0.1", port: config.serverPort, path, method }, (res) => {
    let body = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => { body += chunk; });
    res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, body }));
  });
  req.on("error", reject);
  req.end();
});

const postAction = () => request("POST", `/action/${buildActionPath(action, args)}`);

async function ensureServer() {
  try {
    const response = await request("GET", "/health");
    if (response.ok) return;
  } catch {}

  const serverPath = fileURLToPath(new URL("./server.js", import.meta.url));
  spawn(process.execPath, [serverPath], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const response = await request("GET", "/health");
      if (response.ok) return;
    } catch {}
  }
  throw new Error(`控制服务无法启动，请检查 Node.js 和端口 ${config.serverPort}`);
}

try {
  await ensureServer();
  const response = await postAction();
  let body;
  try { body = JSON.parse(response.body); } catch { body = { ok: false, error: response.body || "控制失败" }; }
  if (!response.ok || !body.ok) throw new Error(body.error || "控制失败");
  console.log(sanitizeUserMessage(body.message || `${body.action} 已完成`, body.action));
} catch (error) {
  console.error(sanitizeUserMessage(error.message));
  process.exit(1);
}
