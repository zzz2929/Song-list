import { createClient } from 'webdav';
import { buildM3U } from '../m3u.js';

function client(cfg) {
  if (!cfg?.url) throw new Error('请先配置 WebDAV 地址');
  return createClient(cfg.url, {
    username: cfg.username || '',
    password: cfg.password || '',
  });
}

const normalizeDir = (d) => String(d || '').replace(/\/+$/, '');

async function ensureDir(c, dir) {
  if (!dir || dir === '/') return;
  const parts = dir.split('/').filter(Boolean);
  let cur = '';
  for (const part of parts) {
    cur += '/' + part;
    try {
      await c.createDirectory(cur);
    } catch {
      // 目录已存在(多数服务端返回 405)时忽略
    }
  }
}

export async function testConnection(cfg) {
  const c = client(cfg);
  const dir = normalizeDir(cfg.directory);
  const items = await c.getDirectoryContents(dir || '/');
  return { ok: true, message: `连接成功,目录下共 ${Array.isArray(items) ? items.length : 0} 项` };
}

export async function syncPlaylists(cfg, playlists, log = () => {}) {
  const c = client(cfg);
  const dir = normalizeDir(cfg.directory);
  await ensureDir(c, dir);

  const report = [];
  for (const pl of playlists) {
    const entry = { playlist: pl.name, ok: false, file: '', error: null };
    try {
      const content = buildM3U(pl.tracks, { pathFrom: cfg.pathFrom, pathTo: cfg.pathTo });
      const file = `${dir || ''}/${safeName(pl.name)}.m3u8`;
      await c.putFileContents(file, content, { overwrite: true });
      entry.ok = true;
      entry.file = file;
    } catch (e) {
      entry.error = String(e?.message || e);
    }
    log(`${entry.ok ? '✓' : '✗'} ${pl.name}`);
    report.push(entry);
  }
  return report;
}

function safeName(n) {
  return String(n || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'playlist';
}
