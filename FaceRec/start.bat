@echo off
rem ============================================================
rem  Face Attendance Demo - offline launcher (no Node.js)
rem  Double-click this file to start the demo. No internet needed.
rem ============================================================
cd /d "%~dp0"

rem Open the browser, then start the built-in Windows PowerShell server.
start "" http://localhost:5500
echo Starting Face Attendance demo...
echo Keep this window open while you use the app. Close it to stop.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

pause
