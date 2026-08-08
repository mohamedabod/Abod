#!/usr/bin/env bash
# =====================================================================
# Aboud Sayem v4.0 — manual APK build (no Gradle, no Capacitor)
#
#   bash build_apk.sh              debug-signed release APK
#   ANDROID_HOME=/path bash build_apk.sh
#
# Side-by-side build (installs next to an existing copy signed with a
# different key, instead of hitting "package conflicts with an existing
# package"):
#
#   APP_ID=com.sayemfit.app4 APP_LABEL="Aboud Sayem 4" \
#   OUT=app-release-v4side.apk bash build_apk.sh
#
# Output: app-release.apk (or $OUT)
# =====================================================================
set -euo pipefail

# The installed app id. It is com.sayemfit.app4 and NOT com.sayemfit.app
# because an older build signed with a lost key still owns the original id;
# changing it back would break updates for anyone already on v4.
APP_ID="${APP_ID:-com.sayemfit.app4}"
APP_LABEL="${APP_LABEL:-}"
OUT="${OUT:-app-release.apk}"

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
BUILD="$BASEDIR/build"
GEN="$BUILD/gen"
cd "$BASEDIR"

# ---------------------------------------------------------------- SDK
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ]; then
  for cand in "$HOME/Android/Sdk" "$HOME/Library/Android/sdk" /usr/lib/android-sdk /opt/android-sdk; do
    [ -d "$cand" ] && SDK="$cand" && break
  done
fi
[ -n "$SDK" ] && [ -d "$SDK" ] || { echo "ERROR: Android SDK not found. Set ANDROID_HOME."; exit 1; }

PLATFORM="$SDK/platforms/android-34/android.jar"
if [ ! -f "$PLATFORM" ]; then
  PLATFORM="$(ls -1 "$SDK"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1 || true)"
fi
[ -f "$PLATFORM" ] || { echo "ERROR: no platforms/android-*/android.jar under $SDK"; exit 1; }

# aapt (v1) is required by this pipeline. It ships up to build-tools 34.0.0;
# build-tools 35+ dropped it, so pick the newest directory that still has it.
BT=""
for dir in $(ls -1d "$SDK"/build-tools/*/ 2>/dev/null | sort -Vr); do
  if [ -x "${dir}aapt" ]; then BT="${dir%/}"; break; fi
done
[ -n "$BT" ] || { echo "ERROR: no build-tools with aapt found. Install build-tools;34.0.0"; exit 1; }

AAPT="$BT/aapt"; D8="$BT/d8"; ZIPALIGN="$BT/zipalign"; APKSIGNER="$BT/apksigner"
for tool in "$AAPT" "$D8" "$ZIPALIGN" "$APKSIGNER"; do
  [ -x "$tool" ] || { echo "ERROR: missing $tool"; exit 1; }
done

echo "SDK        : $SDK"
echo "platform   : $PLATFORM"
echo "build-tools: $BT"

# ------------------------------------------------------------ prepare
rm -rf "$BUILD"
mkdir -p "$BUILD" "$GEN" assets/public

# React is bundled locally — the app must run with zero network access.
REACT_URL="https://unpkg.com/react@18.2.0/umd/react.production.min.js"
REACTDOM_URL="https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"
if [ ! -s assets/public/react.min.js ]; then
  echo "downloading react…"
  curl -fsSL -o assets/public/react.min.js "$REACT_URL"
fi
if [ ! -s assets/public/react-dom.min.js ]; then
  echo "downloading react-dom…"
  curl -fsSL -o assets/public/react-dom.min.js "$REACTDOM_URL"
fi

python3 tools/make_icons.py res >/dev/null
echo "icons      : ok"

# A different label needs a patched copy of res/ so the two installs are
# distinguishable on the launcher.
RES_DIR="res"
if [ -n "$APP_LABEL" ]; then
  RES_DIR="$BUILD/res"
  cp -r res "$RES_DIR"
  sed -i "s|<string name=\"app_name\">[^<]*</string>|<string name=\"app_name\">$APP_LABEL</string>|" \
    "$RES_DIR/values/strings.xml"
  echo "label      : $APP_LABEL"
fi

# --rename-manifest-package changes only the installed application id.
# R.java and the component class names keep the original Java package, so no
# source changes are needed for a side-by-side build.
RENAME_ARGS=""
if [ -n "$APP_ID" ]; then
  RENAME_ARGS="--rename-manifest-package $APP_ID"
  echo "app id     : $APP_ID"
fi

# --------------------------------------------------------- resources
# -m -J generates R.java, which the notification code needs.
# shellcheck disable=SC2086
"$AAPT" package -f -m -J "$GEN" $RENAME_ARGS \
  -M AndroidManifest.xml -S "$RES_DIR" -A assets \
  -I "$PLATFORM" -F "$BUILD/app-unsigned.apk"
echo "resources  : packaged"

# ------------------------------------------------------------ compile
find src "$GEN" -name '*.java' > "$BUILD/sources.txt"
javac -nowarn -Xlint:-options -source 8 -target 8 \
  -bootclasspath "$PLATFORM" -classpath "$PLATFORM" \
  -encoding UTF-8 -d "$BUILD/classes" "@$BUILD/sources.txt"
echo "javac      : ok ($(wc -l < "$BUILD/sources.txt") files)"

CLASSES=$(find "$BUILD/classes" -name '*.class')
# shellcheck disable=SC2086
"$D8" --min-api 24 --lib "$PLATFORM" --output "$BUILD" $CLASSES
echo "d8         : ok"

( cd "$BUILD" && "$AAPT" add -f app-unsigned.apk classes.dex >/dev/null )

# --------------------------------------------------------------- sign
KEYSTORE="$BASEDIR/sayem-key.jks"
STOREPASS="${SAYEM_STOREPASS:-sayemfit123}"
if [ ! -f "$KEYSTORE" ]; then
  # Never silently mint a new identity: a different key means Android refuses
  # to update the installed app, and the only way out is uninstalling it and
  # losing the user's history. That is exactly how v3 became unupdatable.
  if [ "${ALLOW_NEW_KEY:-0}" != "1" ]; then
    echo
    echo "ERROR: $KEYSTORE is missing."
    echo
    echo "  Signing with a new key makes this APK REFUSE to install over the"
    echo "  existing app ('package conflicts with an existing package'), and the"
    echo "  only fix would be uninstalling and losing all stored data."
    echo
    echo "  Restore your backup of sayem-key.jks next to this script."
    echo "  To deliberately start a NEW app identity: ALLOW_NEW_KEY=1 bash build_apk.sh"
    echo
    exit 1
  fi
  keytool -genkeypair -v -keystore "$KEYSTORE" -keyalg RSA -keysize 2048 \
    -validity 10000 -alias sayemfit -storepass "$STOREPASS" -keypass "$STOREPASS" \
    -dname "CN=SayemFit,O=SayemFit,C=EG" >/dev/null
  echo "keystore   : created (NEW IDENTITY — back this file up!)"
fi

"$ZIPALIGN" -f 4 "$BUILD/app-unsigned.apk" "$BUILD/app-aligned.apk"
"$APKSIGNER" sign --ks "$KEYSTORE" --ks-key-alias sayemfit \
  --ks-pass "pass:$STOREPASS" --key-pass "pass:$STOREPASS" \
  --out "$BASEDIR/$OUT" "$BUILD/app-aligned.apk"
"$APKSIGNER" verify "$BASEDIR/$OUT"

echo
echo "SUCCESS -> $BASEDIR/$OUT"
ls -lh "$BASEDIR/$OUT"
