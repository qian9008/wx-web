<template>
  <div class="login-container">
    <a-tabs v-model:active-key="activeTabKey" type="capsule" justify @change="handleTabChange">
      <a-tab-pane key="connect" title="链接状态">
        <ConnectStatus />
      </a-tab-pane>
      <a-tab-pane key="qrcode" title="扫码登录">
        <QrCodeLogin :assigned-key="authKey" @success="handleSuccess" />
      </a-tab-pane>
      <a-tab-pane key="device" title="62账号登录">
        <DeviceLogin v-model:assigned-key="authKey" @success="handleSuccess" />
      </a-tab-pane>
      <a-tab-pane key="extract62" title="提取62数据">
        <Extract62 v-model:assigned-key="authKey" />
      </a-tab-pane>
      <a-tab-pane key="wakeup" title="唤醒登录">
        <WakeupLogin v-model:assigned-key="authKey" @success="handleSuccess" />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import ConnectStatus from '@/components/login/ConnectStatus.vue';
import QrCodeLogin from '@/components/login/QrCodeLogin.vue';
import DeviceLogin from '@/components/login/DeviceLogin.vue';
import Extract62 from '@/components/login/Extract62.vue';
import WakeupLogin from '@/components/login/WakeupLogin.vue';
import { getWx62Bindings } from '@/utils/wx62';

const props = defineProps({
  assignedKey: {
    type: String,
    default: ''
  },
  defaultTab: {
    type: String,
    default: 'qrcode'
  }
});

const emit = defineEmits(['success']);

const activeTabKey = ref(props.defaultTab);
const authKey = ref(props.assignedKey || '');

watch(() => props.assignedKey, (newVal) => {
  authKey.value = newVal || '';
});

const handleTabChange = (key: any) => {
  // Tab 切换扩展点
};

const handleSuccess = (data: any) => {
  emit('success', data);
};

onMounted(() => {
  // 自动初始化并保存一次绑定关系，补充可能新上线的账号
  const currentBindings = getWx62Bindings();
  localStorage.setItem('wx_62_bindings', JSON.stringify(currentBindings));
});
</script>

<style scoped>
.login-container { padding: 10px; }

@media (max-width: 480px) {
  .login-container {
    padding: 0 !important;
  }
  :deep(.arco-tabs-nav-tab) {
    justify-content: flex-start !important;
  }
}
</style>
