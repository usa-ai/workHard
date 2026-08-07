import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { browserLogFile } from "./logger.js";
import {
  findLoginCloseLocator,
  findLoginPanel,
  findPlaybackPanelButton,
  findPlaybackRateOption,
  findSearchButton,
  findSearchInput,
  findFavoriteButton
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
  if (action === "pause") {
    if (current.paused) {
      current.muted = false;
      await current.play().catch(() => {});
    } else {
      current.pause();
    }
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

const CLOSE_LOGIN_SCRIPT = () => {
  const panel = document.querySelector("#login-panel-new");
  if (!panel) return false;
  const candidates = [
    panel.querySelector('[data-e2e*="close"]'),
    panel.querySelector('[aria-label*="关闭"]'),
    panel.querySelector('[title*="关闭"]'),
    panel.querySelector("svg.YoNA2Hyj.qKr0RhiL"),
    panel.querySelector("svg")
  ].filter(Boolean);
  for (const target of candidates) {
    target.closest?.("button,[role=button]")?.click?.();
    target.dispatchEvent?.(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    target.click?.();
  }
  return true;
};

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
  constructor(config, logger = () => {}) { this.config = config; this.browser = null; this.log = logger; this.actionTail = Promise.resolve(); }

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
      await page.waitForTimeout(250);
    }
    const state = await page.evaluate(STATE_SCRIPT).catch(() => null);
    throw new Error(`视频未开始播放，当前状态: ${JSON.stringify(state)}`);
  }

  async closeLogin(page, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    let noCloseCount = 0;
    while (Date.now() < deadline) {
      const panel = await findLoginPanel(page).catch(() => null);
      if (!panel) return true;
      const close = await findLoginCloseLocator(page).catch(() => null);
      if (close) {
        await close.click({ timeout: 300 }).catch(() => {});
        await page.evaluate(CLOSE_LOGIN_SCRIPT).catch(() => {});
        await page.waitForTimeout(200);
        noCloseCount = 0;
      } else {
        await page.evaluate(CLOSE_LOGIN_SCRIPT).catch(() => {});
        await page.waitForTimeout(200);
        noCloseCount++;
        // 连续3次未找到关闭按钮，判定为第二种无法关闭的登录弹窗
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
    const onSecondDesktop = "请切换至第二桌面（Win + Tab 切换）登录后重试";
    throw new Error(`暂时无法${actionName}，${onSecondDesktop}`);
  }

  async ensureLoginReady(page, actionName) {
    const loginPanel = await findLoginPanel(page).catch(() => null);
    if (loginPanel) this._requireLogin(page, actionName);
    const loginVisible = await page.locator("#login-panel-new").count().catch(() => 0);
    if (loginVisible) this._requireLogin(page, actionName);
  }

  async waitForVideoCard(page, timeoutMs = 6000) {
    return await this.clickAnyVideo(page, { totalTimeoutMs: timeoutMs, requireModalChange: false });
  }

  async clickAnyVideo(page, opts = {}) {
    const { totalTimeoutMs = 10000, requireModalChange = true } = opts;
    const deadline = Date.now() + totalTimeoutMs;
    const before = await page.evaluate(STATE_SCRIPT).catch(() => null);
    const isInModal = (state) => Boolean(state?.modalId) ||
      (state?.current?.width >= 800 && state?.current?.height >= 500 && state?.current?.currentTime > 0.2);
    let lastReason = "no candidates";
    let scrollAttempts = 0;
    while (Date.now() < deadline) {
      await this.closeLogin(page, 600).catch(() => {});
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
          const pick = strongAnchorCandidates[0];
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
        const containers = [...document.querySelectorAll(containerSelector)].filter((c) => bigInView(c, 160, 160));
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
        const bigImg = [...document.querySelectorAll("img")].find((img) => bigInView(img, 300, 300));
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
        await page.waitForTimeout(350);
        continue;
      }
      this.log("INFO", "clickAnyVideo: attempt", result);
      // 给进入详情的页面过渡一点时间
      await page.waitForTimeout(900);
      const after = await page.evaluate(STATE_SCRIPT).catch(() => null);
      const entered = isInModal(after) && (
        !requireModalChange ||
        after?.modalId !== before?.modalId ||
        after?.url !== before?.url ||
        (after?.current?.src && after.current.src !== before?.current?.src)
      );
      if (entered) return true;
      lastReason = "clicked-but-not-entered";
      await page.waitForTimeout(250);
    }
    this.log("WARN", "clickAnyVideo: failed", { lastReason, beforeUrl: before?.url, beforeModalId: before?.modalId });
    return false;
  }

  stateChanged(before, after) {
    if (!before || !after) return false;
    if (before.modalId !== after.modalId) return true;
    if (before.current?.src && after.current?.src && before.current.src !== after.current.src) return true;
    if (before.current && after.current && before.current.src === after.current.src && after.current.currentTime < before.current.currentTime - 0.75) return true;
    return false;
  }

  async runAction(action, payload = "") {
    const previous = this.actionTail;
    let release;
    this.actionTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await this._runAction(action, payload);
    } finally {
      release();
    }
  }

  async _runAction(action, payload = "") {
    if (action === "open") action = "start";
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
      return { action, closed: true };
    }
    const browser = await this.connectOrLaunch();
    const contexts = browser.contexts();
    const pages = contexts.flatMap((context) => context.pages()).filter((candidate) => !candidate.isClosed());
    let page = pages.find((candidate) => candidate.url().includes(this.config.urlPattern));
    if (action === "start") {
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
      await page.evaluate(() => {
        if (window.__workDouyinLoginGuard) clearInterval(window.__workDouyinLoginGuard);
        window.__workDouyinLoginGuard = setInterval(() => {
          const panel = document.querySelector("#login-panel-new");
          const close = panel?.querySelector("svg.YoNA2Hyj.qKr0RhiL") || panel?.querySelector("svg");
          if (close) { close.closest("button,[role=button]")?.click(); close.click?.(); }
        }, 200);
      }).catch(() => {});
      for (let i = 0; i < 20; i++) {
        const closed = await this.closeLogin(page);
        if (closed) break;
        await page.waitForTimeout(250);
      }
      this.log("INFO", "open: login guard applied");
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
          await page.waitForTimeout(800);
        }
      };
      await restoreHome();
      const clicked = await this.clickAnyVideo(page, { totalTimeoutMs: 12000, requireModalChange: true });
      if (!clicked) {
        this.log("WARN", "open: clickAnyVideo did not enter video, retry with scroll-then-click fallback");
      } else {
        this.log("INFO", "open: video card clicked");
      }
      for (let i = 0; i < 20; i++) {
        await this.closeLogin(page, 1000);
        const state = await page.evaluate(STATE_SCRIPT).catch(() => null);
        if (state?.current?.readyState >= 2 && !state.current.paused && state.current.currentTime > 0.05) {
          this.log("INFO", "open: video playing", state);
          return { action: "start", pageUrl: page.url(), playing: true, message: "抖音已在第二桌面（Win + Tab 切换）最小化打开" };
        }
        await page.evaluate(PLAY_VISIBLE_SCRIPT).catch(() => {});
        await page.waitForTimeout(250);
      }
      await this.waitForPlaying(page, 5000);
      return { action: "start", pageUrl: page.url(), playing: true, message: "抖音已在第二桌面（Win + Tab 切换）最小化打开" };
    }
    if (!page) throw new Error(`没有找到 URL 包含 ${this.config.urlPattern} 的标签页`);
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
        await page.waitForTimeout(800);
        await this.closeLogin(page, 1000);
      }
      let input = await findSearchInput(page).catch(() => null);
      if (!input) {
        await this.closeLogin(page, 1500);
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
      await page.waitForTimeout(1000);
      await this.closeLogin(page, 1500);
      const clicked = await this.clickAnyVideo(page, { totalTimeoutMs: 9000, requireModalChange: false });
      if (!clicked) throw new Error("搜索后没有找到可点击的视频卡片");
      await page.evaluate(PLAY_VISIBLE_SCRIPT).catch(() => {});
      const playing = await this.waitForPlaying(page, 5000);
      return { action: "search", query: searchText, pageUrl: page.url(), playing: true, state: playing };
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
      const loginVisible = await page.locator("#login-panel-new").count().catch(() => 0);
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
      await page.waitForTimeout(500);
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
        await page.waitForTimeout(150);
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
      await page.waitForTimeout(500);
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
        await page.waitForTimeout(150);
      }
      this.log("INFO", "favorite state", { before: clicked.before, after: afterState });
      return { action, message: "收藏成功" };
    }
    const before = (action === "next" || action === "prev") ? await page.evaluate(STATE_SCRIPT) : null;
    const pauseBefore = action === "pause" ? await page.evaluate(STATE_SCRIPT).catch(() => null) : null;
    const result = await page.evaluate(ACTION_SCRIPT, { action });
    if (action === "next" || action === "prev") {
      const direction = action === "next" ? 1 : -1;
      const viewportHeight = await page.evaluate(() => innerHeight).catch(() => 800);
      // Browser-level wheel input is simulated inside the page; it does not touch the user's keyboard.
      await page.mouse.wheel(0, direction * Math.max(viewportHeight * 0.9, 600)).catch(() => {});
      let after = await page.evaluate(STATE_SCRIPT).catch(() => null);
      for (let i = 0; i < 20 && !this.stateChanged(before, after); i++) {
        await page.waitForTimeout(250);
        after = await page.evaluate(STATE_SCRIPT).catch(() => null);
      }
      if (!this.stateChanged(before, after)) {
        const nav = await page.evaluate(NAV_BUTTON_SCRIPT, { direction }).catch(() => null);
        if (nav) await page.mouse.click(nav.x, nav.y).catch(() => {});
        for (let i = 0; i < 20 && !this.stateChanged(before, after); i++) {
          await page.waitForTimeout(250);
          after = await page.evaluate(STATE_SCRIPT).catch(() => null);
        }
      }
      if (!this.stateChanged(before, after)) {
        throw new Error(`${action === "next" ? "下一个" : "上一个"}视频未切换；before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
      }
      await page.evaluate(PLAY_VISIBLE_SCRIPT).catch(() => {});
      const playing = await this.waitForPlaying(page, 3000);
      return { action, changed: true, playing: true, pageUrl: page.url(), state: playing };
    }
    if (action === "pause") {
      const state = pauseBefore;
      if (!state?.current) throw new Error("当前页面没有找到 video 元素");
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const current = await page.evaluate(STATE_SCRIPT).catch(() => null);
        if (current?.current && current.current.paused !== state.current.paused) {
          return { action, playing: !current.current.paused, pageUrl: page.url() };
        }
        await page.waitForTimeout(150);
      }
      throw new Error("播放/暂停状态没有改变");
    }
    return { ...result, pageUrl: page.url() };
  }

  async close() {
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
  }
}
