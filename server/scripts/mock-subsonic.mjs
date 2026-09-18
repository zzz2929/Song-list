// 本地 Subsonic API 模拟服务端,用于端到端测试同步适配器
// 端口 3902,账号 admin / pass1234,访问 /dump 查看收到的数据
import express from 'express';
import crypto from 'node:crypto';

const PORT = process.env.MOCK_PORT || 3902;
const USER = 'admin';
const PASSWORD = 'pass1234';

const norm = (s) =>
  String(s || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

const LIBRARY = [
  { id: 's1', title: '爱在西元前', artist: '周杰伦', album: '范特西' },
  { id: 's2', title: '简单爱', artist: '周杰伦', album: '范特西' },
  { id: 's3', title: '上海一九四三', artist: '周杰伦', album: '范特西' },
  { id: 's4', title: '半岛铁盒', artist: '周杰伦', album: '八度空间' },
  { id: 's5', title: '回到过去', artist: '周杰伦', album: '八度空间' },
  { id: 's6', title: '江南', artist: '林俊杰', album: '第二天堂' },
  { id: 's7', title: '豆浆油条', artist: '林俊杰', album: '第二天堂' },
  { id: 's8', title: '美人鱼', artist: '林俊杰', album: '第二天堂' },
  { id: 's9', title: '勇气', artist: '梁静茹', album: '滚石合集' },
  { id: 's10', title: '绿光', artist: '孙燕姿', album: '风筝' },
  { id: 's11', title: '天黑黑', artist: '孙燕姿', album: '孙燕姿同名专辑' },
];

const state = { playlists: [] };

const app = express();
app.use(express.urlencoded({ extended: false }));

function sendErr(res, code, message) {
  res.json({ 'subsonic-response': { status: 'failed', error: { code, message } } });
}

function auth(req, res) {
  const u = req.query.u ?? req.body?.u;
  if (u !== USER) {
    sendErr(res, 40, '用户名或密码错误');
    return false;
  }
  const salt = String(req.query.s ?? req.body?.s ?? '');
  const token = String(req.query.t ?? req.body?.t ?? '');
  const expect = crypto.createHash('md5').update(PASSWORD + salt).digest('hex');
  if (token !== expect) {
    sendErr(res, 40, '令牌校验失败');
    return false;
  }
  return true;
}

app.all('/rest/:endpoint', (req, res) => {
  if (!auth(req, res)) return;
  const endpoint = req.params.endpoint;
  const get = (k) => req.query[k] ?? req.body?.[k];
  const getAll = (k) => {
    const out = [];
    for (const src of [req.query[k], req.body?.[k]]) {
      if (src === undefined) continue;
      (Array.isArray(src) ? src : [src]).forEach((x) => out.push(String(x)));
    }
    return out;
  };

  switch (endpoint) {
    case 'ping':
      return res.json({
        'subsonic-response': { status: 'ok', version: '1.16.1', serverVersion: 'mock-navidrome 1.0' },
      });
    case 'getPlaylists':
      return res.json({
        'subsonic-response': {
          status: 'ok',
          playlists: {
            playlist: state.playlists.map((p) => ({
              id: p.id, name: p.name, songCount: p.songIds.length, owner: USER,
            })),
          },
        },
      });
    case 'search3': {
      const query = norm(get('query'));
      const songs = LIBRARY.filter(
        (s) => norm(s.title).includes(query) || query.includes(norm(s.title))
      ).slice(0, Number(get('songCount') || 20));
      return res.json({
        'subsonic-response': { status: 'ok', searchResult3: { song: songs } },
      });
    }
    case 'createPlaylist': {
      const name = get('name');
      const playlistId = get('playlistId');
      const songIds = getAll('songId');
      let pl = playlistId
        ? state.playlists.find((p) => String(p.id) === String(playlistId))
        : null;
      if (!pl) {
        pl = { id: String(1000 + state.playlists.length), name: String(name || '未命名'), songIds: [] };
        state.playlists.push(pl);
      } else if (name) {
        pl.name = String(name);
      }
      if (songIds.length || playlistId) pl.songIds = songIds;
      return res.json({
        'subsonic-response': {
          status: 'ok',
          playlist: { id: pl.id, name: pl.name, songCount: pl.songIds.length },
        },
      });
    }
    default:
      return sendErr(res, 0, `mock 未实现接口 ${endpoint}`);
  }
});

app.get('/dump', (req, res) => res.json(state));

app.listen(PORT, () => {
  console.log(`[mock-subsonic] http://localhost:${PORT} (账号 ${USER}/${PASSWORD})`);
});
