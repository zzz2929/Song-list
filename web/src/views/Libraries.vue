<template>
  <div>
    <el-card key="add-lib" class="page-card anim-in" shadow="never">
      <template #header><b>添加音乐库</b></template>
      <el-form inline @submit.prevent="add">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="可选,默认取目录名" style="width: 180px" />
        </el-form-item>
        <el-form-item label="路径">
          <el-input v-model="form.path" placeholder="音乐文件夹路径,如 /music" style="width: 320px" @keyup.enter="add" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="adding" @click="add">添加</el-button>
          <el-button type="success" :disabled="scan.running" @click="scanNow">
            {{ scan.running ? '扫描中…' : '扫描全部音乐库' }}
          </el-button>
        </el-form-item>
      </el-form>
      <div class="muted">
        Docker 部署时请填写容器内路径(即 docker-compose.yml 中挂载的路径,如 /music);本地开发填本机绝对路径。
        支持 MP3 / FLAC / WAV / M4A / OGG / Opus / APE / DSF 等格式。
      </div>
    </el-card>

    <el-card v-if="scan.total || scan.running || scan.finishedAt" key="scan-progress" class="page-card anim-in" shadow="never">
      <template #header><b>扫描进度</b></template>
      <el-progress :percentage="percent" :status="scan.running ? undefined : 'success'" />
      <div class="muted" style="margin-top: 8px">
        已处理 {{ scan.done }}/{{ scan.total }} · 新增 {{ scan.added }} · 更新 {{ scan.updated }} · 移除 {{ scan.removed }}
      </div>
      <el-collapse v-if="scan.errors.length" style="margin-top: 8px">
        <el-collapse-item :title="`错误/警告 (${scan.errors.length})`">
          <div v-for="(e, i) in scan.errors" :key="i" class="muted error-line">{{ e }}</div>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <el-card key="lib-list" class="anim-in" shadow="never">
      <template #header><b>音乐库列表</b></template>
      <el-table :data="libs" v-loading="loading" empty-text="还没有音乐库,先添加一个吧">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="path" label="路径" min-width="260" show-overflow-tooltip />
        <el-table-column prop="track_count" label="歌曲数" width="90" />
        <el-table-column label="上次扫描" width="180">
          <template #default="{ row }">
            {{ row.last_scan_at ? new Date(row.last_scan_at).toLocaleString() : '未扫描' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api.js';
import { pageEnter } from '../composables/motion.js';

const libs = ref([]);
const loading = ref(false);
const adding = ref(false);
const form = ref({ name: '', path: '' });
const scan = ref({
  running: false, total: 0, done: 0, added: 0, updated: 0, removed: 0,
  errors: [], startedAt: null, finishedAt: null,
});
const percent = computed(() =>
  scan.value.total ? Math.round((scan.value.done / scan.value.total) * 100) : 0
);
let timer;

async function loadLibs() {
  loading.value = true;
  try {
    libs.value = await api.get('/libraries');
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}
async function loadScan() {
  try {
    scan.value = await api.get('/scan/status');
  } catch {
    // 忽略
  }
}
function reload() {
  return Promise.all([loadLibs(), loadScan()]);
}

async function add() {
  if (!form.value.path.trim()) return ElMessage.warning('请填写路径');
  adding.value = true;
  try {
    await api.post('/libraries', form.value);
    ElMessage.success('已添加,点击「扫描全部音乐库」开始读取');
    form.value = { name: '', path: '' };
    await loadLibs();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    adding.value = false;
  }
}

async function scanNow() {
  try {
    await api.post('/scan');
    ElMessage.success('扫描已开始');
    await loadScan();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(
      `删除音乐库「${row.name}」将同时移除其 ${row.track_count} 首歌曲记录(不会删除磁盘上的音乐文件),确定?`,
      '删除确认',
      { type: 'warning' }
    );
  } catch {
    return;
  }
  try {
    await api.del(`/libraries/${row.id}`);
    ElMessage.success('已删除');
    await loadLibs();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

onMounted(() => {
  reload();
  pageEnter();
  timer = setInterval(loadScan, 2000);
});
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.error-line {
  margin: 2px 0;
  word-break: break-all;
}
</style>
