<template>
  <div class="connect-box">
    <a-statistic title="当前链接数量" :value="connectCount" :value-from="0" animation>
      <template #suffix>
        <icon-thunderbolt />
      </template>
    </a-statistic>
    <div class="connect-actions" style="margin-top: 20px;">
      <a-button type="primary" @click="fetchConnectStatus" :loading="connectLoading">
        <template #icon><icon-refresh /></template>
        刷新状态
      </a-button>
    </div>
    <div v-if="connectResult" class="result-panel" style="margin-top: 20px;">
      <pre>{{ connectResult }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { loginApi } from '@/api/modules/im';
import { Message } from '@arco-design/web-vue';
import { IconRefresh, IconThunderbolt } from '@arco-design/web-vue/es/icon';

const connectCount = ref(0);
const connectLoading = ref(false);
const connectResult = ref('');

const fetchConnectStatus = async () => {
  connectLoading.value = true;
  try {
    const res: any = await loginApi.getIWXConnect();
    connectCount.value = res?.Count || 0;
    connectResult.value = JSON.stringify(res, null, 2);
  } catch (err: any) {
    Message.error('获取链接状态失败');
    connectResult.value = `Error: ${err.message || err}`;
  } finally {
    connectLoading.value = false;
  }
};

onMounted(() => {
  fetchConnectStatus();
});
</script>

<style scoped>
.connect-box { padding: 30px 20px; text-align: center; }
.result-panel { background: #1a1a1a; padding: 12px; border-radius: 4px; border: 1px solid #333; text-align: left; max-height: 200px; overflow-y: auto; }
.result-panel pre { margin: 0; font-size: 12px; color: #07c160; white-space: pre-wrap; word-break: break-all; }

/* Sleek custom scrollbars for result-panel */
.result-panel::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.result-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
}
.result-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
.result-panel::-webkit-scrollbar-track {
  background: transparent;
}
</style>
