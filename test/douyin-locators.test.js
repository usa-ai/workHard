import assert from "node:assert/strict";
import test from "node:test";
import { findLoginCloseLocator, findLoginPanel, findPlaybackRateOption, findSearchInput } from "../src/douyin-locators.js";

function createLocator({ visible = true, box = { x: 0, y: 0, width: 100, height: 24 } } = {}) {
  return {
    async count() { return 1; },
    async isVisible() { return visible; },
    async boundingBox() { return box; },
    async click() { return true; },
    async fill() { return true; },
    async press() { return true; },
    first() { return this; }
  };
}

function createPage(map) {
  return {
    locator(selector) {
      return map[selector] || createLocator({ visible: false, box: null });
    }
  };
}

test("findSearchInput prefers the visible searchbar input", async () => {
  const search = createLocator();
  const page = createPage({
    'input[placeholder*="搜索"]': createLocator({ visible: false }),
    'input[data-e2e="searchbar-input"]': search
  });

  assert.equal(await findSearchInput(page), search);
});

test("findPlaybackRateOption selects the requested rate item", async () => {
  const option = createLocator();
  const page = createPage({
    '[data-id="1.25"]': option
  });

  assert.equal(await findPlaybackRateOption(page, "1.25"), option);
});

test("findLoginPanel returns the login panel when it exists", async () => {
  const panel = createLocator({ box: { x: 10, y: 20, width: 300, height: 200 } });
  const page = createPage({
    "#login-panel-new": panel
  });

  assert.equal(await findLoginPanel(page), panel);
});

test("findLoginCloseLocator prefers an explicit close control", async () => {
  const close = createLocator();
  const page = createPage({
    '#login-panel-new button[aria-label*="关闭"]': close
  });

  assert.equal(await findLoginCloseLocator(page), close);
});
