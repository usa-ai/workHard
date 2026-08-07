# Browser Media Control

通过 JavaScript 注入控制 Chrome/Edge 中的抖音视频，支持 Codex 对话命令和 cmd/PowerShell CLI。

## 安装

新手可以直接双击 `setup.cmd`。它会完成安装、启动后台服务并打开抖音。

也可以在 PowerShell 中运行：

```powershell
.\install.ps1
```

自定义 CLI 前缀：

```powershell
.\install.ps1 -CommandPrefix slackoff
```

## 一键使用

安装后，直接执行下面的命令即可自动启动控制服务，并自动打开一个可调试的 Chrome/Edge 抖音窗口：

```powershell
work start
```

之后可以直接控制抖音：

```powershell
work next
work toggle
work search "天气预报"
work quickly 1.25
```

关闭抖音窗口并删除其虚拟桌面：

```powershell
work off
```

`work start` 会尝试创建 Windows 虚拟桌面并把抖音窗口移动过去；如果系统没有安装 `VirtualDesktop` PowerShell 模块，会继续打开抖音，但无法移动桌面。页面加载后会持续检测两种 `#login-panel-new` 登录弹窗，自动点击关闭元素，并随机点击一张可见视频卡片触发播放。旧命令 `work open` 仍作为兼容别名保留。

## 手动启动浏览器和服务

关闭正在运行的 Chrome/Edge 后，用远程调试端口启动（浏览器路径按本机安装位置调整）：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
npm start
```

重启控制服务时，默认后台运行且不持续输出日志：

```powershell
npm restart
```

如果需要让日志持续输出到当前控制台，使用：

```powershell
npm restart -- --logging
```

打开 `https://www.douyin.com` 后即可使用：

```powershell
work next
work prev
work toggle
work mute
work unmute
work like
work search "天气预报"
work quickly 1.25
```

Codex skill 文件位于 `skill/SKILL.md`。将其复制到个人 skills 目录即可让 Codex 识别自然语言命令。

## 限制

浏览器必须以 CDP 远程调试端口启动；服务只监听本机回环地址，不暴露到局域网。控制操作通过浏览器内的 JavaScript 事件、页面 DOM 和 CDP 鼠标滚轮模拟完成，不会调用用户的实体键盘。抖音页面结构变化时，`next/prev` 或点赞按钮选择器可能需要调整。
