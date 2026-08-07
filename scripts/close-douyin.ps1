param(
  [int]$CdpPort = 9222
)
$ErrorActionPreference = "Continue"
$profileMarker = "browser-media-control-profile"
$tempRoot = if ($env:TEMP) { $env:TEMP } else { "." }
$pidFile = Join-Path $tempRoot "browser-media-control.pid"
$managedPids = @()
if (Test-Path -LiteralPath $pidFile) {
  $managedPids = @(Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | ForEach-Object {
    $parsed = 0
    if ([int]::TryParse($_, [ref]$parsed)) { $parsed }
  })
}
try {
  $managedPids += @(Get-NetTCPConnection -LocalPort $CdpPort -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess)
} catch { }
$netstatLine = @(netstat -ano -p tcp 2>$null | Select-String "\:$CdpPort\s+.*LISTENING\s+\d+") | Select-Object -First 1
if ($netstatLine) {
  $match = [regex]::Match($netstatLine.ToString(), "LISTENING\s+(\d+)")
  if ($match.Success) { $managedPids += [int]$match.Groups[1].Value }
}
$managedPids = @($managedPids | Where-Object { $_ } | Select-Object -Unique)

$desktopModule = $false
$originDesktop = $null
$namedDesktops = @()
try {
  Import-Module VirtualDesktop -ErrorAction Stop
  $originDesktop = Get-CurrentDesktop -ErrorAction Stop
  $namedDesktops = @(Get-DesktopList -ErrorAction Stop | Where-Object { $_.Name -eq "WorkDouyin" } | Sort-Object Number -Descending)
  $desktopModule = $true
} catch {
  Write-Warning "VirtualDesktop not available: $($_.Exception.Message)"
}

# Single CIM query for all chrome/msedge processes to avoid slow per-process queries
$allProcs = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction SilentlyContinue)
$targetIds = @()
foreach ($p in $allProcs) {
  $isManaged = $managedPids -contains $p.ProcessId
  if ($p.CommandLine -like "*$profileMarker*") { $isManaged = $true }
  if ($isManaged) { $targetIds += [int]$p.ProcessId }
}
# Also match by window title
foreach ($proc in @(Get-Process chrome,msedge -ErrorAction SilentlyContinue)) {
  try {
    if ($proc.MainWindowTitle -match "douyin|Douyin|WorkDouyin" -and $targetIds -notcontains $proc.Id) {
      $targetIds += [int]$proc.Id
    }
  } catch { }
}

$desktops = @()
foreach ($tid in $targetIds) {
  $proc = Get-Process -Id $tid -ErrorAction SilentlyContinue
  if (-not $proc) { continue }
  $hwnd = [IntPtr]$proc.MainWindowHandle
  if ($desktopModule -and $hwnd -ne [IntPtr]::Zero) {
    $desktop = Get-DesktopFromWindow -Hwnd $hwnd -ErrorAction SilentlyContinue
    if ($desktop) { $desktops += $desktop }
  }
  Stop-Process -Id $tid -Force -ErrorAction SilentlyContinue
}

# Quick confirmation that processes are terminated (fewer iterations, shorter intervals)
for ($i = 0; $i -lt 6; $i++) {
  $remaining = @()
  foreach ($tid in $targetIds) {
    $p = Get-Process -Id $tid -ErrorAction SilentlyContinue
    if ($p) { $remaining += $p }
  }
  if (-not $remaining) { break }
  foreach ($item in $remaining) { Stop-Process -Id $item.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 150
}

foreach ($desktop in ($desktops | Select-Object -Unique)) {
  Remove-Desktop -Desktop $desktop -ErrorAction SilentlyContinue
}
if ($desktopModule) {
  foreach ($namedDesktop in $namedDesktops) {
    if (-not $originDesktop -or $namedDesktop.Number -ne (Get-DesktopIndex $originDesktop)) {
      Remove-Desktop -Desktop $namedDesktop.Number -ErrorAction SilentlyContinue
    }
  }
  if ($originDesktop) { Switch-Desktop -Desktop $originDesktop -NoAnimation -ErrorAction SilentlyContinue }
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
if ($targetIds.Count -gt 0 -or $namedDesktops.Count -gt 0 -or $managedPids.Count -gt 0) { Write-Output "CLOSED" } else { Write-Output "NOT_FOUND" }
