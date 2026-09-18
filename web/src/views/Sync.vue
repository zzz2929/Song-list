<template>
  <div>
    <el-alert
      class="anim-in"
      type="info"
      :closable="false"
      style="margin-bottom: 16px"
      title="同步说明:以本地歌单为准推送到目标端。WebDAV 会把每个歌单写成 .m3u8 文件;Subsonic 会创建/更新同名歌单并自动匹配曲目。连接配置在「设置」页维护。"
    />

    <el-card v-for="t in activeTargets" :key="t.id" class="page-card anim-in" shadow="never">
      <template #header>
        <div class="card-head">
          <b>{{ t.name }}</b>
          <el-tag :type="configured(t.id) ? 'success' : 'info'" size="small">
            {{ configured(t.id) ? '已配置' : '未配置' }}
          </el-tag>
        </div>
      </template>
      <div class="muted" style="margin-bottom: 10px">{{ t.desc }}</div>
      <div v-if="configured(t.id)" class="cfg muted">{{ summary(t.id) }}</div>
      <div class="actions">
        <el-button type="primary" @click="goSettings">{{ configured(t.id) ? '修改配置' : '前往配置' }}</el-button>
        <el-button :disabled="!configured(t.id)" @click="test(t.id)">测试连接</el-button>
        <el-button type="success" :disabled="!configured(t.id)" :loading="syncing === t.id" @click="syncAll(t.id)">
          同步全部歌单
        </el-button>
      </div>
    </el-card>

    <el-card class="anim-in" shadow="never">
      <template #header><b>其他目标</b></template>
      <el-table :data="pendingTargets" size="small" empty-text="全部目标均已支持">
        <el-table-column prop="name" label="目标" width="200" />
        <el-table-column prop="desc" label="说明" min-width="300" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.id === 'audiobookshelf' ? 'info' : 'warning'">
              {{ row.id === 'audiobookshelf' ? '不适用' : '规划中' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="reportVisible" title="同步报告" width="680">
      <el-table :data="report" size="small" max-height="420">
        <el-table-column prop="playlist" label="歌单" min-width="140" />
        <el-table-column label="结果" width="150">
          <template #default="{ row }">
            <el-tag v-if="row.error" type="danger" size="small">失败</el-tag>
            <el-tag v-else type="success" size="small">
              成功{{ row.total != null ? ` ${row.matched}/${row.total}` : '' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="详情" min-width="240">
          <template #default="{ row }">
            <span v-if="row.error" class="muted">{{ row.error }}</span>
            <span v-else-if="row.file" class="muted">{{ row.file }}</span>
            <span v-else-if="row.unmatched && row.unmatched.length" class="muted">
              未匹配 {{ row.unmatched.length }} 首:
              {{ row.unmatched.slice(0, 3).map((u) => u.title).join('、') }}{{ row.unmatched.length > 3 ? '…' : '' }}
            </span>
            <span v-else class="muted">完成</span>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const router = useRouter();
const targets = ref([]);
const cfg = ref({});
const syncing = ref('');
const report = ref([]);
const reportVisible = ref(false);

const activeTargets = computed(() => targets.value.filter((t) => t.implemented));
const pendingTargets = computed(() => targets.value.filter((t) => !t.implemented));

function configured(id) {
  const c = cfg.value[id];
  return !!(c && (c.url || c.baseUrl));
}

function summary(id) {
  const c = cfg.value[id] || {};
  if (id === 'webdav') {
    return [c.url, c.directory ? `目录 ${c.directory}` : '', c.username].filter(Boolean).join(' · ');
  }
  return [c.baseUrl, c.username].filter(Boolean).join(' · ');
}

function goSettings() {
  router.push('/settings');
}

onMounted(async () => {
  try {
    targets.value = await api.get('/sync/targets');
    cfg.value = await api.get('/settings/targets');
  } catch (e) {
    ElMessage.error(e.message);
  }
});

async function test(id) {
  try {
    const r = await api.post(`/sync/${id}/test`);
    ElMessage.success(r.message || '连接成功');
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function syncAll(id) {
  syncing.value = id;
  try {
    report.value = await api.post(`/sync/${id}`);
    reportVisible.value = true;
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    syncing.value = '';
  }
}
</script>

<style scoped>
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cfg {
  padding: 8px 12px;
  background: var(--color-bg-inset);
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
}
.actions {
  display: flex;
  gap: 4px;
}
</style>
