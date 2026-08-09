export const ACTION_MESSAGES = Object.freeze({
  // closed: "抖音已关闭",
  closed: "下班",

  // loggedInStarted: "已检测到登录状态，并随机进入一个视频",
  loggedInStarted: "已检测到登录状态，并开始工作",

  // anonymousStarted: "已继续在未登录状态下使用，并随机进入一个视频",
  anonymousStarted: "已继续在未登录状态下使用，并开始工作",

  // opened: "抖音已在第二桌面（Win + Tab 切换）最小化打开",
  opened: "开始上班，任务已在第二桌面（Win + Tab 切换）最小化打开",

  // loginDetected: "检测到已登录，已随机进入一个视频",
  loginDetected: "检测到已登录，并开始工作",

  liked: "点赞成功",
  favorited: "收藏成功",
  muted: "已静音",
  unmuted: "已取消静音",

  // next: "已切换到下一个视频并开始播放",
  next: "已切换下一个任务",

  // prev: "已切换到上一个视频并开始播放",
  prev: "已切换上一个任务",

  // paused: "已暂停",
  paused: "思考中...",

    // playing: "已开始播放",
  playing: "工作中...",

  // videoOnHome: "视频仍停留在主页，请执行 work refresh 重试",
  videoOnHome: "任务仍停留在主页，请执行 work refresh 重试",

  // searched: (query) => `已搜索“${query}”并随机进入一个视频`,
  searched: (query) => `已搜索“${query}” 并开始处理`,

  speedChanged: (rate) => `已切换到 ${rate} 倍速`,

  loginHint: "请切换至第二桌面(win + Tab)登录或键入 work refresh 继续在未登录状态下使用。",

  loginRequired: "检测到可能需要登录，请键入：work login 并切换至第二桌面(win + Tab)登录后重试；若已登录，请忽略此提示并执行 work refresh。",
  loginRetryHint: "请键入：work login 并切换至第二桌面(win + Tab)登录后重试；若已登录，请忽略此提示",
  searchRequired: "search 需要搜索关键词",
  noVideo: "当前页面没有找到 video 元素",
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

const FORBIDDEN_OUTPUT = /抖音|视频|播放|刷视频|启动抖音|打开抖音|搜索视频/;

export function sanitizeUserMessage(message, action = "") {
  const text = String(message || "");
  if (!FORBIDDEN_OUTPUT.test(text)) return text;
  const safeByAction = {
    start: ACTION_MESSAGES.opened,
    refresh: ACTION_MESSAGES.anonymousStarted,
    next: ACTION_MESSAGES.next,
    prev: ACTION_MESSAGES.prev,
    play: ACTION_MESSAGES.playing,
    pause: ACTION_MESSAGES.paused,
    toggle: ACTION_MESSAGES.playing,
    off: ACTION_MESSAGES.closed,
    search: "已开始处理搜索任务",
    like: ACTION_MESSAGES.liked,
    favorite: ACTION_MESSAGES.favorited
  };
  return safeByAction[action] || "工作任务已处理";
}
