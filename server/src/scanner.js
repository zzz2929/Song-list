import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { db } from './db.js';
import { norm, parseFromFilename } from './norm.js';

export const AUDIO_EXTS = new Set([
  'mp3', 'flac', 'wav', 'aif', 'aiff', 'm4a', 'aac', 'ogg', 'oga', 'opus',
  'ape', 'wv', 'dsf', 'dff', 'wma', 'mka', 'mpc',
]);

// NAS 上常见的无关目录
const SKIP_DIRS = new Set([
  '.trash', '#recycle', '$recycle.bin', 'system volume information',
  'lost+found', '@eadir', '#snapshot', '#recycle:1',
]);

const UPSERT = `
INSERT INTO tracks (
  library_id, path, file_name, file_size, mtime_ms, ext,
  title, artist, album, albumartist, genre, year, track_no, disc_no,
  duration, bitrate, codec, title_norm, artist_norm, album_norm, updated_at
) VALUES (
  @library_id, @path, @file_name, @file_size, @mtime_ms, @ext,
  @title, @artist, @album, @albumartist, @genre, @year, @track_no, @disc_no,
  @duration, @bitrate, @codec, @title_norm, @artist_norm, @album_norm, @updated_at
) ON CONFLICT(path) DO UPDATE SET
  library_id = excluded.library_id,
  file_name = excluded.file_name, file_size = excluded.file_size, mtime_ms = excluded.mtime_ms,
  ext = excluded.ext, title = excluded.title, artist = excluded.artist,
  album = excluded.album, albumartist = excluded.albumartist, genre = excluded.genre,
  year = excluded.year, track_no = excluded.track_no, disc_no = excluded.disc_no,
  duration = excluded.duration, bitrate = excluded.bitrate, codec = excluded.codec,
  title_norm = excluded.title_norm, artist_norm = excluded.artist_norm, album_norm = excluded.album_norm,
  updated_at = excluded.updated_at`;

export const scanState = {
  running: false, total: 0, done: 0, added: 0, updated: 0, removed: 0,
  errors: [], current: '', startedAt: null, finishedAt: null,
};

export function startScan() {
  if (scanState.running) {
    const e = new Error('已有扫描任务在进行中');
    e.status = 409;
    throw e;
  }
  Object.assign(scanState, {
    running: true, total: 0, done: 0, added: 0, updated: 0, removed: 0,
    errors: [], current: '', startedAt: new Date().toISOString(), finishedAt: null,
  });
  runScan().catch((e) => {
    scanState.errors.push(String(e?.message || e));
    scanState.running = false;
    scanState.finishedAt = new Date().toISOString();
  });
}

async function runScan() {
  try {
    const libs = db.prepare('SELECT * FROM libraries WHERE enabled = 1 ORDER BY id').all();
    for (const lib of libs) {
      if (!fs.existsSync(lib.path)) {
        scanState.errors.push(`音乐库路径不可访问: ${lib.path}`);
        continue;
      }
      await scanLibrary(lib);
    }
  } finally {
    scanState.running = false;
    scanState.finishedAt = new Date().toISOString();
  }
}

async function scanLibrary(lib) {
  const files = [];
  await walk(lib.path, files);
  scanState.total += files.length;

  const existing = new Map(
    db.prepare('SELECT id, path, mtime_ms, file_size FROM tracks WHERE library_id = ?')
      .all(lib.id)
      .map((r) => [r.path, r])
  );
  const upsert = db.prepare(UPSERT);
  const seen = new Set();

  await runPool(4, files, async (file) => {
    scanState.current = file;
    let st;
    try {
      st = await fs.promises.stat(file);
    } catch {
      scanState.done++;
      return;
    }
    seen.add(file);
    const mtime = Math.floor(st.mtimeMs);
    const prev = existing.get(file);
    if (prev && prev.mtime_ms === mtime && prev.file_size === st.size) {
      scanState.done++;
      return;
    }

    let meta = null;
    try {
      meta = await parseFile(file, { duration: true });
    } catch (e) {
      if (scanState.errors.length < 200) {
        scanState.errors.push(`解析失败 ${file}: ${e?.message || e}`);
      }
    }

    const common = meta?.common ?? {};
    const format = meta?.format ?? {};
    const fallback = parseFromFilename(path.basename(file));
    const title = String(common.title ?? '').trim() || fallback.title;
    const artist = String(common.artist ?? common.artists?.[0] ?? '').trim() || fallback.artist;
    const album = String(common.album ?? '').trim();
    const albumartist = String(common.albumartist ?? '').trim() || artist;
    const genre = Array.isArray(common.genre)
      ? common.genre.filter(Boolean).join(' / ')
      : String(common.genre ?? '').trim();

    upsert.run({
      library_id: lib.id,
      path: file,
      file_name: path.basename(file),
      file_size: st.size,
      mtime_ms: mtime,
      ext: path.extname(file).slice(1).toLowerCase(),
      title,
      artist,
      album,
      albumartist,
      genre,
      year: common.year ?? null,
      track_no: common.track?.no ?? null,
      disc_no: common.disc?.no ?? null,
      duration: format.duration ?? null,
      bitrate: format.bitrate ?? null,
      codec: format.codec ?? null,
      title_norm: norm(title),
      artist_norm: norm(artist),
      album_norm: norm(album),
      updated_at: new Date().toISOString(),
    });
    if (prev) scanState.updated++;
    else scanState.added++;
    scanState.done++;
  });

  const del = db.prepare('DELETE FROM tracks WHERE id = ?');
  for (const [p, row] of existing) {
    if (!seen.has(p)) {
      del.run(row.id);
      scanState.removed++;
    }
  }
  db.prepare('UPDATE libraries SET last_scan_at = ? WHERE id = ?')
    .run(new Date().toISOString(), lib.id);
}

async function runPool(concurrency, items, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        await fn(items[idx]);
      } catch (e) {
        if (scanState.errors.length < 200) {
          scanState.errors.push(`${items[idx]}: ${e?.message || e}`);
        }
      }
    }
  });
  await Promise.all(workers);
}

async function walk(dir, out) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name.toLowerCase())) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && AUDIO_EXTS.has(path.extname(entry.name).slice(1).toLowerCase())) {
      out.push(full);
    }
  }
}
