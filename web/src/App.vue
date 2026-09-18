<template>
  <el-container class="layout">
    <el-aside width="210px" class="aside">
      <div class="logo">
        <div class="logo-mark">♪</div>
        <span class="logo-text">歌单管理</span>
      </div>
      <el-menu :default-active="$route.path" router>
        <el-menu-item index="/libraries">
          <el-icon><FolderOpened /></el-icon><span>音乐库</span>
        </el-menu-item>
        <el-menu-item index="/tracks">
          <el-icon><Headset /></el-icon><span>歌曲</span>
        </el-menu-item>
        <el-menu-item index="/playlists">
          <el-icon><List /></el-icon><span>歌单</span>
        </el-menu-item>
        <el-menu-item index="/sync">
          <el-icon><Upload /></el-icon><span>同步导出</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon><span>设置</span>
        </el-menu-item>
      </el-menu>
      <div class="aside-foot">
        <span class="dot" :class="{ pulse: scanHint }"></span>{{ statsText }}
      </div>
    </el-aside>
    <el-container>
      <el-header class="header">
        <h1 class="title">{{ $route.meta.title }}</h1>
        <el-tag v-if="scanHint" type="warning" size="small" effect="dark">扫描中…</el-tag>
      </el-header>
      <el-main>
        <router-view :key="$route.path" />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { api } from './api.js';

const statsText = ref('');
const scanHint = ref(false);
let timer;

async function load() {
  try {
    const [stats, scan] = await Promise.all([api.get('/stats'), api.get('/scan/status')]);
    statsText.value = `${stats.tracks} 首歌曲 · ${stats.playlists} 个歌单`;
    scanHint.value = !!scan.running;
  } catch {
    // 服务未就绪时静默
  }
}

onMounted(() => {
  load();
  timer = setInterval(load, 3000);
});
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.layout {
  height: 100%;
}
.aside {
  background: var(--color-bg-sidebar);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border-subtle);
}
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 20px 18px;
}
.logo-mark {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--color-primary-hover), var(--color-primary-active));
  color: var(--color-on-primary);
  font-size: 17px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 14px var(--glow-color);
}
.logo-text {
  color: var(--color-text-1);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.aside :deep(.el-menu) {
  flex: 1;
  background-color: transparent;
}
.aside-foot {
  color: var(--color-text-3);
  font-size: 12px;
  padding: 16px 22px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
  flex-shrink: 0;
}
.dot.pulse {
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 var(--color-primary-tint); }
  50% { opacity: 0.5; box-shadow: 0 0 0 5px transparent; }
}
.header {
  background: var(--color-bg-page);
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1);
}
</style>
