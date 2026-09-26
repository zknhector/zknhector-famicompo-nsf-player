const App = {
songs: [],
currentSong: null,

async init() {
await NSFPlayer.init();
await NSFLibrary.init();

this.songs = [...NSFLibrary.songs];

this.bindUI();
this.initVisualizer();
this.render();
  
},

bindUI() {
const input =
document.getElementById("file-input");

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



},

async changeTrack(direction) {
if (!this.currentSong) {
console.log("No song selected");
return;
}

const count = NSFEngine.trackCount;

if (!count || count <= 1) {
  console.log(
    "This NSF has only one track"
  );
  return;
}

let track =
  NSFEngine.currentTrack + direction;

if (track < 0) {
  track = count - 1;
}

if (track >= count) {
  track = 0;
}

const wasPlaying = NSFPlayer.playing;

NSFPlayer.stop();

if (!NSFEngine.setTrack(track)) {
  console.error(
    "Track change failed:",
    track
  );
  return;
}

console.log(
  `Track changed: ${track + 1} / ${count}`
);

this.updateInfo();

if (wasPlaying) {
  await NSFPlayer.play();
}

},

async loadFiles(files) {
let added = 0;
let duplicates = 0;

for (const file of files) {
  if (!/\.(nsf|nsfe)$/i.test(file.name)) {
    continue;
  }

  const song = await NSFLibrary.add({
    filename: file.name,
    file
  });

  if (song) {
    this.songs.push(song);
    added++;
  } else {
    duplicates++;
  }
}

this.render();

if (duplicates > 0) {
  console.log(
    `重複ファイル ${duplicates} 件をスキップしました`
  );
}

console.log(
  `Library: ${added} added, ${duplicates} duplicate(s) skipped`
);

},

async removeSong(song) {
if (!song || !song.id) {
return;
}

if (this.currentSong?.id === song.id) {
  NSFPlayer.stop();
  NSFPlayer.currentSong = null;
  this.currentSong = null;
}

await NSFLibrary.remove(song.id);

this.songs = [...NSFLibrary.songs];

this.render();

},

render() {
const list =
document.getElementById("song-list");

list.textContent = "";

if (!this.songs.length) {
  const li = document.createElement("li");

  li.textContent =
    "まだ曲がありません";

  list.appendChild(li);

  return;
}

for (const song of this.songs) {
  const li = document.createElement("li");

  const name =
    document.createElement("span");

  name.textContent = song.filename;

  const remove =
    document.createElement("button");

  remove.textContent = "🗑";
  remove.title = "この曲をライブラリから削除";

  remove.onclick = async event => {
    event.stopPropagation();

    await this.removeSong(song);
  };

  li.appendChild(name);
  li.appendChild(remove);

  li.onclick = async () => {
    this.currentSong = song;

    try {
      await NSFPlayer.load(song);
      this.updateInfo();
    } catch (error) {
      console.error(error);

      alert(
        "このファイルを読み込めませんでした。"
      );
    }
  };

  list.appendChild(li);
}

},

initVisualizer() {
  this.spectrumCanvas = document.getElementById("spectrum-canvas");
  this.spectrumContext = this.spectrumCanvas
    ? this.spectrumCanvas.getContext("2d")
    : null;

  this.visualizerStatus = document.getElementById("visualizer-status");
  this.voiceCountElement = document.getElementById("voice-count");
  this.voiceMeterList = document.getElementById("voice-meter-list");

  this.resizeVisualizer();
  window.addEventListener("resize", () => this.resizeVisualizer());

  this.drawVisualizer();
},

resizeVisualizer() {
  if (!this.spectrumCanvas || !this.spectrumContext) return;

  const rect = this.spectrumCanvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  this.spectrumCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  this.spectrumCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  this.spectrumContext.setTransform(dpr, 0, 0, dpr, 0, 0);
},

drawVisualizer() {
  if (!this.spectrumCanvas || !this.spectrumContext) return;

  const ctx = this.spectrumContext;
  const width = this.spectrumCanvas.clientWidth;
  const height = this.spectrumCanvas.clientHeight;

  ctx.clearRect(0, 0, width, height);

  const data = NSFPlayer.getSpectrumData();
  const bars = data ? Math.min(48, data.length) : 48;
  const step = data ? data.length / bars : 1;
  const gap = 3;
  const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);

  for (let i = 0; i < bars; i++) {
    let value = 0;

    if (data) {
      const start = Math.floor(i * step);
      const end = Math.max(start + 1, Math.floor((i + 1) * step));

      for (let j = start; j < end && j < data.length; j++) {
        value = Math.max(value, data[j] / 255);
      }
    }

    const shaped = Math.pow(value, 0.72);
    const barHeight = Math.max(2, shaped * (height - 12));
    const x = i * (barWidth + gap);
    const y = height - barHeight;

    const gradient = ctx.createLinearGradient(0, y, 0, height);
    gradient.addColorStop(0, "#ff3b3b");
    gradient.addColorStop(0.45, "#ffd83d");
    gradient.addColorStop(1, "#35ff8a");

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(x, y, barWidth, 2);
  }

  if (this.visualizerStatus) {
    this.visualizerStatus.textContent = NSFPlayer.playing ? "PLAY" : "READY";
  }

  requestAnimationFrame(() => this.drawVisualizer());
},

renderVoiceMeters() {
  if (!this.voiceMeterList) return;

  const names = NSFEngine.getVoiceNames();
  this.voiceMeterList.textContent = "";

  if (!names.length) {
    const empty = document.createElement("p");
    empty.className = "voice-empty";
    empty.textContent = "この曲の音源CH情報を取得できません";
    this.voiceMeterList.appendChild(empty);

    if (this.voiceCountElement) {
      this.voiceCountElement.textContent = "0 CH";
    }

    return;
  }

  if (this.voiceCountElement) {
    this.voiceCountElement.textContent = `${names.length} CH`;
  }

  names.forEach((name, index) => {
    const row = document.createElement("div");
    row.className = "voice-row";

    const label = document.createElement("div");
    label.className = "voice-name";
    label.textContent = name || `CH ${index + 1}`;

    const bar = document.createElement("div");
    bar.className = "voice-bar";

    const fill = document.createElement("div");
    fill.className = "voice-fill";
    fill.dataset.voiceIndex = String(index);
    bar.appendChild(fill);

    const db = document.createElement("div");
    db.className = "voice-db";
    db.dataset.voiceDbIndex = String(index);
    db.textContent = "-∞ dB";

    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(db);

    this.voiceMeterList.appendChild(row);
  });

  this.clearVoiceLevels();
},

updateVoiceLevels(levels) {
  if (!this.voiceMeterList) return;

  const values = Array.from(levels || []);

  this.voiceMeterList
    .querySelectorAll(".voice-fill")
    .forEach(fill => {
      const index = Number(fill.dataset.voiceIndex);
      const level = Math.max(0, Math.min(1, values[index] || 0));
      fill.style.width = `${Math.round(level * 100)}%`;
    });

  this.voiceMeterList
    .querySelectorAll(".voice-db")
    .forEach(db => {
      const index = Number(db.dataset.voiceDbIndex);
      const level = Math.max(0, Math.min(1, values[index] || 0));

      if (level <= 0.00001) {
        db.textContent = "-∞ dB";
        return;
      }

      const decibels = 20 * Math.log10(level);
      db.textContent = `${decibels.toFixed(1)} dB`;
    });
},

clearVoiceLevels() {
  if (!this.voiceMeterList) return;

  this.updateVoiceLevels([]);
},


updateInfo() {
const info = NSFPlayer.getInfo();

const trackIndex = NSFEngine.currentTrack || 0;

const trackTitle =
  Array.isArray(info.trackTitles)
    ? info.trackTitles[trackIndex]
    : "";

const trackArtist =
  Array.isArray(info.trackArtists)
    ? info.trackArtists[trackIndex]
    : "";

document.getElementById("title").textContent =
  trackTitle || info.title || "-";

document.getElementById("composer").textContent =
  trackArtist || info.artist || "-";

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

this.renderVoiceMeters();

}
};

window.addEventListener(
"load",
() => App.init().catch(console.error)
);
