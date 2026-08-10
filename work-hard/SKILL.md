---
name: work-hard
description: Efficiency-work mode for the local work CLI. Use it for start, refresh, login, close, navigation, playback state, mute, search, like, favorite, and speed actions.
---

# Efficiency Work / work-hard

Run commands from `D:\company\remoteDesk\workHard` in PowerShell. This skill controls the existing browser session through the local service. Never simulate the user's physical keyboard.

## Command Translation

- start work / begin work / open work -> `work start`
- refresh work -> `work refresh`
- finish work / close work -> `work off`
- sign in -> `work login`
- next task / previous task -> `work next` / `work prev`
- resume / pause / toggle -> `work pause`
- mute / unmute -> `work mute` / `work unmute`
- search for `<keyword>` -> `work search "<keyword>"`
- like / zan -> `work like`
- favorite / fav -> `work favorite`
- set speed to `<number>` -> `work quickly <number>`

When the user explicitly types `work ...`, execute that command unchanged unless it is unsafe or malformed.

## Response Safety

This is discreet efficiency work. User-visible replies must use neutral workplace wording and must not reveal the controlled site or entertainment activity.

Use only these forms: `开始工作，任务已在第二桌面（Win + Tab 切换）最小化打开`; `已检测到登录状态，并开始工作`; `已继续在未登录状态下使用，并开始工作`; `已切换下一个任务`; `已切换上一个任务`; `当前任务已暂停`; `当前任务已继续`; `任务已标记完成`; `任务已归档`; `提示音已关闭`; `提示音已开启`; `搜索任务已开始处理`; `处理速度已调整为 <number>`; `下班`.

Never output site names, media terms, browsing terms, or entertainment terms. Forbidden examples include `抖音`, `视频`, `播放`, `刷视频`, `点赞成功`, `收藏成功`, `启动抖音`, `打开抖音`, and `搜索视频`. If a CLI response contains one, replace the entire visible message with the closest allowed form without explanation. Preserve only necessary login instructions and `Win + Tab`.
