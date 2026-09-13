const NSFParser = {
  parse(buffer) {
    const d = new Uint8Array(buffer);
    if (d.length >= 5 &&
        d[0] === 0x4e && d[1] === 0x45 && d[2] === 0x53 &&
        d[3] === 0x4d && d[4] === 0x1a) {
      return {
        format: "NSF",
        version: d[5],
        trackCount: d[6],
        startTrackIndex: Math.max(0, (d[7] || 1) - 1),
        title: this.readText(d, 0x0e, 32),
        artist: this.readText(d, 0x2e, 32),
        copyright: this.readText(d, 0x4e, 32),
        chip: this.detectChip(d[0x7b] || 0)
      };
    }
    if (d.length >= 4 && d[0] === 0x4e && d[1] === 0x53 &&
        d[2] === 0x46 && d[3] === 0x45) {
      return {
        format: "NSFe",
        version: null,
        trackCount: null,
        startTrackIndex: 0,
        title: "",
        artist: "",
        copyright: "",
        chip: "libgme / NSFe metadata"
      };
    }
    return null;
  },

  readText(d, off, len) {
    let s = "";
    for (let i = off; i < Math.min(d.length, off + len); i++) {
      if (!d[i]) break;
      s += String.fromCharCode(d[i]);
    }
    return s.trim();
  },

  detectChip(flags) {
    const chips = ["2A03"];
    if (flags & 0x01) chips.push("VRC6");
    if (flags & 0x02) chips.push("VRC7");
    if (flags & 0x04) chips.push("FDS");
    if (flags & 0x08) chips.push("MMC5");
    if (flags & 0x10) chips.push("N163");
    if (flags & 0x20) chips.push("FME-7");
    return chips.join(" + ");
  }
};
window.NSFParser = NSFParser;
