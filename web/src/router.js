import { createRouter, createWebHashHistory } from 'vue-router';
import Libraries from './views/Libraries.vue';
import Tracks from './views/Tracks.vue';
import Playlists from './views/Playlists.vue';
import Sync from './views/Sync.vue';

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/libraries' },
    { path: '/libraries', component: Libraries, meta: { title: '音乐库' } },
    { path: '/tracks', component: Tracks, meta: { title: '歌曲' } },
    { path: '/playlists', component: Playlists, meta: { title: '歌单' } },
    { path: '/sync', component: Sync, meta: { title: '同步导出' } },
  ],
});
