const NSFEngine = {
  initialized: false,
  loaded: false,

  currentTrack: 0,
  trackCount: 0,

  voiceNames: [],
  voiceNotes: [],
  voiceLevels: [],
  voiceDuties: [],

  info: null,

  sampleRate: 48000,

  async init() {
    if (this.initialized) {
      return true;
    }

    if (!window.LibGME) {
      console.error(
        "[NSF] LibGME bridge is not available."
      );

      return false;
    }

    const ready =
      await window.LibGME.init();

    if (!ready) {
      console.error(
        "[NSF] LibGME initialization failed."
      );

      return false;
    }

    this.initialized = true;

    console.log(
      "[NSF] Engine initialized."
    );

    return true;
  },

  async load(buffer) {
    if (!this.initialized) {
      const ok = await this.init();

      if (!ok) {
        throw new Error(
          "NSF engine initialization failed"
        );
      }
    }

    if (!buffer) {
      throw new Error(
        "NSF buffer is empty"
      );
    }

    /*
     * Parse the file header separately from the
     * actual libgme playback engine.
     *
     * This keeps the existing UI metadata path
     * independent from PCM generation.
     */
    let parsedInfo = null;

    if (
      window.NSFParser &&
      typeof window.NSFParser.parse === "function"
    ) {
      try {
        parsedInfo =
          window.NSFParser.parse(buffer);
      } catch (error) {
        console.warn(
          "[NSF] metadata parsing failed:",
          error
        );
      }
    }

    /*
     * Close any previous NSF before opening the new one.
     */
    this.unload();

    window.LibGME.open(buffer);

    this.trackCount =
      window.LibGME.getTrackCount();

    this.currentTrack =
      parsedInfo &&
      Number.isFinite(parsedInfo.startTrackIndex)
        ? parsedInfo.startTrackIndex
        : 0;

    if (
      this.currentTrack < 0 ||
      this.currentTrack >= this.trackCount
    ) {
      this.currentTrack = 0;
    }

    this.info = parsedInfo || {
      format: "NSF",
      version: null,
      trackCount: this.trackCount,
      startTrackIndex: this.currentTrack,
      title: "",
      artist: "",
      copyright: "",
      trackTitles: [],
      trackArtists: [],
      chip: "2A03"
    };

    /*
     * libgme is the authority for the actual
     * number and names of playable voices.
     */
    this.refreshVoiceInfo();

    this.loaded = true;

    console.log(
      "[NSF] Loaded:",
      {
        tracks: this.trackCount,
        voices: this.voiceNames.length
      }
    );

    return {
      trackCount: this.trackCount,
      voiceNames: this.voiceNames.slice()
    };
  },

  refreshVoiceInfo() {
    if (
      !window.LibGME ||
      !window.LibGME.handle
    ) {
      return;
    }

    this.voiceNames =
      window.LibGME.getVoiceNames() || [];

    this.voiceNotes =
      new Array(this.voiceNames.length)
        .fill(-1);

    this.voiceLevels =
      new Array(this.voiceNames.length)
        .fill(0);

    this.voiceDuties =
      new Array(this.voiceNames.length)
        .fill(-1);
  },

  /*
   * Start the currently selected track.
   *
   * player.js expects NSFEngine.start().
   */
  start() {
    if (
      !this.loaded ||
      !window.LibGME ||
      !window.LibGME.handle
    ) {
      console.warn(
        "[NSF] start() called before NSF was loaded."
      );

      return false;
    }

    return this.startTrack(
      this.currentTrack
    );
  },

  /*
   * Start a specific track.
   */
  startTrack(track) {
    if (
      !window.LibGME ||
      !window.LibGME.handle
    ) {
      return false;
    }

    const index = Number(track);

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.trackCount
    ) {
      console.error(
        "[NSF] Invalid track:",
        track
      );

      return false;
    }

    const result =
      window.LibGME.startTrack(index);

    /*
     * The native bridge returns 1 on success.
     */
    if (result !== 1) {
      console.error(
        "[NSF] startTrack failed:",
        index,
        result
      );

      return false;
    }

    this.currentTrack = index;

    /*
     * Reset telemetry immediately when a new
     * track starts.
     */
    this.voiceNotes =
      new Array(this.voiceNames.length)
        .fill(-1);

    this.voiceLevels =
      new Array(this.voiceNames.length)
        .fill(0);

    this.voiceDuties =
      new Array(this.voiceNames.length)
        .fill(-1);

    return true;
  },

  /*
   * Change track without starting playback
   * through the audio worker.
   *
   * app.js uses this when PREV/NEXT is pressed.
   */
  setTrack(track) {
    if (
      !this.loaded ||
      !window.LibGME ||
      !window.LibGME.handle
    ) {
      return false;
    }

    const index = Number(track);

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.trackCount
    ) {
      console.error(
        "[NSF] Invalid track:",
        track
      );

      return false;
    }

    const result =
      window.LibGME.startTrack(index);

    if (result !== 1) {
      console.error(
        "[NSF] setTrack failed:",
        index,
        result
      );

      return false;
    }

    this.currentTrack = index;

    this.voiceNotes =
      new Array(this.voiceNames.length)
        .fill(-1);

    this.voiceLevels =
      new Array(this.voiceNames.length)
        .fill(0);

    this.voiceDuties =
      new Array(this.voiceNames.length)
        .fill(-1);

    return true;
  },

  getTrackCount() {
    return this.trackCount || 0;
  },

  getCurrentTrack() {
    return this.currentTrack || 0;
  },

  /*
   * Metadata used by player.js / app.js.
   */
  getInfo() {
    const info = this.info || {};

    return {
      format: info.format || "NSF",
      version:
        info.version !== undefined
          ? info.version
          : null,

      trackCount:
        this.trackCount ||
        info.trackCount ||
        0,

      startTrackIndex:
        Number.isFinite(info.startTrackIndex)
          ? info.startTrackIndex
          : 0,

      title: info.title || "",
      artist: info.artist || "",
      copyright: info.copyright || "",
      ripper: info.ripper || "",

      trackTitles:
        Array.isArray(info.trackTitles)
          ? info.trackTitles.slice()
          : [],

      trackArtists:
        Array.isArray(info.trackArtists)
          ? info.trackArtists.slice()
          : [],

      chip:
        info.chip ||
        "2A03"
    };
  },

  getVoiceNames() {
    return this.voiceNames.slice();
  },

  /*
   * Current MIDI note for every voice.
   *
   * Telemetry errors are deliberately isolated
   * from PCM playback.
   */
  getVoiceNotes() {
    if (
      !window.LibGME ||
      typeof window.LibGME.getVoiceNotes !==
        "function"
    ) {
      return this.voiceNotes.slice();
    }

    try {
      const notes =
        window.LibGME.getVoiceNotes();

      if (
        notes &&
        typeof notes.length === "number"
      ) {
        this.voiceNotes =
          Array.from(notes);
      }
    } catch (error) {
      console.warn(
        "[NSF] voice note telemetry failed:",
        error
      );
    }

    return this.voiceNotes.slice();
  },

  /*
   * Normalized level for every voice.
   */
  getVoiceLevels(frameCount = 1) {
    if (
      !window.LibGME ||
      typeof window.LibGME.getVoiceLevels !==
        "function"
    ) {
      return this.voiceLevels.slice();
    }

    try {
      const levels =
        window.LibGME.getVoiceLevels(
          frameCount
        );

      if (
        levels &&
        typeof levels.length === "number"
      ) {
        this.voiceLevels =
          Array.from(levels);
      }
    } catch (error) {
      console.warn(
        "[NSF] voice level telemetry failed:",
        error
      );
    }

    return this.voiceLevels.slice();
  },

  /*
   * Current duty ratio for every voice.
   *
   * Examples:
   *
   *   0.125 = 12.5%
   *   0.250 = 25%
   *   0.375 = 37.5%
   *   0.500 = 50%
   *   0.625 = 62.5%
   *   0.750 = 75%
   *   0.875 = 87.5%
   *   1.000 = 100%
   *
   * -1 means that the voice does not have
   * a conventional pulse duty ratio.
   */
  getVoiceDuties() {
    if (
      !window.LibGME ||
      typeof window.LibGME.getVoiceDuties !==
        "function"
    ) {
      return this.voiceDuties.slice();
    }

    try {
      const duties =
        window.LibGME.getVoiceDuties();

      if (
        duties &&
        typeof duties.length === "number"
      ) {
        this.voiceDuties =
          Array.from(duties);
      }
    } catch (error) {
      console.warn(
        "[NSF] voice duty telemetry failed:",
        error
      );
    }

    return this.voiceDuties.slice();
  },

  /*
   * Update all telemetry at approximately the
   * same point in the audio timeline.
   *
   * IMPORTANT:
   * This function must never generate PCM.
   */
  updateVoiceTelemetry(frameCount = 1) {
    try {
      this.getVoiceLevels(frameCount);
    } catch (error) {
      console.warn(
        "[NSF] level telemetry update failed:",
        error
      );
    }

    try {
      this.getVoiceNotes();
    } catch (error) {
      console.warn(
        "[NSF] note telemetry update failed:",
        error
      );
    }

    try {
      this.getVoiceDuties();
    } catch (error) {
      console.warn(
        "[NSF] duty telemetry update failed:",
        error
      );
    }
  },

  /*
   * Convenience telemetry object.
   */
  getVoiceTelemetry(frameCount = 1) {
    return {
      names: this.getVoiceNames(),
      notes: this.getVoiceNotes(),
      levels: this.getVoiceLevels(
        frameCount
      ),
      duties: this.getVoiceDuties()
    };
  },

  /*
   * PCM path.
   *
   * libgme returns signed 16-bit mono PCM.
   * player.js / AudioWorklet expects Float32.
   *
   * IMPORTANT:
   * No telemetry call is made here.
   * Playback must remain independent from
   * note/level/duty telemetry.
   */
  getFloatPCM(sampleCount) {
    if (
      !window.LibGME ||
      !window.LibGME.handle ||
      sampleCount <= 0
    ) {
      return new Float32Array(0);
    }

    const pcm =
      window.LibGME.play(sampleCount);

    if (
      !pcm ||
      typeof pcm.length !== "number"
    ) {
      return new Float32Array(0);
    }

    const output =
      new Float32Array(pcm.length);

    for (let i = 0; i < pcm.length; i++) {
      output[i] =
        Math.max(
          -1,
          Math.min(
            1,
            pcm[i] / 32768
          )
        );
    }

    return output;
  },

  /*
   * Compatibility PCM method.
   *
   * Older code may call NSFEngine.play().
   */
  play(sampleCount) {
    return this.getFloatPCM(sampleCount);
  },

  stop() {
    if (
      window.LibGME &&
      typeof window.LibGME.stop ===
        "function"
    ) {
      try {
        window.LibGME.stop();
      } catch (error) {
        console.warn(
          "[NSF] stop failed:",
          error
        );
      }
    }
  },

  unload() {
    if (window.LibGME) {
      try {
        window.LibGME.close();
      } catch (error) {
        console.warn(
          "[NSF] close failed:",
          error
        );
      }
    }

    this.loaded = false;

    this.currentTrack = 0;
    this.trackCount = 0;

    this.voiceNames = [];
    this.voiceNotes = [];
    this.voiceLevels = [];
    this.voiceDuties = [];

    this.info = null;
  },

  close() {
    this.unload();
  }
};

window.NSFEngine = NSFEngine;
