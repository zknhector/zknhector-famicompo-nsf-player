/*
 Chromebook-Famicompo-NSF-Player

 gme-core.js v1.0

 libgme core interface

*/


const GMECore = {
  ready: false,

  async init() {
    this.ready = await GMELoader.init();
    return this.ready;
  },

  async open(buffer) {
    if (!this.ready && !(await this.init())) {
      return false;
    }

    await GMELoader.openNSF(buffer);

    return true;
  },

  getTrackCount() {
    return GMELoader.getTrackCount();
  },

  getTrackInfo(track) {
    return GMELoader.getTrackInfo(track);
  },

  startTrack(track) {
    return GMELoader.start(track) === 1;
  },

  getSamples(length) {
    return GMELoader.getPCM(length);
  },

  stop() {
    GMELoader.stop();
  },

  close() {
    GMELoader.close();
  }
};

window.GMECore = GMECore;
