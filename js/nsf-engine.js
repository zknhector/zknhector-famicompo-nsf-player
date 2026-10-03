const NSFEngine = {
  initialized: false,
  loaded: false,

  currentTrack: 0,
  trackCount: 0,

  voiceNames: [],
  voiceNotes: [],
  voiceLevels: [],
  voiceDuties: [],

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

    this.unload();

    window.LibGME.open(buffer);

    this.trackCount =
      window.LibGME.getTrackCount();

    this.currentTrack = 0;

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
    if (!this.loaded && !window.LibGME.handle) {
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

  startTrack(track) {
    if (!window.LibGME.handle) {
      return false;
    }

    const result =
      window.LibGME.startTrack(track);

    if (result !== 1) {
      console.error(
        "[NSF] startTrack failed:",
        track
      );

      return false;
    }

    this.currentTrack = track;

    /*
     * Reset telemetry immediately when a new track
     * starts. This prevents old note/duty information
     * from visually remaining for one or two frames.
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

  getTrackCount() {
    return this.trackCount || 0;
  },

  getCurrentTrack() {
    return this.currentTrack || 0;
  },

  getVoiceNames() {
    return this.voiceNames.slice();
  },

  /*
   * Return current MIDI note for every voice.
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
      /*
       * Telemetry must never interrupt playback.
       */
      console.warn(
        "[NSF] voice note telemetry failed:",
        error
      );
    }

    return this.voiceNotes.slice();
  },

  /*
   * Return normalized level for every voice.
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
      /*
       * Telemetry must never interrupt playback.
       */
      console.warn(
        "[NSF] voice level telemetry failed:",
        error
      );
    }

    return this.voiceLevels.slice();
  },

  /*
   * Return current duty ratio for every voice.
   *
   * Values:
   *   0.125 = 12.5%
   *   0.250 = 25%
   *   0.375 = 37.5%
   *   0.500 = 50%
   *   0.625 = 62.5%
   *   0.750 = 75%
   *   0.875 = 87.5%
   *   1.000 = 100%
   *
   * -1 means that the voice does not have a
   * conventional pulse duty ratio.
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
      /*
       * Duty telemetry is optional.
       * Never allow it to stop audio playback.
       */
      console.warn(
        "[NSF] voice duty telemetry failed:",
        error
      );
    }

    return this.voiceDuties.slice();
  },

  /*
   * Convenience function for the UI.
   *
   * Returns all currently available telemetry
   * in one object.
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

  play(sampleCount) {
    if (!window.LibGME.handle) {
      return new Int16Array(0);
    }

    /*
     * IMPORTANT:
     * PCM generation remains completely independent
     * from telemetry.
     *
     * If note/level/duty information fails, audio
     * playback must continue.
     */
    return window.LibGME.play(
      sampleCount
    );
  },

  stop() {
    if (
      window.LibGME &&
      typeof window.LibGME.stop ===
        "function"
    ) {
      window.LibGME.stop();
    }
  },

  unload() {
    if (window.LibGME) {
      window.LibGME.close();
    }

    this.loaded = false;

    this.currentTrack = 0;
    this.trackCount = 0;

    this.voiceNames = [];
    this.voiceNotes = [];
    this.voiceLevels = [];
    this.voiceDuties = [];
  },

  close() {
    this.unload();
  }
};

window.NSFEngine = NSFEngine;
