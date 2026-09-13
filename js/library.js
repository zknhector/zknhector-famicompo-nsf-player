const NSFLibrary = {
  db: null,
  songs: [],

  async init() {
    this.db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("NSFLibrary", 2);
      r.onupgradeneeded = e => {
        const db = e.target.result;
        if (db.objectStoreNames.contains("songs")) db.deleteObjectStore("songs");
        db.createObjectStore("songs", { keyPath: "id", autoIncrement: true });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    this.songs = await this.getAll();
    return this.songs;
  },

  async add(song) {
    if (!this.db) await this.init();
    const record = {
      filename: song.filename,
      file: song.file,
      date: Date.now()
    };
    const id = await new Promise((resolve, reject) => {
      const tx = this.db.transaction("songs", "readwrite");
      const req = tx.objectStore("songs").add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const saved = { id, filename: record.filename, file: record.file };
    this.songs.push(saved);
    return saved;
  },

  async getAll() {
    if (!this.db) return [];
    return await new Promise((resolve, reject) => {
      const r = this.db.transaction("songs").objectStore("songs").getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  },

  async remove(id) {
    if (!this.db) return;
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction("songs", "readwrite");
      const r = tx.objectStore("songs").delete(id);
      r.onsuccess = resolve;
      r.onerror = () => reject(r.error);
    });
    this.songs = this.songs.filter(s => s.id !== id);
  }
};
window.NSFLibrary = NSFLibrary;
