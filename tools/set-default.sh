#!/usr/bin/env bash
# Делает Luma Launcher домашним экраном: кнопка «Домой» на пульте открывает его, службу кнопки добавляем к уже включённым.
# Откат: adb shell cmd package set-home-activity com.google.android.apps.tv.launcherx/.home.HomeActivity
set -e
ADB="${ADB:-/c/Android/sdk/platform-tools/adb.exe}"; DEV="${TV:-192.168.0.85:5555}"; A="$ADB -s $DEV shell"
SVC="ws.luma.launcher/ws.luma.launcher.HomeKeyService"
$A cmd package set-home-activity ws.luma.launcher/.MainActivity
cur=$($A settings get secure enabled_accessibility_services | tr -d '\r')
case "$cur" in *"$SVC"*) ;; null|"") $A settings put secure enabled_accessibility_services "$SVC" ;; *) $A settings put secure enabled_accessibility_services "$cur:$SVC" ;; esac
$A settings put secure accessibility_enabled 1
echo "home: $($A cmd role get-role-holders android.app.role.HOME | tr -d '\r')"
