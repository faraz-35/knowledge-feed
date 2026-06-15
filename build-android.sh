#!/usr/bin/env bash
# Reproducibly build the Android APK from the static site.
# Output: android/knowledge-feed.apk + android/index.html (served at /android).
set -euo pipefail
cd "$(dirname "$0")"

APP=_capacitor
APP_VERSION="1.3.0"
VERSION_CODE="4"
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

echo ">> Setting app version $APP_VERSION (code $VERSION_CODE)..."
sed -i.bak -E "s/versionCode [0-9]+/versionCode $VERSION_CODE/; s/versionName \"[^\"]*\"/versionName \"$APP_VERSION\"/" "$APP/android/app/build.gradle" && rm -f "$APP/android/app/build.gradle.bak"

echo ">> Generating launcher icon from app-icon-1024.png..."
mkdir -p "$APP/assets"
cp app-icon-1024.png "$APP/assets/icon.png"
( cd "$APP" && npx @capacitor/assets generate --android || true )

echo ">> Syncing + building debug APK..."
( cd "$APP" && npx cap sync android && ( cd android && ./gradlew assembleDebug --console=plain ) )

echo ">> Publishing APK to /android route..."
mkdir -p android
cp "$APP/android/app/build/outputs/apk/debug/app-debug.apk" "android/knowledge-feed.apk"

cat > android/index.html <<HTM
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=knowledge-feed.apk?v=$APP_VERSION">
  <title>Download Knowledge Feed for Android</title>
  <style>
    body{background:#0b0d12;color:#e8e6e1;font-family:-apple-system,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;margin:0;text-align:center;padding:2rem}
    h1{font-family:Georgia,serif;font-weight:400;font-size:1.6rem;margin:0 0 .15rem}
    .ver{color:#d7c9a3;font-size:.8rem;letter-spacing:.05em;margin:0 0 .9rem}
    p{color:#9aa1b3;font-size:.92rem;line-height:1.5;margin:.4rem 0;max-width:24rem}
    a{display:inline-block;margin-top:1.1rem;color:#0b0d12;background:#d7c9a3;font-weight:600;text-decoration:none;padding:.8rem 1.5rem;border-radius:10px}
    .small{font-size:.8rem;color:#5f6675;margin-top:1.6rem}
  </style>
</head>
<body>
  <h1>Knowledge Feed</h1>
  <p class="ver">Android &middot; v$APP_VERSION</p>
  <p>Downloading the app&hellip;</p>
  <p><a href="knowledge-feed.apk?v=$APP_VERSION">Tap here to download the APK</a></p>
  <p class="small">After it downloads, open it to install <strong>over</strong> the old version. If asked, allow &ldquo;Install unknown apps&rdquo; for your browser.</p>
</body>
</html>
HTM

echo "Done -> android/knowledge-feed.apk (v$APP_VERSION)"
