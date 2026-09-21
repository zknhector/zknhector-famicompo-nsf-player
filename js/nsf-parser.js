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


    if (bytes.length === 0) {
      return "";
    }


    const raw = new Uint8Array(bytes);


    const clean = text =>
      text
        .replace(/\u0000/g, "")
        .replace(/[\x00-\x1f\x7f]/g, "")
        .trim();


    /*
     * ASCII
     *
     * NSFのメタデータでは非常によく使われる。
     * ASCIIなら文字コード判定の必要がない。
     */

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


    /*
     * UTF-8
     *
     * fatal:true にして、
     * UTF-8として正しくないデータを
     * 誤ってUTF-8として表示しない。
     */

    try {
      const utf8 =
        new TextDecoder("utf-8", {
          fatal: true
        }).decode(raw);

      return clean(utf8);

    } catch (_error) {
      /*
       * UTF-8ではない。
       * 次にShift-JISを試す。
       */
    }


    /*
     * Shift-JIS / CP932
     *
     * 日本語の古いNSFで使われている
     * 可能性が高い文字コード。
     */

    try {
      const sjis =
        new TextDecoder("shift-jis", {
          fatal: false
        }).decode(raw);

      return clean(sjis);

    } catch (_error) {
      /*
       * 最後のフォールバックへ。
       */
    }


    /*
     * 最終フォールバック
     *
     * 文字を完全に捨てず、
     * 元のバイト値をそのまま文字化する。
     */

    let fallback = "";

    for (const byte of raw) {
      fallback += String.fromCharCode(byte);
    }

    return clean(fallback);
  },


  detectChip(flags) {
    const chips = ["2A03"];


    if (flags & 0x01) {
      chips.push("VRC6");
    }


    if (flags & 0x02) {
      chips.push("VRC7");
    }


    if (flags & 0x04) {
      chips.push("FDS");
    }


    if (flags & 0x08) {
      chips.push("MMC5");
    }


    if (flags & 0x10) {
      chips.push("N163");
    }


    if (flags & 0x20) {
      chips.push("FME-7");
    }


    return chips.join(" + ");
  }
};


window.NSFParser = NSFParser;
