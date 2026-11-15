@echo off
rem Starts the Hybrid Study dev server at http://localhost:5173 in its own window.
rem Double-click this file; close the window (or press Ctrl+C) to stop the server.
title Hybrid Study dev server
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
)
call npm.cmd run dev -- --port 5173 --strictPort
pause
