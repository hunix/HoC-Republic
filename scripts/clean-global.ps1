# clean-global.ps1 — Remove broken global openclaw installation
# Run this once to clean up the corrupted global npm module

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$globalPath = Join-Path $env:APPDATA "npm\node_modules\openclaw"
$globalBin = Join-Path $env:APPDATA "npm\openclaw"
$globalCmd = Join-Path $env:APPDATA "npm\openclaw.cmd"
$globalPs1 = Join-Path $env:APPDATA "npm\openclaw.ps1"

Write-Host "OpenClaw Global Cleanup" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Check what exists
$exists = @()
if (Test-Path $globalPath) { $exists += "node_modules/openclaw ($([math]::Round((Get-ChildItem $globalPath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)) MB)" }
if (Test-Path $globalBin) { $exists += "openclaw (bin shim)" }
if (Test-Path $globalCmd) { $exists += "openclaw.cmd" }
if (Test-Path $globalPs1) { $exists += "openclaw.ps1" }

if ($exists.Count -eq 0) {
    Write-Host "`nNo global openclaw installation found. Already clean!" -ForegroundColor Green
    exit 0
}

Write-Host "`nFound global openclaw artifacts:" -ForegroundColor Yellow
foreach ($item in $exists) {
    Write-Host "  - $item" -ForegroundColor White
}

if (-not $Force) {
    $answer = Read-Host "`nRemove all? (y/N)"
    if ($answer -ne "y" -and $answer -ne "Y") {
        Write-Host "Cancelled." -ForegroundColor Gray
        exit 0
    }
}

# Remove
if (Test-Path $globalPath) {
    Write-Host "Removing $globalPath (this may take a moment)..." -ForegroundColor Yellow
    # Use cmd.exe rd which is much faster than PowerShell Remove-Item for deep trees
    cmd /c "rd /s /q `"$globalPath`"" 2>$null
}
foreach ($f in @($globalBin, $globalCmd, $globalPs1)) {
    if (Test-Path $f) {
        Write-Host "Removing $f..." -ForegroundColor Yellow
        Remove-Item -Force $f
    }
}

Write-Host "`nGlobal openclaw removed successfully." -ForegroundColor Green
Write-Host "Run .\scripts\deploy-global.ps1 to install your local HoC build globally." -ForegroundColor Cyan
