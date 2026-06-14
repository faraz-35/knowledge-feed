#!/usr/bin/env bash
# Reproducibly build the Android APK from the static site.
# Output: android/knowledge-feed.apk (served at the /android route).
set -euo pipefail
cd "$(dirname "$0")"

APP=_capacitor
WEB_FILES="index.html styles.css app.js facts.js manifest.webmanifest sw.js icon-192.png icon-512.png icon-512-maskable.png"

if [ ! -d "$APP/node_modules" ]; then
  echo ">> Bootstrapping Capacitor workspace (first run)..."
  mkdir -p "$APP"
  cat > "$APP/package.json" <<'PKG'
{ "name": "kf-native", "private": true,
  "dependencies": { "@capacitor/android": "^7.0.0", "@capacitor/core": "^7.0.0" },
  "devDependencies": { "@capacitor/cli": "^7.0.0", "@capacitor/assets": "^3.0.0" } }
PKG
  cat > "$APP/capacitor.config.json" <<'CFG'
{ "appId": "com.farazshah.knowledgefeed", "appName": "Knowledge Feed", "webDir": "www" }
CFG
  ( cd "$APP" && npm install --no-fund --no-audit )
fi

echo ">> Staging web assets..."
rm -rf "$APP/www" && mkdir "$APP/www"
cp $WEB_FILES "$APP/www/"

echo ">> Adding Android platform if needed..."
if [ ! -d "$APP/android" ]; then ( cd "$APP" && npx cap add android ); fi

echo ">> Generating launcher icon from app-icon-1024.png..."
mkdir -p "$APP/assets"
cp app-icon-1024.png "$APP/assets/icon.png"
( cd "$APP" && npx @capacitor/assets generate --android || true )

echo ">> Syncing + building debug APK..."
( cd "$APP" && npx cap sync android && ( cd android && ./gradlew assembleDebug --console=plain ) )

echo ">> Publishing APK to /android route..."
mkdir -p android
cp "$APP/android/app/build/outputs/apk/debug/app-debug.apk" android/knowledge-feed.apk
echo "Done -> android/knowledge-feed.apk"
