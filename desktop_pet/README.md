# WorkHardPet

这是一个 Windows 桌面宠物程序，配合本仓库的 `work-hard` 本地控制服务使用。它会以单文件 EXE 的方式运行，脱离 Python 环境也能直接启动。

## 启动开发版

```powershell
py -m pip install -r desktop_pet/requirements.txt
$env:PET_AI_API_KEY = "你的图片生成服务密钥"
py desktop_pet/pet.py
```

可选环境变量：

```powershell
$env:PET_AI_BASE_URL = "https://api.openai.com/v1"
$env:PET_AI_MODEL = "gpt-image-1"
$env:PET_ASSET_DIR = "D:\your\custom\assets"
```

`PET_AI_BASE_URL` 兼容 OpenAI 风格的 Images API；`PET_ASSET_DIR` 可把外部素材目录单独指到你自己的位置。

## 打包单文件 EXE

```powershell
.\desktop_pet\build.ps1
```

打包完成后会得到：

- `dist\WorkHardPet.exe`
- `dist\WorkHardPet.assets\README.md`

如果 `desktop_pet/assets/` 里还有图片，也会一起复制到 `dist\WorkHardPet.assets`，方便你直接替换角色素材。

## 功能概览

- 单文件 EXE，可直接运行
- 桌宠会自动在桌面上移动，撞边后会折返
- 可以通过“尺寸”和“移动速度”滑块调节大小和速度
- 闲置时会自动做小动作
- 点击宠物会弹出随机短句：
  - 摸我干嘛
  - 今天也要加油
  - 别打扰我摸鱼
- 双击宠物会直接调用工作控制里的“开始”动作
- 右键宠物可一键关闭
- 右上角的最小化会收进托盘，不会直接消失
- 背景使用透明色处理，避免黑边和残影
- 素材支持本地替换，不需要重新打包 EXE

## 素材替换

桌宠会按下面顺序寻找素材：

1. `PET_ASSET_DIR` 指定的目录
2. `EXE` 同级的 `WorkHardPet.assets` 目录
3. `%LOCALAPPDATA%\WorkHardPet\assets`
4. 开发模式下的 `desktop_pet/assets`

你只要把新的 PNG / WEBP / GIF 等图片放进上述目录，重新打开桌宠即可生效，不需要重新生成 EXE。

建议使用透明背景 PNG，尺寸尽量接近正方形，这样桌宠缩放时最稳。

## 素材生成

如果配置了 `PET_AI_API_KEY`，桌宠可以：

- 根据输入描述直接生成角色素材
- 根据上传图片自动生成桌宠角色

每天每个本地 profile 最多成功生成 3 次。失败会自动回滚额度。

## 和本地控制服务的关系

桌宠会复用仓库里现有的 `work-hard` 本地服务，因此它不需要重复实现浏览器控制逻辑。它只负责把界面、素材、生成和桌面互动这部分做好。

