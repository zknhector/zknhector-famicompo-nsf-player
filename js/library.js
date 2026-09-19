const NSFLibrary = {
db: null,
songs: [],

async init() {
this.db = await new Promise((resolve, reject) => {
const request = indexedDB.open("NSFLibrary", 3);

  request.onupgradeneeded = event => {
    const db = event.target.result;

    if (!db.objectStoreNames.contains("songs")) {
      db.createObjectStore("songs", {
        keyPath: "id",
        autoIncrement: true
      });
    }
  };

  request.onsuccess = () => {
    resolve(request.result);
  };

  request.onerror = () => {
    reject(request.error);
  };
});

this.songs = await this.getAll();

await this.cleanupDuplicates();

return this.songs;

},

async getFileHash(file) {
const buffer = await file.arrayBuffer();

const digest = await crypto.subtle.digest(
  "SHA-256",
  buffer
);

const bytes = new Uint8Array(digest);

return Array.from(bytes)
  .map(byte =>
    byte.toString(16).padStart(2, "0")
  )
  .join("");

},

async cleanupDuplicates() {
if (!this.db || !this.songs.length) {
return;
}

const seen = new Map();
const duplicates = [];
const updates = [];

for (const song of this.songs) {
  let hash = song.hash;

  if (!hash) {
    hash = await this.getFileHash(song.file);
  }

  if (seen.has(hash)) {
    duplicates.push(song.id);
    continue;
  }

  seen.set(hash, song.id);

  if (song.hash !== hash) {
    updates.push({
      ...song,
      hash
    });
  }
}

if (!duplicates.length && !updates.length) {
  return;
}

await new Promise((resolve, reject) => {
  const tx = this.db.transaction(
    "songs",
    "readwrite"
  );

  const store = tx.objectStore("songs");

  for (const song of updates) {
    store.put(song);
  }

  for (const id of duplicates) {
    store.delete(id);
  }

  tx.oncomplete = resolve;
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

this.songs = await this.getAll();

console.log(
  `Library cleanup: ${duplicates.length} duplicate(s) removed`
);

},

async add(song) {
if (!this.db) {
await this.init();
}

const hash = await this.getFileHash(song.file);

const existing = this.songs.find(
  item => item.hash === hash
);

if (existing) {
  console.log(
    "Duplicate file skipped:",
    song.filename
  );

  return null;
}

const record = {
  filename: song.filename,
  file: song.file,
  hash,
  date: Date.now()
};

const id = await new Promise((resolve, reject) => {
  const tx = this.db.transaction(
    "songs",
    "readwrite"
  );

  const request = tx
    .objectStore("songs")
    .add(record);

  request.onsuccess = () => {
    resolve(request.result);
  };

  request.onerror = () => {
    reject(request.error);
  };
});

const saved = {
  id,
  filename: record.filename,
  file: record.file,
  hash: record.hash
};

this.songs.push(saved);

return saved;

},

async getAll() {
if (!this.db) {
return [];
}

return await new Promise((resolve, reject) => {
  const request = this.db
    .transaction("songs")
    .objectStore("songs")
    .getAll();

  request.onsuccess = () => {
    resolve(request.result || []);
  };

  request.onerror = () => {
    reject(request.error);
  };
});

},

async remove(id) {
if (!this.db) {
return;
}

await new Promise((resolve, reject) => {
  const tx = this.db.transaction(
    "songs",
    "readwrite"
  );

  const request = tx
    .objectStore("songs")
    .delete(id);

  request.onsuccess = resolve;
  request.onerror = () => reject(request.error);
});

this.songs = this.songs.filter(
  song => song.id !== id
);

}
};

window.NSFLibrary = NSFLibrary;
