// 端到端自测: 需要 server(8866) 与 mock-subsonic(3902) 已启动
// 运行: npm run e2e
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.resolve(ROOT, 'fixtures', 'music');
const BASE = process.env.BASE_URL || 'http://localhost:8866/api';
const MOCK = process.env.MOCK_URL || 'http://localhost:3902';

let passed = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function j(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!fs.existsSync(FIXTURES)) {
    console.log('fixtures 不存在,先生成...');
    execFileSync('node', [path.join(__dirname, 'make-fixtures.mjs')], { stdio: 'inherit' });
  }

  // 预清理: 保证脚本可重复运行
  console.log('\n[0] 预清理');
  await j('PUT', `${BASE}/settings/targets`, {});
  for (const l of (await j('GET', `${BASE}/libraries`)).data) {
    if (path.resolve(l.path) === path.resolve(FIXTURES)) {
      await j('DELETE', `${BASE}/libraries/${l.id}`);
      console.log(`  清理音乐库 #${l.id}`);
    }
  }
  for (const p of (await j('GET', `${BASE}/playlists`)).data) {
    if (['周杰伦的歌', '林俊杰的歌', '范特西', '我的精选'].includes(p.name)) {
      await j('DELETE', `${BASE}/playlists/${p.id}`);
      console.log(`  清理歌单「${p.name}」`);
    }
  }

  console.log('\n[1] 音乐库管理');
  const lib = await j('POST', `${BASE}/libraries`, { name: '测试音乐库', path: FIXTURES });
  check('添加音乐库', lib.status === 200 && !!lib.data.id, JSON.stringify(lib.data));
  const dup = await j('POST', `${BASE}/libraries`, { path: FIXTURES });
  check('重复添加返回 409', dup.status === 409);
  const badPath = await j('POST', `${BASE}/libraries`, { path: 'Z:/不存在的路径/xyz' });
  check('无效路径返回 400', badPath.status === 400);

  console.log('\n[2] 扫描与元数据');
  const scan = await j('POST', `${BASE}/scan`);
  check('触发扫描', scan.status === 200);
  let st = null;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    st = (await j('GET', `${BASE}/scan/status`)).data;
    if (!st.running) break;
  }
  check('扫描完成', !!st && !st.running);
  check('扫描总数 11', st?.total === 11, `got ${st?.total}`);
  check('新增 11', st?.added === 11, `got ${st?.added}`);
  check('无错误', st?.errors.length === 0, JSON.stringify(st?.errors?.slice(0, 3)));
  const stats = (await j('GET', `${BASE}/stats`)).data;
  check('统计 tracks=11', stats.tracks === 11, `got ${stats.tracks}`);

  const search = (await j('GET', `${BASE}/tracks?q=${encodeURIComponent('江南')}`)).data;
  check('搜索「江南」命中 1 条(标签解析+中文)', search.total === 1 && search.rows[0].album === '第二天堂');
  const fallback = (await j('GET', `${BASE}/tracks?q=${encodeURIComponent('绿光')}`)).data;
  check('无标签文件按文件名解析出歌手', fallback.total === 1 && fallback.rows[0].artist === '孙燕姿');

  console.log('\n[3] 分面与批量建歌单');
  const albumFacets = (await j('GET', `${BASE}/facets?field=album`)).data;
  check('专辑 facet 范特西=3', albumFacets.find((f) => f.value === '范特西')?.count === 3);
  check('专辑 facet 未知=2', albumFacets.find((f) => f.value === '未知')?.count === 2);
  const artistFacets = (await j('GET', `${BASE}/facets?field=albumartist`)).data;
  check('专辑艺术家 facet 周杰伦=5', artistFacets.find((f) => f.value === '周杰伦')?.count === 5);

  const batch = await j('POST', `${BASE}/playlists/batch`, {
    field: 'albumartist', values: ['周杰伦', '林俊杰'], template: '{value}的歌',
  });
  check('批量创建 2 个歌单', batch.data.created?.length === 2, JSON.stringify(batch.data));
  const batch2 = await j('POST', `${BASE}/playlists/batch`, { field: 'album', values: ['范特西'] });
  check('按专辑创建 1 个', batch2.data.created?.length === 1);
  const batch3 = await j('POST', `${BASE}/playlists/batch`, {
    field: 'albumartist', values: ['周杰伦'], template: '{value}的歌',
  });
  check('重复批量创建被跳过', batch3.data.created?.length === 0 && batch3.data.skipped?.length === 1);

  console.log('\n[4] 歌单增删改');
  const playlists = (await j('GET', `${BASE}/playlists`)).data;
  check('共 3 个歌单(批量创建)', playlists.length === 3, `got ${playlists.length}`);
  const jj = playlists.find((p) => p.name === '周杰伦的歌');
  check('「周杰伦的歌」5 首', jj?.track_count === 5, `got ${jj?.track_count}`);
  const detail = (await j('GET', `${BASE}/playlists/${jj.id}`)).data;
  check('详情含曲目且排序正确', detail.tracks.length === 5 && detail.tracks[0].albumartist === '周杰伦');

  const manual = await j('POST', `${BASE}/playlists`, {
    name: '我的精选', trackIds: detail.tracks.slice(0, 2).map((t) => t.id),
  });
  check('手动建歌单带曲目', manual.status === 200 && manual.data.count === 2);
  const add = await j('POST', `${BASE}/playlists/${manual.data.id}/tracks`, { trackIds: [detail.tracks[2].id] });
  check('追加歌曲', add.status === 200 && add.data.added === 1);
  const rm = await j('DELETE', `${BASE}/playlists/${manual.data.id}/tracks/${detail.tracks[2].id}`);
  check('移除歌曲', rm.status === 200);
  const dupName = await j('POST', `${BASE}/playlists`, { name: '我的精选' });
  check('重名歌单返回 409', dupName.status === 409);

  console.log('\n[5] M3U8 导出');
  const exp = await fetch(`${BASE}/playlists/${jj.id}/export`);
  const text = await exp.text();
  check('导出以 #EXTM3U 开头', text.startsWith('#EXTM3U'));
  check('包含 5 个 EXTINF', (text.match(/#EXTINF/g) || []).length === 5);
  check('路径统一为正斜杠', !text.includes('\\'));

  console.log('\n[6] 同步目标');
  const targets = (await j('GET', `${BASE}/sync/targets`)).data;
  check('同步目标清单 9 个', targets.length === 9, `got ${targets.length}`);
  const noCfg = await j('POST', `${BASE}/sync/subsonic`);
  check('未配置时同步返回 400', noCfg.status === 400);
  const unimplemented = await j('POST', `${BASE}/sync/fnos`);
  check('飞牛音乐适配器返回 501(规划中)', unimplemented.status === 501);

  console.log('\n[7] Subsonic 同步(mock 端到端)');
  await j('PUT', `${BASE}/settings/targets`, {
    subsonic: { baseUrl: MOCK, username: 'admin', password: 'pass1234' },
  });
  const test = await j('POST', `${BASE}/sync/subsonic/test`);
  check('测试连接(token 鉴权)', test.status === 200 && test.data.ok === true, JSON.stringify(test.data));
  await j('PUT', `${BASE}/settings/targets`, {
    subsonic: { baseUrl: MOCK, username: 'admin', password: 'wrong-password' },
  });
  const badTest = await j('POST', `${BASE}/sync/subsonic/test`);
  check('错误密码被拒绝', badTest.status >= 400);
  await j('PUT', `${BASE}/settings/targets`, {
    subsonic: { baseUrl: MOCK, username: 'admin', password: 'pass1234' },
  });

  const sync1 = await j('POST', `${BASE}/sync/subsonic`);
  check('同步返回 4 个歌单报告', sync1.data.length === 4, JSON.stringify(sync1.data));
  const jjReport = sync1.data.find((r) => r.playlist === '周杰伦的歌');
  check('「周杰伦的歌」匹配 5/5', jjReport?.matched === 5 && jjReport?.total === 5, JSON.stringify(jjReport));
  const ftReport = sync1.data.find((r) => r.playlist === '范特西');
  check('「范特西」匹配 3/3', ftReport?.matched === 3, JSON.stringify(ftReport));
  check('无未匹配曲目', sync1.data.every((r) => r.unmatched.length === 0));
  const sync2 = await j('POST', `${BASE}/sync/subsonic`);
  check('二次同步全部为更新(幂等)', sync2.data.every((r) => r.created === false));
  const dump = await (await fetch(`${MOCK}/dump`)).json();
  const dumpPl = dump.playlists.find((p) => p.name === '周杰伦的歌');
  check('目标端「周杰伦的歌」收到 5 首歌', dumpPl?.songIds?.length === 5, JSON.stringify(dumpPl));

  console.log('\n[8] WebDAV 同步(不可达服务端的优雅失败)');
  await j('PUT', `${BASE}/settings/targets`, {
    subsonic: { baseUrl: MOCK, username: 'admin', password: 'pass1234' },
    webdav: { url: 'http://localhost:3999', directory: '/playlists' },
  });
  const wd = await j('POST', `${BASE}/sync/webdav`);
  check('不可达时按歌单返回错误而非崩溃',
    wd.status === 200 && wd.data.length === 4 && wd.data.every((r) => r.ok === false));

  console.log(`\n===== 结果: ${passed} 通过,${failures.length} 失败 =====`);
  if (failures.length) {
    console.error('失败项:', failures.join(' | '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('e2e 运行异常:', e);
  process.exit(1);
});
