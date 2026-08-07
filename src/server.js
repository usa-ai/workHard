import http from "node:http";
import { readFile } from "node:fs/promises";
import { BrowserController } from "./browser-control.js";
import { log } from "./logger.js";
import { parseActionRoute } from "./command-protocol.js";

const root = new URL("..", import.meta.url);
const configText = await readFile(new URL("config.json", root), "utf8");
const config = JSON.parse(configText.replace(/^\uFEFF/, ""));
const allowed = new Set(["start", "open", "off", "next", "prev", "pause", "toggle", "mute", "unmute", "like", "search", "quickly", "favorite", "fav", "collect"]);
const controller = new BrowserController(config, log);

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST" || !req.url.startsWith("/action/")) {
    res.writeHead(404); res.end(JSON.stringify({ error: "Not found" })); return;
  }
  const { action, payload } = parseActionRoute(req.url.slice("/action/".length));
  log("INFO", "action received", { action });
  if (!allowed.has(action)) {
    res.writeHead(400); res.end(JSON.stringify({ error: `不支持的动作: ${action}` })); return;
  }
  try {
    const result = await Promise.race([
      controller.runAction(action, payload),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`动作 ${action} 超时（${config.actionTimeoutMs || 25000}ms），详情见 logs/server.log`)), config.actionTimeoutMs || 25000))
    ]);
    log("INFO", "action completed", { action });
    res.writeHead(200); res.end(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    log("ERROR", "action failed", { action, error: error.stack || error.message });
    res.writeHead(500); res.end(JSON.stringify({ ok: false, error: error.message }));
  }
});

server.listen(config.serverPort, "127.0.0.1", () => {
  log("INFO", `Browser media control listening on http://127.0.0.1:${config.serverPort}`);
});

process.on("SIGINT", () => controller.close().finally(() => process.exit(0)));
process.on("SIGTERM", () => controller.close().finally(() => process.exit(0)));
