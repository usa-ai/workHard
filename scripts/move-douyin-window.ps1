param([string]$TitlePattern = "抖音")
$ErrorActionPreference = "Stop"
Import-Module VirtualDesktop -ErrorAction Stop
$originDesktop = Get-CurrentDesktop
if (-not ("WorkWindowMover" -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WorkWindowMover {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr extra);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr extra);
  public static IntPtr FindByTitle(string needle) { IntPtr found=IntPtr.Zero; EnumWindows((h,e)=>{if(!IsWindowVisible(h))return true;var s=new StringBuilder(512);GetWindowText(h,s,s.Capacity);if(s.ToString().IndexOf(needle,StringComparison.OrdinalIgnoreCase)>=0){found=h;return false;}return true;},IntPtr.Zero);return found; }
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
  public static void Minimize(IntPtr hWnd) { if(hWnd != IntPtr.Zero) ShowWindow(hWnd, 6); }
}
"@
}
$hwnd = [WorkWindowMover]::FindByTitle($TitlePattern)
if ($hwnd -eq [IntPtr]::Zero) { Write-Output "NOT_FOUND"; exit 0 }
$existing = Get-DesktopList | Where-Object { $_.Name -eq "WorkDouyin" } | Select-Object -First 1
$desktop = if ($existing) { Get-Desktop -Index $existing.Number } else { New-Desktop }
if ($desktop) { if (-not $existing) { Set-DesktopName -Desktop $desktop -Name "WorkDouyin" | Out-Null }; Move-Window -Desktop $desktop -Hwnd $hwnd -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 300; [WorkWindowMover]::Minimize($hwnd); if ($originDesktop) { Switch-Desktop -Desktop $originDesktop -NoAnimation }; Write-Output "MOVED" } else { Write-Output "NO_DESKTOP" }
