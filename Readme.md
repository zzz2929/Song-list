# Song-list · 歌单管理系统

为 NAS(尤其是飞牛 fnOS)打造的自托管歌单管理工具:扫描你的音乐库、读取歌曲元数据,按专辑 / 专辑艺术家 / 演唱者等维度**批量创建歌单**,并把歌单**同步**到飞牛音乐、Navidrome、WebDAV 等目标。

- 技术栈:Node.js 20+ / Express / SQLite(Node 内置,零原生依赖) + Vue 3 / Element Plus
- 部署形态:Docker 单容器,Web 界面操作
- 设计文档(含各同步目标的可行性分析):[docs/DESIGN.md](docs/DESIGN.md)

## 当前功能

| 模块 | 说明 |
| --- | --- |
| 音乐库 | 多目录管理、增量扫描(按文件 mtime+size 跳过未变更)、NAS 回收站目录自动跳过 |
| 元数据 | 读取标题/歌手/专辑/专辑艺术家/流派/年份/音轨号/时长/编码格式;无标签时按「歌手 - 标题.mp3」文件名兜底解析 |
| 批量建歌单 | 按专辑、专辑艺术家、演唱者、流派、年份五个维度勾选批量创建,支持命名模板 `{value}` |
| 歌单管理 | 新建/重命名/删除/追加/移除/导出 |
| 导出与同步 | M3U8 导出下载;WebDAV 推送 M3U8;Subsonic API 同步(兼容 Navidrome/Gonic/Airsonic,自动按标题+歌手匹配曲目并生成匹配报告) |
| 设置 | 主题切换(深夜录音棚 / Midnight Galaxy / Tech Innovation / 黑胶暖调,存本机)、歌曲页默认分页、同步目标连接配置 |
| 规划中 | 飞牛音乐(二期)、Jellyfin、Emby、Plex、群晖 Audio Station、带鱼音乐 |

## 快速开始(Docker,推荐在飞牛上使用)

```bash
# 1. 把整个项目上传到 NAS(如 /vol1/apps/song-list),进入目录
# 2. 编辑 docker-compose.yml,把音乐目录挂载改成你的实际路径
# 3. 启动
docker compose up -d --build
```

打开 `http://NAS的IP:8866`:

1. 「音乐库」页 → 添加音乐库,路径填**容器内路径**(如 `/music`)→ 点「扫描全部音乐库」
2. 「歌单」页 → 「批量创建」→ 选维度、勾选、定命名模板 → 一键生成全部歌单
3. 「同步导出」页 → 配置 WebDAV / Subsonic 目标 → 测试连接 → 同步全部歌单

> 在飞牛上:fnOS 的 Docker 应用支持从项目目录创建 Compose;音乐目录通常在 `/vol1/1000/media/Music` 之类位置,挂载后在界面里填 `/music` 即可。

## 本地开发

```bash
npm --prefix server install
npm --prefix web install
npm --prefix web run build     # 构建前端到 server/static
npm --prefix server start      # http://localhost:8866
```

前端热更新开发:`npm --prefix web run dev`(5173 端口,API 自动代理到 8866)。

### 测试

```bash
npm --prefix server run fixtures      # 生成测试音乐库(需要 ffmpeg,仅开发用)
npm --prefix server run mock-subsonic # 启动 Subsonic 模拟服务(3902)
npm --prefix server start             # 启动服务(8866)
npm --prefix server run e2e           # 运行 39 项端到端断言
```

## 数据与安全

- 数据库与同步配置都在 `data/`(容器内 `/app/data`),备份该目录即可
- 同步目标的账号密码明文存于本地 SQLite,仅供家庭内网使用;请勿暴露到公网(如需,建议加反向代理 + 认证)
- 所有操作只写数据库/歌单文件,不修改、不删除你的音乐文件

## 已知限制

- GBK 编码的老式 ID3v1/ID3v2 标签可能显示乱码(建议用 [Music Tag Web](https://github.com/xhongc/music-tag-web) 等工具把标签刷成 UTF-8;容错方案在规划中)
- 同步到流媒体平台(网易云/QQ 音乐等)需要做曲目模糊匹配,暂未纳入计划
- 同步语义为单向推送(本地 → 目标),不做双向同步

## 路线图

1. ✅ 一期:扫描 + 元数据 + 批量建歌单 + M3U8 / WebDAV / Subsonic 同步
2. ⬜ 二期:飞牛音乐适配器(官方未开放音乐 API,将基于飞牛音乐客户端接口实现,参考 [FeiNiuMusic](https://github.com/kuilei0926/FeiNiuMusic) 的 Cookie 认证方案)
3. ⬜ 三期:Jellyfin / Emby / Plex / Audio Station
4. ⬜ 打包 `.fpk` 上架飞牛第三方应用商店
