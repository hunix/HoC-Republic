if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

# Set environment variables for the service installation context causes them to be baked into the service
$env:OPENCLAW_STATE_DIR = "$HOME\.openclaw"
$env:OPENCLAW_CONFIG_PATH = "$HOME\.openclaw\openclaw.yaml"
$env:HOME = $HOME

Write-Host "--- OpenClaw Service Repair Tool ---"

function Remove-Service-Robust {
    param($Name)
    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($service) {
        Write-Host "Service '$Name' found. State: $($service.Status)"
        if ($service.Status -ne 'Stopped') {
            Write-Host "Stopping service..."
            try { Stop-Service -Name $Name -Force -ErrorAction Stop } catch { Write-Host "Stop-Service failed: $_" }
            Start-Sleep -Seconds 2
        }
        
        Write-Host "Uninstalling service..."
        try {
            # Use sc.exe for reliable deletion
            & sc.exe delete $Name
        }
        catch { Write-Host "sc delete failed: $_" }
        
        Start-Sleep -Seconds 2
        
        # Verify
        if (Get-Service -Name $Name -ErrorAction SilentlyContinue) {
            Write-Host "WARNING: Service still exists. It might be marked for deletion. Reboot may be required."
        }
        else {
            Write-Host "Service removed."
        }
    }
    else {
        Write-Host "Service '$Name' not found (clean)."
    }
}

Remove-Service-Robust "OpenClaw Gateway"

Write-Host "Cleaning up port 18789..."
$port = 18789
$process = Get-Process -Id (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue
if ($process) {
    Stop-Process -Id $process.Id -Force
    Write-Host "Killed process $($process.Id) on port $port"
}

Write-Host "Installing Gateway Service..."
# Force build to ensure new wrapper code is used
$env:OPENCLAW_FORCE_BUILD = "1"
node "$ScriptDir\scripts\run-node.mjs" gateway install --force

Write-Host "Starting Gateway Service..."
node "$ScriptDir\scripts\run-node.mjs" gateway start

Write-Host "Done! Check status with: openclaw gateway status"
Write-Host "If it fails, check log at: $env:OPENCLAW_STATE_DIR\openclaw-service.log"
Read-Host "Press Enter to exit"
