# 桌宠实现说明

这是 `work-hard` 分支里的桌面宠物实现，核心目标是把“单文件 EXE、透明窗口、自由行走、缩放、短句气泡、素材替换、AI 生成”这些能力放在一套可以直接分发的程序里。

更完整的用户说明、打包方式和素材替换教程见 [desktop_pet/README.md](../desktop_pet/README.md)。

## 现在的实现

- `desktop_pet/pet.py` 负责桌宠窗口、托盘、行走、气泡、素材库和 AI 生成
- `desktop_pet/build.ps1` 负责 PyInstaller 单文件打包
- `desktop_pet/assets/README.md` 是打包后会一起带上的素材替换说明
- `desktop_pet/requirements.txt` 只保留运行和打包所需的 Python 依赖

## 素材路径

程序会按以下顺序查找素材：

1. `PET_ASSET_DIR`
2. `EXE` 同级的 `WorkHardPet.assets`
3. `%LOCALAPPDATA%\WorkHardPet\assets`
4. 开发模式下的 `desktop_pet/assets`

所以替换角色时，不需要重新生成 EXE，只要把新的图片丢进优先级更高的目录即可。

## AI 生成

如果配置了 `PET_AI_API_KEY`，桌宠会调用兼容 OpenAI Images API 的服务来生成素材。默认会尝试：

- `POST /images/generations`
- `POST /images/edits`

每天每个本地 profile 最多成功生成 3 次，失败会回滚额度。

