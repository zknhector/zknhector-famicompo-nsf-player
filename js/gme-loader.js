const GMELoader = {
  ready: false,
  async init() {
    if (this.ready) return true;
    this.ready = await LibGME.init();
    return this.ready;
  },
  async openNSF(buffer) {
    if (!await this.init()) throw new Error("libgme WASM is unavailable");
    return LibGME.open(buffer);
  },
  getTrackCount() { return LibGME.getTrackCount(); },
  getTrackInfo(track) { return LibGME.getTrackInfo(track); },
  getPCM(samples) { return LibGME.play(samples); },
  start(track) { return LibGME.startTrack(track); },
  stop() { LibGME.stop(); },
  close() { LibGME.close(); }
};
window.GMELoader = GMELoader;
