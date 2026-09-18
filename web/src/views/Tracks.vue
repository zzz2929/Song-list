<template>
  <el-card class="anim-in" shadow="never">
    <div style="margin-bottom: 12px; display: flex; gap: 12px; align-items: center">
      <el-input v-model="q" placeholder="搜索标题 / 歌手 / 专辑 / 文件名" clearable style="width: 320px" :prefix-icon="Search" />
      <span class="muted">共 {{ total }} 首</span>
    </div>
    <el-table :data="rows" v-loading="loading" empty-text="暂无歌曲,先到「音乐库」添加并扫描">
      <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
      <el-table-column prop="artist" label="歌手" min-width="120" show-overflow-tooltip />
      <el-table-column prop="album" label="专辑" min-width="140" show-overflow-tooltip />
      <el-table-column prop="albumartist" label="专辑艺术家" min-width="120" show-overflow-tooltip />
      <el-table-column prop="genre" label="流派" min-width="90" show-overflow-tooltip />
      <el-table-column prop="year" label="年份" width="70" />
      <el-table-column label="时长" width="70">
        <template #default="{ row }">{{ fmtDuration(row.duration) }}</template>
      </el-table-column>
      <el-table-column prop="ext" label="格式" width="70" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button link type="primary" @click="openAdd(row)">加入歌单</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      style="margin-top: 12px; justify-content: flex-end"
      layout="total, prev, pager, next, sizes"
      :total="total"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :page-sizes="[20, 50, 100, 200]"
      @current-change="load"
      @size-change="load"
    />
  </el-card>

  <el-dialog v-model="addVisible" title="加入歌单" width="420">
    <el-select v-model="targetPid" placeholder="选择歌单" style="width: 100%">
      <el-option v-for="p in playlists" :key="p.id" :label="`${p.name} (${p.track_count})`" :value="p.id" />
    </el-select>
    <template #footer>
      <el-button @click="addVisible = false">取消</el-button>
      <el-button type="primary" @click="doAdd">添加</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { api, fmtDuration } from '../api.js';
import { pageEnter } from '../composables/motion.js';

const q = ref('');
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(50);
const loading = ref(false);
const playlists = ref([]);
const addVisible = ref(false);
const targetPid = ref(null);
const current = ref(null);
let timer;

async function load() {
  loading.value = true;
  try {
    const data = await api.get(
      `/tracks?q=${encodeURIComponent(q.value)}&page=${page.value}&pageSize=${pageSize.value}`
    );
    rows.value = data.rows;
    total.value = data.total;
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}

watch(q, () => {
  page.value = 1;
  clearTimeout(timer);
  timer = setTimeout(load, 300);
});

async function loadPlaylists() {
  try {
    playlists.value = await api.get('/playlists');
  } catch {
    // 忽略
  }
}

function openAdd(row) {
  current.value = row;
  targetPid.value = null;
  loadPlaylists();
  addVisible.value = true;
}

async function doAdd() {
  if (!targetPid.value) return ElMessage.warning('请选择歌单');
  try {
    await api.post(`/playlists/${targetPid.value}/tracks`, { trackIds: [current.value.id] });
    const name = playlists.value.find((p) => p.id === targetPid.value)?.name;
    ElMessage.success(`已加入「${name}」`);
    addVisible.value = false;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

onMounted(() => {
  load();
  pageEnter();
});
</script>
