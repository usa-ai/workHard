#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { buildActionPath, parseCliArgs } from "./command-protocol.js";

const config = JSON.parse((await readFile(new URL("../config.json", import.meta.url), "utf8")).replace(/^\uFEFF/, ""));
const { action, args } = parseCliArgs(process.argv);
if (!action) {
  console.error(`用法: ${config.commandPrefix} start|home|off|next|prev|toggle|mute|unmute|like|search|quickly|favorite`);
  process.exit(2);
}
const route = buildActionPath(action, args);
const postAction = (nextRoute = route) => fetch(`http://127.0.0.1:${config.serverPort}/action/${nextRoute}`, { method: "POST" });
const postStart = () => fetch(`http://127.0.0.1:${config.serverPort}/action/start`, { method: "POST" });

const startServerIfNeeded = async () => {
  const serverPath = new URL("./server.js", import.meta.url);
  spawn(process.execPath, [serverPath], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      await fetch(`http://127.0.0.1:${config.serverPort}/health`, { method: "GET" });
      return true;
    } catch {
      if (i === 19) return false;
    }
  }
  return false;
};

const ensureStartedThen = async (nextRoute = route) => {
  if (action === "off") return null;
  const ready = await startServerIfNeeded();
  if (!ready) {
    console.error(`控制服务无法启动，请检查 Node.js 和端口 ${config.serverPort}`);
    process.exit(1);
  }
  await postStart().catch(() => null);
  return postAction(nextRoute);
};

const readBody = async (resp) => {
  if (!resp) return null;
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text || "控制失败" };
  }
};

let response;
try {
  response = await postAction();
} catch {
  if (action === "off") {
    console.error(`控制服务未运行，无法执行 ${action}`);
    process.exit(1);
  }
  response = await ensureStartedThen();
}

let body = await readBody(response);
if (!response || (!response.ok || !body?.ok)) {
  const message = body?.error || "";
  if (action !== "start" && action !== "off" && /video 元素|没有找到视频|没有找到 .*video/i.test(message)) {
    const retry = await ensureStartedThen();
    if (retry) {
      response = retry;
      body = await readBody(response);
    }
  }
}
if (!response || !body?.ok || !response.ok) { console.error(body?.error || "控制失败"); process.exit(1); }
console.log(body.message || `${body.action} ok`);
