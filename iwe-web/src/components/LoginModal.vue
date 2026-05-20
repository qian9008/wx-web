<template>
  <a-modal 
    :visible="visible" 
    title="微信登录与管理" 
    width="550px" 
    :footer="false" 
    unmount-on-close
    @cancel="emit('update:visible', false)"
  >
    <Login :assigned-key="pendingSessionKey" @success="handleLoginSuccess" />
    
    <!-- 只有在拥有活跃的个人授权码时，才显示高级操作，方便免签登录或维护 -->
    <template v-slot:default v-if="accountStore.tokenKey">
      <a-divider style="margin: 20px 0 15px 0;">高级操作</a-divider>
      <a-form :model="accountStore.getEffectiveAvatarConfig()" layout="vertical" style="padding: 0 12px;">
        <a-form-item label="在线状态">
          <a-space>
            <a-button size="small" type="outline" @click="handleAccountStatusActionForCurrent('status')">
              <template #icon><icon-check-circle /></template>在线查询
            </a-button>
            <a-button size="small" type="outline" status="success" @click="handleAccountStatusActionForCurrent('wakeup')">
              <template #icon><icon-thunderbolt /></template>唤醒登录
            </a-button>
          </a-space>
        </a-form-item>
        <a-form-item label="绑定手机验证码">
          <a-input-group>
            <a-input v-model="verifyMobile" placeholder="手机号" size="small" style="width: 200px" />
            <a-button type="primary" size="small" @click="handleAccountVerifyCodeForCurrent">发送验证码</a-button>
          </a-input-group>
        </a-form-item>
        <a-form-item label="环境数据" help="提取当前设备用于免验登录的 62 数据">
          <a-button type="outline" size="small" status="warning" @click="handleExtract62DataForCurrent" :loading="extract62Loading">提取 62 数据</a-button>
          <div v-if="extracted62Data" style="margin-top: 10px; width: 100%;">
            <a-textarea v-model="extracted62Data" :auto-size="{minRows: 2, maxRows: 4}" readonly />
          </div>
        </a-form-item>
        <div v-if="currentAccountResult" style="margin-top: 10px;">
          <pre class="status-result">{{ currentAccountResult }}</pre>
        </div>
      </a-form>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAccountStore } from '@/store/account';
import { loginApi } from '@/api/modules/im';
import { Message } from '@arco-design/web-vue';
import { IconThunderbolt, IconCheckCircle } from '@arco-design/web-vue/es/icon';
import Login from '@/views/Login.vue';

const props = defineProps<{
  visible: boolean;
  pendingSessionKey: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'success'): void;
}>();

const accountStore = useAccountStore();

const verifyMobile = ref('');
const currentAccountResult = ref('');
const extract62Loading = ref(false);
const extracted62Data = ref('');

const handleLoginSuccess = () => {
  emit('success');
};

const handleAccountStatusActionForCurrent = async (action: string) => {
  const uuid = accountStore.activeAccountUuid;
  const acc = accountStore.accounts.find(a => a.uuid === uuid);
  if (!acc || !uuid) return Message.warning('请先选择活跃账号');
  
  try {
    let res: any;
    if (action === 'status') {
      await accountStore.checkSingleAccountStatus(acc.sessionKey);
      res = await loginApi.getOnlineStatus(acc.sessionKey);
    } else if (action === 'wakeup') {
      res = await loginApi.wakeUpLogin(acc.sessionKey);
      Message.info('唤醒指令已发送，正在尝试自动在线连接与状态校验...');
      
      let checkCount = 0;
      const maxChecks = 5;
      const checkInterval = setInterval(async () => {
        checkCount++;
        try {
          const isOnline = await accountStore.checkSingleAccountStatus(acc.sessionKey);
          if (isOnline) {
            clearInterval(checkInterval);
            Message.success(`账号 [${acc.nickname || '微信'}] 唤醒成功！已自动激活在线模式。`);
          } else if (checkCount >= maxChecks) {
            clearInterval(checkInterval);
            Message.warning(`唤醒指令已发送，但检测到账号仍处于离线状态。`);
          }
        } catch (e) {
          if (checkCount >= maxChecks) {
            clearInterval(checkInterval);
          }
        }
      }, 2000);
    }
    currentAccountResult.value = JSON.stringify(res, null, 2);
  } catch (err: any) {
    currentAccountResult.value = `Error: ${err.message || err}`;
  }
};

const handleAccountVerifyCodeForCurrent = async () => {
  const uuid = accountStore.activeAccountUuid;
  const acc = accountStore.accounts.find(a => a.uuid === uuid);
  if (!acc || !uuid) return Message.warning('请先选择活跃账号');
  if (!verifyMobile.value) return Message.warning('请输入手机号');
  
  try {
    const res = await loginApi.getVerifyCode(acc.sessionKey, verifyMobile.value);
    currentAccountResult.value = JSON.stringify(res, null, 2);
    Message.success('验证码请求已发送');
  } catch (err: any) {
    Message.error(err.message || '发送失败');
  }
};

const handleExtract62DataForCurrent = async () => {
  const uuid = accountStore.activeAccountUuid;
  const acc = accountStore.accounts.find(a => a.uuid === uuid);
  if (!acc || !uuid) return Message.warning('请先选择活跃账号');
  
  try {
    extract62Loading.value = true;
    Message.info('开始提取62数据...');
    const res: any = await loginApi.get62Data(acc.sessionKey);
    
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
    
    extracted62Data.value = dataVal;
    if (dataVal) {
      localStorage.setItem(`wx_62_data_${acc.sessionKey}`, dataVal);
      localStorage.setItem(`wx_62_data_${acc.uuid}`, dataVal);
      localStorage.setItem('wx_62_data', dataVal);
      Message.success('62数据提取成功，已按账号隔离保存至本地');
    } else {
      Message.success('62数据提取成功');
    }
  } catch (err: any) {
    Message.error('提取失败: ' + err.message);
  } finally {
    extract62Loading.value = false;
  }
};
</script>

<style scoped>
.status-result {
  background: #000;
  color: #07c160;
  padding: 8px;
  border-radius: 4px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 150px;
  overflow-y: auto;
}
</style>
