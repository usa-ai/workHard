param(
  [string]$CommandPrefix = "work",
  [int]$CdpPort = 9222,
  [int]$ServerPort = 37651
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 18 or newer is required."
}
if (-not (Get-Module -ListAvailable -Name VirtualDesktop)) {
  Write-Host "Installing VirtualDesktop PowerShell module..."
  Install-Module VirtualDesktop -Scope CurrentUser -Force -AllowClobber
}

$configPath = Join-Path $PSScriptRoot "config.yaml"
if (-not (Test-Path -LiteralPath $configPath)) {
  throw "Missing config.yaml"
}

$configText = Get-Content -LiteralPath $configPath -Raw
$configText = [regex]::Replace($configText, '(?m)^commandPrefix:\s*.*$', "commandPrefix: $CommandPrefix")
$configText = [regex]::Replace($configText, '(?m)^serverPort:\s*.*$', "serverPort: $ServerPort")
$configText = [regex]::Replace($configText, '(?m)^cdpPort:\s*.*$', "cdpPort: $CdpPort")
[System.IO.File]::WriteAllText($configPath, $configText, [System.Text.UTF8Encoding]::new($false))

Push-Location $PSScriptRoot
try {
  npm install
  if (Get-Command py -ErrorAction SilentlyContinue) {
    py -m pip install -r desktop_pet\requirements.txt
  } else {
    Write-Warning "未找到 Python 启动器 py；桌宠功能需要稍后手动安装 desktop_pet\requirements.txt"
  }
} finally {
  Pop-Location
}

$npmPrefix = (npm config get prefix).Trim()
$wrapper = Join-Path $npmPrefix ($CommandPrefix + ".cmd")
$cliPath = Join-Path $PSScriptRoot "src\cli.js"
$wrapperLines = @(
  "@echo off",
  "node `"$cliPath`" %*"
)
Set-Content -LiteralPath $wrapper -Value $wrapperLines -Encoding ASCII

$codexSkillRoot = Join-Path $env:USERPROFILE ".codex\skills\browser-media-control"
New-Item -ItemType Directory -Force -Path $codexSkillRoot | Out-Null
$skillText = Get-Content (Join-Path $PSScriptRoot "work-hard\SKILL.md") -Raw
$skillText.Replace("37651", [string]$ServerPort) | Set-Content (Join-Path $codexSkillRoot "SKILL.md") -Encoding UTF8

Write-Host "Installation complete. Start Chrome or Edge with --remote-debugging-port=$CdpPort, then run npm start or npm run pet."
Write-Host "CLI command: $CommandPrefix"
