<template>
  <div class="login-container">
    <a-tabs default-active-key="connect" type="capsule" justify @change="handleTabChange">
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
      </a-tab-pane>

      <!-- 
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
      -->

      <a-tab-pane key="device" title="62账号登录">
        <div class="a16-login-box">
          <a-form :model="deviceForm" layout="vertical" @submit="handleDeviceLogin">
            <a-form-item field="UserName" label="微信账号" required>
              <a-input v-model="deviceForm.UserName" placeholder="手机号/微信号/QQ" />
            </a-form-item>
            <a-form-item field="Password" label="密码" required>
              <a-input-password v-model="deviceForm.Password" placeholder="请输入密码" />
            </a-form-item>
            <a-form-item field="LoginData" label="62 数据" help="62数据为ipad微信登录环境数据">
              <a-textarea 
                v-model="deviceForm.LoginData" 
                placeholder="请输入 62 数据" 
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
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import { loginApi } from '@/api/modules/im';
import { Message } from '@arco-design/web-vue';
import {
  IconRefresh,
  IconThunderbolt,
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

// --- 扫码登录相关 ---
const qrUrl = ref('');
const uuid = ref('');
const authKey = ref(props.assignedKey || ''); // 保存可用的认证 Key
const loading = ref(false); // 默认不自动加载
const expired = ref(false);
const statusMsg = ref('请使用微信扫码');
const qrType = ref<'new' | 'old'>('new');
let timer: any = null;

// 监听二维码通道切换，自动刷新并获取对应通道的二维码
watch(qrType, (newType) => {
  fetchQrCode(newType);
});

// --- A16 登录相关 (已注释) ---
/*
const a16Loading = ref(false);
const a16Form = reactive({
  A16Data: '',
  DeviceName: 'IWE-Desktop',
  Key: props.assignedKey // 使用分配的 Key
});
*/

// --- 62 账号登录相关 ---
const deviceLoading = ref(false);
const deviceForm = reactive({
  UserName: '',
  Password: '',
  LoginData: '',
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

const handleTabChange = (key: any) => {
  // 不再自动获取二维码，需手动点击
};

const startPolling = () => {
  const pollKey = authKey.value || uuid.value || props.assignedKey;
  if (!pollKey) return;
  stopPolling();
  timer = setInterval(async () => {
    try {
      const res: any = await loginApi.checkLogin(pollKey);
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

/*
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
*/

const handleDeviceLogin = async () => {
  if (!deviceForm.UserName || !deviceForm.Password) return Message.warning('请输入账号和密码');
  deviceLoading.value = true;
  try {
    const payload = {
      DeviceInfo: {
        AndroidId: "",
        ImeI: "",
        Manufacturer: "",
        Model: ""
      },
      LoginData: deviceForm.LoginData,
      Password: deviceForm.Password,
      Proxy: "",
      Ticket: "",
      Type: 0,
      UserName: deviceForm.UserName
    };
    const res: any = await loginApi.deviceLogin(authKey.value || deviceForm.Key, payload);
    if (res && res.Key) {
      Message.success('62 账号登录成功');
      emit('success', {
        uuid: res.Uuid || 'device-' + Date.now(),
        sessionKey: res.Key,
        nickname: res.Nickname || deviceForm.UserName
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
  // 不再自动获取二维码
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

@media (max-width: 480px) {
  .login-container {
    padding: 0 !important;
  }
  .qr-code {
    width: 150px !important;
    height: 150px !important;
  }
  .connect-box {
    padding: 15px 5px !important;
  }
  :deep(.arco-tabs-nav-tab) {
    justify-content: flex-start !important;
  }
  .login-box {
    padding: 10px 0 !important;
  }
}
</style>
