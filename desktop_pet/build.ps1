$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

py -m pip install -r desktop_pet/requirements.txt
py -m PyInstaller --noconfirm --clean --onefile --windowed --name WorkHardPet desktop_pet/pet.py
Write-Host "桌宠程序已生成：$projectRoot\dist\WorkHardPet.exe"
