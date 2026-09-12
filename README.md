# Chromebook Famicompo NSF Player

現在の版では、再生エンジンを「実libgme + WebAssembly」に接続するためのコードと再現可能なビルド手順を組み込みました。

## 現在の状態

- NSF / NSFe の形式判定
- NSFメタデータ表示
- libgmeの複数トラック数取得
- IndexedDBへFile/Blobを保存
- AudioWorkletへのPCMストリーミング
- 実libgme C ABIブリッジ
- Emscriptenビルドスクリプト

## 注意

この配布物には、現在の作業環境でコンパイルできなかったため、`wasm/gme.js` / `wasm/gme.wasm` の完成バイナリはまだ入っていません。

`tools/build-libgme-wasm.sh` をEmscripten環境で実行して生成します。

ブラウザのWASM/Service Workerは通常 `file://` 直開きではなく、HTTPSまたはlocalhost等のWebサーバー経由で動かす必要があります。


## Online WASM build (recommended for Chromebook)

This project includes a GitHub Actions workflow at `.github/workflows/build-wasm.yml`. It builds the current libgme source with the official Emscripten SDK on a GitHub-hosted runner and uploads `nsfplayer3-built.zip` as a workflow artifact. GitHub documents workflow artifacts as files produced by a workflow that can be downloaded after the run.

1. Put this project in a GitHub repository, including the `.github/workflows/build-wasm.yml` file.
2. Open the repository's **Actions** tab.
3. Select **Build NSF Player WASM** and choose **Run workflow**.
4. When the run finishes successfully, open the run and download the `nsfplayer3-built` artifact.
5. The downloaded ZIP contains the player with real `wasm/gme.js` and `wasm/gme.wasm`.

The workflow is manual (`workflow_dispatch`) so a build only starts when you request it.
