// 匹配用归一化:去空白/标点/符号,转小写,全角转半角
export function norm(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

// 无标签时从文件名推断艺术家/标题,如 "周杰伦 - 简单爱.mp3"
export function parseFromFilename(name) {
  const base = String(name || '').replace(/\.[^.]+$/, '').trim();
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  if (m) {
    let artist = m[1].trim();
    // "01 - 标题" 这类纯序号前缀不算艺术家
    if (/^\d+$/.test(artist)) artist = '';
    return { artist, title: m[2].trim() || base };
  }
  const numbered = base.match(/^\d+[\s._-]+(.+)$/);
  if (numbered) return { artist: '', title: numbered[1].trim() };
  return { artist: '', title: base };
}

export function formatDuration(sec) {
  if (sec == null || Number.isNaN(sec)) return '';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
