export const ACTION_MESSAGES = Object.freeze({
  closed: "工作模式已关闭",
  loggedInStarted: "已检测到登录状态，并开始工作",
  anonymousStarted: "已继续在未登录状态下使用，并开始工作",
  opened: "开始上班，任务已在第二桌面（Win + Tab 切换）最小化打开",
  loginDetected: "检测到已登录，并开始工作",

  liked: "任务已标记完成",
  favorited: "任务已归档",
  muted: "提示音已关闭",
  unmuted: "提示音已开启",
  next: "已切换下一个任务",
  prev: "已切换上一个任务",
  paused: "当前任务已暂停",
  playing: "当前任务已继续",
  videoOnHome: "任务仍停留在主页，请执行 work refresh 重试",
  searched: () => "搜索任务已开始处理",
  speedChanged: (rate) => `处理速度已调整为 ${rate}`,
  loginHint: "请切换至第二桌面(win + Tab)登录或键入 work refresh 继续在未登录状态下使用。",
  loginRequired: "检测到可能需要登录，请键入：work login 并切换至第二桌面(win + Tab)登录后重试；若已登录，请忽略此提示并执行 work refresh。",
  loginRetryHint: "请键入：work login 并切换至第二桌面(win + Tab)登录后重试；若已登录，请忽略此提示",
  searchRequired: "search 需要搜索关键词",
  noVideo: "当前页面未找到可处理内容",
  noSearchInput: "没有找到搜索框",
  searchNotLoaded: "搜索页面未加载",
  riskDetected: "检测到平台安全验证或异常访问提示，已停止自动操作，请人工处理后重试。"
});

export const startMessage = (requestedAction, loggedIn) =>
  requestedAction === "refresh"
    ? (loggedIn ? ACTION_MESSAGES.loggedInStarted : ACTION_MESSAGES.anonymousStarted)
    : ACTION_MESSAGES.opened;

export const videoResult = (requestedAction, pageUrl, loggedIn, state) => ({
  action: requestedAction,
  pageUrl,
  playing: true,
  ...(state ? { state } : {}),
  message: startMessage(requestedAction, loggedIn)
});

const FORBIDDEN_OUTPUT = /抖音|douyin|视频|播放|刷视频|启动抖音|打开抖音|搜索视频|点赞|收藏|\bvideo\b|\bplay(?:back)?\b|\bwatch(?:ing)?\b/i;

const SAFE_BY_ACTION = Object.freeze({
  start: ACTION_MESSAGES.opened,
  refresh: ACTION_MESSAGES.anonymousStarted,
  login: ACTION_MESSAGES.loginDetected,
  off: ACTION_MESSAGES.closed,
  next: ACTION_MESSAGES.next,
  prev: ACTION_MESSAGES.prev,
  play: ACTION_MESSAGES.playing,
  pause: ACTION_MESSAGES.paused,
  toggle: ACTION_MESSAGES.playing,
  mute: ACTION_MESSAGES.muted,
  unmute: ACTION_MESSAGES.unmuted,
  like: ACTION_MESSAGES.liked,
  favorite: ACTION_MESSAGES.favorited,
  search: ACTION_MESSAGES.searched(),
  quickly: "处理速度已调整"
});

export function sanitizeUserMessage(message, action = "") {
  const text = String(message || "");
  if (text && !FORBIDDEN_OUTPUT.test(text)) return text;
  return SAFE_BY_ACTION[action] || "工作任务已处理";
}

// HTTP callers do not need browser URLs or raw state details that could expose the controlled site.
export function sanitizeActionResult(result, action = "") {
  if (!result || typeof result !== "object") {
    return { message: sanitizeUserMessage("", action) };
  }
  const safe = { ...result };
  delete safe.pageUrl;
  delete safe.url;
  if (safe.state && typeof safe.state === "object") {
    safe.state = { ...safe.state };
    delete safe.state.url;
    delete safe.state.pageUrl;
  }
  if (Object.prototype.hasOwnProperty.call(safe, "message")) {
    safe.message = sanitizeUserMessage(safe.message, action || safe.action || "");
  }
  return safe;
}
