@echo off
REM ══════════════════════════════════════════════════════════
REM  HoC M5StickC Plus2 — Provisioner Launcher
REM  Double-click this file to run the PowerShell provisioner.
REM ══════════════════════════════════════════════════════════

where pwsh >nul 2>&1
if %ERRORLEVEL% equ 0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0Provision.ps1" %*
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Provision.ps1" %*
)
pause
