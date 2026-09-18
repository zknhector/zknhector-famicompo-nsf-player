const NSFPlayer = {
  currentSong: null,
  playing: false,
  volume: 0.8,

  audioContext: null,
  gainNode: null,
  workletNode: null,

  pumpToken: 0,

  async init() {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();

    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.volume;
    this.gainNode.connect(this.audioContext.destination);

    await this.audioContext.audioWorklet.addModule(
      "js/audio-worker.js"
    );
  },

  async load(song) {
    await this.init();

    this.stop();

    this.currentSong = song;

    const buffer = await song.file.arrayBuffer();

    await NSFEngine.load(buffer);
  },

  createAudio() {
    if (this.workletNode) return;

    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      "nsf-audio"
    );

    this.workletNode.connect(this.gainNode);
  },

  clearAudioQueue() {
    if (this.workletNode) {
      this.workletNode.port.postMessage("clear");
    }
  },

  async play() {
    if (!this.currentSong) {
      console.error("No song selected");
      return false;
    }

    await this.init();
    await this.audioContext.resume();

    this.createAudio();
    this.clearAudioQueue();

    if (!NSFEngine.start()) {
      console.error("NSFEngine.start() failed");
      return false;
    }

    this.playing = true;

    const token = ++this.pumpToken;
    this.pump(token);

    return true;
  },

  pump(token) {
    if (
      !this.playing ||
      !this.workletNode ||
      token !== this.pumpToken
    ) {
      return;
    }

    try {
      const pcm = NSFEngine.getFloatPCM(2048);

      if (pcm.length > 0) {
        this.workletNode.port.postMessage(
          pcm,
          [pcm.buffer]
        );
      }

      requestAnimationFrame(() => this.pump(token));

    } catch (error) {
      console.error(
        "NSF audio pump failed:",
        error
      );

      this.playing = false;
      this.pumpToken++;
    }
  },

  stop() {
    this.playing = false;
    this.pumpToken++;

    this.clearAudioQueue();

    if (typeof NSFEngine !== "undefined") {
      NSFEngine.stop();
    }
  },

  async setTrack(track) {
    if (
      typeof NSFEngine === "undefined" ||
      !NSFEngine.trackCount
    ) {
      return false;
    }

    if (
      track < 0 ||
      track >= NSFEngine.trackCount
    ) {
      return false;
    }

    const wasPlaying = this.playing;

    this.clearAudioQueue();

    if (!NSFEngine.setTrack(track)) {
      return false;
    }

    if (wasPlaying) {
      this.playing = true;
      const token = ++this.pumpToken;
      this.pump(token);
    }

    return true;
  },

  async previousTrack() {
    if (!NSFEngine.trackCount) return false;

    const track =
      (NSFEngine.currentTrack - 1 + NSFEngine.trackCount) %
      NSFEngine.trackCount;

    return this.setTrack(track);
  },

  async nextTrack() {
    if (!NSFEngine.trackCount) return false;

    const track =
      (NSFEngine.currentTrack + 1) %
      NSFEngine.trackCount;

    return this.setTrack(track);
  },

  setVolume(value) {
    this.volume = Math.max(
      0,
      Math.min(1, Number(value) / 100)
    );

    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  },

  getInfo() {
    if (
      typeof NSFEngine === "undefined"
    ) {
      return {};
    }

    return NSFEngine.getInfo() || {};
  }
};

window.NSFPlayer = NSFPlayer;
