// Shared selectors for login panel detection.
// Used by both Playwright locators (array) and browser-side scripts (CSS string).

export const LOGIN_PANEL_SELECTORS = [
  '#login-panel-new',
  '[id^="login-panel-new"]',
  '[id^="login-full-panel-"]',
  '[role="dialog"]:has-text("登录")',
  '[class*="login" i][class*="panel" i]',
  '[class*="login-modal" i]',
  '#douyin_login_comp_normal_input_id',
  '#douyin_login_comp_qr_code_id'
];

// CSS-only selectors (valid for document.querySelector, no Playwright extensions)
export const LOGIN_PANEL_CSS = [
  '#login-panel-new',
  '[id^="login-panel-new"]',
  '[id^="login-full-panel-"]',
  '[role="dialog"]',
  '[class*="login" i][class*="panel" i]',
  '[class*="login-modal" i]',
  '#douyin_login_comp_normal_input_id',
  '#douyin_login_comp_qr_code_id'
].join(', ');

export const LOGIN_CLOSE_SELECTORS = [
  '#login-panel-new button[aria-label*="关闭"]',
  '#login-panel-new .YoNA2Hyj.qKr0RhiL',
  '[id^="login-panel-new"] .YoNA2Hyj.qKr0RhiL',
  '.YoNA2Hyj.qKr0RhiL',
  'svg.YoNA2Hyj.qKr0RhiL',
  '[data-e2e*="close"]',
  '[aria-label*="关闭"]',
  '[aria-label*="close" i]',
  '[title*="关闭"]',
  '[title*="close" i]',
  '[class*="close" i]'
];

export const LOGIN_CLOSE_CSS = LOGIN_CLOSE_SELECTORS.join(', ');

async function pickVisibleLocator(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) > 0 && await locator.isVisible()) return locator;
    } catch {
      // Keep scanning other selectors.
    }
  }
  return null;
}

export async function findSearchInput(page) {
  return pickVisibleLocator(page, [
    'input[data-e2e="searchbar-input"]',
    'input#searchbar-input',
    '.uCidR0ch.QdL4imch input',
    '.GySDQyGR.Qb1oCRWQ.nZUU7xBs.V3mV_2qE input',
    '.zPZkM57p.zg64VJR1 input',
    '.uCidR0ch input',
    '.GySDQyGR input',
    '.zPZkM57p input',
    'input[placeholder*="搜索"]',
    'input[placeholder*="搜"]'
  ]);
}

export async function findSearchButton(page) {
  return pickVisibleLocator(page, [
    '[data-e2e="searchbar-button"]',
    'button[data-e2e="searchbar-button"]',
    'button:has-text("搜索")',
    'button[aria-label*="搜索"]'
  ]);
}

export async function findLoginPanel(page) {
  return pickVisibleLocator(page, LOGIN_PANEL_SELECTORS);
}

export async function findLoginCloseLocator(page) {
  for (const selector of LOGIN_CLOSE_SELECTORS) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) > 0 && await locator.isVisible()) return locator;
    } catch {
      // Keep scanning other close-button shapes.
    }
  }
  return null;
}

export async function findPlaybackPanelButton(page) {
  return pickVisibleLocator(page, [
    '.xgplayer-setting-playbackRatio',
    '.xgplayer-playback-setting',
    'div:has-text("倍速")',
    'button:has-text("倍速")'
  ]);
}

export async function findPlaybackRateOption(page, rate) {
  const value = String(rate);
  return pickVisibleLocator(page, [
    `[data-id="${value}"]`,
    `.xgplayer-playratio-item[data-id="${value}"]`,
    `.xgplayer-playback-setting [data-id="${value}"]`,
    `.xgplayer-setting-playbackRatio [data-id="${value}"]`,
    `div:has-text("${value}")`
  ]);
}

export async function findFavoriteButton(page) {
  return pickVisibleLocator(page, [
    '[data-e2e="video-player-favorite"]',
    'button[data-e2e="video-player-favorite"]',
    '[data-e2e*="favorite"]',
    '.xgplayer-favorite',
    'button:has-text("收藏")'
  ]);
}
