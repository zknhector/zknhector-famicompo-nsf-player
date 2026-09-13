const NSFEngine = {
  ready: false,
  playing: false,
  currentTrack: 0,
  trackCount: 0,
  info: null,

  async init() {
    this.ready = await GMECore.init();
    return this.ready;
  },

  async load(buffer) {
    if (!await this.init()) throw new Error("libgme WASM unavailable");
    const parsed = NSFParser.parse(buffer);
    if (!parsed) throw new Error("NSF/NSFe format could not be identified");

    await GMECore.open(buffer);
    this.trackCount = GMECore.getTrackCount();
    this.currentTrack = Math.min(
      parsed.startTrackIndex || 0,
      Math.max(0, this.trackCount - 1)
    );
    this.info = parsed;
    return true;
  },

  start() {
    if (!GMECore.startTrack(this.currentTrack)) return false;
    this.playing = true;
    return true;
  },

  stop() {
    this.playing = false;
    GMECore.stop();
  },

  setTrack(track) {
    if (track < 0 || track >= this.trackCount) return false;
    this.currentTrack = track;
    return !this.playing || GMECore.startTrack(track);
  },

  getFloatPCM(frames) {
    const pcm = GMECore.getSamples(frames * 2);
    const out = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
    return out;
  },

  getInfo() { return this.info; }
};
window.NSFEngine = NSFEngine;
