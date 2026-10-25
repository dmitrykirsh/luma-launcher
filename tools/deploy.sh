#!/usr/bin/env bash
# Сборка debug-APK, установка на ТВ и запуск лаунчера: tools/deploy.sh
set -e
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME:-/c/Program Files/Microsoft/jdk-17.0.20.101-hotspot}"
GR="${GRADLE:-/c/Users/dkirs/.gradle/wrapper/dists/gradle-8.14.3-bin/cv11ve7ro1n3o1j4so8xd9n66/gradle-8.14.3/bin/gradle}"
ADB="${ADB:-/c/Android/sdk/platform-tools/adb.exe}"; DEV="${TV:-192.168.0.85:5555}"
if ! "$GR" -q assembleDebug > /tmp/launcher-build.log 2>&1; then grep -E "^e:|What went wrong" -A3 /tmp/launcher-build.log | head -30; echo "СБОРКА УПАЛА"; exit 1; fi
"$ADB" -s "$DEV" install -r -g app/build/outputs/apk/debug/app-debug.apk | tail -1
"$ADB" -s "$DEV" shell am start -n ws.luma.launcher/.MainActivity >/dev/null
echo started
