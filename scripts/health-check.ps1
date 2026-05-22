#!/usr/bin/env pwsh
<#
.SYNOPSIS
  HoC Gateway Health Check — quickly verifies the gateway and hoc-ui are responding.

.DESCRIPTION
  Checks:
    1. Gateway WebSocket endpoint (HTTP upgrade check via port 3000)
    2. Gateway HTTP health endpoint (http://localhost:3000/health or via WS)
    3. hoc-ui dev server (http://localhost:5173)
    4. Model downloads state (any interrupted downloads)

.EXAMPLE
  powershell -File scripts/health-check.ps1
#>

param(
  [int]$GatewayPort = 3000,
  [int]$HocUiPort = 5173,
  [string]$GatewayHost = "localhost"
)

$ErrorActionPreference = "Continue"
$script:passed = 0
$script:failed = 0

function Write-Check {
  param([string]$Name, [bool]$Ok, [string]$Detail = "")
  if ($Ok) {
    Write-Host "  ✅ $Name" -ForegroundColor Green
    if ($Detail) { Write-Host "     $Detail" -ForegroundColor DarkGray }
    $script:passed++
  } else {
    Write-Host "  ❌ $Name" -ForegroundColor Red
    if ($Detail) { Write-Host "     $Detail" -ForegroundColor DarkYellow }
    $script:failed++
  }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  HoC Health Check" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# ── 1. Gateway Port Open ──────────────────────────────────────────────────────
Write-Host "[ Gateway ]" -ForegroundColor White
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $connect = $tcp.BeginConnect($GatewayHost, $GatewayPort, $null, $null)
  $ok = $connect.AsyncWaitHandle.WaitOne(2000, $false)
  $tcp.Close()
  Write-Check "Port $GatewayPort open" $ok "WebSocket gateway is reachable"
} catch {
  Write-Check "Port $GatewayPort open" $false "TCP connect failed: $_"
}

# ── 2. Gateway HTTP Health ────────────────────────────────────────────────────
try {
  $resp = Invoke-WebRequest -Uri "http://$($GatewayHost):$GatewayPort/health" `
    -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
  $statusOk = $resp.StatusCode -eq 200
  Write-Check "HTTP /health endpoint" $statusOk "Status: $($resp.StatusCode)"
} catch {
  # Gateway may not expose HTTP /health — that's fine, WS is the real check
  Write-Check "HTTP /health endpoint" $false "Not available (WS-only gateway is normal)"
}

Write-Host ""
Write-Host "[ HoC UI Dev Server ]" -ForegroundColor White

# ── 3. hoc-ui Dev Server ──────────────────────────────────────────────────────
try {
  $resp = Invoke-WebRequest -Uri "http://$($GatewayHost):$HocUiPort" `
    -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
  Write-Check "hoc-ui dev server (port $HocUiPort)" $true "Vite server is running"
} catch {
  Write-Check "hoc-ui dev server (port $HocUiPort)" $false "Not running — start with: pnpm dev"
}

Write-Host ""
Write-Host "[ Download State ]" -ForegroundColor White

# ── 4. Interrupted Downloads ──────────────────────────────────────────────────
$stateFile = Join-Path $PSScriptRoot ".." "models" ".downloads" "state.json"
if (Test-Path $stateFile) {
  try {
    $state = Get-Content $stateFile | ConvertFrom-Json
    $dls = @($state.activeDownloads.PSObject.Properties)
    if ($dls.Count -eq 0) {
      Write-Check "Download state" $true "No interrupted downloads"
    } else {
      Write-Check "Download state" $false "$($dls.Count) interrupted download(s) found — call models.manager.download to resume"
      foreach ($dl in $dls) {
        $mb = [math]::Round($dl.Value.downloadedBytes / 1MB, 1)
        $totalMb = [math]::Round($dl.Value.totalBytes / 1MB, 1)
        Write-Host "     • $($dl.Name): $mb MB / $totalMb MB" -ForegroundColor DarkYellow
      }
    }
  } catch {
    Write-Check "Download state" $false "Could not parse state.json: $_"
  }
} else {
  Write-Check "Download state" $true "No state file (no previous downloads)"
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
$totalChecks = $script:passed + $script:failed
if ($script:failed -eq 0) {
  Write-Host "  RESULT: ALL $totalChecks CHECKS PASSED ✅" -ForegroundColor Green
} else {
  Write-Host "  RESULT: $($script:failed)/$totalChecks CHECKS FAILED ❌" -ForegroundColor Red
}
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

exit $script:failed
