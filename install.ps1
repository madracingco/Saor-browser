#Requires -Version 5.1
<#
.SYNOPSIS
    Saor Browser — Windows installer (PowerShell)

.DESCRIPTION
    Installs prerequisites and builds Saor Browser on Windows 10/11.

    Requirements:
      - Node.js ≥ 18  (downloaded automatically via winget if missing)
      - Visual Studio Build Tools or Visual Studio 2019/2022 with C++ workload
        (required to compile the @webview/webview native addon)
      - Microsoft Edge / WebView2 Runtime  (ships with Windows 10 20H2+ and 11)

    Run in PowerShell (Administrator for the launcher shortcut):
        Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
        .\install.ps1

.NOTES
    WebView2 is pre-installed on Windows 10 build 20H2+ and Windows 11.
    On older systems download from: https://developer.microsoft.com/microsoft-edge/webview2/
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$NodeMin = 18

Write-Host "==> Saor Browser Windows installer"
Write-Host "    Directory: $RepoDir"
Write-Host ""

# ── Node.js ──────────────────────────────────────────────────────────────────

function Get-NodeMajor {
    try {
        $ver = & node -e "process.stdout.write(process.versions.node.split('.')[0])" 2>$null
        return [int]$ver
    } catch { return 0 }
}

$nodeMajor = Get-NodeMajor
if ($nodeMajor -lt $NodeMin) {
    Write-Host "==> Node.js $nodeMajor found (need >= $NodeMin). Installing via winget..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        # Refresh PATH
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                    [System.Environment]::GetEnvironmentVariable("PATH", "User")
        $nodeMajor = Get-NodeMajor
        if ($nodeMajor -lt $NodeMin) {
            Write-Error "Node.js installation may require a new terminal. Re-run install.ps1 after restarting PowerShell."
            exit 1
        }
    } else {
        Write-Error "winget not available. Please install Node.js >= $NodeMin from https://nodejs.org and re-run this script."
        exit 1
    }
}
Write-Host "==> Node.js $nodeMajor — OK"

# ── Visual Studio Build Tools check ──────────────────────────────────────────

if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
    Write-Warning @"
cl.exe (MSVC compiler) not found in PATH.
The @webview/webview package requires Visual Studio Build Tools with the
'Desktop development with C++' workload to compile its native addon.

Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/

After installing, re-run this script from the 'Developer PowerShell for VS'.
"@
}

# ── WebView2 check ────────────────────────────────────────────────────────────

$wv2Key = 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$wv2User = 'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
if (-not ((Test-Path $wv2Key) -or (Test-Path $wv2User))) {
    Write-Warning @"
Microsoft Edge WebView2 Runtime not detected.
On Windows 10 (build < 20H2) or Windows Server you may need to install it manually:
  https://developer.microsoft.com/microsoft-edge/webview2/
On Windows 10 20H2+ and Windows 11 it is pre-installed.
"@
}

# ── npm install + build ───────────────────────────────────────────────────────

Write-Host ""
Write-Host "==> Installing npm dependencies..."
Set-Location $RepoDir
npm install

Write-Host ""
Write-Host "==> Building TypeScript..."
npm run build

# ── Launcher batch file ───────────────────────────────────────────────────────

$launcherDir = "$env:LOCALAPPDATA\Programs\Saor"
New-Item -ItemType Directory -Force -Path $launcherDir | Out-Null
$launcherPath = "$launcherDir\saor.cmd"

Set-Content -Path $launcherPath -Value @"
@echo off
node --max-old-space-size=128 "$RepoDir\dist\ui\app.js" %*
"@

# Add to user PATH if not already present
$userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$launcherDir*") {
    [System.Environment]::SetEnvironmentVariable("PATH", "$userPath;$launcherDir", "User")
    Write-Host "==> Added $launcherDir to user PATH (restart shell to take effect)"
}

# ── Desktop shortcut ──────────────────────────────────────────────────────────

try {
    $wshell   = New-Object -ComObject WScript.Shell
    $shortcut = $wshell.CreateShortcut("$env:USERPROFILE\Desktop\Saor Browser.lnk")
    $shortcut.TargetPath       = "node"
    $shortcut.Arguments        = "--max-old-space-size=128 `"$RepoDir\dist\ui\app.js`""
    $shortcut.WorkingDirectory = $RepoDir
    $shortcut.Description      = "Saor Browser — free, lightweight, private"
    $shortcut.Save()
    Write-Host "==> Desktop shortcut created"
} catch {
    Write-Warning "Could not create desktop shortcut: $_"
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗"
Write-Host "║  Saor Browser installed successfully on Windows!      ║"
Write-Host "║                                                       ║"
Write-Host "║  Run:  saor                  (after restarting shell) ║"
Write-Host "║  Or:   npm start             (inside $RepoDir)        ║"
Write-Host "║  Or:   double-click the Desktop shortcut              ║"
Write-Host "╚═══════════════════════════════════════════════════════╝"
