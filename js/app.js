const App = {
  songs: [],
  currentSong: null,

  async init() {
    await NSFPlayer.init();
    await NSFLibrary.init();
    this.songs = [...NSFLibrary.songs];
    this.bindUI();
    this.render();
  },

  bindUI() {
    const input = document.getElementById("file-input");

    input.addEventListener("change", e => {
      this.loadFiles(e.target.files);
    });

    document.getElementById("play").onclick = () => {
      NSFPlayer.play();
    };

    document.getElementById("stop").onclick = () => {
      NSFPlayer.stop();
    };

    document.getElementById("prev").onclick = () => {
      this.changeTrack(-1);
    };

    document.getElementById("next").onclick = () => {
      this.changeTrack(1);
    };

    document.getElementById("volume").oninput = e => {
      NSFPlayer.setVolume(e.target.value);
    };
  },

  async changeTrack(direction) {
    if (!this.currentSong) {
      return;
    }

    if (!NSFEngine.trackCount || NSFEngine.trackCount <= 1) {
      return;
    }

    const count = NSFEngine.trackCount;

    let track = NSFEngine.currentTrack + direction;

    if (track < 0) {
      track = count - 1;
    }

    if (track >= count) {
      track = 0;
    }

    const wasPlaying = NSFPlayer.playing;

    NSFPlayer.stop();

    if (!NSFEngine.setTrack(track)) {
      console.error("Track change failed:", track);
      return;
    }

    this.updateInfo();

    if (wasPlaying) {
      await NSFPlayer.play();
    }
  },

  async loadFiles(files) {
    for (const file of files) {
      if (!/\.(nsf|nsfe)$/i.test(file.name)) continue;

      const song = await NSFLibrary.add({
        filename: file.name,
        file
      });

      this.songs.push(song);
    }

    this.render();
  },

  render() {
    const list = document.getElementById("song-list");

    list.textContent = "";

    if (!this.songs.length) {
      const li = document.createElement("li");
      li.textContent = "まだ曲がありません";
      list.appendChild(li);
      return;
    }

    for (const song of this.songs) {
      const li = document.createElement("li");

      li.textContent = song.filename;

      li.onclick = async () => {
        this.currentSong = song;

        try {
          await NSFPlayer.load(song);
          this.updateInfo();
        } catch (e) {
          console.error(e);
          alert(
            "このファイルを読み込めませんでした。WASM版libgmeが必要です。"
          );
        }
      };

      list.appendChild(li);
    }
  },

  updateInfo() {
    const info = NSFPlayer.getInfo();

    document.getElementById("title").textContent =
      info.title || "-";

    document.getElementById("composer").textContent =
      info.artist || "-";

    document.getElementById("chip").textContent =
      info.chip || "-";

    document.getElementById("copyright").textContent =
      info.copyright || "-";

    document.getElementById("track").textContent =
      info.trackCount
        ? `${NSFEngine.currentTrack + 1} / ${info.trackCount}`
        : "-";

    document.getElementById("extension").textContent =
      info.format || "-";
  }
};

window.addEventListener("load", () => {
  App.init().catch(console.error);
});
