<template>
  <div class="a16-login-box">
    <a-form :model="wakeupForm" layout="vertical" @submit="handleWakeup">
      <a-form-item field="License" label="授权码 (License)" required>
        <a-input v-model="wakeupForm.License" placeholder="请输入授权码" />
        <template #extra v-if="accountStore.accounts.length > 0">
          <div style="margin-top: 8px;">
            <span style="color: #86909c; font-size: 12px; margin-right: 8px;">快速选择账号:</span>
            <a-space wrap>
              <a-tag 
                v-for="acc in accountStore.accounts.filter(a => a.sessionKey)" 
                :key="acc.uuid" 
                :color="acc.status === 'online' ? 'green' : 'gray'" 
                style="cursor: pointer;"
                @click="handleSelectAccount(acc.sessionKey)"
              >
                {{ acc.nickname }} ({{ acc.status === 'online' ? '在线' : '离线' }})
              </a-tag>
            </a-space>
          </div>
        </template>
      </a-form-item>
      <a-button type="primary" html-type="submit" :loading="wakeupLoading" long>
        开始发送唤醒指令
      </a-button>
    </a-form>
    
    <div v-if="wakeupResult" class="result-panel" style="margin-top: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="color: #07c160; font-weight: bold; font-size: 12px;">响应结果：</span>
        <a-link size="mini" @click="copyWakeupResult">
          <template #icon><icon-copy /></template>
          复制结果
        </a-link>
      </div>
      <pre style="max-height: 120px; overflow-y: auto; font-size: 12px; word-break: break-all; white-space: pre-wrap;">{{ wakeupResult }}</pre>
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

const props = defineProps({
  assignedKey: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['success', 'update:assignedKey']);

const wakeupLoading = ref(false);
const wakeupResult = ref('');
const wakeupForm = reactive({
  License: props.assignedKey || ''
});

const accountStore = useAccountStore();

watch(() => props.assignedKey, (newVal) => {
  wakeupForm.License = newVal || '';
});

const handleSelectAccount = (key: string) => {
  wakeupForm.License = key;
  emit('update:assignedKey', key);
};

const handleWakeup = async () => {
  if (!wakeupForm.License) return Message.warning('请输入或选择授权码');
  wakeupLoading.value = true;
  wakeupResult.value = '';
  try {
    Message.info('正在发送唤醒指令...');
    const res: any = await loginApi.wakeUpLogin(wakeupForm.License);
    console.log('[Login:WakeUpLogin]', res);
    
    wakeupResult.value = typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res);
    Message.info('唤醒指令已成功发送，正在验证在线状态...');
    
    // 开启在线检测循环环路（每 2 秒一次，最多 5 次）
    let checkCount = 0;
    const maxChecks = 5;
    const checkInterval = setInterval(async () => {
      checkCount++;
      try {
        const isOnline = await accountStore.checkSingleAccountStatus(wakeupForm.License);
        if (isOnline) {
          clearInterval(checkInterval);
          wakeupLoading.value = false;
          Message.success('账号唤醒登录成功！正在为您激活并进入主控台...');
          
          // 查询获取详细的 wxid 和昵称传给 success 事件，使 UI 自动推进
          const statusRes: any = await loginApi.getOnlineStatus(wakeupForm.License);
          const data = statusRes?.Data || statusRes;
          const realWxid = data?.wxid || data?.uuid || wakeupForm.License;
          const nick = data?.nickname || data?.Nickname || '已唤醒账号';

          emit('success', {
            uuid: realWxid,
            sessionKey: wakeupForm.License,
            nickname: nick
          });
        } else if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
          wakeupLoading.value = false;
          Message.warning('唤醒指令已发送，但账号检测未上线，请稍后手动查询状态。');
        }
      } catch (e) {
        if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
          wakeupLoading.value = false;
        }
      }
    }, 2000);
  } catch (err: any) {
    Message.error(err.message || '唤醒指令发送失败');
    wakeupResult.value = `Error: ${err.message || err}`;
    wakeupLoading.value = false;
  }
};

const copyWakeupResult = () => {
  copyToClipboard(wakeupResult.value);
};
</script>

<style scoped>
.a16-login-box { padding: 20px 10px; }
.result-panel { background: #1a1a1a; padding: 12px; border-radius: 4px; border: 1px solid #333; text-align: left; max-height: 200px; overflow-y: auto; }
.result-panel pre { margin: 0; font-size: 12px; color: #07c160; white-space: pre-wrap; word-break: break-all; }
</style>
