<template>
  <div class="login-container">
    <a-tabs default-active-key="connect" type="capsule" justify>
      <a-tab-pane key="connect" title="链接状态">
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
      </a-tab-pane>
      <a-tab-pane key="qrcode" title="扫码登录">
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
      </a-tab-pane>

      <a-tab-pane key="a16" title="A16数据登录">
        <div class="a16-login-box">
          <a-form :model="a16Form" layout="vertical" @submit="handleA16Login">
            <a-form-item field="A16Data" label="A16 数据" required>
              <a-textarea 
                v-model="a16Form.A16Data" 
                placeholder="请输入 A16 数据内容" 
                :auto-size="{ minRows: 3, maxRows: 6 }"
              />
            </a-form-item>
            <a-form-item field="DeviceName" label="设备名称">
              <a-input v-model="a16Form.DeviceName" placeholder="可选，例如: 我的 iPhone" />
            </a-form-item>
            <a-button type="primary" html-type="submit" :loading="a16Loading" long>
              立即登录
            </a-button>
          </a-form>
        </div>
      </a-tab-pane>

      <a-tab-pane key="device" title="62账号登录">
        <div class="a16-login-box">
          <a-form :model="deviceForm" layout="vertical" @submit="handleDeviceLogin">
            <a-form-item field="Account" label="微信账号" required>
              <a-input v-model="deviceForm.Account" placeholder="手机号/微信号/QQ" />
            </a-form-item>
            <a-form-item field="Password" label="密码" required>
              <a-input-password v-model="deviceForm.Password" placeholder="请输入密码" />
            </a-form-item>
            <a-form-item field="DeviceData" label="62 数据">
              <a-textarea 
                v-model="deviceForm.DeviceData" 
                placeholder="请输入 62 数据 (可选)" 
                :auto-size="{ minRows: 2, maxRows: 4 }"
              />
            </a-form-item>
            <a-button type="primary" html-type="submit" :loading="deviceLoading" long>
              立即登录
            </a-button>
          </a-form>
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { loginApi } from '@/api/modules/im';
import { Message } from '@arco-design/web-vue';
import {
  IconRefresh,
  IconThunderbolt
} from '@arco-design/web-vue/es/icon';

const props = defineProps({
  assignedKey: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['success']);

// --- 扫码登录相关 ---
const qrUrl = ref('');
const uuid = ref('');
const loading = ref(true);
const expired = ref(false);
const statusMsg = ref('请使用微信扫码');
let timer: any = null;

// --- A16 登录相关 ---
const a16Loading = ref(false);
const a16Form = reactive({
  A16Data: '',
  DeviceName: 'IWE-Desktop',
  Key: props.assignedKey // 使用分配的 Key
});

// --- 62 账号登录相关 ---
const deviceLoading = ref(false);
const deviceForm = reactive({
  Account: '',
  Password: '',
  DeviceData: '',
  Key: props.assignedKey
});

// --- 链接状态相关 ---
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

const fetchQrCode = async () => {
  loading.value = true;
  expired.value = false;
  try {
    const res: any = await loginApi.getQrCode(props.assignedKey);
    if (res && res.QrCodeUrl) {
      qrUrl.value = res.QrCodeUrl;
      const match = qrUrl.value.match(/\/x\/([^&?]+)/);
      uuid.value = match ? match[1] : '';
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
  if (!uuid.value) return;
  stopPolling();
  timer = setInterval(async () => {
    try {
      const res: any = await loginApi.checkLogin(uuid.value, props.assignedKey);
      if (res && res.Status === 2) {
          stopPolling();
          Message.success('登录成功');
          emit('success', {
              uuid: uuid.value, 
              sessionKey: res.Key || props.assignedKey,
              nickname: res.Nickname || '新账号'
          });
      } else if (res && res.Status === 1) {
          statusMsg.value = '扫码成功，请在手机上确认';
      }
    } catch (err) {}
  }, 2000);
};

const handleA16Login = async () => {
  if (!a16Form.A16Data) return Message.warning('请输入 A16 数据');
  a16Loading.value = true;
  try {
    const res: any = await loginApi.a16Login(a16Form);
    if (res && res.Key) {
      Message.success('A16 登录成功');
      emit('success', {
        uuid: 'a16-' + Date.now(),
        sessionKey: res.Key,
        nickname: res.Nickname || 'A16 账号'
      });
    } else {
      Message.error(res?.Msg || '登录失败');
    }
  } catch (err: any) {
    Message.error(err.message || '网络请求失败');
  } finally {
    a16Loading.value = false;
  }
};

const handleDeviceLogin = async () => {
  if (!deviceForm.Account || !deviceForm.Password) return Message.warning('请输入账号和密码');
  deviceLoading.value = true;
  try {
    const res: any = await loginApi.deviceLogin(deviceForm.Key, deviceForm);
    if (res && res.Key) {
      Message.success('62 账号登录成功');
      emit('success', {
        uuid: 'device-' + Date.now(),
        sessionKey: res.Key,
        nickname: res.Nickname || deviceForm.Account
      });
    } else {
      Message.error(res?.Msg || '登录失败');
    }
  } catch (err: any) {
    Message.error(err.message || '网络请求失败');
  } finally {
    deviceLoading.value = false;
  }
};

const stopPolling = () => { if (timer) clearInterval(timer); timer = null; };
onMounted(() => {
  fetchConnectStatus();
  fetchQrCode();
});
onUnmounted(() => stopPolling());
</script>

<style scoped>
.login-container { padding: 10px; }
.login-box { text-align: center; padding: 20px 0; }
.qr-code { position: relative; width: 180px; height: 180px; margin: 0 auto; border: 1px solid #333; }
.qr-code img { width: 100%; height: 100%; }
.mask { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; flex-direction: column; justify-content: center; align-items: center; cursor: pointer; }
.status-msg { margin-top: 15px; color: #86909c; }

.a16-login-box { padding: 20px 10px; }
.connect-box { padding: 30px 20px; text-align: center; }
.result-panel { background: #1a1a1a; padding: 12px; border-radius: 4px; border: 1px solid #333; text-align: left; max-height: 200px; overflow-y: auto; }
.result-panel pre { margin: 0; font-size: 12px; color: #07c160; white-space: pre-wrap; word-break: break-all; }
</style>
