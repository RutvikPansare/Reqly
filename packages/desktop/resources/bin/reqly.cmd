@echo off
rem Reqly bundled-server shim (Windows). Shipped at <install>\resources\bin.
rem Runs the bundled Reqly server via the Electron executable in Node mode.
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\Reqly.exe" "%~dp0..\server\dist\server\index.js" %*
