#!/bin/bash
# Builds Instant Translate for Safari and installs it into Applications.
#
#   ./install.sh                       # signs with your first "Apple Development" certificate
#   SIGN_IDENTITY=<sha1> ./install.sh  # pick a certificate (see: security find-identity -v -p codesigning)
set -euo pipefail
cd "$(dirname "$0")"

PROJECT="Instant Translate/Instant Translate.xcodeproj"
APP="Instant Translate.app"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "Xcode is required: install it from the App Store, open it once, then run this script again." >&2
  exit 1
fi

# --- signing certificate ---
if [[ -z "${SIGN_IDENTITY:-}" ]]; then
  SIGN_IDENTITY=$(security find-identity -v -p codesigning | grep '"Apple Development' | grep -v CSSMERR | head -1 | awk '{print $2}' || true)
fi
if [[ -n "$SIGN_IDENTITY" && "$SIGN_IDENTITY" != "-" ]]; then
  NAME=$(security find-identity -v -p codesigning | grep "$SIGN_IDENTITY" | sed -E 's/^[^"]*"([^"]*)".*/\1/' | head -1)
  echo "Signing with: ${NAME:-$SIGN_IDENTITY}"
else
  SIGN_IDENTITY="-"
  echo "No Apple Development certificate found: building unsigned."
  echo "Safari will then need Develop > Allow Unsigned Extensions (resets on every Safari restart)."
  echo "Tip: sign in with your Apple ID in Xcode > Settings > Accounts to get a free certificate."
fi

# --- build ---
BUILD_DIR=$(mktemp -d)
trap 'rm -rf "$BUILD_DIR"' EXIT
echo "Building…"
xcodebuild -project "$PROJECT" -scheme "Instant Translate" -configuration Release \
  -destination "platform=macOS" -derivedDataPath "$BUILD_DIR" -quiet \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$SIGN_IDENTITY" DEVELOPMENT_TEAM="" \
  PROVISIONING_PROFILE_SPECIFIER="" build
BUILT="$BUILD_DIR/Build/Products/Release/$APP"

# --- install ---
DEST=/Applications
if [[ ! -w "$DEST" ]]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi
pkill -x "Instant Translate" 2>/dev/null || true
rm -rf "${DEST:?}/$APP"
ditto "$BUILT" "$DEST/$APP"
# Forget the temporary build so Safari sees only the installed copy.
"$LSREGISTER" -u "$BUILT" 2>/dev/null || true
"$LSREGISTER" -f "$DEST/$APP"
# Launching once registers the extension with Safari; right after a reinstall
# LaunchServices may need a moment.
open "$DEST/$APP" 2>/dev/null || { sleep 2; open "$DEST/$APP" 2>/dev/null; } || echo "(Open $DEST/$APP once to register the extension.)"

cat <<EOF

Installed: $DEST/$APP

Next, in Safari:
  1. Safari > Settings > Extensions: turn on "Instant Translate".
  2. Click "Edit Websites…" and allow it on all websites.
  3. Reload open pages, then select any text (or click a word in YouTube subtitles).
EOF
