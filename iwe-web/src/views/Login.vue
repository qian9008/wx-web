<template>
  <div class="login-box">
    <div v-if="loading" class="loading">
      <a-spin :size="32" />
      <p>正在获取二维码...</p>
    </div>
    <div v-else class="qrcode-container">
      <div v-if="qrUrl" class="qr-code">
        <img :src="qrUrl" alt="登录二维码" />
        <div v-if="expired" class="mask" @click="fetchQrCode">
          <icon-refresh :size="30" />
          <p>已过期，点击刷新</p>
        </div>
      </div>
      <p class="status-msg">{{ statusMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { loginApi } from '@/api/modules/im';
import { Message } from '@arco-design/web-vue';
import { IconRefresh } from '@arco-design/web-vue/es/icon';

const emit = defineEmits(['success']);
const qrUrl = ref('');
const uuid = ref('');
const loading = ref(true);
const expired = ref(false);
const statusMsg = ref('请使用微信扫码');
let timer: any = null;

const fetchQrCode = async () => {
  loading.value = true;
  expired.value = false;
  try {
    const res: any = await loginApi.getQrCode();
    // 重点修正：request.ts 已经拆包，这里 res 就是 Data 内容
    if (res && res.QrCodeUrl) {
      qrUrl.value = res.QrCodeUrl;
      
      // 提取 UUID
      const match = qrUrl.value.match(/\/x\/([^&?]+)/);
      uuid.value = match ? match[1] : '';
      
      console.log('提取到的 UUID:', uuid.value);
      startPolling();
    } else {
      console.error('返回数据异常:', res);
      throw new Error('API 返回格式不匹配');
    }
  } catch (err) {
    // 这里不再提示跨域（因为大概率是字段逻辑错），提示通用错误
    Message.error('获取失败，请重试');
  } finally {
    loading.value = false;
  }
};

const startPolling = () => {
  if (!uuid.value) return;
  stopPolling();
  timer = setInterval(async () => {
    try {
      const res: any = await loginApi.checkLogin(uuid.value);
      // request.ts 已经过滤 Code 200，这里 res 是 Data 内容
      if (res && res.Status === 2) {
          stopPolling();
          Message.success('登录成功');
          emit('success', { 
              uuid: uuid.value, 
              sessionKey: res.Key,
              nickname: res.Nickname || '新账号'
          });
      } else if (res && res.Status === 1) {
          statusMsg.value = '扫码成功，请在手机上确认';
      }
    } catch (err) {}
  }, 2000);
};

const stopPolling = () => { if (timer) clearInterval(timer); timer = null; };
onMounted(() => fetchQrCode());
onUnmounted(() => stopPolling());
</script>

<style scoped>
.login-box { text-align: center; }
.qr-code { position: relative; width: 180px; height: 180px; margin: 0 auto; border: 1px solid #eee; }
.qr-code img { width: 100%; height: 100%; }
.mask { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.9); display: flex; flex-direction: column; justify-content: center; align-items: center; cursor: pointer; }
.status-msg { margin-top: 15px; color: #86909c; }
</style>
