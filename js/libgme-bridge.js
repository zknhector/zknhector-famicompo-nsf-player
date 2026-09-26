const LibGME = {
  ready: false,
  module: null,

  handle: 0,
  dataPtr: 0,

  outPtr: 0,
  outBytes: 0,

  levelPtr: 0,
  levelBytes: 0,

  sampleRate: 48000,

  async init() {
    if (this.ready) {
      return true;
    }

    if (typeof window.GME !== "function") {
      console.error("wasm/gme.js is missing or not loaded.");
      return false;
    }

    console.log("GME Core initialize");

    try {
      this.module = await window.GME({});
      this.ready = !!this.module;

      if (this.ready) {
        console.log("GME Core ready");
      } else {
        console.error("Emscripten Module initialization failed.");
      }

      return this.ready;
    } catch (error) {
      console.error("Emscripten Module initialization error:", error);
      this.ready = false;
      return false;
    }
  },

  open(buffer) {
    if (!this.ready || !this.module) {
      throw new Error("libgme is not ready");
    }

    this.close();

    const bytes = new Uint8Array(buffer);

    this.dataPtr = this.module._malloc(bytes.length);
    this.module.HEAPU8.set(bytes, this.dataPtr);

    this.handle = this.module._nsf_bridge_open(
      this.dataPtr,
      bytes.length
    );

    if (!this.handle) {
      this.close();
      throw new Error("libgme open failed");
    }

    console.log("NSF opened, handle =", this.handle);
    return this.handle;
  },

  getTrackCount() {
    if (!this.handle || !this.module) return 0;
    return this.module._nsf_bridge_track_count(this.handle);
  },

  startTrack(track) {
    if (!this.handle || !this.module) return 0;
    return this.module._nsf_bridge_start(this.handle, track);
  },

  play(sampleCount) {
    if (!this.handle || !this.module || sampleCount <= 0) {
      return new Int16Array(0);
    }

    const bytes = sampleCount * 2;

    if (!this.outPtr || this.outBytes < bytes) {
      if (this.outPtr) this.module._free(this.outPtr);

      this.outPtr = this.module._malloc(bytes);
      this.outBytes = bytes;
    }

    const result = this.module._nsf_bridge_play(
      this.handle,
      sampleCount,
      this.outPtr
    );

    if (result !== 1) {
      throw new Error(`libgme play failed (${result})`);
    }

    return new Int16Array(
      this.module.HEAP16.buffer,
      this.outPtr,
      sampleCount
    ).slice();
  },

  getVoiceCount() {
    if (!this.handle || !this.module) return 0;
    return this.module._nsf_bridge_voice_count(this.handle);
  },

  getVoiceNames() {
    const count = this.getVoiceCount();
    const names = [];

    if (!count || !this.module) return names;

    for (let i = 0; i < count; i++) {
      const ptr = this.module._nsf_bridge_voice_name(this.handle, i);
      names.push(
        ptr
          ? this.module.UTF8ToString(ptr)
          : `CH ${i + 1}`
      );
    }

    return names;
  },

  getVoiceLevels(frameCount) {
    const count = this.getVoiceCount();

    if (!count || !this.module || frameCount <= 0) {
      return [];
    }

    const bytes = count * 4;

    if (!this.levelPtr || this.levelBytes < bytes) {
      if (this.levelPtr) this.module._free(this.levelPtr);

      this.levelPtr = this.module._malloc(bytes);
      this.levelBytes = bytes;
    }

    const result = this.module._nsf_bridge_voice_levels(
      this.handle,
      frameCount,
      this.levelPtr
    );

    if (result !== 1) {
      return [];
    }

    return new Float32Array(
      this.module.HEAPF32.buffer,
      this.levelPtr,
      count
    ).slice();
  },

  stop() {
    if (this.handle && this.module) {
      this.module._nsf_bridge_stop(this.handle);
    }
  },

  close() {
    if (!this.module) return;

    if (this.handle) {
      this.module._nsf_bridge_delete(this.handle);
    }

    if (this.dataPtr) this.module._free(this.dataPtr);
    if (this.outPtr) this.module._free(this.outPtr);
    if (this.levelPtr) this.module._free(this.levelPtr);

    this.handle = 0;
    this.dataPtr = 0;
    this.outPtr = 0;
    this.outBytes = 0;
    this.levelPtr = 0;
    this.levelBytes = 0;
  }
};

window.LibGME = LibGME;
