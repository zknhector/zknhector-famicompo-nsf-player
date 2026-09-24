const NSFParser = {
  parse(buffer) {
    const d = new Uint8Array(buffer);

    if (
      d.length >= 5 &&
      d[0] === 0x4e &&
      d[1] === 0x45 &&
      d[2] === 0x53 &&
      d[3] === 0x4d &&
      d[4] === 0x1a
    ) {
      return {
        format: "NSF",
        version: d[5],
        trackCount: d[6],
        startTrackIndex: Math.max(0, (d[7] || 1) - 1),

        title: this.readText(d, 0x0e, 32),
        artist: this.readText(d, 0x2e, 32),
        copyright: this.readText(d, 0x4e, 32),

        trackTitles: [],
        trackArtists: [],

        chip: this.detectChip(d[0x7b] || 0)
      };
    }

    if (
      d.length >= 4 &&
      d[0] === 0x4e &&
      d[1] === 0x53 &&
      d[2] === 0x46 &&
      d[3] === 0x45
    ) {
      return this.parseNSFe(d);
    }

    return null;
  },

  parseNSFe(d) {
    const info = {
      format: "NSFe",
      version: null,
      trackCount: 0,
      startTrackIndex: 0,

      title: "",
      artist: "",
      copyright: "",
      ripper: "",

      trackTitles: [],
      trackArtists: [],

      chip: "2A03"
    };

    let sawInfo = false;
    let sawData = false;

    let offset = 4;

    while (offset + 8 <= d.length) {
      const length = this.readLE32(d, offset);
      const id = String.fromCharCode(
        d[offset + 4],
        d[offset + 5],
        d[offset + 6],
        d[offset + 7]
      );

      const dataStart = offset + 8;
      const dataEnd = Math.min(
        d.length,
        dataStart + length
      );

      if (dataEnd < dataStart) {
        break;
      }

      if (id === "INFO") {
        if (dataEnd - dataStart >= 9) {
          const p = dataStart;

          info.regionFlags = d[p + 6];
          info.chipFlags = d[p + 7];
          info.trackCount = d[p + 8];
          info.startTrackIndex = d[p + 9] || 0;

          info.chip = this.detectChip(
            info.chipFlags
          );

          sawInfo = true;
        }
      } else if (id === "auth") {
        const strings = this.readStringList(
          d,
          dataStart,
          dataEnd
        );

        info.title = strings[0] || "";
        info.artist = strings[1] || "";
        info.copyright = strings[2] || "";
        info.ripper = strings[3] || "";
      } else if (id === "tlbl") {
        info.trackTitles = this.readStringList(
          d,
          dataStart,
          dataEnd
        );
      } else if (id === "taut") {
        info.trackArtists = this.readStringList(
          d,
          dataStart,
          dataEnd
        );
      } else if (id === "DATA") {
        sawData = true;
      } else if (id === "NEND") {
        break;
      }

      // NSFe chunk length is measured from the byte after the 8-byte header.
      // Stop safely if a malformed chunk claims bytes beyond the file.
      if (dataStart + length > d.length) {
        break;
      }

      offset = dataEnd;
    }

    // INFO and DATA are required in a well-formed NSFe.
    if (!sawInfo || !sawData) {
      return null;
    }

    return info;
  },

  readLE32(d, off) {
    if (off + 4 > d.length) {
      return 0;
    }

    return (
      (d[off]) |
      (d[off + 1] << 8) |
      (d[off + 2] << 16) |
      (d[off + 3] * 0x1000000)
    ) >>> 0;
  },

  readStringList(d, start, end) {
    const result = [];
    let pos = start;

    while (pos < end) {
      const bytes = [];

      while (pos < end && d[pos] !== 0x00) {
        bytes.push(d[pos]);
        pos++;
      }

      result.push(
        this.decodeTextBytes(
          new Uint8Array(bytes)
        )
      );

      if (pos < end && d[pos] === 0x00) {
        pos++;
      }
    }

    return result;
  },

  readText(d, off, len) {
    const end = Math.min(
      d.length,
      off + len
    );

    const bytes = [];

    for (let i = off; i < end; i++) {
      if (d[i] === 0x00) {
        break;
      }

      bytes.push(d[i]);
    }

    return this.decodeTextBytes(
      new Uint8Array(bytes)
    );
  },

  decodeTextBytes(raw) {
    if (!raw || raw.length === 0) {
      return "";
    }

    const clean = text =>
      text
        .replace(/\u0000/g, "")
        .replace(/[\x00-\x1f\x7f]/g, "")
        .trim();

    let ascii = true;

    for (const byte of raw) {
      if (byte >= 0x80) {
        ascii = false;
        break;
      }
    }

    if (ascii) {
      return clean(
        new TextDecoder("ascii").decode(raw)
      );
    }

    // NSFe strings are specified as UTF-8.
    try {
      const utf8 =
        new TextDecoder("utf-8", {
          fatal: true
        }).decode(raw);

      return clean(utf8);
    } catch (_error) {
      // Keep the legacy NSF fallback below.
    }

    try {
      const sjis =
        new TextDecoder("shift-jis", {
          fatal: false
        }).decode(raw);

      return clean(sjis);
    } catch (_error) {
    }

    let fallback = "";

    for (const byte of raw) {
      fallback += String.fromCharCode(byte);
    }

    return clean(fallback);
  },

  detectChip(flags) {
    const chips = ["2A03"];

    if (flags & 0x01) chips.push("VRC6");
    if (flags & 0x02) chips.push("VRC7");
    if (flags & 0x04) chips.push("FDS");
    if (flags & 0x08) chips.push("MMC5");
    if (flags & 0x10) chips.push("N163");
    if (flags & 0x20) chips.push("FME-7");
    if (flags & 0x40) chips.push("VT02+");

    return chips.join(" + ");
  }
};

window.NSFParser = NSFParser;
