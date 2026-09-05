#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------------------------
# SongPlay — Automated Android APK Build Script
# Builds and signs standalone songplay.apk in the repository root.
# ------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🎵 Building SongPlay Android App (songplay.apk)..."

# Detect Java 17+
if [ -d "/opt/homebrew/opt/openjdk@17" ]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
elif [ -z "${JAVA_HOME:-}" ]; then
  CANDIDATE=$(/usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home 2>/dev/null || true)
  if [ -n "$CANDIDATE" ]; then
    export JAVA_HOME="$CANDIDATE"
  fi
fi

# Detect Android SDK Build Tools & Platform
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ ! -d "$ANDROID_HOME" ]; then
  echo "❌ Error: Android SDK not found at $ANDROID_HOME. Please set ANDROID_HOME."
  exit 1
fi

BUILD_TOOLS_DIR=$(find "$ANDROID_HOME/build-tools" -maxdepth 1 -mindepth 1 | sort -V | tail -n 1)
PLATFORM_DIR=$(find "$ANDROID_HOME/platforms" -maxdepth 1 -name "android-*" | sort -V | tail -n 1)

if [ -z "$BUILD_TOOLS_DIR" ] || [ ! -f "$BUILD_TOOLS_DIR/aapt2" ]; then
  echo "❌ Error: aapt2 not found in $ANDROID_HOME/build-tools."
  exit 1
fi

if [ -z "$PLATFORM_DIR" ] || [ ! -f "$PLATFORM_DIR/android.jar" ]; then
  echo "❌ Error: android.jar not found in $ANDROID_HOME/platforms."
  exit 1
fi

export PATH="$BUILD_TOOLS_DIR:$JAVA_HOME/bin:$PATH"
ANDROID_JAR="$PLATFORM_DIR/android.jar"

echo "✅ Using Java: $($JAVA_HOME/bin/java -version 2>&1 | head -n 1)"
echo "✅ Using Build Tools: $BUILD_TOOLS_DIR"
echo "✅ Using Platform: $PLATFORM_DIR"

# 1. Update web assets in assets/www
echo "📦 Packaging web application assets..."
mkdir -p android/assets/www/static android/bin

python3 - << 'EOF'
import os, shutil
with open("templates/index.html", "r", encoding="utf-8") as f:
    html = f.read()
html = html.replace("{{ url_for('static', filename='favicon.svg') }}", "static/favicon.svg")
html = html.replace("{{ url_for('static', filename='style.css') }}", "static/style.css")
html = html.replace("{{ url_for('static', filename='app.js') }}", "static/app.js")
html = html.replace('href="/manifest.webmanifest"', 'href="static/manifest.webmanifest"')

with open("android/assets/www/index.html", "w", encoding="utf-8") as f:
    f.write(html)

for item in os.listdir("static"):
    s = os.path.join("static", item)
    d = os.path.join("android/assets/www/static", item)
    if os.path.isfile(s):
        shutil.copy2(s, d)

shutil.copy2("static/sw.js", "android/assets/www/sw.js")
EOF

# 2. Compile resources
echo "🎨 Compiling Android resources..."
aapt2 compile --dir android/res -o android/res.zip

# 3. Link resources and generate R.java
echo "🔗 Linking resources and generating R.java..."
aapt2 link android/res.zip \
  -I "$ANDROID_JAR" \
  --manifest android/AndroidManifest.xml \
  --java android/src \
  -A android/assets \
  -o android/songplay_unaligned.apk

# 4. Compile Java sources
echo "☕ Compiling Java code..."
"$JAVA_HOME/bin/javac" -encoding UTF-8 \
  -cp "$ANDROID_JAR" \
  -d android/bin \
  android/src/com/songplay/app/R.java \
  android/src/com/songplay/app/NativeMusicResolver.java \
  android/src/com/songplay/app/MainActivity.java

# 5. Convert class files to Dalvik bytecode (D8)
echo "⚡ Converting to DEX..."
d8 --lib "$ANDROID_JAR" \
  --output android/bin/ \
  android/bin/com/songplay/app/*.class

# 6. Add classes.dex to APK
echo "📦 Bundling classes.dex..."
jar uf android/songplay_unaligned.apk -C android/bin classes.dex

# 7. 4-byte zip alignment
echo "📐 Aligning APK..."
zipalign -f -p 4 android/songplay_unaligned.apk android/songplay_aligned.apk

# 8. Keystore & Signing
echo "✍️ Signing APK..."
if [ ! -f android/songplay.keystore ]; then
  keytool -genkeypair -v -keystore android/songplay.keystore \
    -alias songplay -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass songplay123 -keypass songplay123 \
    -dname "CN=SongPlay, OU=Mobile, O=SongPlay, L=NewDelhi, ST=DL, C=IN"
fi

apksigner sign --ks android/songplay.keystore \
  --ks-key-alias songplay \
  --ks-pass pass:songplay123 \
  --key-pass pass:songplay123 \
  --out songplay.apk android/songplay_aligned.apk

# 9. Verify
echo "🔍 Verifying signature..."
apksigner verify --verbose songplay.apk

echo "🎉 Build Complete! APK ready at: $SCRIPT_DIR/songplay.apk"
ls -lh songplay.apk
