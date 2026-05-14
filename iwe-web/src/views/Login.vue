<template>
  <div class="login-container">
    <a-tabs default-active-key="qrcode" type="capsule" justify>
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

      <a-tab-pane key="status" title="状态维护">
        <div class="status-tools">
          <a-space direction="vertical" fill>
            <a-input-group>
              <a-input v-model="statusKey" placeholder="请输入 License (Key)" />
              <a-button type="outline" @click="handleGetStatus" :loading="statusLoading">查询状态</a-button>
            </a-input-group>
            
            <div class="tool-btns">
              <a-button @click="handleWakeUp" type="outline" status="success">
                <template #icon><icon-thunderbolt /></template>唤醒登录
              </a-button>
              <a-button @click="handleCheckAlias" type="outline" status="warning">
                <template #icon><icon-edit /></template>检测微信号设置
              </a-button>
            </div>

            <div v-if="statusResult" class="result-panel">
              <pre>{{ statusResult }}</pre>
            </div>
          </a-space>
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { loginApi } from '@/api/modules/im';
import { Message } from '@arco-design/web-vue';
import { IconRefresh, IconThunderbolt, IconEdit } from '@arco-design/web-vue/es/icon';

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

// --- 状态工具相关 ---
const statusKey = ref(props.assignedKey); // 初始化为分配的 Key
const statusLoading = ref(false);
const statusResult = ref('');

const fetchQrCode = async () => {
  loading.value = true;
  expired.value = false;
  try {
    // 如果有分配的 Key，获取二维码时可能需要传递（根据 API 而定，目前 getQrCode 无参数）
    const res: any = await loginApi.getQrCode();
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
      const res: any = await loginApi.checkLogin(uuid.value);
      if (res && res.Status === 2) {
          stopPolling();
          Message.success('登录成功');
          emit('success', {
              uuid: uuid.value, 
              sessionKey: res.Key || props.assignedKey, // 优先使用 API 返回的，如果没有则使用分配的
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
  // 如果没有分配 Key 且表单也没有，则提醒（虽然逻辑上应该由 Home 分配）
  if (!a16Form.Key) {
     // 如果 API 支持不传 Key 自动分配则可继续，否则应报错
  }

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

const handleGetStatus = async () => {
  if (!statusKey.ref) {
      // 自动尝试从 store 获取当前激活账号的 key
      // 这里简便起见要求用户输入
  }
  if (!statusKey.value) return Message.warning('请输入 License Key');
  statusLoading.value = true;
  try {
    const res = await loginApi.getLoginStatus(statusKey.value);
    statusResult.value = JSON.stringify(res, null, 2);
  } catch (err: any) {
    statusResult.value = `查询失败: ${err.message}`;
  } finally {
    statusLoading.value = false;
  }
};

const handleWakeUp = async () => {
  if (!statusKey.value) return Message.warning('请输入 License Key');
  try {
    const res: any = await loginApi.wakeUpLogin(statusKey.value);
    Message.success('唤醒指令已发送');
    statusResult.value = JSON.stringify(res, null, 2);
  } catch (err: any) {
    Message.error(`唤醒失败: ${err.message}`);
  }
};

const handleCheckAlias = async () => {
  if (!statusKey.value) return Message.warning('请输入 License Key');
  try {
    const res: any = await loginApi.checkCanSetAlias(statusKey.value);
    statusResult.value = JSON.stringify(res, null, 2);
  } catch (err: any) {
    Message.error(`检测失败: ${err.message}`);
  }
};

const stopPolling = () => { if (timer) clearInterval(timer); timer = null; };
onMounted(() => fetchQrCode());
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
.status-tools { padding: 20px 10px; }
.tool-btns { margin-top: 15px; display: flex; gap: 10px; }
.result-panel { margin-top: 15px; background: #232323; padding: 10px; border-radius: 4px; border: 1px solid #333; max-height: 200px; overflow: auto; }
.result-panel pre { margin: 0; font-size: 12px; color: #07c160; white-space: pre-wrap; word-break: break-all; }
</style>
