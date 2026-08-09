# WorkHardPet

这是一个 Windows 优先的 Tkinter 桌宠。它复用项目已有的本地 HTTP 控制服务，因此不会在桌宠里重复实现浏览器动作。

## 开发运行

```powershell
py -m pip install -r desktop_pet/requirements.txt
$env:PET_AI_API_KEY = "你的图片生成服务密钥"
py desktop_pet/pet.py
```

## 打包

```powershell
.\desktop_pet\build.ps1
```

生成的文件位于 `dist\WorkHardPet.exe`。没有配置 `PET_AI_API_KEY` 时，内置素材和本地上传仍可正常使用，只会禁用 AI 生成。
