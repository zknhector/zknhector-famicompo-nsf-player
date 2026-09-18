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

    if (input) {
      input.addEventListener("change", e => {
        this.loadFiles(e.target.files);
      });
    }

    const playButton = document.getElementById("play");
    const stopButton = document.getElementById("stop");
    const prevButton = document.getElementById("prev");
    const nextButton = document.getElementById("next");
    const volume = document.getElementById("volume");

    if (playButton) {
      playButton.onclick = () => {
        NSFPlayer.play();
      };
    }

    if (stopButton) {
      stopButton.onclick = () => {
        NSFPlayer.stop();
      };
    }

    if (prevButton) {
      prevButton.onclick = () => {
        this.changeTrack(-1);
      };
    }

    if (nextButton) {
      nextButton.onclick = () => {
        this.changeTrack(1);
      };
    }

    if (volume) {
      volume.oninput = e => {
        NSFPlayer.setVolume(e.target.value);
      };
    }
  },

  async changeTrack(direction) {
    if (!this.currentSong) {
      console.log("No song selected");
      return;
    }

    const count = NSFEngine.trackCount;

    if (!count || count <= 1) {
      console.log("This NSF has only one track");
      return;
    }

    let track = NSFEngine.currentTrack + direction;

    if (track < 0) {
      track = count - 1;
    }

    if (track >= count) {
      track = 0;
    }

    const wasPlaying = NSFPlayer.playing;

    // 現在の再生を止める
    NSFPlayer.stop();

    // トラック変更
    if (!NSFEngine.setTrack(track)) {
      console.error("Track change failed:", track);
      return;
    }

    console.log(
      `Track changed: ${track + 1} / ${count}`
    );

    this.updateInfo();

    // 変更前に再生中だった場合は、そのまま新トラックを再生
    if (wasPlaying) {
      await NSFPlayer.play();
    }
  },

  async loadFiles(files) {
    for (const file of files) {
      if (!/\.(nsf|nsfe)$/i.test(file.name)) {
        continue;
      }

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

    if (!list) {
      return;
    }

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

    const title = document.getElementById("title");
    const composer = document.getElementById("composer");
    const chip = document.getElementById("chip");
    const copyright = document.getElementById("copyright");
    const track = document.getElementById("track");
    const extension = document.getElementById("extension");

    if (title) {
      title.textContent = info.title || "-";
    }

    if (composer) {
      composer.textContent = info.artist || "-";
    }

    if (chip) {
      chip.textContent = info.chip || "-";
    }

    if (copyright) {
      copyright.textContent = info.copyright || "-";
    }

    if (track) {
      track.textContent =
        info.trackCount
          ? `${NSFEngine.currentTrack + 1} / ${info.trackCount}`
          : "-";
    }

    if (extension) {
      extension.textContent = info.format || "-";
    }
  }
};

window.addEventListener("load", () => {
  App.init().catch(console.error);
});
