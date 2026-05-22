<template>
  <div class="a16-login-box">
    <a-form :model="extractForm" layout="vertical" @submit="handleExtract62">
      <a-form-item field="License" label="授权码 (License)" required>
        <a-input v-model="extractForm.License" placeholder="请输入授权码" />
        <template #extra v-if="accountStore.accounts.length > 0">
          <div style="margin-top: 8px;">
            <span style="color: #86909c; font-size: 12px; margin-right: 8px;">快速选择在线账号:</span>
            <a-space wrap>
              <a-tag 
                v-for="acc in accountStore.accounts.filter(a => a.status === 'online' && a.sessionKey)" 
                :key="acc.uuid" 
                color="arcoblue" 
                style="cursor: pointer;"
                @click="handleSelectOnlineAccount(acc.sessionKey)"
              >
                {{ acc.nickname }}
              </a-tag>
            </a-space>
          </div>
        </template>
      </a-form-item>
      <a-button type="primary" html-type="submit" :loading="extractLoading" long>
        开始提取并保存
      </a-button>
    </a-form>
    
    <div v-if="extractedData" class="result-panel" style="margin-top: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="color: #07c160; font-weight: bold; font-size: 12px;">提取成功（已自动保存到浏览器）：</span>
        <a-link size="mini" @click="copyExtractedData">
          <template #icon><icon-copy /></template>
          复制数据
        </a-link>
      </div>
      <pre style="max-height: 120px; overflow-y: auto; font-size: 12px; word-break: break-all; white-space: pre-wrap;">{{ extractedData }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { useAccountStore } from '@/store/account';
import { loginApi } from '@/api/modules/im';
import { Message } from '@arco-design/web-vue';
import { IconCopy } from '@arco-design/web-vue/es/icon';
import { copyToClipboard } from '@/utils/clipboard';
import { saveWx62Binding } from '@/utils/wx62';

const props = defineProps({
  assignedKey: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:assignedKey']);

const extractLoading = ref(false);
const extractedData = ref('');
const extractForm = reactive({
  License: props.assignedKey || ''
});

const accountStore = useAccountStore();

watch(() => props.assignedKey, (newVal) => {
  extractForm.License = newVal || '';
});

const handleSelectOnlineAccount = (key: string) => {
  extractForm.License = key;
  emit('update:assignedKey', key);
};

const handleExtract62 = async () => {
  if (!extractForm.License) return Message.warning('请输入或选择授权码');
  extractLoading.value = true;
  extractedData.value = '';
  try {
    Message.info('开始提取62数据...');
    const res: any = await loginApi.get62Data(extractForm.License);
    console.log('[Login:Get62Data]', res);
    
    // 兼容解析 data/Data 字段并保存
    let dataVal = '';
    if (res) {
      if (typeof res === 'string') {
        dataVal = res;
      } else if (typeof res === 'object') {
        dataVal = res.Data || res.data || '';
        if (dataVal && typeof dataVal === 'object') {
          dataVal = dataVal.data || dataVal.Data || JSON.stringify(dataVal);
        } else if (!dataVal) {
          dataVal = JSON.stringify(res);
        }
      }
    }

    if (dataVal) {
      extractedData.value = dataVal;
      
      // 账户隔离保存
      localStorage.setItem(`wx_62_data_${extractForm.License}`, dataVal);
      localStorage.setItem('wx_62_data', dataVal); // 备份通用
      
      const matchedAcc = accountStore.accounts.find(a => a.sessionKey === extractForm.License);
      if (matchedAcc && matchedAcc.uuid) {
        localStorage.setItem(`wx_62_data_${matchedAcc.uuid}`, dataVal);
        if (matchedAcc.alias) {
          localStorage.setItem(`wx_62_data_${matchedAcc.alias}`, dataVal);
        }
        // 保存绑定关系！优先使用 alias
        saveWx62Binding(matchedAcc.alias || matchedAcc.uuid, matchedAcc.sessionKey, dataVal, matchedAcc.nickname);
      }
      
      Message.success('62数据提取成功，已按账号隔离保存至本地');
    } else {
      Message.warning('提取成功，但数据为空');
    }
  } catch (err: any) {
    Message.error(err.message || '提取失败，请检查授权码是否正确或是否在线');
  } finally {
    extractLoading.value = false;
  }
};

const copyExtractedData = () => {
  copyToClipboard(extractedData.value);
};
</script>

<style scoped>
.a16-login-box { padding: 20px 10px; }
.result-panel { background: #1a1a1a; padding: 12px; border-radius: 4px; border: 1px solid #333; text-align: left; max-height: 200px; overflow-y: auto; }
.result-panel pre { margin: 0; font-size: 12px; color: #07c160; white-space: pre-wrap; word-break: break-all; }
</style>
