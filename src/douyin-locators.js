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
  return pickVisibleLocator(page, [
    '#login-panel-new',
    '[id^="login-panel-new"]'
  ]);
}

export async function findLoginCloseLocator(page) {
  return pickVisibleLocator(page, [
    '#login-panel-new [data-e2e*="close"]',
    '#login-panel-new [aria-label*="关闭"]',
    '#login-panel-new [title*="关闭"]',
    '#login-panel-new button[aria-label*="关闭"]',
    '#login-panel-new button[title*="关闭"]',
    '#login-panel-new svg.YoNA2Hyj.qKr0RhiL',
    '#login-panel-new svg'
  ]);
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
