<template>
  <div>
    <el-card class="page-card anim-in" shadow="never">
      <template #header><b>外观主题</b></template>
      <div class="theme-grid">
        <div
          v-for="t in themes"
          :key="t.id"
          class="theme-card"
          :class="{ active: t.id === current }"
          @click="pick(t)"
        >
          <div class="swatches">
            <span v-for="c in t.swatches" :key="c" class="swatch" :style="{ background: c }"></span>
          </div>
          <div class="theme-name">
            {{ t.name }}
            <el-icon v-if="t.id === current" class="check"><CircleCheckFilled /></el-icon>
          </div>
          <div class="theme-desc">
            {{ t.desc }}
            <el-tag size="small" :type="t.dark ? 'info' : 'warning'" effect="plain">{{ t.dark ? '暗色' : '浅色' }}</el-tag>
          </div>
        </div>
      </div>
      <div class="muted" style="margin-top: 10px">主题保存在当前浏览器,多设备可各自选择。</div>
    </el-card>

    <el-card class="page-card anim-in" shadow="never">
      <template #header><b>通用</b></template>
      <el-form label-width="120px" style="max-width: 480px">
        <el-form-item label="歌曲页每页条数">
          <el-select v-model="pageSize" style="width: 140px" @change="savePageSize">
            <el-option v-for="n in [20, 50, 100, 200]" :key="n" :label="`${n} 条`" :value="n" />
          </el-select>
          <span class="muted" style="margin-left: 10px">仅对当前浏览器生效</span>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="page-card anim-in" shadow="never">
      <template #header><b>同步目标配置</b></template>
      <div class="muted" style="margin-bottom: 16px">
        配置保存到服务器数据库;测试连接与同步操作在「同步导出」页进行。账号密码明文存于本地,请勿在公共网络环境使用。
      </div>

      <el-divider content-position="left">WebDAV(M3U8 文件推送)</el-divider>
      <el-form label-width="110px" style="max-width: 620px">
        <el-form-item label="WebDAV 地址">
          <el-input v-model="webdav.url" placeholder="http://192.168.1.10:5005" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="webdav.username" autocomplete="off" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="webdav.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="目标目录">
          <el-input v-model="webdav.directory" placeholder="/music/playlists" />
        </el-form-item>
        <el-form-item label="路径替换">
          <el-input v-model="webdav.pathFrom" placeholder="原前缀,如 /music" style="width: 210px" />
          <span style="margin: 0 6px">→</span>
          <el-input v-model="webdav.pathTo" placeholder="新前缀,如 /volume1/music" style="width: 210px" />
        </el-form-item>
      </el-form>

      <el-divider content-position="left">Subsonic / Navidrome</el-divider>
      <el-form label-width="110px" style="max-width: 620px">
        <el-form-item label="服务端地址">
          <el-input v-model="subsonic.baseUrl" placeholder="http://192.168.1.10:4533" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="subsonic.username" autocomplete="off" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="subsonic.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
      </el-form>

      <div style="margin-top: 8px">
        <el-button type="primary" @click="save">保存全部配置</el-button>
        <span class="muted" style="margin-left: 10px">保存后到「同步导出」页测试连接或同步</span>
      </div>
    </el-card>

    <el-card class="anim-in" shadow="never">
      <template #header><b>关于</b></template>
      <div class="about-line"><span class="about-label">应用</span>Song-list 歌单管理系统 v0.1</div>
      <div class="about-line"><span class="about-label">技术栈</span>Node.js · Express · SQLite(零原生依赖) · Vue 3 · Element Plus</div>
      <div class="about-line"><span class="about-label">数据位置</span>数据库与配置在 data/ 目录(容器内 /app/data),备份该目录即可</div>
      <div class="about-line"><span class="about-label">同步支持</span>M3U8 导出 · WebDAV · Subsonic/Navidrome(已实现) · 飞牛音乐(规划中)</div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api.js';
import { THEMES, applyTheme, currentTheme } from '../theme.js';

const themes = THEMES;
const current = ref(currentTheme());
const pageSize = ref(Number(localStorage.getItem('sl.pageSize')) || 50);
const webdav = ref({ url: '', username: '', password: '', directory: '', pathFrom: '', pathTo: '' });
const subsonic = ref({ baseUrl: '', username: '', password: '' });

function pick(t) {
  current.value = applyTheme(t.id).id;
}

function savePageSize() {
  localStorage.setItem('sl.pageSize', String(pageSize.value));
  ElMessage.success('已保存,下次进入歌曲页生效');
}

async function save() {
  try {
    await api.put('/settings/targets', { webdav: webdav.value, subsonic: subsonic.value });
    ElMessage.success('同步目标配置已保存');
  } catch (e) {
    ElMessage.error(e.message);
  }
}

onMounted(async () => {
  try {
    const cfg = await api.get('/settings/targets');
    webdav.value = { ...webdav.value, ...(cfg.webdav || {}) };
    subsonic.value = { ...subsonic.value, ...(cfg.subsonic || {}) };
  } catch (e) {
    ElMessage.error(e.message);
  }
});
</script>

<style scoped>
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.theme-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px;
  cursor: pointer;
  transition: border-color 0.18s ease, transform 0.12s ease;
}
.theme-card:hover {
  border-color: var(--color-primary);
}
.theme-card:active {
  transform: scale(0.98);
}
.theme-card.active {
  border-color: var(--color-primary);
  background: var(--color-primary-tint);
}
.swatches {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
}
.theme-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1);
  display: flex;
  align-items: center;
  gap: 6px;
}
.check {
  color: var(--color-primary);
}
.theme-desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-3);
  display: flex;
  align-items: center;
  gap: 8px;
}
.about-line {
  font-size: 13px;
  color: var(--color-text-2);
  padding: 4px 0;
}
.about-label {
  display: inline-block;
  width: 80px;
  color: var(--color-text-3);
}
</style>
