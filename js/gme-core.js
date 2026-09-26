window.GMECore = window.GMECore || {
  ready: false,
  async init() {
    this.ready = await GMELoader.init();
    return this.ready;
  },
  async open(buffer) {
    if (!this.ready && !(await this.init())) return false;
    await GMELoader.openNSF(buffer);
    return true;
  },
  getTrackCount() { return GMELoader.getTrackCount(); },
  getTrackInfo(track) { return GMELoader.getTrackInfo(track); },
  getSamples(length) { return GMELoader.getPCM(length); },
  getVoiceNames() { return GMELoader.getVoiceNames(); },
  getVoiceLevels(frames) { return GMELoader.getVoiceLevels(frames); },
  startTrack(track) { return GMELoader.start(track) === 1; },
  stop() { GMELoader.stop(); },
  close() { GMELoader.close(); }
};
