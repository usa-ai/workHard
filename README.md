# 效率工作（work-hard）

通过本地 Node.js 服务和 Chrome/Edge CDP 控制抖音。可以在 PowerShell 中使用 `work` 命令，也可以在 Codex 对话框中使用 `$work-hard` Skill 让模型执行相同的命令。

## 环境要求

- Windows
- Node.js 20+
- Chrome 或 Edge
- 浏览器允许 CDP 远程调试端口 `9222`
- 项目服务端口：`127.0.0.1:37651`

## 安装

在项目目录 `D:\company\remoteDesk\workHard` 执行：

```powershell
npm install
.\install.ps1
```

`install.ps1` 会安装 `work` 命令。也可以双击 `setup.cmd` 完成安装和初始化。

## 启动服务

普通后台启动：

```powershell
npm start
```

重启服务并后台运行：

```powershell
npm restart
```

重启服务并在当前窗口持续输出日志：

```powershell
npm restart logging
```

日志模式会占用当前窗口，停止时按 `Ctrl+C`。`npm restart --logging` 会被 npm 11 当成未知配置参数并显示 warning，不建议使用。

检查服务状态：

```powershell
Invoke-RestMethod http://127.0.0.1:37651/health
```

正常结果为：

```json
{"ok":true}
```

## 基本命令

所有命令都在 PowerShell 中执行：

```powershell
work start
work refresh
work off
work next
work prev
work pause
work mute
work unmute
work like
work fav
work quickly 1.25
work search "王者荣耀"
```

命令说明：
## 命令速查表（以 `ACTION_ALIASES` 为准）

所有别名最终都会归一化为标准动作名。CLI 和 HTTP 路由共用同一套映射。

| 分类 | 标准命令 | 可用别名 | 作用 |
| --- | --- | --- | --- |
| 启动与会话 | `work start` | `open`、`home`、`s` | 开始工作模式 |
| 启动与会话 | `work refresh` | `r` | 刷新并继续工作 |
| 启动与会话 | `work login` | 无 | 登录工作账号 |
| 启动与会话 | `work off` | `close` | 关闭工作模式 |
| 任务导航 | `work next` | `n` | 切换到下一个任务 |
| 任务导航 | `work prev` | `p` | 切换到上一个任务 |
| 播放状态 | `work pause` | `pa` | 暂停/恢复当前任务 |
| 播放状态 | `work mute` | 无 | 静音 |
| 播放状态 | `work unmute` | 无 | 取消静音 |
| 互动操作 | `work like` | `zan` | 完成点赞 |
| 互动操作 | `work favorite` | `fav` | 完成收藏 |
| 搜索与速度 | `work search "关键词"` | `se` | 搜索并开始处理任务 |
| 搜索与速度 | `work quickly 1.25` | `fast` | 调整处理速度 |

不要在新增文档或调用方中重新维护动作列表；新增命令时只修改 `src/command-protocol.js` 中的 `ACTION_ALIASES`，README 表格随后同步更新。

- `work start` 打开抖音，并在第二桌面最小化打开；启动成功后会进入工作状态。
- `work refresh` 返回主页后重新进入一个视频；已登录和未登录状态会分别提示。
- `work pause` 是暂停/播放切换，不是单向暂停。暂停时返回 `已暂停` 或 `思考中...`，再次执行会返回 `已开始播放` 或 `工作中...`，具体文案取决于当前消息版本。
- `work off` 关闭抖音并停止相关控制。
- `work next` / `work prev` 切换任务视频。
- `work fav` 是 `work favorite` 的别名。
- `work quickly <数字>` 设置播放倍速，例如 `work quickly 1.25`。
- `work search "关键词"` 等待搜索框和搜索结果加载后，随机进入一个结果视频。抖音未打开时也可以直接执行，命令会自动启动浏览器。

旧别名仍保留：`work open` 等同于 `work start`，`work close` 等同于 `work off`，`work zan` 等同于 `work like`，`work fast` 等同于 `work quickly`。

## 冷启动搜索

抖音未打开时可以直接执行：

```powershell
work search "王者荣耀"
```

流程会自动完成：

1. 启动可调试的 Chrome/Edge。
2. 等待抖音主页和搜索框渲染。
3. 搜索关键词；搜索框查找失败时每隔 500ms 重试，最多重试 2 次。
4. 等待搜索页加载，并兼容不同版本的结果卡片结构。
5. 随机进入一个视频并开始播放。

## 登录处理

点赞、收藏或其他需要登录的操作检测到登录弹窗时，会返回登录提示，例如：

```text
检测到可能需要登录，请键入：work login 并切换至第二桌面(win + Tab)登录后重试；若已登录，请忽略此提示并执行 work refresh。
```

执行登录：

```powershell
work login
```

`work login` 不会自动关闭登录弹窗，用户可以切换到第二桌面使用 `Win + Tab` 完成登录。已经登录时，`work login` 会识别当前登录状态并进入工作视频。

如果希望关闭弹窗并继续未登录使用：

```powershell
work refresh
```

## Codex Skill

Skill 名称为 `work-hard`，显示名称为“效率工作”。在支持 Skill 引用的对话框中可以使用：

```text
$work-hard 打开抖音，搜索王者荣耀视频
```

或使用界面中的：

```text
/work-hard
```

模型会检查本地服务；服务未启动时先运行 `npm start`，再执行：

```powershell
work search "王者荣耀"
```

直接输入 `work ...` 时，Skill 会在 PowerShell 中原样执行该命令，并返回 CLI 的实际结果。Skill 文件位于 `work-hard/SKILL.md`，已安装副本位于 `C:\Users\26227\.codex\skills\work-hard\SKILL.md`。

## 安全范围

- 服务只监听 `127.0.0.1`，不会暴露到局域网。
- 浏览器控制通过 CDP 和页面事件完成，不模拟用户的实体键盘输入。
- `work login` 会保留登录弹窗，不会在用户登录过程中自动关闭它。
- 抖音页面 DOM 或 class 名称变化时，定位器可能需要更新。
