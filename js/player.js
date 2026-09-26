const NSFPlayer = {
  currentSong: null,
  playing: false,
  volume: 0.8,

  audioContext: null,
  gainNode: null,
  analyserNode: null,
  workletNode: null,

  async init() {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();

    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.volume;

    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.78;

    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);

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

    this.workletNode.port.onmessage = event => {
      if (!event.data) return;

      if (event.data.type === "need") {
        this.feedAudio();
      }
    };
  },

  async play() {
    if (!this.currentSong) {
      console.error("No song selected");
      return false;
    }

    await this.init();
    await this.audioContext.resume();
    this.createAudio();

    if (!NSFEngine.start()) {
      console.error("NSFEngine.start() failed");
      return false;
    }

    this.playing = true;

    this.workletNode.port.postMessage({
      type: "start"
    });

    this.feedAudio();
    this.feedAudio();
    this.feedAudio();
    this.feedAudio();

    return true;
  },

  feedAudio() {
    if (!this.playing || !this.workletNode) return;

    try {
      const pcm = NSFEngine.getFloatPCM(2048);

      if (!pcm || pcm.length === 0) return;

      this.workletNode.port.postMessage(
        pcm,
        [pcm.buffer]
      );

      if (window.App && typeof window.App.updateVoiceLevels === "function") {
        window.App.updateVoiceLevels(
          NSFEngine.getVoiceLevels()
        );
      }

    } catch (error) {
      console.error("NSF audio feed failed:", error);

      this.playing = false;

      if (this.workletNode) {
        this.workletNode.port.postMessage({
          type: "stop"
        });
      }
    }
  },

  stop() {
    this.playing = false;

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: "stop"
      });
    }

    if (typeof NSFEngine !== "undefined") {
      NSFEngine.stop();
    }

    if (window.App && typeof window.App.clearVoiceLevels === "function") {
      window.App.clearVoiceLevels();
    }
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

  getSpectrumData() {
    if (!this.analyserNode) return null;

    const data = new Uint8Array(
      this.analyserNode.frequencyBinCount
    );

    this.analyserNode.getByteFrequencyData(data);
    return data;
  },

  getInfo() {
    if (typeof NSFEngine === "undefined") return {};
    return NSFEngine.getInfo() || {};
  }
};

window.NSFPlayer = NSFPlayer;
