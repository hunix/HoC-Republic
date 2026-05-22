#Requires -Version 7.0
<#
.SYNOPSIS
    HoC M5StickC Plus2 — Quick Flash (Windows 11 / PowerShell 7)

.DESCRIPTION
    Builds and uploads the firmware without modifying config.h.
    Use this if you prefer to configure via Serial commands after flashing,
    or if config.h is already set up.

.PARAMETER Port
    Optional COM port (e.g., COM3). Auto-detected if not specified.

.EXAMPLE
    .\Flash.ps1
    .\Flash.ps1 -Port COM5
#>

param(
    [string]$Port
)

$ErrorActionPreference = "Stop"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir

Write-Host ""
Write-Host "  HoC M5StickC Plus2 — Quick Flash" -ForegroundColor Cyan
Write-Host ""

# ── Check PlatformIO ─────────────────────────────────────────
$pioCmd = Get-Command pio -ErrorAction SilentlyContinue
if (-not $pioCmd) {
    $pioCmd = Get-Command platformio -ErrorAction SilentlyContinue
}
if (-not $pioCmd) {
    Write-Host "  Error: PlatformIO CLI (pio) not found." -ForegroundColor Red
    Write-Host "  Install: pip install platformio" -ForegroundColor Gray
    exit 1
}

# ── Clean stale library cache if needed ──────────────────────
$libdepsDir = Join-Path $projectDir ".pio\libdeps"
if (Test-Path $libdepsDir) {
    Write-Host "  Cleaning stale library cache..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $libdepsDir
    Write-Host "  Library cache cleared" -ForegroundColor Green
}

# ── Build ────────────────────────────────────────────────────
Write-Host "  Building firmware (this may take a few minutes on first run)..." -ForegroundColor Yellow
Push-Location $projectDir
try {
    & pio run
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Build successful" -ForegroundColor Green
} finally {
    Pop-Location
}

# ── Upload ───────────────────────────────────────────────────
Write-Host ""
Push-Location $projectDir
try {
    if ($Port) {
        Write-Host "  Uploading to $Port..." -ForegroundColor Yellow
        & pio run -t upload --upload-port $Port
    } else {
        Write-Host "  Uploading (auto-detect port)..." -ForegroundColor Yellow
        & pio run -t upload
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Upload failed!" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

# ── Done ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Done! Firmware uploaded." -ForegroundColor Green
Write-Host ""
Write-Host "  Open serial monitor:" -ForegroundColor Cyan
Write-Host "    pio device monitor -b 115200"
Write-Host ""
Write-Host "  Then configure via serial commands:" -ForegroundColor White
Write-Host "    /set wifi_ssid YourNetwork"
Write-Host "    /set wifi_pass YourPassword"
Write-Host "    /set gw_host 192.168.1.100"
Write-Host "    /set gw_port 18789"
Write-Host "    /reboot"
Write-Host ""
