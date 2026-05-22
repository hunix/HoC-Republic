# deploy-global.ps1 — Deploy local HoC build to global npm modules
# Makes `openclaw` command available system-wide, using YOUR local code
#
# Usage:
#   .\scripts\deploy-global.ps1          # Full build + deploy
#   .\scripts\deploy-global.ps1 -NoBuild # Deploy only (skip build)

param(
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$globalModules = Join-Path $env:APPDATA "npm\node_modules"
$globalBinDir = Join-Path $env:APPDATA "npm"
$targetDir = Join-Path $globalModules "openclaw"

Write-Host "HoC -> Global Deploy" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host "Source:  $projectRoot" -ForegroundColor Gray
Write-Host "Target:  $targetDir" -ForegroundColor Gray

# ─── Step 1: Build ──────────────────────────────────────────────
if (-not $NoBuild) {
    Write-Host "`n[1/4] Building TypeScript..." -ForegroundColor Yellow
    Push-Location $projectRoot
    try {
        pnpm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Build failed" -ForegroundColor Red
            exit 1
        }
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "`n[1/4] Skipping build (--NoBuild)" -ForegroundColor Gray
}

# ─── Step 2: Clean old global ───────────────────────────────────
Write-Host "`n[2/4] Cleaning old global install..." -ForegroundColor Yellow

# Remove the old module directory (but not if it's already a junction to us)
if (Test-Path $targetDir) {
    $item = Get-Item $targetDir -Force
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        $linkTarget = $item.Target
        if ($linkTarget -eq $projectRoot) {
            Write-Host "  Already linked to this project, refreshing..." -ForegroundColor Gray
            Remove-Item $targetDir -Force
        }
        else {
            Write-Host "  Removing stale symlink -> $linkTarget" -ForegroundColor Yellow
            Remove-Item $targetDir -Force
        }
    }
    else {
        Write-Host "  Removing old copy ($([math]::Round((Get-ChildItem $targetDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB, 1)) MB)..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $targetDir
    }
}

# ─── Step 3: Create junction to local project ──────────────────
Write-Host "`n[3/4] Creating junction link..." -ForegroundColor Yellow

# Ensure global modules dir exists
if (-not (Test-Path $globalModules)) {
    New-Item -ItemType Directory -Path $globalModules -Force | Out-Null
}

# Create a directory junction (works without admin on Windows)
cmd /c mklink /J "$targetDir" "$projectRoot" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to create junction" -ForegroundColor Red
    exit 1
}
Write-Host "  $targetDir -> $projectRoot" -ForegroundColor Green

# ─── Step 4: Create/update bin shims ───────────────────────────
Write-Host "`n[4/4] Writing bin shims..." -ForegroundColor Yellow

$entryScript = "openclaw.mjs"

# .cmd shim for Windows cmd.exe
$cmdShim = @"
@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
CALL :find_dp0
IF EXIST "%dp0%\node.exe" (
  SET "_prog=%dp0%\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)
endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\node_modules\openclaw\$entryScript" %*
"@

# .ps1 shim for PowerShell
$ps1Shim = @"
#!/usr/bin/env pwsh
`$basedir=Split-Path `$MyInvocation.MyCommand.Definition -Parent

`$exe=""
if (`$PSVersionTable.PSVersion -lt "6.0" -or `$IsWindows) {
  `$exe=".exe"
}
`$ret=0
if (Test-Path "`$basedir/node`$exe") {
  # Support local node installations
  & "`$basedir/node`$exe" "`$basedir/node_modules/openclaw/$entryScript" `$args
  `$ret=`$LASTEXITCODE
} else {
  & "node`$exe" "`$basedir/node_modules/openclaw/$entryScript" `$args
  `$ret=`$LASTEXITCODE
}
exit `$ret
"@

# Plain sh shim (for Git Bash / WSL)
$shShim = @"
#!/bin/sh
basedir=`$(dirname "`$(echo "`$0" | sed -e 's,\\\\,/,g')")

case ``uname`` in
    *CYGWIN*|*MINGW*|*MSYS*) basedir=``cygpath -w "`$basedir"``;;
esac

if [ -x "`$basedir/node" ]; then
  exec "`$basedir/node" "`$basedir/node_modules/openclaw/$entryScript" "`$@"
else
  exec node "`$basedir/node_modules/openclaw/$entryScript" "`$@"
fi
"@

$cmdPath = Join-Path $globalBinDir "openclaw.cmd"
$ps1Path = Join-Path $globalBinDir "openclaw.ps1"
$shPath = Join-Path $globalBinDir "openclaw"

Set-Content -Path $cmdPath -Value $cmdShim -Encoding ASCII -NoNewline
Write-Host "  Created $cmdPath" -ForegroundColor Gray

Set-Content -Path $ps1Path -Value $ps1Shim -Encoding UTF8 -NoNewline
Write-Host "  Created $ps1Path" -ForegroundColor Gray

Set-Content -Path $shPath -Value ($shShim -replace "`r`n", "`n") -Encoding ASCII -NoNewline
Write-Host "  Created $shPath" -ForegroundColor Gray

# ─── Done ──────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Green
Write-Host " Deploy complete!" -ForegroundColor Green
Write-Host " 'openclaw' CLI now runs YOUR local HoC code." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Test it:" -ForegroundColor Cyan
Write-Host "  openclaw gateway run" -ForegroundColor White
Write-Host "  openclaw --version" -ForegroundColor White
