import crypto from 'node:crypto';
import { norm } from '../norm.js';

// Subsonic API 适配器,兼容 Navidrome / Gonic / Airsonic 等所有 Subsonic 兼容服务端。
// 鉴权: token = md5(password + salt) (Subsonic API 1.13+)
// 同步语义: 以本地歌单为准,目标端同名歌单内容将被整体替换(幂等)。

const CLIENT = 'songlist';
const API_VERSION = '1.16.1';

function authParams(cfg) {
  const salt = crypto.randomBytes(6).toString('hex');
  const token = crypto.createHash('md5').update(String(cfg.password || '') + salt).digest('hex');
  return { u: cfg.username, t: token, s: salt, v: API_VERSION, c: CLIENT, f: 'json' };
}

async function call(cfg, endpoint, extra = {}) {
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('请先配置服务端地址');
  const url = new URL(base + '/rest/' + endpoint);
  for (const [k, v] of Object.entries(authParams(cfg))) url.searchParams.set(k, v);

  const hasBody = Object.keys(extra).length > 0;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => body.append(k, String(x)));
    else body.append(k, String(v));
  }

  const res = await fetch(url, {
    method: hasBody ? 'POST' : 'GET',
    headers: hasBody ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
    body: hasBody ? body : undefined,
  });
  if (!res.ok) throw new Error(`服务端返回 HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.['subsonic-response'];
  if (!r || r.status !== 'ok') {
    const detail = r?.error ? `${r.error.message || ''}(code ${r.error.code})` : JSON.stringify(data).slice(0, 200);
    throw new Error(`${endpoint} 调用失败: ${detail}`);
  }
  return r;
}

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

export async function testConnection(cfg) {
  const r = await call(cfg, 'ping');
  return { ok: true, message: `连接成功,服务端 API 版本 ${r.version || '?'}` };
}

async function findPlaylistByName(cfg, name) {
  const r = await call(cfg, 'getPlaylists');
  return arr(r.playlists?.playlist).find((p) => p.name === name) || null;
}

// 打分: 标题归一化相等是硬前提(4 分),歌手/专辑艺术家 +2,专辑 +1
function score(song, track) {
  if (norm(song.title) !== norm(track.title)) return 0;
  let s = 4;
  const songArtists = [song.artist, song.albumArtist ?? song.albumartist]
    .filter(Boolean)
    .map(norm);
  if (track.artist && norm(track.artist) && songArtists.includes(norm(track.artist))) s += 2;
  if (track.album && norm(track.album) && norm(song.album) === norm(track.album)) s += 1;
  return s;
}

async function matchTrack(cfg, track, cache) {
  const key = `${norm(track.title)}|${norm(track.artist)}`;
  if (cache.has(key)) return cache.get(key);

  let best = null;
  let bestScore = 0;
  const queries = [track.title, [track.artist, track.title].filter(Boolean).join(' ')];
  for (const query of queries) {
    if (!query) continue;
    const r = await call(cfg, 'search3', {
      query,
      songCount: 20,
      artistCount: 0,
      albumCount: 0,
    });
    for (const song of arr(r.searchResult3?.song)) {
      const s = score(song, track);
      if (s > bestScore) {
        bestScore = s;
        best = song;
      }
    }
    if (best) break;
  }
  const result = best
    ? { id: String(best.id), title: best.title, artist: best.artist ?? '' }
    : null;
  cache.set(key, result);
  return result;
}

export async function syncPlaylists(cfg, playlists, log = () => {}) {
  const report = [];
  const cache = new Map();
  for (const pl of playlists) {
    const entry = {
      playlist: pl.name,
      total: pl.tracks.length,
      matched: 0,
      unmatched: [],
      created: false,
      error: null,
    };
    try {
      const ids = [];
      for (const t of pl.tracks) {
        const m = await matchTrack(cfg, t, cache);
        if (m) {
          ids.push(m.id);
          entry.matched++;
        } else {
          entry.unmatched.push({ title: t.title, artist: t.artist, album: t.album });
        }
      }
      const existing = await findPlaylistByName(cfg, pl.name);
      const params = existing
        ? { playlistId: existing.id, name: pl.name, songId: ids }
        : { name: pl.name, songId: ids };
      await call(cfg, 'createPlaylist', params);
      entry.created = !existing;
    } catch (e) {
      entry.error = String(e?.message || e);
    }
    log(`${entry.error ? '✗' : '✓'} ${pl.name} (${entry.matched}/${entry.total})`);
    report.push(entry);
  }
  return report;
}
