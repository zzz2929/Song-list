// 飞牛音乐适配器(预留)。
// 官方未开放音乐/歌单 API(developer.fnnas.com 第一期仅覆盖文件授权等基础能力),
// 需要基于飞牛音乐客户端的内部接口(Cookie 认证)实现。
// 参考: github.com/kuilei0926/FeiNiuMusic 已验证该路线,含登录/歌曲/专辑/歌手/歌单接口。
// 计划于二期实现,需要一台真实 fnOS 设备抓包确认接口与鉴权细节。

const NOT_IMPLEMENTED =
  '飞牛音乐适配器将在下一版本实现: 官方未开放音乐 API,需在真实 fnOS 设备上' +
  '抓包确认内部接口(Cookie 认证,参考开源项目 FeiNiuMusic),随后开放';

export async function testConnection() {
  throw new Error(NOT_IMPLEMENTED);
}

export async function syncPlaylists() {
  throw new Error(NOT_IMPLEMENTED);
}
