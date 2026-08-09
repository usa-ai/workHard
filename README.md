# 效率工作（work-hard）

这是一个伪装成“效率工具”的本地摸鱼插件。它会通过 Node.js 服务连接 Chrome / Edge 的远程调试端口，控制抖音页面里的播放、搜索、点赞、收藏、静音、切换视频、倍速等动作。

它的设计目标很直白：让你少碰鼠标键盘，多让浏览器替你干活。

你可以在 PowerShell 里直接输入 `work start`、`work search "王者荣耀"` 这一类命令，也可以在 Codex 对话框里用 `$work-hard` 或 `/work-hard` 让模型替你执行同样的操作。

## 目录

- `config.yaml`：主配置文件
- `src/server.js`：本地控制服务
- `src/cli.js`：`work` 命令入口
- `src/browser-control.js`：核心浏览器控制逻辑
- `src/command-protocol.js`：命令别名和路由解析
- `src/messages.js`：对外提示文案
- `scripts/restart.mjs`：重启本地服务
- `install.ps1`：安装、写入配置、创建 CLI 命令
- `work-hard/SKILL.md`：Codex Skill 定义

## 环境要求

- Windows
- Node.js 20 或更高版本
- Chrome 或 Edge
- 浏览器开启远程调试端口 `9222`
- 本地服务端口默认 `37651`

## 安装

在项目根目录执行：

```powershell
npm install
.\install.ps1
```

`install.ps1` 会做这几件事：

1. 安装依赖
2. 生成本地 `work` 命令
3. 写入 `config.yaml`
4. 同步 Codex Skill 副本

如果你改过 `config.yaml`，重新执行一次安装脚本通常最省事。

## 启动与重启

启动服务：

```powershell
npm start
```

重启服务：

```powershell
npm run restart
```

带日志重启：

```powershell
npm run restart:logging
```

也可以使用：

```powershell
npm restart logging
```

日志模式会占用当前窗口，停止时按 `Ctrl+C`。

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:37651/health
```

正常返回：

```json
{"ok":true}
```

## 配置文件：`config.yaml`

当前项目只使用 `config.yaml`。不要再新建 `config.json`，否则脚本不会读取它。

推荐默认配置：

```yaml
commandPrefix: work
serverPort: 37651
cdpPort: 9222
urlPattern: douyin.com
douyinUrl: https://www.douyin.com
desktopMode: true
actionTimeoutMs: 10000
throttle:
  minActionGapMs: 400
  sameActionGapMs: 500
  maxRetries: 2
  retryDelayMs: 500
delays:
  guardPollMs: 250
  closeRetryMs: 200
  videoPollMs: 250
  statePollMs: 150
  afterNavigationMs: 800
  afterClickMs: 300
  afterInputMs: 300
  afterBackMs: 500
  actionStepMs: 300
  loginPageMs: 8000
  shortStepMs: 300
```

字段说明：

| 字段 | 作用 | 建议 |
| --- | --- | --- |
| `commandPrefix` | 安装后 CLI 命令前缀，例如 `work start` | 保持 `work`，改了以后要重新安装 CLI |
| `serverPort` | 本地服务监听端口 | 保持默认，除非端口冲突 |
| `cdpPort` | Chrome / Edge 的远程调试端口 | 必须和浏览器启动参数一致 |
| `urlPattern` | 识别抖音标签页的 URL 片段 | 一般保持 `douyin.com` |
| `douyinUrl` | 打开或恢复时跳转的抖音地址 | 一般保持主页地址 |
| `desktopMode` | 是否启用第二桌面工作模式 | Windows 桌面场景建议保持 `true` |
| `actionTimeoutMs` | 单个动作的超时时间（毫秒） | 动作偶尔超时可适当调大 |
| `throttle.minActionGapMs` | 不同动作之间的最小间隔 | 控制命令节奏，避免太快 |
| `throttle.sameActionGapMs` | 相同动作连续执行的最小间隔 | 防止重复命令过密 |
| `throttle.maxRetries` | 动作失败后的最大重试次数 | 一般保持 `2` |
| `throttle.retryDelayMs` | 重试前等待的时间 | 一般保持默认 |
| `delays.*` | 页面探测、导航、点击、输入等内部等待时间 | 只有在页面很慢或很快时才改 |

如果你不确定怎么改，优先只动这几个最常见的项：

- `serverPort`
- `cdpPort`
- `commandPrefix`
- `actionTimeoutMs`

改完 `config.yaml` 后，重启服务让配置生效：

```powershell
npm run restart:logging
```

## 基本命令

```powershell
work start
work refresh
work login
work off
work next
work prev
work play
work pause
work toggle
work mute
work unmute
work like
work fav
work quickly 1.25
work search "王者荣耀"
```

常见命令语义：

- `work start`：打开抖音，处理登录弹窗，并尽量进入一个正在播放的视频
- `work refresh`：重新回到主页，再进入视频
- `work login`：主动打开登录流程；检测到已登录时会直接进入视频
- `work off`：关闭抖音并停止控制
- `work next` / `work prev`：切换下一个或上一个视频
- `work play` / `work pause` / `work toggle`：控制当前视频播放状态
- `work mute` / `work unmute`：静音和取消静音
- `work like`：点赞
- `work fav`：收藏
- `work quickly 1.25`：设置播放倍速，值直接对应播放器的 playbackRate
- `work search "关键词"`：搜索并进入结果视频；抖音没打开时会先自动启动

命令别名也兼容：

- `work open`、`work home`、`work s` 等同于 `work start`
- `work r` 等同于 `work refresh`
- `work n` 等同于 `work next`
- `work p` 等同于 `work prev`
- `work pa` 等同于 `work pause`
- `work zan` 等同于 `work like`
- `work se` 等同于 `work search`
- `work fast` 等同于 `work quickly`

## 行为说明

- 服务默认监听 `127.0.0.1:37651`
- CLI 会在本地服务没启动时自动拉起服务
- 如果当前没有可用的抖音标签页，`work start` 和 `work search` 都会尝试打开或接管浏览器
- 如果浏览器没连上 CDP，程序会尝试启动 Chrome / Edge，并使用 `config.yaml` 里的 `cdpPort`
- 检测到登录弹窗时，不会强行关闭；`work login` 会保留登录流程，方便你手动登录
- `work search` 会先回到主页，再找搜索框、输入关键词、点击搜索，然后进入一个结果视频
- `work like`、`work fav`、`work quickly` 依赖页面结构，页面 DOM 变动后可能需要同步更新定位器

## 冷启动搜索

抖音没打开时也可以直接执行：

```powershell
work search "王者荣耀"
```

流程大致是：

1. 启动可调试的 Chrome / Edge
2. 打开抖音主页
3. 等待搜索框出现
4. 输入关键词并搜索
5. 等待结果页加载后随机进入一个视频

如果搜索框或结果卡片一时没出现，脚本会短暂重试，不会马上失败。

## 登录处理

检测到登录弹窗时，脚本会保留弹窗，不会自动把它关掉。返回给用户的提示会引导你输入 `work login`，然后切换到第二桌面完成登录。

如果你已经登录，但页面仍然给出登录提示，可以直接执行：

```powershell
work refresh
```

## Codex Skill

Skill 名称是 `work-hard`，显示名是“效率工作”。在支持 Skill 引用的对话框里可以这样用：

```text
$work-hard 打开抖音，搜索王者荣耀视频
```

或者直接写：

```text
/work-hard
```

如果本地服务还没启动，模型会先执行 `npm start`，然后再处理后续命令。

## 安全范围

- 本地服务只监听 `127.0.0.1`
- 浏览器控制只通过 CDP 和页面事件完成，不会模拟真实键盘在系统里乱敲
- `work login` 不会自动关闭登录弹窗
- 抖音页面 DOM 或 class 名变化后，定位器可能需要同步更新

## 常见问题

### `npm run restart:logging` 报 `ENOENT: ... config.json`

这表示旧脚本还在找 `config.json`。当前项目已经改用 `config.yaml`，需要把 `scripts/restart.mjs` 和 `install.ps1` 一起同步到新配置文件。

### `work` 命令找不到

重新执行：

```powershell
.\install.ps1
```

### 浏览器连不上

确认 Chrome / Edge 已经带着远程调试端口启动，例如 `9222`，并且没有被别的进程占用。
