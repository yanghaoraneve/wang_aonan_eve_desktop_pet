@echo off
call E:\VS2022BuildTools\VC\Auxiliary\Build\vcvars64.bat >nul 2>&1
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
cd /d "%~dp0"
npm run tauri:dev
