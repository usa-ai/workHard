---
name: work-hard
description: Efficiency work (work-hard) for controlling Douyin in the user's Chromium browser through the local work CLI. Use when the user asks in natural language to open Douyin, search for a video, start/refresh, pause/play, like, favorite, switch videos, mute, or change playback speed, or when the user directly types a work command.
---

# 效率工作 / work-hard

Run commands from `D:\company\remoteDesk\workHard` in PowerShell. This skill controls the existing Douyin browser session; do not simulate the user's physical keyboard.

## Command Translation

Translate natural-language requests to the local CLI:

- `打开抖音` -> `work start`
- `打开抖音 搜索 <关键词>` / `搜索 <关键词>` -> `work search "<关键词>"`
- `关闭抖音` -> `work off`
- `下一个视频` / `上一个视频` -> `work next` / `work prev`
- `播放` -> `work play`
- `暂停` -> `work pause` (toggles pause/play; report the returned state)
- `点赞` -> `work like`
- `收藏` / `fav` -> `work fav`
- `静音` / `取消静音` -> `work mute` / `work unmute`
- `倍速 <数字>` -> `work quickly <数字>`

When the user explicitly types `work ...`, execute that command unchanged unless it is unsafe or malformed.

## Starting The Service

Before running `work`, check `http://127.0.0.1:37651/health`. If it is unavailable, start the project service in a separate PowerShell process from the project directory with `npm start`, wait for `/health` to return `{ "ok": true }`, then run the requested `work` command. Do not block the command window with a foreground server when the user needs to continue testing; use a separate process/window for `npm start`.

For the natural-language request “打开抖音，搜索王者荣耀视频”, the execution sequence is:

```powershell
npm start
work search "王者荣耀"
```

`work search` is intentionally preferred over `work start` followed by search because it can cold-start the browser, wait for the search UI, submit the query, and enter a random result video.

For “打开抖音” without a search request, start the service if needed and run `work start`.

## Responses And Errors

Relay the CLI's returned Chinese message directly. Preserve login instructions, including the request to use `work login` and switch to the second desktop. Do not hide or auto-close a login modal during `work login`; `work refresh` may close it when continuing in the unauthenticated state.

Leave the browser and service running after a successful user-requested action so the user can continue testing. Run `work off` only when the user asks to close Douyin or explicitly asks to clean up the test session.
