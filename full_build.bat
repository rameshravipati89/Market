@echo off
:: =============================================================================
::  full_build.bat — Windows launcher for full_build.ps1
::  Double-click this file to rebuild and start all services.
:: =============================================================================

echo Starting multilevel-marketing build...
echo.

:: Run PowerShell script with execution policy bypass (no admin needed)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0full_build.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build failed. See output above.
    pause
    exit /b %ERRORLEVEL%
)

pause
