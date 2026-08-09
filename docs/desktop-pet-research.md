# 桌宠复用调研

调研日期：2026-08-09

## 候选项目

| 项目 | 技术栈 | 许可证 | 可复用点 | 主要限制 |
| --- | --- | --- | --- | --- |
| [VPet-Simulator](https://github.com/LorisYounger/VPet) | C# / WPF | Apache-2.0（默认素材需单独确认授权） | Windows 桌宠窗口、动画状态、Mod/创意工坊生态 | 不能直接嵌入当前 Node 服务；Windows-only |
| [桌面灵](https://github.com/qiyueblues-design/zhuomianling) | Electron / React / TypeScript | MIT | 透明无边框窗口、点击穿透、Live2D 模型导入、动作映射 | 项目较新，偏 Live2D，需自行接入本地动作 API |
| [Desktop Virtual Buddy](https://github.com/spyderweb47/Desktop-Virtual-buddy) | Electron / TypeScript | MIT | 透明置顶、Shimeji 精灵帧、拖拽和点击反应、素材编辑器 | Windows API 绑定较强，项目仍处于早期阶段 |
| [BongoCat](https://github.com/ayangweb/BongoCat) | Tauri / Vue / Rust | MIT | 跨平台透明窗口、素材渲染和打包经验 | 交互模型偏键盘可视化，不适合直接作为动作控制层 |
| [OpenPet](https://github.com/X-T-E-R/OpenPet) | TypeScript | GPL-3.0 | 本地桌宠运行时、导入宠物、CLI/MCP/HTTP 控制思路 | GPL-3.0 会影响闭源或商业集成，需避免直接复制代码 |

## 采用方案

当前分支不直接复制上述项目代码或素材，采用 Python/Tkinter 自有实现：

- 透明、无边框、置顶窗口由 Tkinter 和 Windows 窗口属性提供，pystray 提供托盘入口。
- 桌宠动作通过现有 `POST /action/:action` 接口复用，不重复实现浏览器控制逻辑。
- 内置素材与用户上传素材使用本地文件目录管理。
- AI 生成通过主进程配置的 OpenAI-compatible Images API 调用，API key 不进入界面层、不写入仓库。
- 每个本地用户按稳定 profile id 记录每日 3 次成功生成额度；失败请求不扣额度。

第三方项目只作为交互和窗口实现参考。引入第三方素材前仍需逐项确认素材本身的版权和商业使用条款，不能只依据代码仓库许可证判断。
