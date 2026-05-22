<template>
  <div class="login-box">
    <div style="margin-bottom: 20px;">
      <a-input v-model="authKey" placeholder="请输入或分配授权码 (可选)" style="width: 250px" allow-clear>
        <template #prefix><icon-safe /></template>
      </a-input>
    </div>
    
    <div style="margin-bottom: 20px;">
      <a-radio-group v-model="qrType" type="button">
        <a-radio value="new">新版接口 (推荐)</a-radio>
        <a-radio value="old">旧版接口</a-radio>
      </a-radio-group>
    </div>

    <div v-if="!qrUrl && !loading" class="empty-state" style="padding: 20px 0;">
      <icon-qrcode :size="48" style="color: #86909c; margin-bottom: 16px;" />
      <p style="color: #86909c; margin-bottom: 20px;">点击下方按钮获取登录二维码</p>
      <a-button type="primary" @click="fetchQrCode(qrType)">获取二维码</a-button>
    </div>
    <div v-else-if="loading" class="loading">
      <a-spin :size="32" />
      <p>正在获取二维码...</p>
    </div>
    <div v-else class="qrcode-container">
      <div v-if="qrUrl" class="qr-code">
        <img :src="qrUrl" alt="登录二维码" />
        <div v-if="expired" class="mask" @click="fetchQrCode(qrType)">
          <icon-refresh :size="30" />
          <p>已过期，点击刷新</p>
        </div>
      </div>
      <p class="status-msg">{{ statusMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { loginApi } from '@/api/modules/im';
import { Message } from '@arco-design/web-vue';
import {
  IconRefresh,
  IconQrcode,
  IconSafe
} from '@arco-design/web-vue/es/icon';

const props = defineProps({
  assignedKey: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['success']);

const qrUrl = ref('');
const uuid = ref('');
const authKey = ref(props.assignedKey || '');
const loading = ref(false);
const expired = ref(false);
const statusMsg = ref('请使用微信扫码');
const qrType = ref<'new' | 'old'>('new');
let timer: any = null;

// 监听二维码通道切换，仅在已经生成过二维码的情况下，自动刷新获取对应通道的二维码
watch(qrType, (newType) => {
  if (qrUrl.value) {
    fetchQrCode(newType);
  }
});

const fetchQrCode = async (type: 'old' | 'new' = 'new') => {
  loading.value = true;
  expired.value = false;
  qrUrl.value = '';
  uuid.value = '';
  stopPolling();
  try {
    const requestKey = authKey.value;
    const res: any = type === 'new' 
      ? await loginApi.getQrCodeNew(requestKey)
      : await loginApi.getQrCode(requestKey);
    if (res && res.QrCodeUrl) {
      qrUrl.value = res.QrCodeUrl;
      const match = qrUrl.value.match(/\/x\/([^&?]+)/);
      uuid.value = res.Uuid || res.Key || (match ? match[1] : '');
      authKey.value = res.Key || requestKey || uuid.value; // 优先使用接口返回的 Key
      startPolling();
    } else {
      throw new Error('API 返回格式不匹配');
    }
  } catch (err) {
    Message.error('获取失败，请重试');
  } finally {
    loading.value = false;
  }
};

const startPolling = () => {
  const pollKey = authKey.value || uuid.value || props.assignedKey;
  if (!pollKey) return;
  stopPolling();
  timer = setInterval(async () => {
    try {
      const res: any = await loginApi.checkLogin(pollKey);
      const stateVal = res && (res.state !== undefined ? res.state : res.Status);
      if (res && stateVal === 2) {
          stopPolling();
          Message.success('登录成功');
          emit('success', {
              uuid: res.wxid || res.uuid || res.Uuid || uuid.value, 
              sessionKey: res.Key || res.key || pollKey || props.assignedKey,
              nickname: res.Nickname || res.nick_name || res.nickname || '新账号'
          });
      } else if (res && stateVal === 1) {
          statusMsg.value = '扫码成功，请在手机上确认';
      }
    } catch (err) {}
  }, 2000);
};

const stopPolling = () => { if (timer) clearInterval(timer); timer = null; };

onUnmounted(() => stopPolling());
</script>

<style scoped>
.login-box { text-align: center; padding: 20px 0; }
.qr-code { position: relative; width: 180px; height: 180px; margin: 0 auto; border: 1px solid #333; }
.qr-code img { width: 100%; height: 100%; }
.mask { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; flex-direction: column; justify-content: center; align-items: center; cursor: pointer; }
.status-msg { margin-top: 15px; color: #86909c; }
</style>
