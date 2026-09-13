/*
 * libgme-bridge.js
 * Browser ABI adapter for the Emscripten libgme build.
 */
const LibGME = {
  ready: false,
  module: null,
  handle: 0,
  dataPtr: 0,
  outPtr: 0,
  sampleRate: 48000,

  async init() {
    if (this.ready) return true;
    if (typeof window.GME !== "function") {
      console.error("wasm/gme.js is missing or not loaded.");
      return false;
    }
    this.module = await window.GME({});
    this.ready = true;
    return true;
  },

  open(buffer) {
    if (!this.ready) throw new Error("libgme is not ready");
    this.close();

    const bytes = new Uint8Array(buffer);
    this.dataPtr = this.module._malloc(bytes.length);
    this.module.HEAPU8.set(bytes, this.dataPtr);

    const handlePtr = this.module._malloc(4);
    const rc = this.module._nsf_bridge_open(bytes.length ? this.dataPtr : 0, bytes.length, handlePtr);
    if (rc !== 0) {
      this.module._free(handlePtr);
      this.module._free(this.dataPtr);
      this.dataPtr = 0;
      throw new Error(`libgme open failed (${rc})`);
    }

    this.handle = this.module.HEAPU32[handlePtr >>> 2];
    this.module._free(handlePtr);
    return this.handle;
  },

  getTrackCount() {
    return this.handle ? this.module._nsf_bridge_track_count(this.handle) : 0;
  },

  startTrack(track) {
    if (!this.handle) return -1;
    return this.module._nsf_bridge_start(this.handle, track);
  },

  getTrackInfo(track) {
    if (!this.handle) return null;
    const p = this.module._malloc(12);
    const rc = this.module._nsf_bridge_info(
      this.handle, track, p, p + 4, p + 8
    );
    if (rc !== 0) {
      this.module._free(p);
      return null;
    }
    const v = new Int32Array(this.module.HEAPU8.buffer, p, 3);
    const info = { length: v[0], introLength: v[1], loopLength: v[2] };
    this.module._free(p);
    return info;
  },

  play(sampleCount) {
    if (!this.handle || sampleCount <= 0) return new Int16Array(0);
    const bytes = sampleCount * 2;
    if (!this.outPtr) this.outPtr = this.module._malloc(bytes);
    const rc = this.module._nsf_bridge_play(this.handle, this.outPtr, sampleCount);
    if (rc !== 0) throw new Error(`libgme play failed (${rc})`);
    return new Int16Array(this.module.HEAP16.buffer, this.outPtr, sampleCount).slice();
  },

  stop() {
    if (this.handle) this.module._nsf_bridge_stop(this.handle);
  },

  close() {
    if (!this.module) return;
    if (this.handle) this.module._nsf_bridge_delete(this.handle);
    if (this.dataPtr) this.module._free(this.dataPtr);
    if (this.outPtr) this.module._free(this.outPtr);
    this.handle = this.dataPtr = this.outPtr = 0;
  }
};
window.LibGME = LibGME;
