$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

py -m pip install -r desktop_pet/requirements.txt
py -m PyInstaller --noconfirm --clean --onefile --windowed --name WorkHardPet desktop_pet/pet.py
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "dist\WorkHardPet.assets") | Out-Null
Copy-Item -Path (Join-Path $projectRoot "desktop_pet\assets\*") -Destination (Join-Path $projectRoot "dist\WorkHardPet.assets") -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "妗屽疇绋嬪簭宸茬敓鎴愶細$projectRoot\dist\WorkHardPet.exe"
