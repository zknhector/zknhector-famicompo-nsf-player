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

document.getElementById("volume").oninput = e => {
  NSFPlayer.setVolume(e.target.value);
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

window.addEventListener(
"load",
() => App.init().catch(console.error)
);
