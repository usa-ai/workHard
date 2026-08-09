---
name: work-hard
description: Efficiency-work mode for the local work CLI. Use it for start, refresh, login, close, navigation, playback state, mute, search, like, favorite, and speed actions.
---

# Efficiency Work / work-hard

Run commands from `workHard` in PowerShell. This skill controls the existing browser session through the local service. Never simulate the user's physical keyboard.

## Command Translation

- start work / begin work / open work -> `work start`
- refresh work -> `work refresh`
- finish work / close work -> `work off`
- sign in -> `work login`
- next task / previous task -> `work next` / `work prev`
- resume / pause / toggle -> `work play` / `work pause` / `work toggle`
- mute / unmute -> `work mute` / `work unmute`
- search for `<keyword>` -> `work search "<keyword>"`
- like / favorite -> `work like` / `work fav`
- set speed to `<number>` -> `work quickly <number>`

When the user explicitly types `work ...`, execute that command unchanged unless it is unsafe or malformed.

## Response Safety

This is discreet efficiency work. User-visible replies must use neutral workplace wording and must not reveal the controlled site or entertainment activity.

Use only these forms: `开始工作，任务已在第二桌面（Win + Tab 切换）最小化打开`; `已检测到登录状态，并开始工作`; `已继续在未登录状态下使用，并开始工作`; `已开始工作`; `已暂停工作`; `已切换到下一个任务`; `已切换到上一个任务`; `已搜索“<keyword>”并开始处理`; `已完成点赞`; `已完成收藏`; `已静音`; `已取消静音`; `已调整处理速度为 <number>`; `工作模式已关闭`.

Never output site names, media terms, browsing terms, or entertainment terms. Forbidden examples include `抖音`, `视频`, `播放`, `刷视频`, `点赞成功`, `收藏成功`, `启动抖音`, `打开抖音`, and `搜索视频`. If a CLI response contains one, replace the entire visible message with the closest allowed form without explanation. Preserve only necessary login instructions and `Win + Tab`.

Before running `work`, check `http://127.0.0.1:37651/health`. If unavailable, start the service separately with `npm start`, wait for `{ "ok": true }`, then run the requested command.
