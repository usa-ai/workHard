import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { browserLogFile } from "./logger.js";
import {
  LOGIN_PANEL_CSS,
  LOGIN_CLOSE_CSS,
  findLoginCloseLocator,
  findLoginPanel,
  findSearchButton,
  findSearchInput
} from "./douyin-locators.js";

const STATE_SCRIPT = () => {
  const videos = [...document.querySelectorAll("video")];
  const visible = videos.filter((video) => {
    const rect = video.getBoundingClientRect();
    return rect.width > 20 && rect.height > 20 && rect.bottom > 0 && rect.top < innerHeight;
  });
  const current = visible.sort((a, b) =>
    (b.getBoundingClientRect().width * b.getBoundingClientRect().height) -
    (a.getBoundingClientRect().width * a.getBoundingClientRect().height)
  )[0] || videos[0];
  return {
    url: location.href,
    modalId: new URL(location.href).searchParams.get("modal_id"),
    scrollY: window.scrollY,
    videoCount: videos.length,
    current: current ? {
      src: current.currentSrc || current.src || "",
      currentTime: current.currentTime,
      paused: current.paused,
      readyState: current.readyState,
      width: current.getBoundingClientRect().width,
      height: current.getBoundingClientRect().height
    } : null
  };
};

const ACTION_SCRIPT = async ({ action }) => {
  const allVideos = [...document.querySelectorAll("video")];
  const visibleVideos = allVideos.filter((video) => {
    const rect = video.getBoundingClientRect();
    return rect.width > 20 && rect.height > 20 && rect.bottom > 0 && rect.top < innerHeight;
  });
  const selected = visibleVideos.sort((a, b) =>
    (b.getBoundingClientRect().width * b.getBoundingClientRect().height) -
    (a.getBoundingClientRect().width * a.getBoundingClientRect().height)
  )[0] || allVideos[0];
  const state = {
    url: location.href,
    modalId: new URL(location.href).searchParams.get("modal_id"),
    scrollY: window.scrollY,
    videoCount: allVideos.length,
    current: selected ? { src: selected.currentSrc || selected.src || "", currentTime: selected.currentTime, paused: selected.paused, readyState: selected.readyState } : null
  };
  const current = state.current ? [...document.querySelectorAll("video")].find((video) =>
    (video.currentSrc || video.src || "") === state.current.src
  ) : null;
  if (action === "next" || action === "prev") {
    return { action, before: state };
  }
  if (!current) throw new Error("当前页面没有找到 video 元素");
  if (action === "play") await current.play();
  if (action === "pause") current.pause();
  if (action === "toggle") {
    if (current.paused) await current.play();
    else current.pause();
  }
  if (action === "mute" || action === "unmute") current.muted = action === "mute";
  return { action, paused: current.paused, muted: current.muted, currentTime: current.currentTime, readyState: current.readyState };
};

const LIKE_SCRIPT = () => {
  const marker = document.getElementById("__lottie_element_2");
  const visual = [...document.querySelectorAll("[clip-path]")].find((item) =>
    (item.getAttribute("clip-path") || "").includes("__lottie_element_2") && item.getBoundingClientRect().width > 2
  );
  const diggTargets = [...document.querySelectorAll('[data-e2e="video-player-digg"]')].filter((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < innerHeight;
  });
  let target = diggTargets[0] || visual || marker;
  if (!target) return { found: false };
  for (let i = 0; i < 10 && target; i++, target = target.parentElement) {
    if (target.matches("button,[role=button],[data-e2e*=like],[data-e2e=video-player-digg]")) break;
  }
  target = target || diggTargets[0] || visual || marker?.parentElement;
  const rect = target?.getBoundingClientRect();
  if (!rect || rect.width < 2 || rect.height < 2) return { found: false };
  const before = target.getAttribute("aria-pressed") || target.getAttribute("data-e2e-state") || target.className?.toString() || "";
  return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, before };
};

const FAVORITE_SCRIPT = () => {
  const targets = [...document.querySelectorAll('[data-e2e="video-player-favorite"], [data-e2e*="favorite"], .xgplayer-favorite, button[aria-label*="收藏"]')].filter((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < innerHeight;
  });
  let target = targets[0];
  if (!target) return { found: false };
  for (let i = 0; i < 10 && target; i++, target = target.parentElement) {
    if (target.matches("button,[role=button],a")) break;
  }
  target = target || targets[0];
  const rect = target?.getBoundingClientRect();
  if (!rect || rect.width < 2 || rect.height < 2) return { found: false };
  const before = target.getAttribute("aria-pressed") || target.getAttribute("data-e2e-state") || target.getAttribute("data-favorited") || target.className?.toString() || "";
  return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, before };
};

const CLOSE_LOGIN_SCRIPT = ({ panelCss, closeCss }) => {
  const anchor = document.querySelector(panelCss);
  if (!anchor) return false;
  let panel = anchor;
  for (let i = 0; i < 8 && panel.parentElement; i++) {
    const candidate = panel.parentElement;
    const rect = candidate.getBoundingClientRect();
    if (rect.width >= 280 && rect.height >= 180 && rect.width <= 700 && rect.height <= 700) panel = candidate;
    else if (rect.width > innerWidth * 0.8 && rect.height > innerHeight * 0.8) break;
  }
  const panelRect = panel.getBoundingClientRect();
  const candidates = [...panel.querySelectorAll(closeCss), ...document.querySelectorAll(closeCss)]
    .filter((item, index, all) => all.indexOf(item) === index)
    .filter((item) => {
      const rect = item.getBoundingClientRect();
      const label = `${item.getAttribute("aria-label") || ""} ${item.getAttribute("title") || ""} ${item.textContent || ""}`.trim();
      const withinPanel = rect.left >= panelRect.left - 80 && rect.right <= panelRect.right + 80 && rect.top >= panelRect.top - 80 && rect.bottom <= panelRect.bottom + 80;
      const nearTopRight = rect.left > panelRect.left + panelRect.width * 0.72 && rect.top < panelRect.top + panelRect.height * 0.25;
      return rect.width > 2 && rect.height > 2 && withinPanel && (label.includes("关闭") || label.toLowerCase().includes("close") || /^(×|✕|x)$/i.test(label) || nearTopRight);
    });
  const target = candidates[0];
  if (!target) return false;
  const clickable = target.closest?.('button,[role="button"]') || target;
  if (target.matches?.('.YoNA2Hyj.qKr0RhiL') && target.parentElement) target.parentElement.click?.();
  clickable.click?.();
  clickable.dispatchEvent?.(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  clickable.dispatchEvent?.(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  clickable.dispatchEvent?.(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  return true;
};

const LOGIN_CONFIG = { panelCss: LOGIN_PANEL_CSS, closeCss: LOGIN_CLOSE_CSS };

const NAV_BUTTON_SCRIPT = ({ direction }) => {
  const direct = document.querySelector(direction > 0 ? '[data-e2e="video-switch-next-arrow"]' : '[data-e2e="video-switch-prev-arrow"]');
  if (direct && !direct.classList.contains("disabled")) {
    const rect = direct.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  const words = direction > 0 ? ["下一", "下一个", "next", "向下"] : ["上一", "上一个", "previous", "prev", "向上"];
  const nodes = [...document.querySelectorAll("button,[role=button],a")];
  const node = nodes.find((item) => {
    const rect = item.getBoundingClientRect();
    const label = `${item.getAttribute("aria-label") || ""} ${item.getAttribute("title") || ""} ${item.textContent || ""}`.toLowerCase();
    return rect.width > 10 && rect.height > 10 && rect.bottom > 0 && rect.top < innerHeight && words.some((word) => label.includes(word));
  });
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

const PLAY_VISIBLE_SCRIPT = () => {
  const videos = [...document.querySelectorAll("video")].filter((video) => {
    const rect = video.getBoundingClientRect();
    return rect.width > 20 && rect.height > 20 && rect.bottom > 0 && rect.top < innerHeight;
  });
  const video = videos.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] || document.querySelector("video");
  if (!video) return false;
  video.muted = false;
  video.play().catch(() => {});
  return true;
};

const SEARCH_STATE_SCRIPT = () => {
  const locationState = {
    url: location.href,
    modalId: new URL(location.href).searchParams.get("modal_id"),
    pathname: location.pathname,
    title: document.title
  };
  const input = document.querySelector('input[data-e2e="searchbar-input"], input[placeholder*="搜索"], input[placeholder*="搜"]');
  const button = document.querySelector('[data-e2e="searchbar-button"], button[data-e2e="searchbar-button"], button:has-text("搜索")');
  return {
    ...locationState,
    hasInput: Boolean(input),
    hasButton: Boolean(button),
    inputValue: input?.value || ""
  };
};

const QUICKLY_SCRIPT = async ({ rate }) => {
  const wrapper = [...document.querySelectorAll(".xgplayer-playback-setting, .xgplayer-setting-playbackRatio, [data-index], [data-state]")].find((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < innerHeight;
  });
  if (!wrapper) return { found: false };
  const options = [...wrapper.querySelectorAll("[data-id], .xgplayer-playratio-item")];
  const target = options.find((item) => String(item.getAttribute("data-id") || item.dataset?.id || "").trim() === String(rate).trim());
  if (!target) return { found: false };
  const rect = target.getBoundingClientRect();
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

export class BrowserController {
  constructor(config, logger = () => {}) {
    this.config = config;
    this.browser = null;
    this.log = logger;
    this.actionTail = Promise.resolve();
    this.loginGuard = null;
    this.loginMode = false;
  }

  startLoginGuard(page) {
    this.stopLoginGuard();
    let running = false;
    const timer = setInterval(async () => {
      if (running || page.isClosed()) return;
      running = true;
      try { await this.closeLogin(page, 800); } finally { running = false; }
    }, 250);
    this.loginGuard = { timer };
  }

  stopLoginGuard() {
    if (this.loginGuard) clearInterval(this.loginGuard.timer);
    this.loginGuard = null;
  }

  async connect(logAttempt = true) {
    const endpoint = `http://127.0.0.1:${this.config.cdpPort}`;
    if (this.browser?.isConnected()) {
      const probe = new AbortController();
      const timer = setTimeout(() => probe.abort(), 800);
      try {
        await fetch(`${endpoint}/json/version`, { signal: probe.signal });
        return this.browser;
      } catch {
        await this.browser.close().catch(() => {});
        this.browser = null;
      } finally {
        clearTimeout(timer);
      }
    }
    if (logAttempt) this.log("INFO", "connecting to CDP", { port: this.config.cdpPort });
    this.browser = await chromium.connectOverCDP(endpoint);
    this.log("INFO", "CDP connected");
    return this.browser;
  }

  async connectOrLaunch() {
    try { return await this.connect(); } catch (firstError) {
      this.log("WARN", "CDP unavailable, launching browser", firstError.message);
      const candidates = [
        `${process.env.LOCALAPPDATA || ""}\\Google\\Chrome\\Application\\chrome.exe`,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        `${process.env.LOCALAPPDATA || ""}\\Microsoft\\Edge\\Application\\msedge.exe`,
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      ];
      const executable = candidates.find((path) => existsSync(path));
      if (!executable) throw firstError;
      const profile = `${process.env.TEMP || "."}\\browser-media-control-profile`;
      const script = fileURLToPath(new URL("../scripts/open-douyin.ps1", import.meta.url));
      const output = openSync(browserLogFile, "a");
      const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Port", String(this.config.cdpPort), "-UserDataDir", profile, "-Url", this.config.douyinUrl, "-ChromePath", executable], { windowsHide: true, stdio: ["ignore", output, output] });
      child.once("exit", () => closeSync(output));
      this.log("INFO", "browser launch script started", { pid: child.pid, executable, profile });
      for (let i = 0; i < 150; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        try { return await this.connect(false); } catch (error) { if (i % 25 === 24) this.log("WARN", "waiting for CDP", { attempt: i + 1, error: error.message }); }
      }
      this.log("ERROR", "browser launch timed out", { log: browserLogFile });
      throw new Error("无法启动可调试的 Chrome/Edge，请检查浏览器安装状态");
    }
  }

  async waitForPlaying(page, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await page.evaluate(PLAY_VISIBLE_SCRIPT).catch(() => {});
      const state = await page.evaluate(STATE_SCRIPT).catch(() => null);
      if (state?.current && state.current.readyState >= 2 && !state.current.paused && state.current.currentTime > 0.05) return state;
      await this.waitStep(page, 250);
    }
    const state = await page.evaluate(STATE_SCRIPT).catch(() => null);
    throw new Error(`视频未开始播放，当前状态: ${JSON.stringify(state)}`);
  }

  async closeLogin(page, timeoutMs = 4000) {
    const deadline = Date.now() + Math.max(timeoutMs, 500);
    let noCloseCount = 0;
    let attempts = 0;
    while (Date.now() < deadline) {
      attempts += 1;
      const panel = await findLoginPanel(page).catch(() => null);
      if (!panel) {
        if (attempts > 1) this.log("INFO", "login modal closed or absent", { attempts, timeoutMs, pageUrl: page.url() });
        return true;
      }
      const close = await findLoginCloseLocator(page).catch(() => null);
      this.log("INFO", "login modal detected", { attempts, timeoutMs, hasCloseLocator: Boolean(close), noCloseCount, pageUrl: page.url() });
      if (close) {
        await close.click({ timeout: 300 }).catch(() => {});
        await page.evaluate(CLOSE_LOGIN_SCRIPT, LOGIN_CONFIG).catch(() => {});
        await this.waitStep(page, 200);
        noCloseCount = 0;
      } else {
        await page.evaluate(CLOSE_LOGIN_SCRIPT, LOGIN_CONFIG).catch(() => {});
        await this.waitStep(page, 200);
        noCloseCount++;
        if (noCloseCount >= 3) {
          const stillThere = await findLoginPanel(page).catch(() => null);
          if (stillThere) return false;
        }
      }
    }
    const stillThere = await findLoginPanel(page).catch(() => null);
    return !stillThere;
  }

  _requireLogin(page, actionName) {
    throw new Error("检测到登录弹窗，请键入：work login 并切换至第二桌面(win + Tab)登录或继续在未登录状态下使用。");
  }

  async ensureLoginReady(page, actionName) {
    const loginPanel = await findLoginPanel(page).catch(() => null);
    if (!loginPanel) return;
    if (this.loginGuard && await this.closeLogin(page, 1200)) return;
    this._requireLogin(page, actionName);
  }

  async waitStep(page, ms = 400) {
    await page.waitForTimeout(ms);
  }

  async clickAnyVideo(page, opts = {}) {
    const { totalTimeoutMs = 10000, requireModalChange = true, allowCloseLogin = false } = opts;
    const deadline = Date.now() + totalTimeoutMs;
    const before = await page.evaluate(STATE_SCRIPT).catch(() => null);
    const isInVideoDetail = (state) => Boolean(state?.modalId) || /\/video\/|\/detail\//.test(state?.url || "");
    let lastReason = "no candidates";
    let scrollAttempts = 0;
    while (Date.now() < deadline) {
      if (allowCloseLogin) await this.closeLogin(page, 600);
      else await this.ensureLoginReady(page, "进入视频");
      const result = await page.evaluate(() => {
        const inView = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight;
        };
        const bigInView = (el, w = 180, h = 180) => {
          const r = el.getBoundingClientRect();
          return r.width > w && r.height > h && r.bottom > 0 && r.top < innerHeight && r.right > 160;
        };
        const safeClick = (el) => {
          el?.click?.();
          el?.dispatchEvent?.(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
          el?.dispatchEvent?.(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
          el?.dispatchEvent?.(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        };
        const rectOf = (el) => {
          const r = el?.getBoundingClientRect?.() || { x: 0, y: 0, width: 0, height: 0 };
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        // 1) 最优先：直接进入详情的链接（href 含 modal_id 或 /video/）
        const strongAnchorCandidates = [...document.querySelectorAll('a[href*="modal_id="], a[href*="/video/"], a[href*="/detail/"]')]
          .filter((a) => inView(a))
          .filter((a) => {
            const r = a.getBoundingClientRect();
            return (r.width * r.height > 30000) || (r.width > 200 && r.height > 200) ||
              a.querySelector("img,svg,video") || (r.width > 80 && r.height > 40);
          });
        if (strongAnchorCandidates.length) {
          const pick = strongAnchorCandidates[Math.floor(Math.random() * strongAnchorCandidates.length)];
          safeClick(pick);
          const pt = rectOf(pick);
          return { ok: true, stage: "strong-link", tag: pick.tagName, href: pick.getAttribute("href") || "", x: pt.x, y: pt.y };
        }
        // 2) 容器级：video-card / FeedCell / feed-item 里的可点击元素
        const containerSelector = [
          'div[data-e2e="video-card"]',
          'div[data-e2e="feed-active-video"]',
          'div[class*="video-card"]',
          'li[class*="video-list-item"]',
          'section[class*="feed-item"]',
          'div[class*="FeedCell"]',
          'a[class*="card-link"]',
          'div[data-e2e="scroll-item"]',
          'div[class*="scroll-item"]'
        ].join(",");
        const containers = [...document.querySelectorAll(containerSelector)]
          .filter((c) => bigInView(c, 160, 160))
          .sort(() => Math.random() - 0.5);
        for (const container of containers) {
          const direct = container.querySelector('a[href*="modal_id="], a[href*="/video/"], a[href*="/detail/"]');
          if (direct && inView(direct)) {
            safeClick(direct);
            const pt = rectOf(direct);
            return { ok: true, stage: "container-link", tag: direct.tagName, href: direct.getAttribute("href") || "", x: pt.x, y: pt.y };
          }
          const inner = [...container.querySelectorAll("a,button,[role=button],img,div")].find((el) => {
            if (!inView(el)) return false;
            const r = el.getBoundingClientRect();
            if (el.tagName === "IMG") return (r.width > 150 && r.height > 150);
            return (r.width > 30 && r.height > 20);
          });
          if (inner) {
            const target = inner.closest('a,button,[role="button"],li,div[data-e2e]') || inner;
            safeClick(target);
            const pt = rectOf(target);
            return { ok: true, stage: "container-inner", tag: target.tagName, href: target.getAttribute?.("href") || "", x: pt.x, y: pt.y };
          }
        }
        // 3) 页面上大图 → 包一层再点（只点尺寸大的，避免误点 banner）
        const bigImages = [...document.querySelectorAll("img")].filter((img) => bigInView(img, 300, 300));
        const bigImg = bigImages[Math.floor(Math.random() * bigImages.length)];
        if (bigImg) {
          const wrap = bigImg.closest('a,button,[role="button"],li,div[data-e2e],section[class*="feed"],div[class*="video-card"],div[class*="FeedCell"]') || bigImg;
          safeClick(wrap);
          const pt = rectOf(wrap);
          return { ok: true, stage: "img-wrap", tag: wrap.tagName, href: wrap.getAttribute?.("href") || "", x: pt.x, y: pt.y };
        }
        return { ok: false, reason: containers.length ? "container-no-inner" : (bigImg ? "bigimg-unresolved" : "no-candidates") };
      }).catch((e) => ({ ok: false, reason: `eval-error:${e && e.message ? e.message : e}` }));
      if (!result?.ok) {
        lastReason = result?.reason || "unknown";
        // 没找到候选 → 轻滚一下，避免首屏卡片还没渲染
        scrollAttempts += 1;
        if (scrollAttempts % 2 === 1) {
          await page.evaluate(() => {
            window.scrollBy({ top: 300, behavior: "smooth" });
            setTimeout(() => window.scrollBy({ top: -300, behavior: "smooth" }), 250);
          }).catch(() => {});
        }
        await this.waitStep(page, 350);
        continue;
      }
      this.log("INFO", "clickAnyVideo: attempt", result);
      // 给进入详情的页面过渡一点时间
      await this.waitStep(page, 900);
      const after = await page.evaluate(STATE_SCRIPT).catch(() => null);
      const entered = isInVideoDetail(after) && (
        !requireModalChange ||
        after?.modalId !== before?.modalId ||
        after?.url !== before?.url ||
        (after?.current?.src && after.current.src !== before?.current?.src)
      );
      if (entered) return true;
      lastReason = "clicked-but-not-entered";
      await this.waitStep(page, 250);
    }
    this.log("WARN", "clickAnyVideo: failed", { lastReason, beforeUrl: before?.url, beforeModalId: before?.modalId });
    return false;
  }

  stateChanged(before, after) {
    if (!before || !after) return false;
    if (before.modalId !== after.modalId) return true;
    if (before.current?.src && after.current?.src && before.current.src !== after.current.src) return true;
    if (before.videoCount !== after.videoCount && after.current?.readyState >= 2) return true;
    if (before.current && after.current && before.current.src === after.current.src && after.current.currentTime < before.current.currentTime - 0.75) return true;
    return false;
  }

  async runAction(action, payload = "") {
    const queuedAt = Date.now();
    const previous = this.actionTail;
    let release;
    this.actionTail = new Promise((resolve) => { release = resolve; });
    await previous;
    this.log("INFO", "action started", { action, payload, queueWaitMs: Date.now() - queuedAt });
    try {
      const result = await this._runAction(action, payload);
      this.log("INFO", "action finished", { action, durationMs: Date.now() - queuedAt, result });
      return result;
    } catch (error) {
      if (action !== "login" && action !== "off" && this.browser?.isConnected()) {
        const pages = this.browser.contexts().flatMap((context) => context.pages()).filter((page) => !page.isClosed());
        const page = pages.find((candidate) => candidate.url().includes(this.config.urlPattern));
        const loginPanel = page ? await findLoginPanel(page).catch(() => null) : null;
        if (loginPanel) {
          if (this.loginGuard) await this.closeLogin(page, 1200);
          else throw new Error("检测到登录弹窗，请键入：work login 并切换至第二桌面(win + Tab)登录或继续在未登录状态下使用。");
        }
      }
      this.log("ERROR", "action failed", { action, durationMs: Date.now() - queuedAt, error: error.message });
      throw error;
    } finally {
      release();
    }
  }

  async _runAction(action, payload = "") {
    const requestedAction = action;
    if (action === "open" || action === "refresh") action = "start";
    if (this.loginMode && !["login", "start", "off"].includes(action)) {
      throw new Error("检测到登录弹窗，请键入：work login 并切换至第二桌面(win + Tab)登录或继续在未登录状态下使用。");
    }
    if (action === "off") {
      const script = fileURLToPath(new URL("../scripts/close-douyin.ps1", import.meta.url));
      try {
        const browser = await this.connect();
        const contexts = browser.contexts();
        const pages = contexts.flatMap((context) => context.pages()).filter((candidate) => !candidate.isClosed());
        const page = pages.find((candidate) => candidate.url().includes(this.config.urlPattern));
        if (page) {
          await page.evaluate(async () => {
            const videos = [...document.querySelectorAll("video")];
            const current = videos.find((video) => !video.paused) || videos[0];
            if (current) {
              current.pause();
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          }).catch(() => {});
        }
      } catch {
        // Best effort; continue to close.
      }
      await this.close();
      await new Promise((resolve, reject) => {
        const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-CdpPort", String(this.config.cdpPort)], { stdio: "ignore" });
        child.once("error", reject);
        child.once("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error("关闭抖音失败，请切换至第二桌面（Win + Tab 切换）手动关闭"));
        });
      });
      return { action, closed: true, message: "抖音已关闭" };
    }
    const browser = await this.connectOrLaunch();
    const contexts = browser.contexts();
    const pages = contexts.flatMap((context) => context.pages()).filter((candidate) => !candidate.isClosed());
    let page = pages.find((candidate) => candidate.url().includes(this.config.urlPattern));
    if (action === "login") {
      this.stopLoginGuard();
      if (this.loginMode) {
        return { action: "login", message: "请切换至第二桌面(win + Tab)登录或键入 work refresh 继续在未登录状态下使用。" };
      }
      page = page || pages.find((candidate) => candidate.url().startsWith("http")) || await contexts[0].newPage();
      await page.goto(this.config.douyinUrl, { waitUntil: "domcontentloaded", timeout: 12000 }).catch(() => {});
      await this.waitStep(page, 1000);
      const message = "请切换至第二桌面(win + Tab)登录或键入 work refresh 继续在未登录状态下使用。";
      if (await findLoginPanel(page).catch(() => null)) {
        this.loginMode = true;
        return { action: "login", message };
      }
      const login = page.locator("button.semi-button.semi-button-primary.WGl8bZmp").first();
      if (!(await login.count())) throw new Error("没有找到登录按钮，请执行 work refresh 后重试");
      try {
        await login.click({ timeout: 2000 });
      } catch (error) {
        const fullPanel = page.locator('[id^="login-full-panel-"]').first();
        if (await fullPanel.count()) {
          this.loginMode = true;
          return { action: "login", message };
        }
        throw error;
      }
      await this.waitStep(page, 500);
      if (!(await findLoginPanel(page).catch(() => null))) throw new Error("登录弹窗未打开，请执行 work login 重试");
      this.loginMode = true;
      return { action: "login", message };
    }
    if (action === "start") {
      this.loginMode = false;
      page = page || pages.find((candidate) => candidate.url().startsWith("http")) || await contexts[0].newPage();
      this.log("INFO", "open: navigating", { url: this.config.douyinUrl });
      let navigationError = null;
      await page.goto(this.config.douyinUrl, { waitUntil: "domcontentloaded", timeout: 12000 }).catch((error) => { navigationError = error; });
      if (!page.url() || page.url() === "about:blank") {
        const replacement = await contexts[0].newPage();
        await replacement.goto(this.config.douyinUrl, { waitUntil: "domcontentloaded", timeout: 12000 }).catch((error) => { navigationError = error; });
        page = replacement;
      }
      if (navigationError && !page.url().includes(this.config.urlPattern)) {
        throw new Error(`抖音页面导航失败: ${navigationError.message}`);
      }
      this.log("INFO", "open: page loaded", { pageUrl: page.url() });
      const mover = fileURLToPath(new URL("../scripts/move-douyin-window.ps1", import.meta.url));
      spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", mover, "-TitlePattern", "抖音"], { detached: true, stdio: "ignore" }).unref();
      for (let i = 0; i < 20; i++) {
        const closed = await this.closeLogin(page, 4000);
        if (closed) break;
        await this.waitStep(page, 250);
      }
      this.startLoginGuard(page);
      this.log("INFO", "open: login modal handled");
      const restoreHome = async () => {
        const back = await page.evaluate(() => {
          const candidate = document.querySelector('.Vjmi41VB') || document.querySelector('.o7hAjQkB.isDark') || document.querySelector('.Xj717eA');
          if (candidate) {
            candidate.click?.();
            candidate.dispatchEvent?.(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return true;
          }
          return false;
        }).catch(() => false);
        if (back) {
          this.log("INFO", "open: returned to home");
          await this.waitStep(page, 800);
        }
      };
      await restoreHome();
      const clicked = await this.clickAnyVideo(page, { totalTimeoutMs: 12000, requireModalChange: true, allowCloseLogin: true });
      if (!clicked) throw new Error("未能从主页进入视频详情，请执行 work refresh 重试");
      this.log("INFO", "open: video card clicked");
      await this.waitStep(page, 500);
      for (let i = 0; i < 20; i++) {
        await this.closeLogin(page, 1000);
        const state = await page.evaluate(STATE_SCRIPT).catch(() => null);
        const inVideoDetail = Boolean(state?.modalId) || /\/video\/|\/detail\//.test(state?.url || "");
        if (inVideoDetail && state?.current?.readyState >= 2 && !state.current.paused && state.current.currentTime > 0.05) {
          this.log("INFO", "open: video playing", state);
          return {
            action: requestedAction,
            pageUrl: page.url(),
            playing: true,
            message: requestedAction === "refresh"
              ? "已继续在未登录状态下使用，并随机进入一个视频"
              : "抖音已在第二桌面（Win + Tab 切换）最小化打开"
          };
        }
        await page.evaluate(PLAY_VISIBLE_SCRIPT).catch(() => {});
        await this.waitStep(page, 250);
      }
      const playing = await this.waitForPlaying(page, 5000);
      if (!playing?.modalId && !/\/video\/|\/detail\//.test(playing?.url || "")) {
        throw new Error("视频仍停留在主页，请执行 work refresh 重试");
      }
      return {
        action: requestedAction,
        pageUrl: page.url(),
        playing: true,
        message: requestedAction === "refresh"
          ? "已继续在未登录状态下使用，并随机进入一个视频"
          : "抖音已在第二桌面（Win + Tab 切换）最小化打开"
      };
    }
    if (!page) throw new Error(`没有找到 URL 包含 ${this.config.urlPattern} 的标签页`);
    const loginPanel = await findLoginPanel(page).catch(() => null);
    if (loginPanel) {
      if (this.loginGuard) await this.closeLogin(page, 1200);
      else throw new Error("检测到登录弹窗，请键入：work login 并切换至第二桌面(win + Tab)登录或继续在未登录状态下使用。");
    }
    if (action === "search") {
      const searchText = payload || "";
      if (!searchText.trim()) throw new Error("search 需要搜索关键词");
      // 优先返回主页进行搜索（主页搜索框更稳定可靠）
      const returned = await page.evaluate(() => {
        const back = document.querySelector('.Vjmi41VB') || document.querySelector('.o7hAjQkB.isDark') || document.querySelector('.Xj717eA');
        if (back) { back.click(); return true; }
        return false;
      }).catch(() => false);
      if (returned) {
        this.log("INFO", "search: returned to home page");
        await this.waitStep(page, 800);
        await this.ensureLoginReady(page, "搜索");
      }
      let input = await findSearchInput(page).catch(() => null);
      if (!input) {
        await this.ensureLoginReady(page, "搜索");
        input = await findSearchInput(page).catch(() => null);
      }
      if (!input) throw new Error("没有找到搜索框");
      await input.click({ timeout: 500 }).catch(() => {});
      await input.fill(searchText, { timeout: 1000 }).catch(async () => {
        await input.press("Control+A").catch(() => {});
        await input.type(searchText, { delay: 20 }).catch(() => {});
      });
      const button = await findSearchButton(page).catch(() => null);
      if (button) {
        await button.click({ timeout: 600 }).catch(() => {});
      } else {
        await input.press("Enter").catch(() => {});
      }
      await this.waitStep(page, 1000);
      await this.ensureLoginReady(page, "搜索");
      const clicked = await this.clickAnyVideo(page, { totalTimeoutMs: 9000, requireModalChange: false });
      if (!clicked) throw new Error("搜索后没有找到可点击的视频卡片");
      await page.evaluate(PLAY_VISIBLE_SCRIPT).catch(() => {});
      const playing = await this.waitForPlaying(page, 5000);
      return {
        action: "search",
        query: searchText,
        pageUrl: page.url(),
        playing: true,
        state: playing,
        message: `已搜索“${searchText}”并随机进入一个视频`
      };
    }
    if (action === "quickly") {
      const rawRate = (payload || "").trim();
      if (!rawRate) throw new Error("quickly 需要倍速值，例如 1.25");
      const rateNum = Number(rawRate);
      if (!Number.isFinite(rateNum) || rateNum <= 0) throw new Error(`倍速值无效: ${rawRate}`);
      // 全部在 evaluate 内完成：开面板 → 点选项 → 验证 playbackRate
      const result = await page.evaluate(async (payload) => {
        const { wantedRate, rateValue } = payload;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const inView = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight;
        };
        const getVideo = () => {
          const videos = [...document.querySelectorAll("video")];
          const visible = videos.filter((v) => {
            const r = v.getBoundingClientRect();
            return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < innerHeight;
          }).sort((a, b) => (b.getBoundingClientRect().height - a.getBoundingClientRect().height))[0];
          return visible || videos[0];
        };

        // 1) 找并点击倍速按钮（可能在设置面板里，需要先点设置齿轮）
        let panelBtn = document.querySelector(".xgplayer-setting-playbackRatio") ||
          document.querySelector(".xgplayer-playback-setting");
        if (!panelBtn) {
          // 可能需要先打开设置面板
          const settings = document.querySelector(".xgplayer-setting") ||
            document.querySelector('[class*="xgplayer-setting"]:not([class*="playback"]):not([class*="volume"])');
          if (settings && inView(settings)) {
            settings.click?.();
            settings.dispatchEvent?.(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
            await sleep(200);
          }
          panelBtn = document.querySelector(".xgplayer-setting-playbackRatio") ||
            document.querySelector(".xgplayer-playback-setting");
        }
        // 文字兜底
        if (!panelBtn) {
          panelBtn = [...document.querySelectorAll("xg-icon,div,button,[role=button]")]
            .filter(inView)
            .find((el) => {
              const txt = (el.textContent || "").replace(/\s+/g, "");
              return txt.includes("倍速") || /倍速\d/.test(txt) || /^\d+(\.\d+)?倍?$/.test(txt);
            });
        }
        let panelOpened = false;
        if (panelBtn) {
          panelBtn.click?.();
          panelBtn.dispatchEvent?.(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
          await sleep(300);
          panelOpened = true;
        }

        // 2) 在面板里找目标倍速选项
        const selectors = [
          `[data-id="${wantedRate}"]`,
          `.xgplayer-playratio-item[data-id="${wantedRate}"]`,
          `.xgplayer-playback-setting [data-id="${wantedRate}"]`,
          `.xgplayer-setting-playbackRatio [data-id="${wantedRate}"]`
        ];
        let option = [...document.querySelectorAll(selectors.join(","))]
          .find((el) => inView(el));
        if (!option) {
          // 文字匹配兜底
          option = [...document.querySelectorAll(".xgplayer-playratio-item,[data-index],div[data-state],div[role=menuitem],li,div")]
            .find((el) => {
              if (!inView(el)) return false;
              const txt = (el.getAttribute("data-id") || el.textContent || "").replace(/\s+/g, "");
              return txt === wantedRate || txt === `${wantedRate}x` || txt === `${wantedRate}倍`;
            });
        }
        let uiClicked = false;
        if (option) {
          option.click?.();
          option.dispatchEvent?.(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
          option.dispatchEvent?.(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
          option.dispatchEvent?.(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
          uiClicked = true;
          await sleep(300);
        }

        // 3) 验证 video.playbackRate 是否生效
        let video = getVideo();
        let actualRate = video?.playbackRate;
        // 如果 UI 点击没生效，强制设 playbackRate 并持续覆盖
        if (actualRate !== rateValue && video) {
          try {
            video.playbackRate = rateValue;
            await sleep(100);
            actualRate = video.playbackRate;
          } catch {}
        }
        return {
          found: uiClicked || !!video,
          panelOpened,
          uiClicked,
          actualRate,
          wantedRate,
          videoFound: !!video
        };
      }, { wantedRate: rawRate, rateValue: rateNum }).catch((e) => ({ found: false, error: e.message }));

      this.log("INFO", "quickly: result", result);

      // 4) 如果 playbackRate 仍不匹配，用轮询强制设置（xgplayer 会覆盖，所以要持续设）
      if (result?.found && result.actualRate !== rateNum) {
        this.log("WARN", "quickly: playbackRate mismatch, applying override", { actual: result.actualRate, wanted: rateNum });
        const overrideResult = await page.evaluate(async (rateValue) => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const getVideo = () => {
            const videos = [...document.querySelectorAll("video")];
            const visible = videos.filter((v) => {
              const r = v.getBoundingClientRect();
              return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < innerHeight;
            }).sort((a, b) => (b.getBoundingClientRect().height - a.getBoundingClientRect().height))[0];
            return visible || videos[0];
          };
          let success = false;
          for (let i = 0; i < 5; i++) {
            const video = getVideo();
            if (video) {
              try { video.playbackRate = rateValue; } catch {}
              await sleep(100);
              if (Math.abs(video.playbackRate - rateValue) < 0.01) { success = true; break; }
            }
            await sleep(100);
          }
          return { success, finalRate: getVideo()?.playbackRate };
        }, rateNum).catch(() => ({ success: false }));
        this.log("INFO", "quickly: override result", overrideResult);
        if (overrideResult?.success) {
          return { action: "quickly", rate: rawRate, playbackRate: rateNum, message: `已切换到 ${rawRate} 倍速` };
        }
      }

      if (result?.found && result.actualRate === rateNum) {
        return { action: "quickly", rate: rawRate, playbackRate: rateNum, message: `已切换到 ${rawRate} 倍速` };
      }
      // 倍速功能需要登录，未登录时页面会弹出登录框
      const loginVisible = await findLoginPanel(page).catch(() => null);
      if (loginVisible) {
        this._requireLogin(page, "调整倍速");
      }
      throw new Error(`倍速切换失败（panelOpened=${result?.panelOpened}, uiClicked=${result?.uiClicked}, actualRate=${result?.actualRate}），请先执行 ${this.config.commandPrefix || "work"} start 后重试`);
    }
    if (action === "like") {
      await this.ensureLoginReady(page, "点赞");
      const clicked = await page.evaluate(LIKE_SCRIPT);
      if (!clicked?.found) throw new Error("没有找到点赞按钮");
      await page.mouse.click(clicked.x, clicked.y).catch(() => {});
      await this.waitStep(page, 500);
      await this.ensureLoginReady(page, "点赞");
      const deadline = Date.now() + 2500;
      let afterLike = "";
      while (Date.now() < deadline) {
        afterLike = await page.evaluate(() => {
          const visible = [...document.querySelectorAll('[data-e2e="video-player-digg"]')].find((item) => {
            const rect = item.getBoundingClientRect();
            return rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < innerHeight;
          });
          return visible?.getAttribute("aria-pressed") || visible?.getAttribute("data-e2e-state") || visible?.className?.toString() || "";
        }).catch(() => "");
        if (afterLike && afterLike !== clicked.before) break;
        await this.waitStep(page, 150);
      }
      if (!afterLike || afterLike === clicked.before) {
        throw new Error(`点赞状态没有改变，当前状态: ${afterLike || "未知"}`);
      }
      this.log("INFO", "like state", { before: clicked.before, after: afterLike });
      return { action, message: "点赞成功" };
    }
    if (action === "favorite") {
      await this.ensureLoginReady(page, "收藏");
      const clicked = await page.evaluate(FAVORITE_SCRIPT);
      if (!clicked?.found) throw new Error("没有找到收藏按钮");
      await page.mouse.click(clicked.x, clicked.y).catch(() => {});
      await this.waitStep(page, 500);
      await this.ensureLoginReady(page, "收藏");
      const deadline = Date.now() + 2500;
      let afterState = "";
      while (Date.now() < deadline) {
        afterState = await page.evaluate(() => {
          const visible = [...document.querySelectorAll('[data-e2e="video-player-favorite"], [data-e2e*="favorite"]')].find((item) => {
            const rect = item.getBoundingClientRect();
            return rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < innerHeight;
          });
          return visible?.getAttribute("aria-pressed") || visible?.getAttribute("data-e2e-state") || visible?.getAttribute("data-favorited") || visible?.className?.toString() || "";
        }).catch(() => "");
        if (afterState && afterState !== clicked.before) break;
        await this.waitStep(page, 150);
      }
      if (!afterState || afterState === clicked.before) throw new Error("收藏状态没有改变");
      this.log("INFO", "favorite state", { before: clicked.before, after: afterState });
      return { action, message: "收藏成功" };
    }
    const before = (action === "next" || action === "prev") ? await page.evaluate(STATE_SCRIPT) : null;
    const playbackBefore = ["play", "pause", "toggle"].includes(action)
      ? await page.evaluate(STATE_SCRIPT).catch(() => null)
      : null;
    const result = await page.evaluate(ACTION_SCRIPT, { action });
    if (action === "next" || action === "prev") {
      const direction = action === "next" ? 1 : -1;
      const viewportHeight = await page.evaluate(() => innerHeight).catch(() => 800);
      // Browser-level wheel input is simulated inside the page; it does not touch the user's keyboard.
      await page.mouse.wheel(0, direction * Math.max(viewportHeight * 0.9, 600)).catch(() => {});
      let after = await page.evaluate(STATE_SCRIPT).catch(() => null);
      for (let i = 0; i < 20 && !this.stateChanged(before, after); i++) {
        await this.waitStep(page, 250);
        await this.ensureLoginReady(page, action === "next" ? "切换到下一个视频" : "切换到上一个视频");
        after = await page.evaluate(STATE_SCRIPT).catch(() => null);
      }
      if (!this.stateChanged(before, after)) {
        await this.ensureLoginReady(page, action === "next" ? "切换到下一个视频" : "切换到上一个视频");
        const nav = await page.evaluate(NAV_BUTTON_SCRIPT, { direction }).catch(() => null);
        if (nav) await page.mouse.click(nav.x, nav.y).catch(() => {});
        for (let i = 0; i < 20 && !this.stateChanged(before, after); i++) {
          await this.waitStep(page, 250);
          await this.ensureLoginReady(page, action === "next" ? "切换到下一个视频" : "切换到上一个视频");
          after = await page.evaluate(STATE_SCRIPT).catch(() => null);
        }
      }
      if (!this.stateChanged(before, after)) {
        throw new Error(`${action === "next" ? "下一个" : "上一个"}视频未切换；before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
      }
      await page.evaluate(PLAY_VISIBLE_SCRIPT).catch(() => {});
      const playing = await this.waitForPlaying(page, 3000);
      return {
        action,
        changed: true,
        playing: true,
        pageUrl: page.url(),
        state: playing,
        message: action === "next" ? "已切换到下一个视频并开始播放" : "已切换到上一个视频并开始播放"
      };
    }
    if (["play", "pause", "toggle"].includes(action)) {
      const state = playbackBefore;
      if (!state?.current) throw new Error("当前页面没有找到 video 元素");
      const expectedPaused = action === "pause" ? true : action === "play" ? false : !state.current.paused;
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const current = await page.evaluate(STATE_SCRIPT).catch(() => null);
        if (current?.current?.paused === expectedPaused) {
          return {
            action,
            playing: !expectedPaused,
            pageUrl: page.url(),
            message: expectedPaused ? "已暂停" : "已开始播放"
          };
        }
        await this.waitStep(page, 150);
      }
      throw new Error(`无法${expectedPaused ? "暂停" : "播放"}当前视频`);
    }
    const messages = { mute: "已静音", unmute: "已取消静音" };
    return { ...result, pageUrl: page.url(), message: messages[action] };
  }

  async close() {
    this.stopLoginGuard();
    this.loginMode = false;
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
  }
}
