@echo off
chcp 65001 >nul
title Luma Launcher: установка на ТВ
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
if errorlevel 1 pause
