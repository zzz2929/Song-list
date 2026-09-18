// 生成本地测试音乐库: ffmpeg 合成 2 秒静音 MP3 并写入中文 ID3 标签
// 用途: npm run fixtures (仅开发/测试环境需要 ffmpeg,运行时不需要)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'fixtures', 'music');

const ITEMS = [
  { artist: '周杰伦', albumartist: '周杰伦', album: '范特西', title: '爱在西元前', track: 1, year: 2001, genre: 'Pop' },
  { artist: '周杰伦', albumartist: '周杰伦', album: '范特西', title: '简单爱', track: 2, year: 2001, genre: 'Pop' },
  { artist: '周杰伦', albumartist: '周杰伦', album: '范特西', title: '上海一九四三', track: 3, year: 2001, genre: 'Pop' },
  { artist: '周杰伦', albumartist: '周杰伦', album: '八度空间', title: '半岛铁盒', track: 1, year: 2002, genre: 'Pop' },
  { artist: '周杰伦', albumartist: '周杰伦', album: '八度空间', title: '回到过去', track: 2, year: 2002, genre: 'Pop' },
  { artist: '林俊杰', albumartist: '林俊杰', album: '第二天堂', title: '江南', track: 1, year: 2004, genre: 'Mandopop' },
  { artist: '林俊杰', albumartist: '林俊杰', album: '第二天堂', title: '豆浆油条', track: 2, year: 2004, genre: 'Mandopop' },
  { artist: '林俊杰', albumartist: '林俊杰', album: '第二天堂', title: '美人鱼', track: 3, year: 2004, genre: 'Mandopop' },
  { artist: '梁静茹', albumartist: '群星', album: '滚石合集', title: '勇气', track: 1, year: 2000, genre: 'Pop' },
];

fs.rmSync(OUT, { recursive: true, force: true });

for (const it of ITEMS) {
  const dir = path.join(OUT, `${it.artist} - ${it.album}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(it.track).padStart(2, '0')} ${it.title}.mp3`);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', '2', '-c:a', 'libmp3lame', '-b:a', '64k',
    '-id3v2_version', '3',
    '-metadata', `title=${it.title}`,
    '-metadata', `artist=${it.artist}`,
    '-metadata', `album=${it.album}`,
    '-metadata', `album_artist=${it.albumartist}`,
    '-metadata', `date=${it.year}`,
    '-metadata', `genre=${it.genre}`,
    '-metadata', `track=${it.track}`,
    file,
  ]);
}

// 无标签文件,验证文件名兜底解析("孙燕姿 - 绿光" → 歌手/标题;"01 - 天黑黑" → 纯标题)
const loose = path.join(OUT, '散落歌曲');
fs.mkdirSync(loose, { recursive: true });
fs.writeFileSync(path.join(loose, '孙燕姿 - 绿光.mp3'), silentMp3());
fs.writeFileSync(path.join(loose, '01 - 天黑黑.mp3'), silentMp3());

console.log(`fixtures 已生成: ${OUT} (${ITEMS.length + 2} 个文件)`);

function silentMp3() {
  // MPEG1 Layer3 128kbps 44100Hz 帧头 + 全零载荷,80 帧约 0.2 秒
  const frame = Buffer.alloc(417);
  frame[0] = 0xff; frame[1] = 0xfb; frame[2] = 0x90; frame[3] = 0x00;
  return Buffer.concat(Array.from({ length: 80 }, () => frame));
}
