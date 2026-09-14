#!/usr/bin/env bash
set -euo pipefail

# Build requirements:
#   emsdk / emcc
#   cmake
#   git
#
# This script intentionally builds libgme from source rather than bundling
# an unknown third-party binary. The resulting gme.js/gme.wasm are placed
# in ../wasm/.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/game-music-emu"
BUILD="$VENDOR/build-emscripten"
OUT="$ROOT/wasm"

if ! command -v emcc >/dev/null 2>&1; then
  echo "ERROR: emcc was not found."
  echo "Install/activate the Emscripten SDK, then run this script again."
  exit 2
fi

if [ ! -d "$VENDOR/.git" ]; then
  mkdir -p "$ROOT/vendor"
  git clone --depth 1 https://github.com/libgme/game-music-emu.git "$VENDOR"
fi

rm -rf "$BUILD"
mkdir -p "$BUILD"
cd "$BUILD"

emcmake cmake .. \
  -DBUILD_SHARED_LIBS=OFF \
  -DCMAKE_BUILD_TYPE=Release

emmake cmake --build . --config Release -j2

LIBGME_A="$(find "$BUILD" -name 'libgme.a' -print -quit)"
if [ -z "$LIBGME_A" ]; then
  echo "ERROR: libgme.a was not produced."
  exit 3
fi

mkdir -p "$OUT"

em++ -O3 \
  -I"$VENDOR/gme" \
  "$ROOT/src/gme_bridge.c" \
  "$LIBGME_A" \
  -o "$OUT/gme.js" \
  -sMODULARIZE=1 \
  -sEXPORT_NAME=GME \
  -sENVIRONMENT=web \
  -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_nsf_bridge_open","_nsf_bridge_track_count","_nsf_bridge_start","_nsf_bridge_play","_nsf_bridge_stop","_nsf_bridge_delete","_nsf_bridge_info"]' \
  -sEXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
  

echo "Built:"
ls -lh "$OUT/gme.js" "$OUT/gme.wasm"
