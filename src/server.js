import http from "node:http";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { BrowserController } from "./browser-control.js";
import { log } from "./logger.js";
import { ACTION_ALIASES, parseActionRoute } from "./command-protocol.js";
import { sanitizeActionResult, sanitizeUserMessage } from "./messages.js";

const root = new URL("..", import.meta.url);
const configText = await readFile(new URL("config.yaml", root), "utf8");
const config = YAML.parse(configText.replace(/^\uFEFF/, "")) || {};
const allowed = new Set(Object.values(ACTION_ALIASES));
const controller = new BrowserController(config, log);

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, { ok: true });
    return;
  }
  if (req.method !== "POST" || !req.url.startsWith("/action/")) {
    send(res, 404, { ok: false, error: "Not found" });
    return;
  }

  let action = "";
  let payload = "";
  try {
    ({ action, payload } = parseActionRoute(req.url.slice("/action/".length)));
  } catch {
    send(res, 400, { ok: false, error: "工作任务参数无效" });
    return;
  }
  if (!allowed.has(action)) {
    send(res, 400, { ok: false, error: `不支持的动作: ${action}` });
    return;
  }

  log("INFO", "action received", { action });
  try {
    const result = await controller.runAction(action, payload);
    log("INFO", "action completed", { action });
    send(res, 200, { ok: true, ...sanitizeActionResult(result, action) });
  } catch (error) {
    log("ERROR", "action failed", { action, error: error.stack || error.message });
    send(res, 500, { ok: false, error: sanitizeUserMessage(error.message, action) });
  }
});

server.listen(config.serverPort, "127.0.0.1", () => {
  log("INFO", `Browser media control listening on http://127.0.0.1:${config.serverPort}`);
});

process.on("SIGINT", () => controller.close().finally(() => process.exit(0)));
process.on("SIGTERM", () => controller.close().finally(() => process.exit(0)));
