const ACTION_ALIASES = {
  open: "start",
  home: "start",
  start: "start",
  off: "off",
  close: "off",
  next: "next",
  prev: "prev",
  previous: "prev",
  pause: "pause",
  toggle: "pause",
  play: "pause",
  resume: "pause",
  mute: "mute",
  unmute: "unmute",
  like: "like",
  zan: "like",
  search: "search",
  quickly: "quickly",
  favorite: "favorite",
  fav: "favorite",
  collect: "favorite"
};

export function normalizeActionName(name) {
  if (!name) return "";
  return ACTION_ALIASES[name] || name;
}

export function parseCliArgs(argv) {
  const action = normalizeActionName(argv[2]);
  return { action, args: argv.slice(3) };
}

export function buildActionPath(action, args = []) {
  const payload = args.filter(Boolean).join(" ").trim();
  return payload ? `${action}/${encodeURIComponent(payload)}` : action;
}

export function parseActionRoute(route) {
  const [rawAction = "", ...rest] = route.split("/");
  const action = normalizeActionName(rawAction);
  const payload = rest.length ? decodeURIComponent(rest.join("/")) : "";
  return { action, payload };
}
