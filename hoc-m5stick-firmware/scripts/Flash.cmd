@echo off
REM ══════════════════════════════════════════════════════════
REM  HoC M5StickC Plus2 — Quick Flash Launcher
REM  Double-click this file to build and flash the firmware.
REM ══════════════════════════════════════════════════════════

where pwsh >nul 2>&1
if %ERRORLEVEL% equ 0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0Flash.ps1" %*
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Flash.ps1" %*
)
pause
