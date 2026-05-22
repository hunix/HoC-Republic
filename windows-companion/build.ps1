# Build script for OpenClaw Windows Companion Service
# Run this script on a Windows machine with .NET 9.0 SDK installed

param(
    [string]$Configuration = "Release",
    [string]$OutputPath,
    [string]$Project
)

if ([string]::IsNullOrEmpty($Project)) {
    $Project = Join-Path $PSScriptRoot "OpenClawCompanionEnhanced.csproj"
}

if ([string]::IsNullOrEmpty($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot "bin\publish"
}

Write-Host "Building OpenClaw Windows Companion Service..." -ForegroundColor Cyan

# Check if .NET SDK is installed
$dotnetVersion = dotnet --version 2>$null
if (-not $dotnetVersion) {
    Write-Host "ERROR: .NET SDK not found. Please install .NET 8.0 SDK from https://dotnet.microsoft.com/download" -ForegroundColor Red
    exit 1
}

Write-Host "Using .NET SDK version: $dotnetVersion" -ForegroundColor Green

# Restore dependencies
Write-Host "`nRestoring dependencies..." -ForegroundColor Yellow
dotnet restore $Project
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to restore dependencies" -ForegroundColor Red
    exit 1
}

# Build the project
Write-Host "`nBuilding project..." -ForegroundColor Yellow
dotnet build $Project --configuration $Configuration --no-restore
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    exit 1
}

# Publish as single-file executable (framework-dependent — .NET 9 runtime must be installed)
Write-Host "`nPublishing executable..." -ForegroundColor Yellow
dotnet publish $Project --configuration $Configuration --runtime win-x64 --no-self-contained `
    -p:PublishSingleFile=true `
    --output $OutputPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Publish failed" -ForegroundColor Red
    exit 1
}

Write-Host "`nBuild completed successfully!" -ForegroundColor Green
Write-Host "Executable location: $OutputPath\OpenClawCompanionEnhanced.exe" -ForegroundColor Cyan

# Display file size
$exePath = Join-Path $OutputPath "OpenClawCompanionEnhanced.exe"
if (Test-Path $exePath) {
    $fileSize = (Get-Item $exePath).Length / 1MB
    Write-Host "Executable size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
}

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Run install.ps1 as Administrator to install the service" -ForegroundColor White
Write-Host "2. Or manually install with: sc.exe create OpenClawCompanion binPath= `"$exePath`" start= auto" -ForegroundColor White
