const App = {
  keyboardStartNote: 12,
  keyboardEndNote: 127,
  voiceNotes: [],
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
    this.spectrumCanvas =
      document.getElementById("spectrum-canvas");

    this.spectrumContext =
      this.spectrumCanvas
        ? this.spectrumCanvas.getContext("2d")
        : null;

    this.visualizerStatus =
      document.getElementById(
        "visualizer-status"
      );

    this.voiceCountElement =
      document.getElementById("voice-count");

    this.voiceMeterList =
      document.getElementById(
        "voice-meter-list"
      );

    this.voiceTargetLevels = [];
    this.voiceDisplayLevels = [];
    this.voiceDuties = [];
    this.voiceAnimationTime =
      performance.now();

    this.resizeVisualizer();

    window.addEventListener(
      "resize",
      () => this.resizeVisualizer()
    );

    this.drawVisualizer();
    this.animateVoiceMeters();

    /*
     * Duty telemetry is independent from
     * the PCM playback path.
     */
    this.startDutyTelemetry();
  },

  resizeVisualizer() {
    if (
      !this.spectrumCanvas ||
      !this.spectrumContext
    ) {
      return;
    }

    const rect =
      this.spectrumCanvas
        .getBoundingClientRect();

    const dpr =
      Math.max(
        1,
        Math.min(
          2,
          window.devicePixelRatio || 1
        )
      );

    this.spectrumCanvas.width =
      Math.max(
        1,
        Math.floor(rect.width * dpr)
      );

    this.spectrumCanvas.height =
      Math.max(
        1,
        Math.floor(rect.height * dpr)
      );

    this.spectrumContext.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );
  },

  drawVisualizer() {
    if (
      !this.spectrumCanvas ||
      !this.spectrumContext
    ) {
      return;
    }

    const ctx =
      this.spectrumContext;

    const width =
      this.spectrumCanvas.clientWidth;

    const height =
      this.spectrumCanvas.clientHeight;

    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    const data =
      NSFPlayer.getSpectrumData();

    const bars =
      data
        ? Math.min(48, data.length)
        : 48;

    const step =
      data
        ? data.length / bars
        : 1;

    const gap = 3;

    const barWidth =
      Math.max(
        2,
        (width - gap * (bars - 1)) /
          bars
      );

    for (
      let i = 0;
      i < bars;
      i++
    ) {
      let value = 0;

      if (data) {
        const start =
          Math.floor(i * step);

        const end =
          Math.max(
            start + 1,
            Math.floor(
              (i + 1) * step
            )
          );

        for (
          let j = start;
          j < end &&
          j < data.length;
          j++
        ) {
          value =
            Math.max(
              value,
              data[j] / 255
            );
        }
      }

      const shaped =
        Math.pow(value, 0.72);

      const barHeight =
        Math.max(
          2,
          shaped * (height - 12)
        );

      const x =
        i * (barWidth + gap);

      const y =
        height - barHeight;

      const gradient =
        ctx.createLinearGradient(
          0,
          y,
          0,
          height
        );

      gradient.addColorStop(
        0,
        "#ff3b3b"
      );

      gradient.addColorStop(
        0.45,
        "#ffd83d"
      );

      gradient.addColorStop(
        1,
        "#35ff8a"
      );

      ctx.fillStyle = gradient;

      ctx.fillRect(
        x,
        y,
        barWidth,
        barHeight
      );

      ctx.fillStyle =
        "rgba(255,255,255,0.14)";

      ctx.fillRect(
        x,
        y,
        barWidth,
        2
      );
    }

    if (this.visualizerStatus) {
      this.visualizerStatus.textContent =
        NSFPlayer.playing
          ? "PLAY"
          : "READY";
    }

    requestAnimationFrame(
      () => this.drawVisualizer()
    );
  },

  renderVoiceMeters() {
    if (!this.voiceMeterList) {
      return;
    }

    const names =
      NSFEngine.getVoiceNames();

    this.voiceMeterList.textContent =
      "";

    if (!names.length) {
      const empty =
        document.createElement("p");

      empty.className =
        "voice-empty";

      empty.textContent =
        "この曲の音源CH情報を取得できません";

      this.voiceMeterList.appendChild(
        empty
      );

      if (this.voiceCountElement) {
        this.voiceCountElement.textContent =
          "0 CH";
      }

      this.voiceDuties = [];

      return;
    }

    if (this.voiceCountElement) {
      this.voiceCountElement.textContent =
        `${names.length} CH`;
    }

    /*
     * 曲読み込み直後のDuty値を取得。
     */
    let duties = [];

    if (
      typeof NSFEngine.getVoiceDuties ===
      "function"
    ) {
      try {
        duties =
          NSFEngine.getVoiceDuties() || [];
      } catch (error) {
        console.warn(
          "[APP] initial duty read failed:",
          error
        );

        duties = [];
      }
    }

    this.voiceDuties =
      Array.from(duties);

    names.forEach(
      (name, index) => {
        const row =
          document.createElement("div");

        row.className =
          "voice-row";

        const label =
          document.createElement("div");

        label.className =
          "voice-name";

        label.textContent =
          name ||
          `CH ${index + 1}`;

        const bar =
          document.createElement("div");

        bar.className =
          "voice-bar";

        const fill =
          document.createElement("div");

        fill.className =
          "voice-fill";

        fill.dataset.voiceIndex =
          String(index);

        bar.appendChild(fill);

        const db =
          document.createElement("div");

        db.className =
          "voice-db";

        db.dataset.voiceDbIndex =
          String(index);

        db.textContent =
          "-∞ dB";

        /*
         * Duty表示
         */
        const duty =
          document.createElement("div");

        duty.className =
          "voice-duty";

        duty.dataset.voiceDutyIndex =
          String(index);

        duty.textContent =
          this.formatDuty(
            this.voiceDuties[index]
          );

        const head =
          document.createElement("div");

        head.className =
          "voice-head";

        head.appendChild(label);
        head.appendChild(bar);
        head.appendChild(db);
        head.appendChild(duty);

        const keyboard =
          this.createVoiceKeyboard(
            index
          );

        row.appendChild(head);
        row.appendChild(keyboard);

        this.voiceMeterList.appendChild(
          row
        );
      }
    );

    this.voiceTargetLevels =
      new Array(names.length)
        .fill(0);

    this.voiceDisplayLevels =
      new Array(names.length)
        .fill(0);

    this.clearVoiceLevels();

    this.updateVoiceDuties(
      this.voiceDuties
    );

    this.updateVoiceNotes(
      this.voiceNotes
    );
  },

  createVoiceKeyboard(index) {
    const keyboard =
      document.createElement("div");

    keyboard.className =
      "voice-keyboard";

    keyboard.dataset.voiceIndex =
      String(index);

    const start =
      this.keyboardStartNote;

    const end =
      this.keyboardEndNote;

    const whiteNotes = [];
    const blackNotes = [];

    const blackPitchClasses =
      new Set([
        1,
        3,
        6,
        8,
        10
      ]);

    for (
      let note = start;
      note <= end;
      note++
    ) {
      if (
        blackPitchClasses.has(
          note % 12
        )
      ) {
        blackNotes.push(note);
      } else {
        whiteNotes.push(note);
      }
    }

    const whiteCount =
      whiteNotes.length;

    whiteNotes.forEach(
      note => {
        const key =
          document.createElement(
            "div"
          );

        key.className =
          "piano-key white";

        key.dataset.note =
          String(note);

        key.title =
          this.noteToName(note);

        keyboard.appendChild(
          key
        );
      }
    );

    blackNotes.forEach(
      note => {
        const key =
          document.createElement(
            "div"
          );

        key.className =
          "piano-key black";

        key.dataset.note =
          String(note);

        key.title =
          this.noteToName(note);

        let whiteBefore = 0;

        for (
          const whiteNote of whiteNotes
        ) {
          if (
            whiteNote >= note
          ) {
            break;
          }

          whiteBefore++;
        }

        const blackWidth = 1.45;
        const whiteWidth =
          100 / whiteCount;

        key.style.left =
          `${
            whiteBefore *
              whiteWidth -
            blackWidth / 2
          }%`;

        keyboard.appendChild(
          key
        );
      }
    );

    const current =
      document.createElement("div");

    current.className =
      "keyboard-current";

    current.dataset.voiceCurrentIndex =
      String(index);

    current.textContent =
      "—";

    keyboard.appendChild(
      current
    );

    return keyboard;
  },

  noteToName(note) {
    const value =
      Number(note);

    if (!Number.isFinite(value)) {
      return "—";
    }

    const midi =
      Math.round(value);

    const names = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B"
    ];

    if (
      midi < 0 ||
      midi > 127
    ) {
      return "—";
    }

    const octave =
      Math.floor(midi / 12) - 1;

    return `${names[midi % 12]}${octave}`;
  },

  updateVoiceNotes(notes) {
    const values =
      Array.from(notes || []);

    this.voiceNotes =
      values;

    if (!this.voiceMeterList) {
      return;
    }

    this.voiceMeterList
      .querySelectorAll(
        ".voice-keyboard"
      )
      .forEach(
        keyboard => {
          const index =
            Number(
              keyboard.dataset
                .voiceIndex
            );

          const noteValue =
            Number(values[index]);

          const hasNote =
            Number.isFinite(
              noteValue
            ) &&
            noteValue >=
              this.keyboardStartNote &&
            noteValue <=
              this.keyboardEndNote;

          keyboard
            .querySelectorAll(
              ".piano-key.active"
            )
            .forEach(
              key =>
                key.classList.remove(
                  "active"
                )
            );

          const current =
            keyboard.querySelector(
              ".keyboard-current"
            );

          if (!hasNote) {
            if (current) {
              current.textContent =
                "—";
            }

            return;
          }

          const midi =
            Math.round(
              noteValue
            );

          const key =
            keyboard.querySelector(
              `.piano-key[data-note="${midi}"]`
            );

          if (key) {
            key.classList.add(
              "active"
            );
          }

          if (current) {
            current.textContent =
              this.noteToName(
                midi
              );
          }
        }
      );
  },

  /*
   * Duty値を画面表示用の文字列へ変換。
   *
   * 0.125 = 12.5%
   * 0.25  = 25%
   * 0.375 = 37.5%
   * 0.5   = 50%
   * 0.625 = 62.5%
   * 0.75  = 75%
   * 0.875 = 87.5%
   * 1.0   = 100%
   *
   * -1 / NaN / undefined はDuty対象外として "—"。
   */
  formatDuty(value) {
    const number =
      Number(value);

    if (
      !Number.isFinite(number) ||
      number < 0
    ) {
      return "—";
    }

    /*
     * 取得値が0～1の範囲なら通常のDuty値。
     */
    if (number <= 1) {
      const percent =
        number * 100;

      const rounded =
        Math.round(
          percent * 10
        ) / 10;

      if (
        Math.abs(
          rounded -
          Math.round(rounded)
        ) < 0.01
      ) {
        return `${Math.round(rounded)}%`;
      }

      return `${rounded.toFixed(1)}%`;
    }

    /*
     * 念のため、もし0～100の値が
     * 直接返された場合にも対応。
     */
    if (number <= 100) {
      const rounded =
        Math.round(
          number * 10
        ) / 10;

      if (
        Math.abs(
          rounded -
          Math.round(rounded)
        ) < 0.01
      ) {
        return `${Math.round(rounded)}%`;
      }

      return `${rounded.toFixed(1)}%`;
    }

    return "—";
  },

  /*
   * 現在のDuty値を全チャンネルへ反映。
   */
  updateVoiceDuties(duties) {
    const values =
      Array.from(duties || []);

    this.voiceDuties =
      values;

    if (!this.voiceMeterList) {
      return;
    }

    this.voiceMeterList
      .querySelectorAll(
        ".voice-duty"
      )
      .forEach(
        dutyElement => {
          const index =
            Number(
              dutyElement.dataset
                .voiceDutyIndex
            );

          const value =
            values[index];

          dutyElement.textContent =
            this.formatDuty(
              value
            );
        }
      );
  },

  /*
   * Duty telemetryはPCM再生とは独立。
   *
   * 100msごとに最新値を取得して
   * 画面へ反映する。
   */
  startDutyTelemetry() {
    const poll = () => {
      try {
        if (
          window.NSFEngine &&
          typeof NSFEngine.getVoiceDuties ===
            "function"
        ) {
          const duties =
            NSFEngine.getVoiceDuties();

          this.updateVoiceDuties(
            duties
          );
        }
      } catch (error) {
        /*
         * Duty表示のエラーで
         * 音声再生を止めない。
         */
        console.warn(
          "[APP] duty telemetry update failed:",
          error
        );
      }

      window.setTimeout(
        poll,
        100
      );
    };

    window.setTimeout(
      poll,
      100
    );
  },

  updateVoiceLevels(levels) {
    const values =
      Array.from(levels || []);

    this.voiceTargetLevels =
      values.map(
        value =>
          Math.max(
            0,
            Math.min(
              1,
              Number(value) || 0
            )
          )
      );

    if (
      this.voiceDisplayLevels.length !==
      this.voiceTargetLevels.length
    ) {
      this.voiceDisplayLevels =
        new Array(
          this.voiceTargetLevels.length
        ).fill(0);
    }
  },

  animateVoiceMeters(
    now = performance.now()
  ) {
    const dt =
      Math.max(
        0.001,
        Math.min(
          0.1,
          (
            now -
            this.voiceAnimationTime
          ) / 1000
        )
      );

    this.voiceAnimationTime =
      now;

    const targets =
      this.voiceTargetLevels ||
      [];

    if (
      this.voiceDisplayLevels.length !==
      targets.length
    ) {
      this.voiceDisplayLevels =
        new Array(
          targets.length
        ).fill(0);
    }

    const attack =
      1 -
      Math.exp(
        -dt / 0.035
      );

    const release =
      1 -
      Math.exp(
        -dt / 0.18
      );

    for (
      let i = 0;
      i < targets.length;
      i++
    ) {
      const target =
        Math.max(
          0,
          Math.min(
            1,
            targets[i] || 0
          )
        );

      const current =
        this.voiceDisplayLevels[i] ||
        0;

      const factor =
        target > current
          ? attack
          : release;

      this.voiceDisplayLevels[i] =
        current +
        (
          target -
          current
        ) *
        factor;
    }

    if (this.voiceMeterList) {
      this.voiceMeterList
        .querySelectorAll(
          ".voice-fill"
        )
        .forEach(
          fill => {
            const index =
              Number(
                fill.dataset
                  .voiceIndex
              );

            const level =
              this.voiceDisplayLevels[
                index
              ] || 0;

            fill.style.width =
              `${
                Math.round(
                  level * 1000
                ) / 10
              }%`;
          }
        );

      this.voiceMeterList
        .querySelectorAll(
          ".voice-db"
        )
        .forEach(
          db => {
            const index =
              Number(
                db.dataset
                  .voiceDbIndex
              );

            const level =
              this.voiceDisplayLevels[
                index
              ] || 0;

            if (
              level <= 0.00001
            ) {
              db.textContent =
                "-∞ dB";

              return;
            }

            const decibels =
              20 *
              Math.log10(
                level
              );

            db.textContent =
              `${decibels.toFixed(1)} dB`;
          }
        );
    }

    requestAnimationFrame(
      next =>
        this.animateVoiceMeters(
          next
        )
    );
  },

  clearVoiceLevels() {
    this.voiceTargetLevels =
      new Array(
        this.voiceDisplayLevels?.length ||
          0
      ).fill(0);

    this.updateVoiceNotes(
      new Array(
        this.voiceDisplayLevels?.length ||
          0
      ).fill(-1)
    );
  },

  updateInfo() {
    const info =
      NSFPlayer.getInfo();

    const trackIndex =
      NSFEngine.currentTrack || 0;

    const trackTitle =
      Array.isArray(
        info.trackTitles
      )
        ? info.trackTitles[
            trackIndex
          ]
        : "";

    const trackArtist =
      Array.isArray(
        info.trackArtists
      )
        ? info.trackArtists[
            trackIndex
          ]
        : "";

    document.getElementById(
      "title"
    ).textContent =
      trackTitle ||
      info.title ||
      "-";

    document.getElementById(
      "composer"
    ).textContent =
      trackArtist ||
      info.artist ||
      "-";

    document.getElementById(
      "chip"
    ).textContent =
      info.chip ||
      "-";

    document.getElementById(
      "copyright"
    ).textContent =
      info.copyright ||
      "-";

    document.getElementById(
      "track"
    ).textContent =
      info.trackCount
        ? `${
            NSFEngine.currentTrack + 1
          } / ${
            info.trackCount
          }`
        : "-";

    document.getElementById(
      "extension"
    ).textContent =
      info.format ||
      "-";

    this.renderVoiceMeters();
  }
};

/*
 * player.js uses window.App for live UI telemetry.
 */
window.App = App;

window.addEventListener(
  "load",
  () =>
    App.init().catch(
      console.error
    )
);
