<template>
  <div>
  <el-row :gutter="16">
    <el-col :span="7">
      <el-card class="anim-in" shadow="never">
        <template #header>
          <div class="card-head">
            <b>歌单 ({{ playlists.length }})</b>
            <div>
              <el-button size="small" @click="createOne">新建</el-button>
              <el-button size="small" type="primary" @click="openBatch">批量创建</el-button>
            </div>
          </div>
        </template>
        <div v-loading="loading" style="min-height: 120px">
          <div
            v-for="p in playlists"
            :key="p.id"
            class="pl-item"
            :class="{ active: p.id === selectedId }"
            @click="select(p.id)"
          >
            <div class="pl-name">{{ p.name }}</div>
            <div class="muted">{{ p.track_count }} 首</div>
          </div>
          <el-empty v-if="!playlists.length && !loading" description="还没有歌单" :image-size="60" />
        </div>
      </el-card>
    </el-col>
    <el-col :span="17">
      <el-card v-if="detail" class="anim-in" shadow="never">
        <template #header>
          <div class="card-head">
            <b>{{ detail.name }}</b>
            <div>
              <el-button size="small" @click="rename">重命名</el-button>
              <el-button size="small" @click="exportM3U">导出 M3U8</el-button>
              <el-button size="small" type="danger" @click="removePl">删除</el-button>
            </div>
          </div>
        </template>
        <el-table :data="detail.tracks" v-loading="detailLoading" empty-text="歌单为空,可到「歌曲」页添加">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
          <el-table-column prop="artist" label="歌手" min-width="120" show-overflow-tooltip />
          <el-table-column prop="album" label="专辑" min-width="140" show-overflow-tooltip />
          <el-table-column label="时长" width="70">
            <template #default="{ row }">{{ fmtDuration(row.duration) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="{ row }">
              <el-button link type="danger" @click="removeTrack(row)">移除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
      <el-card v-else class="anim-in" shadow="never">
        <el-empty description="选择左侧歌单查看详情" />
      </el-card>
    </el-col>
  </el-row>

  <el-dialog v-model="batchVisible" title="批量创建歌单" width="680">
    <el-form label-width="90px">
      <el-form-item label="按维度">
        <el-radio-group v-model="batchField" @change="loadFacets">
          <el-radio-button value="album">专辑</el-radio-button>
          <el-radio-button value="albumartist">专辑艺术家</el-radio-button>
          <el-radio-button value="artist">演唱者</el-radio-button>
          <el-radio-button value="genre">流派</el-radio-button>
          <el-radio-button value="year">年份</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="命名模板">
        <el-input v-model="batchTemplate" style="width: 240px" placeholder="{value}" />
        <span class="muted" style="margin-left: 8px">{value} 会替换为所选的值</span>
      </el-form-item>
      <el-form-item label="筛选">
        <el-input v-model="facetFilter" clearable placeholder="输入关键字过滤" style="width: 240px" />
        <span class="muted" style="margin-left: 8px">已选 {{ selectedFacets.length }} 项</span>
      </el-form-item>
    </el-form>
    <el-table
      ref="facetTable"
      :data="filteredFacets"
      v-loading="facetLoading"
      height="320"
      @selection-change="onFacetSelect"
      empty-text="没有数据,请先到「音乐库」页扫描"
    >
      <el-table-column type="selection" width="46" />
      <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
      <el-table-column prop="count" label="歌曲数" width="90" />
    </el-table>
    <template #footer>
      <el-button @click="batchVisible = false">取消</el-button>
      <el-button type="primary" :loading="batchCreating" :disabled="!selectedFacets.length" @click="doBatch">
        创建 {{ selectedFacets.length }} 个歌单
      </el-button>
    </template>
  </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, fmtDuration } from '../api.js';

const playlists = ref([]);
const loading = ref(false);
const selectedId = ref(null);
const detail = ref(null);
const detailLoading = ref(false);

const batchVisible = ref(false);
const batchField = ref('album');
const facets = ref([]);
const facetLoading = ref(false);
const facetFilter = ref('');
const selectedFacets = ref([]);
const batchTemplate = ref('{value}');
const batchCreating = ref(false);
const facetTable = ref(null);

const filteredFacets = computed(() => {
  const kw = facetFilter.value.trim();
  return kw ? facets.value.filter((f) => f.value.includes(kw)) : facets.value;
});

async function loadList() {
  loading.value = true;
  try {
    playlists.value = await api.get('/playlists');
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}

async function select(id) {
  selectedId.value = id;
  detailLoading.value = true;
  try {
    detail.value = await api.get(`/playlists/${id}`);
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    detailLoading.value = false;
  }
}

async function createOne() {
  let name;
  try {
    ({ value: name } = await ElMessageBox.prompt('歌单名称', '新建歌单', {
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
    }));
  } catch {
    return;
  }
  try {
    const res = await api.post('/playlists', { name: name.trim() });
    ElMessage.success('已创建');
    await loadList();
    await select(res.id);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function rename() {
  let name;
  try {
    ({ value: name } = await ElMessageBox.prompt('新的歌单名称', '重命名', {
      inputValue: detail.value.name,
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
    }));
  } catch {
    return;
  }
  try {
    await api.patch(`/playlists/${detail.value.id}`, { name: name.trim() });
    ElMessage.success('已重命名');
    await loadList();
    await select(detail.value.id);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function exportM3U() {
  window.open(`/api/playlists/${detail.value.id}/export`);
}

async function removePl() {
  try {
    await ElMessageBox.confirm(`确定删除歌单「${detail.value.name}」?`, '删除确认', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await api.del(`/playlists/${detail.value.id}`);
    ElMessage.success('已删除');
    detail.value = null;
    selectedId.value = null;
    await loadList();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function removeTrack(row) {
  try {
    await api.del(`/playlists/${detail.value.id}/tracks/${row.id}`);
    await Promise.all([loadList(), select(detail.value.id)]);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function openBatch() {
  batchVisible.value = true;
  loadFacets();
}

async function loadFacets() {
  facetLoading.value = true;
  try {
    facets.value = await api.get(`/facets?field=${batchField.value}`);
    selectedFacets.value = [];
    await nextTick();
    facetTable.value?.clearSelection();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    facetLoading.value = false;
  }
}

function onFacetSelect(rows) {
  selectedFacets.value = rows;
}

async function doBatch() {
  if (!selectedFacets.value.length) return;
  batchCreating.value = true;
  try {
    const res = await api.post('/playlists/batch', {
      field: batchField.value,
      values: selectedFacets.value.map((f) => f.value),
      template: batchTemplate.value || '{value}',
    });
    let msg = `成功创建 ${res.created.length} 个歌单`;
    if (res.skipped.length) msg += `,跳过已存在 ${res.skipped.length} 个: ${res.skipped.join('、')}`;
    const totalTracks = res.created.reduce((s, c) => s + c.count, 0);
    if (totalTracks) msg += `,共收录 ${totalTracks} 首歌曲`;
    await ElMessageBox.alert(msg, '批量创建完成', { confirmButtonText: '好的' });
    batchVisible.value = false;
    await loadList();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    batchCreating.value = false;
  }
}

onMounted(() => {
  loadList();
  pageEnter();
});
</script>

<style scoped>
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pl-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background-color 0.18s ease, transform 0.12s ease;
}
.pl-item:active {
  transform: scale(0.98);
}
@media (prefers-reduced-motion: no-preference) {
  .pl-item {
    animation: rise-in 0.28s ease both;
  }
  .pl-item:nth-child(2) { animation-delay: 0.04s; }
  .pl-item:nth-child(3) { animation-delay: 0.08s; }
  .pl-item:nth-child(4) { animation-delay: 0.12s; }
  .pl-item:nth-child(5) { animation-delay: 0.16s; }
  .pl-item:nth-child(6) { animation-delay: 0.2s; }
  .pl-item:nth-child(n + 7) { animation-delay: 0.24s; }
}
.pl-item:hover {
  background: var(--color-bg-hover);
}
.pl-item.active {
  background: var(--color-primary-tint);
}
.pl-item.active .pl-name {
  color: var(--color-primary);
}
.pl-name {
  font-size: 14px;
  color: var(--color-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
