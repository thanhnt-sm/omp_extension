@echo off
setlocal
node "%~dp0verify-omp-global.cjs" %*
set "EXIT_CODE=%ERRORLEVEL%"
exit /b %EXIT_CODE%
