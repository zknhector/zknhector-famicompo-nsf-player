const NSFEngine = {
  initialized: false,
  loaded: false,

  currentTrack: 0,
  trackCount: 0,

  voiceNames: [],
  voiceNotes: [],
  voiceLevels: [],
  voiceDuties: [],
  voiceSources: [],

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
     * Parse metadata before opening the LibGME
     * playback handle.
     *
     * NSFParser is optional here so that a parser
     * problem never prevents libgme playback.
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
     * Close the previous song.
     */
    this.unload();

    /*
     * Open the actual NSF/NSFe through LibGME.
     */
    window.LibGME.open(buffer);

    this.trackCount =
      window.LibGME.getTrackCount();

    /*
     * Parser information is used when available.
     * LibGME remains the authority for actual
     * playback track count.
     */
    this.info =
      parsedInfo || {
        format: "NSF",
        version: null,

        trackCount: this.trackCount,
        startTrackIndex: 0,

        title: "",
        artist: "",
        copyright: "",
        ripper: "",

        trackTitles: [],
        trackArtists: [],

        chip: "2A03"
      };

    let startTrack =
      Number(this.info.startTrackIndex);

    if (
      !Number.isInteger(startTrack) ||
      startTrack < 0 ||
      startTrack >= this.trackCount
    ) {
      startTrack = 0;
    }

    this.currentTrack = startTrack;

    /*
     * Get voice information after LibGME has opened
     * the file.
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

    /*
     * Get the actual sound-source family for every
     * voice. Source IDs are supplied by the native
     * bridge and use the same order as voiceNames.
     *
     *   1 = 2A03
     *   2 = VRC6
     *   3 = N163
     *   4 = FME7
     *   5 = FDS
     *   6 = MMC5
     *   7 = VRC7
     *
     * Telemetry failure must never prevent playback.
     */
    try {
      if (
        typeof window.LibGME.getVoiceSources ===
        "function"
      ) {
        this.voiceSources =
          Array.from(
            window.LibGME.getVoiceSources() || []
          );
      } else {
        this.voiceSources = [];
      }
    } catch (error) {
      console.warn(
        "[NSF] voice source telemetry failed:",
        error
      );

      this.voiceSources = [];
    }

    /*
     * Keep the source array aligned with the voice
     * array. Missing entries are represented by 0,
     * which means "unknown / use fallback detection".
     */
    if (
      this.voiceSources.length <
      this.voiceNames.length
    ) {
      this.voiceSources =
        this.voiceSources.concat(
          new Array(
            this.voiceNames.length -
            this.voiceSources.length
          ).fill(0)
        );
    } else if (
      this.voiceSources.length >
      this.voiceNames.length
    ) {
      this.voiceSources =
        this.voiceSources.slice(
          0,
          this.voiceNames.length
        );
    }

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
   * Start the current track.
   *
   * player.js calls this method when PLAY is pressed.
   */
  start() {
    if (
      !this.loaded ||
      !window.LibGME ||
      !window.LibGME.handle
    ) {
      console.error(
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

    if (result !== 1) {
      console.error(
        "[NSF] startTrack failed:",
        index
      );

      return false;
    }

    this.currentTrack = index;

    /*
     * Clear old telemetry immediately.
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
   * Used by PREV / NEXT.
   */
  setTrack(track) {
    return this.startTrack(track);
  },

  getTrackCount() {
    return this.trackCount || 0;
  },

  getCurrentTrack() {
    return this.currentTrack || 0;
  },

  /*
   * Metadata used by NSFPlayer and App.
   */
  getInfo() {
    const info =
      this.info || {};

    return {
      format:
        info.format || "NSF",

      version:
        info.version !== undefined
          ? info.version
          : null,

      trackCount:
        this.trackCount ||
        info.trackCount ||
        0,

      startTrackIndex:
        Number.isInteger(
          info.startTrackIndex
        )
          ? info.startTrackIndex
          : 0,

      title:
        info.title || "",

      artist:
        info.artist || "",

      copyright:
        info.copyright || "",

      ripper:
        info.ripper || "",

      trackTitles:
        Array.isArray(info.trackTitles)
          ? info.trackTitles.slice()
          : [],

      trackArtists:
        Array.isArray(info.trackArtists)
          ? info.trackArtists.slice()
          : [],

      chip:
        info.chip || "2A03"
    };
  },

  getVoiceNames() {
    return this.voiceNames.slice();
  },

  /*
   * Actual sound-source family for every voice.
   *
   * Source IDs:
   *   1 = 2A03
   *   2 = VRC6
   *   3 = N163
   *   4 = FME7
   *   5 = FDS
   *   6 = MMC5
   *   7 = VRC7
   */
  getVoiceSources() {
    return this.voiceSources.slice();
  },

  /*
   * Current MIDI note for every voice.
   *
   * Telemetry errors must never stop playback.
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
   * Current normalized voice level.
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
   * Pulse voices:
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
   * Other voice types return -1.
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
   * Update all telemetry.
   *
   * This function NEVER generates PCM.
   */
  updateVoiceTelemetry(frameCount = 1) {
    try {
      this.getVoiceLevels(
        frameCount
      );
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
   * Combined telemetry helper.
   */
  getVoiceTelemetry(frameCount = 1) {
    return {
      names:
        this.getVoiceNames(),

      sources:
        this.getVoiceSources(),

      notes:
        this.getVoiceNotes(),

      levels:
        this.getVoiceLevels(
          frameCount
        ),

      duties:
        this.getVoiceDuties()
    };
  },

  /*
   * PCM playback path.
   *
   * IMPORTANT:
   * No telemetry is requested here.
   *
   * This is intentional so that a telemetry
   * failure can never stop audio playback.
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
      window.LibGME.play(
        sampleCount
      );

    if (
      !pcm ||
      typeof pcm.length !== "number"
    ) {
      return new Float32Array(0);
    }

    const output =
      new Float32Array(
        pcm.length
      );

    for (
      let i = 0;
      i < pcm.length;
      i++
    ) {
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
   * Compatibility alias.
   */
  play(sampleCount) {
    return this.getFloatPCM(
      sampleCount
    );
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
          "[NSF] LibGME close failed:",
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
    this.voiceSources = [];

    this.info = null;
  },

  close() {
    this.unload();
  }
};

window.NSFEngine = NSFEngine;
