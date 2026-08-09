// 将不同的命令别名统一映射为标准动作名，避免 CLI 和 HTTP 路由出现两套写法。
export const ACTION_ALIASES = Object.freeze({
  open: "start",
  home: "start",
  start: "start",
  s: "start",

  refresh: "refresh",
  r: "refresh",

  login: "login",
  off: "off",
  close: "off",
  next: "next",
  n: "next",
  prev: "prev",
  p: "prev",

  pause: "pause",
  pa: "pause",
  mute: "mute",
  unmute: "unmute",
  like: "like",
  zan: "like",

  search: "search",
  se: "search",

  quickly: "quickly",
  fast: "quickly",
  fav: "favorite",
});

// 将用户输入的动作名规范化为内部标准动作名。
export function normalizeActionName(name) {
  if (!name) return "";
  return ACTION_ALIASES[name] || name;
}

// 解析 CLI 参数，返回标准动作名和剩余参数。
export function parseCliArgs(argv) {
  return { action: normalizeActionName(argv[2]), args: argv.slice(3) };
}

// 把动作名和参数拼成 HTTP 路由路径。
export function buildActionPath(action, args = []) {
  const payload = args.filter(Boolean).join(" ").trim();
  return payload ? `${action}/${encodeURIComponent(payload)}` : action;
}

// 从 HTTP 路由中解析动作名与负载参数。
export function parseActionRoute(route) {
  const [rawAction = "", ...rest] = route.split("/");
  return {
    action: normalizeActionName(rawAction),
    payload: rest.length ? decodeURIComponent(rest.join("/")) : ""
  };
}
