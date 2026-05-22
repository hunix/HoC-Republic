# Installation script for OpenClaw Windows Companion Service
# Must be run as Administrator

param(
    [string]$ServiceName = "OpenClawCompanion",
    [string]$ExecutablePath
)

if ([string]::IsNullOrEmpty($ExecutablePath)) {
    $ExecutablePath = Join-Path $PSScriptRoot "bin\publish\OpenClawCompanionEnhanced.exe"
}

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

Write-Host "Installing OpenClaw Windows Companion Service..." -ForegroundColor Cyan

# Check if executable exists
if (-not (Test-Path $ExecutablePath)) {
    Write-Host "ERROR: Executable not found at $ExecutablePath" -ForegroundColor Red
    Write-Host "Please run build.ps1 first to build the service" -ForegroundColor Yellow
    exit 1
}

# Get absolute path
$absolutePath = (Resolve-Path $ExecutablePath).Path
Write-Host "Executable path: $absolutePath" -ForegroundColor Green

# Check if service already exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Service already exists. Stopping and removing..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $ServiceName
    Start-Sleep -Seconds 2
}

# Create the service with interactive desktop access
Write-Host "Creating service..." -ForegroundColor Yellow
sc.exe create $ServiceName binPath= "$absolutePath" start= auto type= own type= interact DisplayName= "OpenClaw Companion Service"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to create service" -ForegroundColor Red
    exit 1
}

# Configure service to run as LocalSystem (required for interactive session access)
Write-Host "Configuring service to run as LocalSystem..." -ForegroundColor Yellow
sc.exe config $ServiceName obj= LocalSystem
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Failed to configure service account" -ForegroundColor Yellow
}

# Set cluster/Redis environment variables for the service
Write-Host "Configuring cluster environment variables..." -ForegroundColor Yellow
$envRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env.cluster"
if (Test-Path $envFile) {
    $envVars = @()
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            $envVars += "$($matches[1].Trim())=$($matches[2].Trim())"
        }
    }
    if ($envVars.Count -gt 0) {
        New-ItemProperty -Path $envRegPath -Name "Environment" -PropertyType MultiString -Value $envVars -Force | Out-Null
        Write-Host "  Set $($envVars.Count) environment variables from .env.cluster" -ForegroundColor Green
    }
}
else {
    Write-Host "  No .env.cluster found, skipping cluster config" -ForegroundColor Yellow
}

# Configure failure recovery
Write-Host "Configuring failure recovery..." -ForegroundColor Yellow
sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Failed to configure failure recovery" -ForegroundColor Yellow
}

# Set service description
Write-Host "Setting service description..." -ForegroundColor Yellow
sc.exe description $ServiceName "Provides high-privilege Windows capabilities for OpenClaw agent"

# Start the service
Write-Host "Starting service..." -ForegroundColor Yellow
sc.exe start $ServiceName
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Service created but failed to start" -ForegroundColor Yellow
    Write-Host "Check Event Viewer for error details" -ForegroundColor Yellow
}
else {
    Write-Host "`nService installed and started successfully!" -ForegroundColor Green
}

# Display service status
Write-Host "`nService Status:" -ForegroundColor Cyan
sc.exe query $ServiceName

Write-Host "`nService Configuration:" -ForegroundColor Cyan
sc.exe qc $ServiceName

Write-Host "`nInstallation complete!" -ForegroundColor Green
Write-Host "The companion service is now running with NT AUTHORITY\SYSTEM privileges" -ForegroundColor Cyan
