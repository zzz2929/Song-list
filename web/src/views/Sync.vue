<template>
  <el-alert
    class="anim-in"
    type="info"
    :closable="false"
    style="margin-bottom: 16px"
    title="同步说明:以本地歌单为准推送到目标端。WebDAV 会把每个歌单写成 .m3u8 文件;Subsonic 会创建/更新同名歌单并自动匹配曲目。配置保存在服务器本地,请勿在公共网络环境使用。"
  />

  <el-card class="page-card anim-in" shadow="never">
    <template #header><b>WebDAV(M3U8 文件推送)</b></template>
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
      <el-form-item>
        <el-button type="primary" @click="save">保存配置</el-button>
        <el-button @click="test('webdav')">测试连接</el-button>
        <el-button type="success" :loading="syncing === 'webdav'" @click="syncAll('webdav')">同步全部歌单</el-button>
      </el-form-item>
    </el-form>
    <div class="muted">
      适合群晖/威联通文件服务、Alist、坚果云等任意 WebDAV 服务。每个歌单生成一个 .m3u8 文件,播放器打开同目录即可看到歌单。
    </div>
  </el-card>

  <el-card class="page-card anim-in" shadow="never">
    <template #header><b>Subsonic / Navidrome</b></template>
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
      <el-form-item>
        <el-button type="primary" @click="save">保存配置</el-button>
        <el-button @click="test('subsonic')">测试连接</el-button>
        <el-button type="success" :loading="syncing === 'subsonic'" @click="syncAll('subsonic')">同步全部歌单</el-button>
      </el-form-item>
    </el-form>
    <div class="muted">
      兼容所有 Subsonic API 服务端(Navidrome、Gonic、Airsonic-Advanced 等)。同步时按「标题 + 歌手」自动匹配服务端曲目,未匹配的曲目会在报告中列出。
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
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api.js';
import { pageEnter } from '../composables/motion.js';

const webdav = ref({ url: '', username: '', password: '', directory: '', pathFrom: '', pathTo: '' });
const subsonic = ref({ baseUrl: '', username: '', password: '' });
const targets = ref([]);
const syncing = ref('');
const report = ref([]);
const reportVisible = ref(false);

const pendingTargets = computed(() => targets.value.filter((t) => !t.implemented));

onMounted(async () => {
  pageEnter();
  try {
    targets.value = await api.get('/sync/targets');
    const cfg = await api.get('/settings/targets');
    webdav.value = { ...webdav.value, ...(cfg.webdav || {}) };
    subsonic.value = { ...subsonic.value, ...(cfg.subsonic || {}) };
  } catch (e) {
    ElMessage.error(e.message);
  }
});

async function save() {
  try {
    await api.put('/settings/targets', { webdav: webdav.value, subsonic: subsonic.value });
    ElMessage.success('配置已保存');
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function test(id) {
  try {
    await save();
    const r = await api.post(`/sync/${id}/test`);
    ElMessage.success(r.message || '连接成功');
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function syncAll(id) {
  syncing.value = id;
  try {
    await save();
    report.value = await api.post(`/sync/${id}`);
    reportVisible.value = true;
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    syncing.value = '';
  }
}
</script>
