---
name: browser-media-control
description: Use when the user sends browser media-control commands for a Douyin page, including start, close, next/previous, play/pause, mute, like, search, and playback speed.
---

# Browser Media Control

Use the local service at `http://127.0.0.1:37651` to control the user's Chromium browser. Map natural-language commands to these POST endpoints:

- `打开抖音` -> `/action/start`
- `关闭抖音` -> `/action/off`
- `下一个视频` -> `/action/next`
- `上一个视频` -> `/action/prev`
- `播放/暂停` -> `/action/toggle`
- `静音` -> `/action/mute`
- `取消静音` -> `/action/unmute`
- `点赞` -> `/action/like`
- `搜索 <关键词>` -> `/action/search/<URL-encoded keyword>`
- `倍速 <数字>` -> `/action/quickly/<rate>`

Call the endpoint with a POST request. Report the returned error directly when the service is not running, the browser was not started with a CDP port, or no Douyin tab was found. For `/action/like`, relay the `点赞成功` message. Do not use the user's physical keyboard; all events must be injected into the browser page.
