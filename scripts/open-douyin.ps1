param(
  [Parameter(Mandatory = $true)][int]$Port,
  [Parameter(Mandatory = $true)][string]$UserDataDir,
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$ChromePath
)
$ErrorActionPreference = "Continue"
$desktopModule = $false
$originDesktop = $null
try {
  Import-Module VirtualDesktop -ErrorAction Stop
  $originDesktop = Get-CurrentDesktop -ErrorAction Stop
  $desktopModule = $true
} catch {
  Write-Warning "VirtualDesktop 当前不可用，将在当前桌面启动浏览器：$($_.Exception.Message)"
}

if (-not ("WorkWindowFinder" -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WorkWindowFinder {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr extra);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
  delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr extra);
  public static IntPtr FindByPid(int processId) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hWnd, extra) => { uint pid; GetWindowThreadProcessId(hWnd, out pid); if (pid == processId && IsWindowVisible(hWnd)) { found = hWnd; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  public static IntPtr FindByTitle(string needle) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hWnd, extra) => { if (!IsWindowVisible(hWnd)) return true; var text = new System.Text.StringBuilder(512); GetWindowText(hWnd, text, text.Capacity); if (text.ToString().IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0) { found = hWnd; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  public static void Minimize(IntPtr hWnd) { if (hWnd != IntPtr.Zero) ShowWindow(hWnd, 6); }
}
"@
}

$existing = if ($desktopModule) { Get-DesktopList -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "WorkDouyin" } | Select-Object -First 1 } else { $null }
$desktop = if ($desktopModule) { if ($existing) { Get-Desktop -Index $existing.Number } else { New-Desktop } } else { $null }
if ($desktopModule -and -not $desktop) { Write-Warning "无法创建 WorkDouyin 桌面，将在当前桌面启动浏览器" }
if ($desktop -and -not $existing) { Set-DesktopName -Desktop $desktop -Name "WorkDouyin" | Out-Null }
$args = @(
  "--remote-debugging-port=$Port", "--user-data-dir=$UserDataDir",
  "--new-window", "--start-maximized", "--window-title=WorkDouyin",
  "--no-first-run", "--no-default-browser-check", "--disable-notifications",
  "--autoplay-policy=no-user-gesture-required", $Url
)
$process = Start-Process -FilePath $ChromePath -ArgumentList $args -PassThru
$tempRoot = if ($env:TEMP) { $env:TEMP } else { "." }
$pidFile = Join-Path $tempRoot "browser-media-control.pid"
Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ASCII
$deadline = (Get-Date).AddSeconds(20)
$hwnd = [IntPtr]::Zero
while ($hwnd -eq [IntPtr]::Zero -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 250
  $hwnd = [WorkWindowFinder]::FindByPid($process.Id)
  if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [WorkWindowFinder]::FindByTitle("WorkDouyin") }
}
if ($desktop -and $hwnd -ne [IntPtr]::Zero) {
  Move-Window -Desktop $desktop -Hwnd $hwnd -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 300
  [WorkWindowFinder]::Minimize($hwnd)
}
if ($desktopModule -and $originDesktop) { Switch-Desktop -Desktop $originDesktop -NoAnimation -ErrorAction SilentlyContinue }
Write-Output "OPENED:$($process.Id)"
