#!/bin/sh
# Build build/icon.icns from build/icon.png using macOS-only tools
# (sips + iconutil). No npm dependencies. Run after scripts/make-icon.mjs.
set -e
cd "$(dirname "$0")/.."

node scripts/make-icon.mjs

SET=build/icon.iconset
rm -rf "$SET"
mkdir -p "$SET"

for s in 16 32 128 256 512; do
  sips -z $s $s build/icon.png --out "$SET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z $d $d build/icon.png --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done

iconutil -c icns "$SET" -o build/icon.icns
rm -rf "$SET"
echo "wrote build/icon.icns"
