<template>
  <div class="a16-login-box">
    <a-form :model="deviceForm" layout="vertical" @submit="handleDeviceLogin">
      <a-form-item field="Account" required>
        <template #label>
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <span>微信账号</span>
            <a-dropdown v-if="localUsernamesWith62.length > 0" @select="handleSelectUsername" position="br">
              <a-link size="mini" style="padding: 0; display: flex; align-items: center; gap: 4px;">
                <icon-history /> 历史账号 <icon-down />
              </a-link>
              <template #content>
                <a-doption 
                  v-for="item in localUsernamesWith62" 
                  :key="item.value" 
                  :value="item.value"
                >
                  <div style="display: flex; flex-direction: column; line-height: 1.4; padding: 2px 0;">
                    <span style="font-weight: 500; font-size: 13px;">{{ item.nickname }}</span>
                    <span style="font-size: 11px; opacity: 0.7;">{{ item.value }}</span>
                  </div>
                </a-doption>
              </template>
            </a-dropdown>
          </div>
        </template>
        <a-input v-model="deviceForm.Account" placeholder="手机号/微信号/QQ" />
      </a-form-item>
      <a-form-item field="Password" label="密码" required>
        <a-input-password v-model="deviceForm.Password" placeholder="请输入密码" />
      </a-form-item>
      <a-form-item field="LoginData" label="62 数据" help="62数据为ipad微信登录环境数据">
        <template #extra v-if="hasLocal62Data">
          <a-link size="mini" @click="fillLocal62Data" style="float: right; padding: 0;">使用本地保存的62数据</a-link>
        </template>
        <a-textarea 
          v-model="deviceForm.LoginData" 
          placeholder="已保存的62数据将自动加载，或手动输入" 
          :auto-size="{ minRows: 2, maxRows: 4 }"
        />
      </a-form-item>
      <a-button type="primary" html-type="submit" :loading="deviceLoading" long>
        立即登录
      </a-button>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useAccountStore } from '@/store/account';
import { loginApi } from '@/api/modules/im';
import { Message } from '@arco-design/web-vue';
import { IconHistory, IconDown } from '@arco-design/web-vue/es/icon';
import { getWx62Bindings, saveWx62Binding } from '@/utils/wx62';

const props = defineProps({
  assignedKey: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['success', 'update:assignedKey']);

const deviceLoading = ref(false);
const deviceForm = reactive({
  Account: '',
  Password: '',
  LoginData: '',
  Key: props.assignedKey
});

const accountStore = useAccountStore();

const hasLocal62Data = computed(() => {
  return !!(
    (deviceForm.Account && localStorage.getItem(`wx_62_data_${deviceForm.Account}`)) ||
    (props.assignedKey && localStorage.getItem(`wx_62_data_${props.assignedKey}`)) ||
    localStorage.getItem('wx_62_data')
  );
});

const fillLocal62Data = () => {
  const saved = (deviceForm.Account && localStorage.getItem(`wx_62_data_${deviceForm.Account}`)) || 
                (props.assignedKey && localStorage.getItem(`wx_62_data_${props.assignedKey}`));
  if (saved) {
    deviceForm.LoginData = saved;
    Message.success('已自动填充该账号的本地62数据');
  } else {
    const general = localStorage.getItem('wx_62_data');
    if (general) {
      deviceForm.LoginData = general;
      Message.success('未找到该账号的专用数据，已填充默认62数据');
    } else {
      Message.warning('未找到任何本地62数据');
    }
  }
};

// 计算所有拥有本地 62 数据的账号列表，供选择使用
const localUsernamesWith62 = computed(() => {
  const bindings = getWx62Bindings();
  return bindings.map(b => ({
    label: `${b.nickname} (${b.username})`,
    value: b.username,
    nickname: b.nickname,
    tokenKey: b.tokenKey,
    loginData: b.loginData
  }));
});

const handleSelectUsername = (value: string) => {
  const matched = localUsernamesWith62.value.find(item => item.value === value);
  if (matched) {
    deviceForm.Account = matched.value;      // 填充微信账号 (优先是 alias)
    deviceForm.LoginData = matched.loginData; // 填充 62 数据
    
    // 正确回填与之绑定的 TOKEN_KEY 到槽位配置中
    deviceForm.Key = matched.tokenKey;
    emit('update:assignedKey', matched.tokenKey);
    
    Message.success(`已选择账号 [${matched.nickname}]，已自动填充微信账号、TOKEN_KEY 及 62 数据`);
  } else {
    Message.warning(`未找到对应账号的绑定数据`);
  }
};

// 自动填充观察器，支持当输入 UserName 或 key 时自动拉取该账户专用 62 数据
watch(
  [() => deviceForm.Account, () => props.assignedKey],
  ([newUsername, newKey], [oldUsername, oldKey]) => {
    // 优先从已有的绑定关系中检索 62 数据
    const bindings = getWx62Bindings();
    const matchedBinding = bindings.find(b => b.username === newUsername || b.tokenKey === newKey || (newUsername && b.username.toLowerCase() === newUsername.toLowerCase()));
    
    const savedNew = matchedBinding?.loginData || 
                     (newUsername && localStorage.getItem(`wx_62_data_${newUsername}`)) || 
                     (newKey && localStorage.getItem(`wx_62_data_${newKey}`));
    
    if (savedNew) {
      const general = localStorage.getItem('wx_62_data');
      const oldBinding = bindings.find(b => b.username === oldUsername || b.tokenKey === oldKey);
      const savedOld = oldBinding?.loginData ||
                       (oldUsername && localStorage.getItem(`wx_62_data_${oldUsername}`)) || 
                       (oldKey && localStorage.getItem(`wx_62_data_${oldKey}`));
      
      const isCurrentEmpty = !deviceForm.LoginData;
      const isCurrentGeneral = general && deviceForm.LoginData === general;
      const isCurrentOldData = savedOld && deviceForm.LoginData === savedOld;
      
      // 如果当前为空，或者当前是通用数据，或者当前是上一个账号的数据，则自动覆写为新账号的数据
      if (isCurrentEmpty || isCurrentGeneral || isCurrentOldData) {
        deviceForm.LoginData = savedNew;
        // 如果有对应绑定的 tokenKey 且当前配置非空，顺便更新 tokenKey 确保一致
        if (matchedBinding) {
          deviceForm.Key = matchedBinding.tokenKey;
          emit('update:assignedKey', matchedBinding.tokenKey);
        }
      }
    }
  },
  { immediate: true }
);

const handleDeviceLogin = async () => {
  if (!deviceForm.Account || !deviceForm.Password) return Message.warning('请输入账号和密码');
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
      UserName: deviceForm.Account
    };
    const res: any = await loginApi.deviceLogin(props.assignedKey || deviceForm.Key, payload);
    if (res && res.Key) {
      Message.success('62 账号登录成功');
      
      const realAlias = res.Alias || res.alias;
      const realUsername = realAlias || res.Uuid || deviceForm.Account;
      
      // 成功登录后，将本次使用的 62 数据按账号隔离保存，并建立唯一绑定关系
      if (deviceForm.LoginData) {
        localStorage.setItem(`wx_62_data_${deviceForm.Account}`, deviceForm.LoginData);
        if (res.Uuid) {
          localStorage.setItem(`wx_62_data_${res.Uuid}`, deviceForm.LoginData);
        }
        if (realAlias) {
          localStorage.setItem(`wx_62_data_${realAlias}`, deviceForm.LoginData);
        }
        // 绑定微信账号 (优先用 alias)、TOKEN_KEY (res.Key) 和 62 数据
        saveWx62Binding(realUsername, res.Key, deviceForm.LoginData, res.Nickname || deviceForm.Account);
      }

      emit('success', {
        uuid: res.Uuid || 'device-' + Date.now(),
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

onMounted(() => {
  // 自动填充本地保存的62数据
  const saved62 = localStorage.getItem('wx_62_data');
  if (saved62) {
    deviceForm.LoginData = saved62;
  }
});
</script>

<style scoped>
.a16-login-box { padding: 20px 10px; }
</style>
