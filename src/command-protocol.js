export const ACTION_ALIASES = Object.freeze({
  open: "start",
  home: "start",
  start: "start",
  refresh: "refresh",
  login: "login",
  off: "off",
  close: "off",
  next: "next",
  prev: "prev",
  pause: "pause",
  mute: "mute",
  unmute: "unmute",
  like: "like",
  zan: "like",
  search: "search",
  quickly: "quickly",
  fast: "quickly",
  fav: "favorite",
});

export function normalizeActionName(name) {
  if (!name) return "";
  return ACTION_ALIASES[name] || name;
}

export function parseCliArgs(argv) {
  return { action: normalizeActionName(argv[2]), args: argv.slice(3) };
}

export function buildActionPath(action, args = []) {
  const payload = args.filter(Boolean).join(" ").trim();
  return payload ? `${action}/${encodeURIComponent(payload)}` : action;
}

export function parseActionRoute(route) {
  const [rawAction = "", ...rest] = route.split("/");
  return {
    action: normalizeActionName(rawAction),
    payload: rest.length ? decodeURIComponent(rest.join("/")) : ""
  };
}
