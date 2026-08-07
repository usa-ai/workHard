import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const logDir = fileURLToPath(new URL("../logs/", import.meta.url));
mkdirSync(logDir, { recursive: true });
export const logFile = fileURLToPath(new URL("../logs/server.log", import.meta.url));
export const browserLogFile = fileURLToPath(new URL("../logs/browser-launch.log", import.meta.url));

export function log(level, message, details = "") {
  const suffix = details ? ` ${typeof details === "string" ? details : JSON.stringify(details)}` : "";
  const line = `${new Date().toISOString()} [${level}] ${message}${suffix}`;
  console.log(line);
  appendFileSync(logFile, line + "\n", "utf8");
}
