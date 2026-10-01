const NSFEngine = {
  ready: false,
  playing: false,
  currentTrack: 0,
  trackCount: 0,
  info: null,
  voiceNames: [],
  voiceLevels: [],
  voiceNotes: [],

  async init() {
    this.ready = await GMECore.init();
    return this.ready;
  },

  async load(buffer) {
    if (!await this.init()) {
      throw new Error("libgme WASM unavailable");
    }

    const parsed = NSFParser.parse(buffer);

    if (!parsed) {
      throw new Error("NSF/NSFe format could not be identified");
    }

    await GMECore.open(buffer);

    this.trackCount = GMECore.getTrackCount();

    this.currentTrack = Math.min(
      parsed.startTrackIndex || 0,
      Math.max(0, this.trackCount - 1)
    );

    this.info = parsed;

    this.voiceNames = GMECore.getVoiceNames();

    this.voiceLevels = new Array(
      this.voiceNames.length
    ).fill(0);

    this.voiceNotes = new Array(
      this.voiceNames.length
    ).fill(-1);

    return true;
  },

  start() {
    if (!GMECore.startTrack(this.currentTrack)) {
      return false;
    }

    this.playing = true;

    return true;
  },

  stop() {
    this.playing = false;

    GMECore.stop();
  },

  setTrack(track) {
    if (
      track < 0 ||
      track >= this.trackCount
    ) {
      return false;
    }

    this.currentTrack = track;

    return (
      !this.playing ||
      GMECore.startTrack(track)
    );
  },

  getFloatPCM(frames) {
    /*
     * PCM再生専用。
     *
     * ここでは音量メーターや鍵盤モニターの取得を行わない。
     * テレメトリ側でエラーが起きても、音声再生を止めないため。
     */
    const pcm = GMECore.getSamples(frames * 2);

    const out = new Float32Array(pcm.length);

    for (let i = 0; i < pcm.length; i++) {
      out[i] = pcm[i] / 32768;
    }

    return out;
  },

  updateVoiceTelemetry(frames) {
    /*
     * 音量メーターは再生PCMとは独立して更新する。
     * 失敗しても音声再生には影響させない。
     */
    try {
      const levels = GMECore.getVoiceLevels(frames);

      if (levels && levels.length) {
        this.voiceLevels = Array.from(levels);
      }
    } catch (error) {
      console.warn("[NSF JS] voice level update failed:", error);
    }

    /*
     * 鍵盤モニターも独立取得。
     * WASM側に未実装/古いビルドでも再生を止めない。
     */
    try {
      const notes = GMECore.getVoiceNotes();

      if (notes && notes.length) {
        this.voiceNotes = Array.from(notes);
      }
    } catch (error) {
      console.warn("[NSF JS] voice note update failed:", error);
    }
  },

  getInfo() {
    return this.info;
  },

  getVoiceNames() {
    return this.voiceNames;
  },

  getVoiceLevels() {
    return this.voiceLevels;
  },

  getVoiceNotes() {
    return this.voiceNotes;
  },

  isMultiChannel() {
    return GMECore.isMultiChannel();
  }
};

window.NSFEngine = NSFEngine;
