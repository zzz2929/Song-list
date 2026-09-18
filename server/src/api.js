import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, getSetting, setSetting, withTransaction } from './db.js';
import { startScan, scanState } from './scanner.js';
import { buildM3U } from './m3u.js';
import { TARGETS, getAdapter } from './sync/index.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (msg, status = 400) => {
  const e = new Error(msg);
  e.status = status;
  return e;
};

const FACET_EXPR = {
  album: "COALESCE(NULLIF(album, ''), '未知')",
  albumartist: "COALESCE(NULLIF(albumartist, ''), '未知')",
  artist: "COALESCE(NULLIF(artist, ''), '未知')",
  genre: "COALESCE(NULLIF(genre, ''), '未知')",
  year: "COALESCE(CAST(year AS TEXT), '未知')",
};

// ---------- 音乐库 ----------

router.get('/libraries', (req, res) => {
  res.json(
    db.prepare(
      `SELECT l.*, (SELECT COUNT(*) FROM tracks t WHERE t.library_id = l.id) AS track_count
       FROM libraries l ORDER BY l.id`
    ).all()
  );
});

router.post('/libraries', wrap(async (req, res) => {
  const rawPath = String(req.body?.path || '').trim();
  if (!rawPath) throw bad('请填写音乐库路径');
  const p = path.resolve(rawPath);
  let st;
  try {
    st = await fs.promises.stat(p);
  } catch {
    throw bad(`路径不存在或不可访问: ${p}`);
  }
  if (!st.isDirectory()) throw bad(`路径不是目录: ${p}`);
  if (db.prepare('SELECT id FROM libraries WHERE path = ?').get(p)) {
    throw bad('该路径已添加过', 409);
  }
  const name = String(req.body?.name || '').trim() || path.basename(p) || '音乐库';
  const info = db
    .prepare('INSERT INTO libraries (name, path, created_at) VALUES (?, ?, ?)')
    .run(name, p, new Date().toISOString());
  res.json({ id: Number(info.lastInsertRowid), name, path: p });
}));

router.patch('/libraries/:id', (req, res) => {
  const lib = db.prepare('SELECT * FROM libraries WHERE id = ?').get(req.params.id);
  if (!lib) throw bad('音乐库不存在', 404);
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : lib.name;
  const enabled = req.body?.enabled !== undefined ? (req.body.enabled ? 1 : 0) : lib.enabled;
  let p = lib.path;
  if (req.body?.path !== undefined && String(req.body.path).trim()) {
    p = path.resolve(String(req.body.path).trim());
    if (db.prepare('SELECT id FROM libraries WHERE path = ? AND id != ?').get(p, lib.id)) {
      throw bad('该路径已被其他音乐库使用', 409);
    }
  }
  db.prepare('UPDATE libraries SET name = ?, path = ?, enabled = ? WHERE id = ?')
    .run(name, p, enabled, lib.id);
  res.json({ ok: true });
});

router.delete('/libraries/:id', (req, res) => {
  const info = db.prepare('DELETE FROM libraries WHERE id = ?').run(req.params.id);
  if (!info.changes) throw bad('音乐库不存在', 404);
  res.json({ ok: true });
});

// ---------- 扫描 ----------

router.post('/scan', (req, res) => {
  startScan();
  res.json({ ok: true });
});

router.get('/scan/status', (req, res) => {
  res.json(scanState);
});

// ---------- 歌曲 ----------

router.get('/tracks', (req, res) => {
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const where = [];
  const args = [];
  if (q) {
    where.push('(title LIKE ? OR artist LIKE ? OR album LIKE ? OR albumartist LIKE ? OR file_name LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM tracks ${whereSql}`).get(...args).c;
  const rows = db
    .prepare(
      `SELECT id, title, artist, album, albumartist, genre, year, duration, ext,
              track_no, disc_no, path
       FROM tracks ${whereSql}
       ORDER BY artist, album, disc_no, track_no, title
       LIMIT ? OFFSET ?`
    )
    .all(...args, pageSize, (page - 1) * pageSize);
  res.json({ total, page, pageSize, rows });
});

router.get('/facets', (req, res) => {
  const expr = FACET_EXPR[req.query.field];
  if (!expr) throw bad('field 必须是 album / albumartist / artist / genre / year 之一');
  res.json(
    db.prepare(`SELECT ${expr} AS value, COUNT(*) AS count FROM tracks GROUP BY ${expr} ORDER BY count DESC, value`).all()
  );
});

// ---------- 歌单 ----------

function createPlaylist(name, description, trackIds) {
  return withTransaction(() => {
    const now = new Date().toISOString();
    const info = db
      .prepare('INSERT INTO playlists (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(name, description || '', now, now);
    const pid = Number(info.lastInsertRowid);
    if (trackIds.length) {
      const ins = db.prepare(
        'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)'
      );
      trackIds.forEach((tid, i) => ins.run(pid, tid, i + 1));
    }
    return pid;
  });
}

router.get('/playlists', (req, res) => {
  res.json(
    db.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
       FROM playlists p ORDER BY p.name COLLATE NOCASE`
    ).all()
  );
});

router.post('/playlists', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw bad('请填写歌单名称');
  if (db.prepare('SELECT id FROM playlists WHERE name = ?').get(name)) {
    throw bad('同名歌单已存在', 409);
  }
  const trackIds = (Array.isArray(req.body?.trackIds) ? req.body.trackIds : []).map(Number);
  const valid = trackIds.length
    ? db.prepare(`SELECT id FROM tracks WHERE id IN (${trackIds.map(() => '?').join(',')})`).all(...trackIds).map((r) => r.id)
    : [];
  const order = new Map(trackIds.map((id, i) => [id, i]));
  valid.sort((a, b) => order.get(a) - order.get(b));
  const id = createPlaylist(name, String(req.body?.description || ''), valid);
  res.json({ id, name, count: valid.length });
});

router.post('/playlists/batch', (req, res) => {
  const field = req.body?.field;
  const expr = FACET_EXPR[field];
  if (!expr) throw bad('field 必须是 album / albumartist / artist / genre / year 之一');
  const values = (Array.isArray(req.body?.values) ? req.body.values : []).map((v) => String(v));
  if (!values.length) throw bad('请至少选择一个值');
  const tpl = String(req.body?.template || '{value}').trim() || '{value}';

  const created = [];
  const skipped = [];
  withTransaction(() => {
    for (const value of values) {
      const name = tpl.replaceAll('{value}', value);
      if (db.prepare('SELECT id FROM playlists WHERE name = ?').get(name)) {
        skipped.push(name);
        continue;
      }
      const rows = db
        .prepare(`SELECT id FROM tracks WHERE ${expr} = ? ORDER BY album, disc_no, track_no, title`)
        .all(value);
      const pid = createPlaylist(name, `按「${field} = ${value}」批量创建`, rows.map((r) => r.id));
      created.push({ id: pid, name, count: rows.length });
    }
  });
  res.json({ created, skipped });
});

router.get('/playlists/:id(\\d+)', (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!pl) throw bad('歌单不存在', 404);
  const tracks = db
    .prepare(
      `SELECT pt.position, t.* FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ? ORDER BY pt.position`
    )
    .all(pl.id);
  res.json({ ...pl, tracks });
});

router.patch('/playlists/:id(\\d+)', (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!pl) throw bad('歌单不存在', 404);
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : pl.name;
  if (!name) throw bad('歌单名称不能为空');
  const clash = db.prepare('SELECT id FROM playlists WHERE name = ? AND id != ?').get(name, pl.id);
  if (clash) throw bad('同名歌单已存在', 409);
  const description = req.body?.description !== undefined ? String(req.body.description) : pl.description;
  db.prepare('UPDATE playlists SET name = ?, description = ?, updated_at = ? WHERE id = ?')
    .run(name, description, new Date().toISOString(), pl.id);
  res.json({ ok: true });
});

router.delete('/playlists/:id(\\d+)', (req, res) => {
  const info = db.prepare('DELETE FROM playlists WHERE id = ?').run(req.params.id);
  if (!info.changes) throw bad('歌单不存在', 404);
  res.json({ ok: true });
});

router.post('/playlists/:id(\\d+)/tracks', (req, res) => {
  const pl = db.prepare('SELECT id FROM playlists WHERE id = ?').get(req.params.id);
  if (!pl) throw bad('歌单不存在', 404);
  const trackIds = (Array.isArray(req.body?.trackIds) ? req.body.trackIds : []).map(Number);
  if (!trackIds.length) throw bad('请选择要添加的歌曲');
  const valid = db
    .prepare(`SELECT id FROM tracks WHERE id IN (${trackIds.map(() => '?').join(',')})`)
    .all(...trackIds)
    .map((r) => r.id);
  if (!valid.length) throw bad('所选歌曲不存在(可能已被移除),请刷新页面');
  withTransaction(() => {
    const max = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM playlist_tracks WHERE playlist_id = ?').get(pl.id).m;
    const ins = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
    valid.forEach((tid, i) => ins.run(pl.id, tid, max + i + 1));
    db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), pl.id);
  });
  res.json({ ok: true, added: valid.length });
});

router.put('/playlists/:id(\\d+)/tracks', (req, res) => {
  const pl = db.prepare('SELECT id FROM playlists WHERE id = ?').get(req.params.id);
  if (!pl) throw bad('歌单不存在', 404);
  const trackIds = (Array.isArray(req.body?.trackIds) ? req.body.trackIds : []).map(Number);
  withTransaction(() => {
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(pl.id);
    const ins = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
    trackIds.forEach((tid, i) => ins.run(pl.id, tid, i + 1));
    db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), pl.id);
  });
  res.json({ ok: true });
});

router.delete('/playlists/:id(\\d+)/tracks/:trackId(\\d+)', (req, res) => {
  const info = db
    .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
    .run(req.params.id, req.params.trackId);
  if (!info.changes) throw bad('该歌曲不在此歌单中', 404);
  res.json({ ok: true });
});

router.get('/playlists/:id(\\d+)/export', (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!pl) throw bad('歌单不存在', 404);
  const tracks = db
    .prepare(
      `SELECT pt.position, t.* FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ? ORDER BY pt.position`
    )
    .all(pl.id);
  const content = buildM3U(tracks, {
    pathFrom: String(req.query.pathFrom || ''),
    pathTo: String(req.query.pathTo || ''),
  });
  res.setHeader('content-type', 'audio/x-mpegurl; charset=utf-8');
  res.setHeader(
    'content-disposition',
    `attachment; filename="playlist-${pl.id}.m3u8"; filename*=UTF-8''${encodeURIComponent(pl.name)}.m3u8`
  );
  res.send(content);
});

// ---------- 统计 ----------

router.get('/stats', (req, res) => {
  res.json({
    libraries: db.prepare('SELECT COUNT(*) AS c FROM libraries').get().c,
    tracks: db.prepare('SELECT COUNT(*) AS c FROM tracks').get().c,
    playlists: db.prepare('SELECT COUNT(*) AS c FROM playlists').get().c,
  });
});

// ---------- 同步 ----------

router.get('/sync/targets', (req, res) => {
  res.json(
    Object.entries(TARGETS).map(([id, t]) => ({
      id,
      name: t.name,
      implemented: t.implemented,
      desc: t.desc,
    }))
  );
});

router.get('/settings/targets', (req, res) => {
  let cfg = {};
  try {
    cfg = JSON.parse(getSetting('targets') || '{}');
  } catch {
    cfg = {};
  }
  res.json(cfg);
});

router.put('/settings/targets', (req, res) => {
  setSetting('targets', JSON.stringify(req.body || {}));
  res.json({ ok: true });
});

function requireTarget(req) {
  const target = TARGETS[req.params.target];
  if (!target) throw bad('未知的同步目标', 404);
  if (!target.implemented || !getAdapter(req.params.target)) {
    throw bad(`「${target.name}」尚未实现: ${target.desc}`, 501);
  }
  let cfgAll = {};
  try {
    cfgAll = JSON.parse(getSetting('targets') || '{}');
  } catch {
    cfgAll = {};
  }
  const cfg = cfgAll[req.params.target] || {};
  if (!cfg.baseUrl && !cfg.url) throw bad(`请先在「同步导出」页保存「${target.name}」的连接配置`);
  return { target, cfg };
}

router.post('/sync/:target/test', wrap(async (req, res) => {
  const { target, cfg } = requireTarget(req);
  res.json(await getAdapter(req.params.target).testConnection(cfg));
}));

router.post('/sync/:target', wrap(async (req, res) => {
  const { target, cfg } = requireTarget(req);
  const playlists = db.prepare('SELECT id, name FROM playlists ORDER BY name COLLATE NOCASE').all();
  const tracksStmt = db.prepare(
    `SELECT pt.position, t.* FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     WHERE pt.playlist_id = ? ORDER BY pt.position`
  );
  const payload = playlists.map((p) => ({ id: p.id, name: p.name, tracks: tracksStmt.all(p.id) }));
  const report = await getAdapter(req.params.target).syncPlaylists(cfg, payload);
  res.json(report);
}));

export default router;
