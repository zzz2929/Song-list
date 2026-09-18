import * as webdav from './webdav.js';
import * as subsonic from './subsonic.js';
import * as fnos from './fnos.js';

// 同步目标注册表。implemented=true 的目标可直接使用;
// 其余为目标清单占位,逐期实现,详见 docs/DESIGN.md。
export const TARGETS = {
  webdav: {
    name: 'WebDAV (M3U8 文件)',
    implemented: true,
    adapter: webdav,
    desc: '把歌单写成 M3U8 文件推送到任意 WebDAV 目录,几乎所有播放器都能识别,通用性最强',
  },
  subsonic: {
    name: 'Subsonic / Navidrome',
    implemented: true,
    adapter: subsonic,
    desc: '通过 Subsonic API 同步并按标题/歌手自动匹配曲目,兼容 Navidrome、Gonic、Airsonic 等',
  },
  fnos: {
    name: '飞牛音乐',
    implemented: false,
    adapter: fnos,
    desc: '官方未开放音乐 API,将基于飞牛音乐客户端内部接口(Cookie 认证)实现,二期交付',
  },
  jellyfin: {
    name: 'Jellyfin',
    implemented: false,
    adapter: null,
    desc: '官方 REST API,规划中',
  },
  emby: {
    name: 'Emby',
    implemented: false,
    adapter: null,
    desc: '官方 REST API,规划中',
  },
  plex: {
    name: 'Plex',
    implemented: false,
    adapter: null,
    desc: 'X-Plex-Token 鉴权,规划中',
  },
  audiostation: {
    name: '群晖 Audio Station',
    implemented: false,
    adapter: null,
    desc: 'Synology WebAPI 有社区文档,规划中',
  },
  daoliyu: {
    name: '带鱼音乐 (DaoLiYu)',
    implemented: false,
    adapter: null,
    desc: '协议待确认;若兼容 Subsonic 可直接复用现有适配器',
  },
  audiobookshelf: {
    name: 'Audiobookshelf',
    implemented: false,
    adapter: null,
    desc: '定位为有声书/播客服务,无音乐歌单概念,暂不支持',
  },
};

export function getAdapter(id) {
  const t = TARGETS[id];
  if (!t) return null;
  return t.implemented ? t.adapter : null;
}
