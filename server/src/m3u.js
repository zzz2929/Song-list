// 生成 M3U8 歌单文本
// pathFrom/pathTo: 可选的路径前缀替换,例如把容器内路径 /music 映射为播放器可见路径
export function buildM3U(tracks, { pathFrom = '', pathTo = '' } = {}) {
  const from = pathFrom ? pathFrom.replace(/\\/g, '/').replace(/\/+$/, '') : '';
  const to = pathTo ? pathTo.replace(/\\/g, '/').replace(/\/+$/, '') : '';
  const lines = ['#EXTM3U', '#EXTENC:UTF-8'];
  for (const t of tracks) {
    let p = String(t.path || '').replace(/\\/g, '/');
    if (from && p.toLowerCase().startsWith(from.toLowerCase() + '/')) {
      p = to + p.slice(from.length);
    }
    const label = [t.artist, t.title].filter(Boolean).join(' - ') || t.file_name || '';
    const dur = t.duration != null && !Number.isNaN(t.duration) ? Math.round(t.duration) : -1;
    lines.push(`#EXTINF:${dur},${label}`);
    lines.push(p);
  }
  return lines.join('\n') + '\n';
}
