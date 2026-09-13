# 実libgme WASMビルド

このプロジェクトの再生エンジンは Game Music Emu (libgme) を使います。

現在のChromebook側アプリは、`wasm/gme.js` と `wasm/gme.wasm` が存在すれば、
NSF/NSFeをlibgmeへ渡してPCMを生成する構成です。

## 必要なもの

- Emscripten SDK (`emcc`, `emcmake`)
- CMake
- Git

## ビルド

プロジェクトのルートで:

```bash
./tools/build-libgme-wasm.sh
```

生成物:

```text
wasm/gme.js
wasm/gme.wasm
```

この2ファイルは配布ZIPに含めます。

重要: このリポジトリには第三者がビルドした不明なWASMバイナリを同梱していません。
libgmeのソースから再現可能な形で生成します。
