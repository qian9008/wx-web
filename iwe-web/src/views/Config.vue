<template>
  <div class="config-container">
    <a-card :style="{ width: '420px' }" title="IWE 系统初始化">
      <a-form :model="form" layout="vertical" @submit="handleSubmit">
        <a-form-item field="baseUrl" label="服务器地址" required>
          <a-input v-model="form.baseUrl" placeholder="http://192.168.50.188:8819" />
        </a-form-item>
        <a-form-item field="adminKey" label="管理密钥 (ADMIN_KEY)" required>
          <a-input v-model="form.adminKey" placeholder="请输入管理功能密钥" />
        </a-form-item>
        <a-form-item field="debug" label="调试模式 (Debug)">
          <a-switch v-model="form.debug" />
        </a-form-item>
        <a-button type="primary" html-type="submit" :loading="loading" long>
          验证并进入系统
        </a-button>
      </a-form>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useAccountStore } from '@/store/account';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { adminApi } from '@/api/modules/admin';

const accountStore = useAccountStore();
const router = useRouter();
const loading = ref(false);

const form = reactive({
  baseUrl: accountStore.baseUrl || '',
  adminKey: accountStore.adminKey,
  debug: accountStore.debug.all || false,
});

const handleSubmit = async () => {
  if (!form.baseUrl || !form.adminKey) return Message.warning('请填写完整');
  
  loading.value = true;
  try {
    // 立即存入 localStorage，确保 request.ts 的拦截器能拿到最新的配置
    localStorage.setItem('iwe_base_url', form.baseUrl);
    localStorage.setItem('iwe_admin_token', form.adminKey);
    localStorage.setItem('ADMIN_KEY', form.adminKey);
    
    // 兼容新结构，初次配置只更新 all 开关
    const newDebugConfig = { ...accountStore.debug, all: form.debug };
    localStorage.setItem('debug_config', JSON.stringify(newDebugConfig));

    // 显式传入 key 进行验证，确保万无一失
    await adminApi.ping(form.adminKey);
    
    // 验证成功后更新 store
    accountStore.setGlobalConfig(form.baseUrl, form.adminKey, form.adminKey, newDebugConfig);
    
    Message.success('验证成功，配置已保存');
    router.push('/');
  } catch (err) {
    console.error('验证失败:', err);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.config-container { height: 100vh; display: flex; justify-content: center; align-items: center; background-color: #f2f3f5; }
</style>
