# 桌宠 MVP

功能分支：`codex/desktop-pet`

## 启动

```powershell
py -m pip install -r desktop_pet/requirements.txt
$env:PET_AI_API_KEY = "你的图片生成服务密钥"
$env:PET_AI_BASE_URL = "https://api.openai.com/v1" # 可选，兼容 Images API 的服务
$env:PET_AI_MODEL = "gpt-image-1"                    # 可选
py desktop_pet/pet.py
```

默认请求兼容 [OpenAI Images API](https://platform.openai.com/docs/api-reference/images)，文本生成使用 `/images/generations`，参考图生成使用 `/images/edits`；也可以通过 `PET_AI_BASE_URL` 接入兼容服务。

桌宠会复用本项目的 Node 控制服务。源码运行时会在服务未启动时自动尝试启动；打包后的 `.exe` 建议先在项目目录执行 `npm start`，或设置 `WORK_HARD_ROOT`/从项目目录启动，以便桌宠找到 `src/server.js`。

也可以直接运行：

```powershell
npm run pet
```

API key 只在 Python 主进程读取，不会显示在桌宠界面，也不应写入 Git 或截图。

## 打包

```powershell
.\desktop_pet\build.ps1
```

生成的单文件程序位于 `dist\WorkHardPet.exe`。打包前脚本会安装 Pillow、pystray 和 PyInstaller。

## 桌宠操作

- 点击桌宠本体：开始工作。
- 快捷按钮：开始、切换下一个任务、完成点赞、完成收藏、静音。
- 搜索栏：输入关键词后开始处理搜索任务。
- 素材库：选择内置素材、上传 PNG/JPG/WEBP/GIF、上传参考图并自动生成，或输入描述生成新素材。
- 右键桌宠：打开同一组常用操作和隐藏/退出菜单。
- 托盘图标：在桌宠隐藏后重新显示或退出。

## 生成额度

每个本地 profile 每个自然日最多成功生成 3 次。额度文件保存在 `%LOCALAPPDATA%\WorkHardPet\state.json`；网络失败、服务错误或图片下载失败会自动归还本次预占额度。

当前没有账号系统，因此“每个用户”默认以本地 profile 表示；也可以通过 `PET_USER_ID` 指定稳定的用户标识。接入登录系统后，应把 `PetStore` 的 profile id 换成服务端认证用户 id，并把额度校验放到服务端。

## 结构

- `desktop_pet/pet.py`：桌宠窗口、素材库、动作桥接、AI 生成和额度控制。
- `desktop_pet/requirements.txt`：运行与打包依赖。
- `desktop_pet/build.ps1`：生成 Windows `.exe`。
- `docs/desktop-pet-research.md`：开源项目调研与许可证结论。
