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

$configPath = Join-Path $PSScriptRoot "config.json"
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$config.commandPrefix = $CommandPrefix
$config.cdpPort = $CdpPort
$config.serverPort = $ServerPort
$json = $config | ConvertTo-Json
[System.IO.File]::WriteAllText($configPath, $json, [System.Text.UTF8Encoding]::new($false))

Push-Location $PSScriptRoot
try {
  npm install
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
$skillText = Get-Content (Join-Path $PSScriptRoot "skill\SKILL.md") -Raw
$skillText.Replace("37651", [string]$ServerPort) | Set-Content (Join-Path $codexSkillRoot "SKILL.md") -Encoding UTF8

Write-Host "Installation complete. Start Chrome or Edge with --remote-debugging-port=$CdpPort, then run npm start."
Write-Host "CLI command: $CommandPrefix"
