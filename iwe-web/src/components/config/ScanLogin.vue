<template>
  <div class="scan-mode-container">
    <div v-if="!qrUrl && !qrLoading" class="qr-placeholder">
      <icon-qrcode :size="48" style="color: #86909c; margin-bottom: 12px;" />
      <p class="qr-tip">确认上方服务器地址后，点击下方按钮获取登录二维码</p>
      <a-button type="primary" size="medium" @click="handleGetQrCode" class="glow-btn-mini">获取二维码</a-button>
    </div>
    <div v-else-if="qrLoading" class="qr-loading">
      <a-spin :size="32" />
      <p class="qr-tip">正在获取二维码...</p>
    </div>
    <div v-else class="qr-display">
      <div class="qr-image-wrapper">
        <img :src="qrUrl" alt="登录二维码" class="qr-image" />
        <div v-if="qrExpired" class="qr-expired-mask" @click="handleGetQrCode">
          <icon-refresh :size="24" />
          <p>二维码已过期<br/>点击刷新</p>
        </div>
      </div>
      <p class="qr-status" :class="{ 'status-highlight': qrStatusMsg.includes('成功') }">{{ qrStatusMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, watch } from 'vue';
import { useAccountStore } from '@/store/account';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { loginApi } from '@/api/modules/im';
import { IconQrcode, IconRefresh } from '@arco-design/web-vue/es/icon';

const props = defineProps<{
  baseUrl: string;
  debug: boolean;
  loginMode: string;
}>();

const emit = defineEmits<{
  (e: 'success', key: string): void;
}>();

const accountStore = useAccountStore();
const router = useRouter();

const qrUrl = ref('');
const qrLoading = ref(false);
const qrExpired = ref(false);
const qrStatusMsg = ref('请使用微信扫码');
const scanUuid = ref('');
const scanKey = ref('');
const scanTimer = ref<any>(null);

const saveBaseConfig = () => {
  localStorage.setItem('baseUrl', props.baseUrl);
  localStorage.setItem('iwe_base_url', props.baseUrl);
  
  const newDebugConfig = { ...(accountStore.debug || {}), all: props.debug };
  localStorage.setItem('debug_config', JSON.stringify(newDebugConfig));
  return newDebugConfig;
};

const handleGetQrCode = async () => {
  if (!props.baseUrl) {
    Message.warning('请先填写服务器地址');
    return;
  }
  
  saveBaseConfig();
  
  qrLoading.value = true;
  qrExpired.value = false;
  qrUrl.value = '';
  scanUuid.value = '';
  scanKey.value = '';
  stopScanPolling();
  
  try {
    const res: any = await loginApi.getQrCodeNew('');
    if (res && res.QrCodeUrl) {
      qrUrl.value = res.QrCodeUrl;
      const match = qrUrl.value.match(/\/x\/([^&?]+)/);
      scanUuid.value = res.Uuid || res.Key || (match ? match[1] : '');
      scanKey.value = res.Key || scanUuid.value;
      qrStatusMsg.value = '请使用微信扫码';
      startScanPolling();
    } else {
      throw new Error('API 返回格式不匹配');
    }
  } catch (err: any) {
    console.error('获取登录二维码失败:', err);
    Message.error('获取二维码失败，请检查服务器地址是否能连通');
  } finally {
    qrLoading.value = false;
  }
};

const startScanPolling = () => {
  const pollKey = scanKey.value;
  if (!pollKey) return;
  stopScanPolling();
  
  scanTimer.value = setInterval(async () => {
    try {
      const res: any = await loginApi.checkLogin(pollKey);
      const stateVal = res && (res.state !== undefined ? res.state : res.Status);
      if (res && stateVal === 2) {
        stopScanPolling();
        qrStatusMsg.value = '登录成功！正在进入主控台...';
        Message.success('扫码登录成功！');
        
        const finalKey = res.Key || res.key || pollKey;
        
        localStorage.setItem('TOKEN_KEY', finalKey);
        
        const debugConfig = { ...(accountStore.debug || {}), all: props.debug };
        accountStore.setGlobalConfig(props.baseUrl, '', finalKey, debugConfig);
        
        try {
          await accountStore.checkSingleAccountStatus(finalKey);
        } catch (e) {
          console.warn('初始化单账号状态失败:', e);
        }
        
        emit('success', finalKey);
        
        setTimeout(() => {
          router.push('/');
        }, 1500);
        
      } else if (res && stateVal === 1) {
        qrStatusMsg.value = '扫码成功，请在手机上确认';
      } else if (res && stateVal === 3) {
        stopScanPolling();
        qrExpired.value = true;
        qrStatusMsg.value = '二维码已过期，请刷新';
      }
    } catch (err) {
      console.warn('轮询登录状态发生错误:', err);
    }
  }, 2000);
};

const stopScanPolling = () => {
  if (scanTimer.value) {
    clearInterval(scanTimer.value);
    scanTimer.value = null;
  }
};

// 监听模式切换，若切出则停止扫码轮询
watch(() => props.loginMode, (newVal) => {
  if (newVal !== 'token') {
    stopScanPolling();
  }
});

onUnmounted(() => {
  stopScanPolling();
});
</script>
