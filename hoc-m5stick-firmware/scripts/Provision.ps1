#Requires -Version 7.0
<#
.SYNOPSIS
    HoC M5StickC Plus2 — Interactive Provisioning Script (Windows 11 / PowerShell 7)

.DESCRIPTION
    Guides you through configuring WiFi and gateway settings, writes them into
    config.h, then builds and flashes the firmware using PlatformIO.

.PARAMETER Port
    Optional COM port (e.g., COM3). Auto-detected if not specified.

.EXAMPLE
    .\Provision.ps1
    .\Provision.ps1 -Port COM5
#>

param(
    [string]$Port
)

$ErrorActionPreference = "Stop"

# ── Colors & Helpers ─────────────────────────────────────────
function Write-Banner {
    Write-Host ""
    Write-Host "  ╔═══════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║   HoC M5StickC Plus2 — Provisioner    ║" -ForegroundColor Cyan
    Write-Host "  ║   Windows 11 / PowerShell 7 Edition   ║" -ForegroundColor Cyan
    Write-Host "  ╚═══════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($msg) {
    Write-Host "  → $msg" -ForegroundColor Yellow
}

function Write-Success($msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function Write-Err($msg) {
    Write-Host "  ✗ $msg" -ForegroundColor Red
}

# ══════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════

Write-Banner

# ── Check PlatformIO ─────────────────────────────────────────
Write-Step "Checking PlatformIO CLI..."
$pioCmd = Get-Command pio -ErrorAction SilentlyContinue
if (-not $pioCmd) {
    # Also check for platformio
    $pioCmd = Get-Command platformio -ErrorAction SilentlyContinue
}
if (-not $pioCmd) {
    Write-Err "PlatformIO CLI (pio) not found in PATH."
    Write-Host ""
    Write-Host "  Install it with one of these methods:" -ForegroundColor White
    Write-Host "    pip install platformio" -ForegroundColor Gray
    Write-Host "    or install the PlatformIO IDE extension in VS Code" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
Write-Success "PlatformIO found: $($pioCmd.Source)"

# ── Detect COM Port ──────────────────────────────────────────
if (-not $Port) {
    Write-Step "Detecting USB serial port..."

    # Query WMI for CH9102 or CP210x or USB Serial devices
    $serialPorts = Get-CimInstance -ClassName Win32_PnPEntity -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match "COM\d+" -and ($_.Name -match "CH910|CP210|USB|Serial") } |
        ForEach-Object {
            if ($_.Name -match "(COM\d+)") { $Matches[1] }
        }

    if (-not $serialPorts) {
        # Fallback: list all COM ports
        $serialPorts = [System.IO.Ports.SerialPort]::GetPortNames()
    }

    if ($serialPorts -and $serialPorts.Count -gt 0) {
        if ($serialPorts -is [array]) {
            $Port = $serialPorts[0]
        } else {
            $Port = $serialPorts
        }
        Write-Success "Found: $Port"

        if ($serialPorts -is [array] -and $serialPorts.Count -gt 1) {
            Write-Host "  Multiple ports detected: $($serialPorts -join ', ')" -ForegroundColor Gray
            Write-Host "  Using $Port. Override with: .\Provision.ps1 -Port COMx" -ForegroundColor Gray
        }
    } else {
        Write-Err "No USB serial port detected."
        Write-Host "  Connect your M5StickC Plus2 and try again," -ForegroundColor White
        Write-Host "  or specify the port: .\Provision.ps1 -Port COM3" -ForegroundColor White
        exit 1
    }
}

Write-Host ""

# ── Gather Configuration ────────────────────────────────────
Write-Host "  ── WiFi Configuration ──" -ForegroundColor Cyan
$wifiSsid = Read-Host "    WiFi SSID"
$wifiPass = Read-Host "    WiFi Password" -MaskInput

Write-Host ""
Write-Host "  ── HoC Gateway Configuration ──" -ForegroundColor Cyan

$gwHostInput = Read-Host "    Gateway Host IP [192.168.1.100]"
$gwHost = if ($gwHostInput) { $gwHostInput } else { "192.168.1.100" }

$gwPortInput = Read-Host "    Gateway Port [18789]"
$gwPort = if ($gwPortInput) { $gwPortInput } else { "18789" }

$gwToken = Read-Host "    Gateway Token (leave empty if none)"

$tlsInput = Read-Host "    Use TLS? (y/N)"
$useTls = if ($tlsInput -match "^[Yy]") { "true" } else { "false" }

# ── Summary ──────────────────────────────────────────────────
Write-Host ""
Write-Host "  ── Summary ──" -ForegroundColor Cyan
Write-Host "    WiFi SSID:     $wifiSsid"
Write-Host "    Gateway:       ${gwHost}:${gwPort}"
Write-Host "    TLS:           $useTls"
Write-Host "    Token:         $(if ($gwToken) { '(set)' } else { '(none)' })"
Write-Host "    COM Port:      $Port"
Write-Host ""

$confirm = Read-Host "  Proceed with flashing? (Y/n)"
if ($confirm -and $confirm -notmatch "^[Yy]") {
    Write-Host "  Aborted." -ForegroundColor Yellow
    exit 0
}

# ── Resolve project paths ───────────────────────────────────
$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$configFile = Join-Path $projectDir "include\config.h"

if (-not (Test-Path $configFile)) {
    Write-Err "config.h not found at: $configFile"
    exit 1
}

# ── Write Configuration ─────────────────────────────────────
Write-Step "Writing configuration to config.h..."

$config = Get-Content $configFile -Raw

# Replace each setting using regex
$config = $config -replace '(#define WIFI_SSID\s+)"[^"]*"',       "`$1`"$wifiSsid`""
$config = $config -replace '(#define WIFI_PASS\s+)"[^"]*"',       "`$1`"$wifiPass`""
$config = $config -replace '(#define GATEWAY_HOST\s+)"[^"]*"',    "`$1`"$gwHost`""
$config = $config -replace '(#define GATEWAY_PORT\s+)\d+',        "`${1}$gwPort"
$config = $config -replace '(#define GATEWAY_TOKEN\s+)"[^"]*"',   "`$1`"$gwToken`""
$config = $config -replace '(#define GATEWAY_USE_TLS\s+)\w+',     "`${1}$useTls"

Set-Content -Path $configFile -Value $config -NoNewline
Write-Success "Configuration written to config.h"

# ── Clean stale library cache ────────────────────────────────
$libdepsDir = Join-Path $projectDir ".pio\libdeps"
if (Test-Path $libdepsDir) {
    Write-Step "Cleaning stale library cache..."
    Remove-Item -Recurse -Force $libdepsDir
    Write-Success "Library cache cleared"
}

# ── Build ────────────────────────────────────────────────────
Write-Host ""
Write-Step "Building firmware (this may take a few minutes on first run)..."
Push-Location $projectDir
try {
    & pio run
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Build failed! Check the output above for errors."
        exit 1
    }
    Write-Success "Build successful"
} finally {
    Pop-Location
}

# ── Upload ───────────────────────────────────────────────────
Write-Host ""
Write-Step "Uploading firmware to $Port..."
Push-Location $projectDir
try {
    & pio run -t upload --upload-port $Port
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Upload failed! Check connection and port."
        exit 1
    }
} finally {
    Pop-Location
}

# ── Done ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║   Firmware flashed successfully!      ║" -ForegroundColor Green
Write-Host "  ╚═══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Your M5StickC Plus2 will now:" -ForegroundColor White
Write-Host "    1. Connect to WiFi: $wifiSsid"
Write-Host "    2. Connect to HoC Gateway: ${gwHost}:${gwPort}"
Write-Host "    3. Show the dashboard on the display"
Write-Host ""
Write-Host "  Open Serial Monitor:" -ForegroundColor Cyan
Write-Host "    pio device monitor -p $Port -b 115200"
Write-Host ""
Write-Host "  Tip: You can change settings later via Serial commands." -ForegroundColor Gray
Write-Host "       Type /help in the serial monitor for all options." -ForegroundColor Gray
Write-Host ""
