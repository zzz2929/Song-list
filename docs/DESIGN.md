# 设计文档

## 1. 目标与范围

在飞牛 fnOS(NAS)上以 Docker 方式运行的自托管歌单管理系统:

1. 读取用户自定义音乐库(任意目录,可多库);
2. 读取音频文件元数据(标签、时长、格式等);
3. 按专辑名 / 专辑艺术家(album artist)/ 演唱者等维度批量创建歌单;
4. 将歌单同步到飞牛音乐及其他音乐平台。

一期交付 1–3 与通用同步能力(M3U8 / WebDAV / Subsonic);飞牛音乐适配器为二期攻坚点(官方 API 未开放,详见 §6)。

## 2. 总体架构

```
┌────────────────────────── Docker 容器 ──────────────────────────┐
│                                                                  │
│  Vue3 + Element Plus SPA (server/static)                         │
│        │  fetch /api/*                                           │
│        ▼                                                         │
│  Express API                                                     │
│    ├─ 音乐库管理 /libraries                                       │
│    ├─ 扫描调度 /scan (后台任务 + 轮询状态)                          │
│    ├─ 歌曲/分面 /tracks /facets                                   │
│    ├─ 歌单 /playlists (含批量创建、M3U8 导出)                      │
│    └─ 同步 /sync/:target → 适配器注册表 sync/index.js              │
│              ├─ webdav.js   (M3U8 文件推送)                       │
│              ├─ subsonic.js (Subsonic API + 曲目匹配)             │
│              └─ fnos.js     (二期预留,501)                        │
│        ▼                                                         │
│  SQLite (node:sqlite 内置模块,数据目录 /app/data)                  │
│        libraries / tracks / playlists / playlist_tracks / settings│
└──────────────────────────────────────────────────────────────────┘
```

要点:

- **零原生依赖**:SQLite 使用 Node 22 内置的 `node:sqlite`,无需 node-gyp,Docker 镜像可直接跑 x86_64 与 ARM64(飞牛两类机型都有)。
- **适配器模式**:每个同步目标实现统一接口 `testConnection(cfg)` / `syncPlaylists(cfg, playlists, log)`,注册于 `sync/index.js`;前端据此渲染目标清单,未实现目标自动进入"规划中"列表。
- **单向同步语义**:以本地歌单为基准推送到目标端。Subsonic 端同名歌单内容整体替换(幂等,可重复执行);WebDAV 端按歌单名写 `.m3u8`(覆盖)。

## 3. 数据模型

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| libraries | path(唯一)、last_scan_at | 音乐库目录 |
| tracks | path(唯一)、title/artist/album/albumartist/genre/year/track_no/disc_no/duration/bitrate/codec、*_norm | 元数据与匹配用归一化列;mtime_ms+file_size 用于增量扫描 |
| playlists | name(唯一)、description | 歌单 |
| playlist_tracks | (playlist_id, track_id) 主键、position | 有序曲目关联 |
| settings | key/value(JSON) | 同步目标连接配置 |

## 4. 扫描器

- 递归遍历,扩展名白名单:mp3/flac/wav/aiff/m4a/aac/ogg/oga/opus/ape/wv/dsf/dff/wma/mka/mpc;跳过 `.` 开头目录与 `#recycle`、`$RECYCLE.BIN`、`@eadir` 等 NAS 常见目录。
- 元数据解析用 `music-metadata`;解析失败不中断,降级为文件名推断(`歌手 - 标题`、`01 标题` 等模式)。
- 并发 4,实时进度(总数/已处理/新增/更新/移除/错误列表)供前端轮询。
- 增量:mtime+size 未变直接跳过;已消失文件删除记录(仅数据库,不动磁盘文件)。

## 5. 批量建歌单

维度:album / albumartist / artist / genre / year,统一用 SQL 表达式把空值归并为「未知」参与分面统计与筛选。用户在分面列表勾选 + 命名模板(默认 `{value}`)→ 单事务批量创建同名冲突跳过并汇报。

## 6. 同步目标矩阵

| 目标 | 实现方式 | 鉴权 | 状态 |
| --- | --- | --- | --- |
| M3U8 导出 | 本地下载 `.m3u8`,支持路径前缀替换 | - | ✅ 一期 |
| WebDAV | `webdav` 客户端把每个歌单写成 `<目录>/<歌单名>.m3u8` | 用户名密码 | ✅ 一期 |
| Navidrome / Subsonic 系 | Subsonic API:`ping`/`getPlaylists`/`search3`/`createPlaylist`;token = md5(password+salt) | 用户名密码 | ✅ 一期 |
| 飞牛音乐 | 官方未开放音乐 API(developer.fnnas.com 一期仅文件授权/路由等基础能力);需基于飞牛音乐客户端内部接口(Cookie 认证)实现,社区项目 [FeiNiuMusic](https://github.com/kuilei0926/FeiNiuMusic) 已验证可行性(登录/歌曲/专辑/歌手/歌单接口) | Cookie | ⬜ 二期(需真机抓包) |
| Jellyfin / Emby | 官方 REST API,创建歌单 + 按 ItemId 追加;曲目匹配同 §7 | API Key / 用户密码 | ⬜ 三期 |
| Plex | REST + X-Plex-Token | Token | ⬜ 三期 |
| 群晖 Audio Station | Synology WebAPI(webapi/AudioStation),社区文档充分 | sid 会话 | ⬜ 三期 |
| 带鱼音乐 (DaoLiYu) | 飞牛应用商店内的中文音乐应用,协议未公开;若兼容 Subsonic 则直接复用现有适配器 | 待确认 | ⬜ 待确认 |
| Audiobookshelf | 定位为有声书/播客服务,无音乐歌单概念 | - | 不支持 |

## 7. 曲目匹配策略(Subsonic)

1. 归一化:NFKC + 小写 + 去空白/标点(`norm()`),中英文通用。
2. `search3` 以标题(必要时 标题+歌手)查询,候选打分:标题归一化相等为硬前提(+4);歌手或专辑艺术家相等 +2;专辑相等 +1;低于阈值视为未匹配。
3. 报告逐歌单输出 `matched/total` 与未匹配清单,便于人工核对。
4. 同库场景(Navidrome 扫的也是同一批文件)匹配率接近 100%;跨平台场景(流媒体)需要更复杂的模糊匹配,不在当前范围。

## 8. 关键风险与对策

| 风险 | 对策 |
| --- | --- |
| 飞牛音乐内部接口随 fnOS 升级变动 | 适配器隔离在单一模块,失效只影响该目标;M3U8/WebDAV 通道永可用 |
| 同步凭据明文存储 | 界面提示 + README 声明仅限内网;后续可加主密码加密 |
| GBK 老标签乱码 | 文件名兜底解析;规划编码探测修复(mojibake 反解) |
| 大库扫描性能 | 增量扫描 + 并发 4 + WAL;十万级文件预计分钟级 |

## 9. 验证

`server/scripts/e2e.mjs`:39 项断言覆盖 建库/扫描/中文标签/文件名兜底/分面/批量创建/歌单增删改/M3U8 导出/同步目标守卫/Subsonic 真实 token 鉴权同步(含幂等二次同步与目标端数据核对)/WebDAV 优雅失败/飞牛 501。配套 `make-fixtures.mjs`(ffmpeg 生成带中文 ID3v2.3 标签的静音 MP3)与 `mock-subsonic.mjs`(带 token 校验的 Subsonic 模拟端)。
