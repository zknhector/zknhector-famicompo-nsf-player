const NSFPlayer = {
  currentSong: null,
  playing: false,
  volume: 0.8,
  audioContext: null,
  gainNode: null,
  workletNode: null,

  async init() {
    if (this.audioContext) return;
    this.audioContext = new AudioContext();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.volume;
    this.gainNode.connect(this.audioContext.destination);
    await this.audioContext.audioWorklet.addModule("js/audio-worker.js");
  },

  async load(song) {
    await this.init();
    this.stop();
    this.currentSong = song;
    await NSFEngine.load(await song.file.arrayBuffer());
  },

  createAudio() {
    if (this.workletNode) return;
    this.workletNode = new AudioWorkletNode(this.audioContext, "nsf-audio");
    this.workletNode.connect(this.gainNode);
  },

  async play() {
    if (!this.currentSong) return false;
    await this.init();
    await this.audioContext.resume();
    this.createAudio();
    if (!NSFEngine.start()) return false;
    this.playing = true;
    this.pump();
    return true;
  },

  pump() {
    if (!this.playing || !this.workletNode) return;
    const pcm = NSFEngine.getFloatPCM(2048);
    this.workletNode.port.postMessage(pcm, [pcm.buffer]);
    requestAnimationFrame(() => this.pump());
  },

  stop() {
    this.playing = false;
    if (NSFEngine) NSFEngine.stop();
  },

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) / 100));
    if (this.gainNode) this.gainNode.gain.value = this.volume;
  },

  getInfo() {
    return NSFEngine.getInfo() || {};
  }
};
window.NSFPlayer = NSFPlayer;
