<template>
  <div class="config-container dark-theme">
    <div class="glass-card">
      <div class="header">
        <h1 class="glow-text">IWE 终端</h1>
        <p class="subtitle">Next Generation IM Workstation</p>
      </div>

      <!-- State 1: Login Form -->
      <div v-if="!adminVerified" class="form-section">
        <a-form :model="form" layout="vertical" @submit="handleVerify">
          <a-form-item field="baseUrl" label="服务器地址" required>
            <a-input v-model="form.baseUrl" placeholder="http://192.168.x.x:8819" allow-clear />
          </a-form-item>
          
          <a-tabs type="capsule" v-model:active-key="loginMode" class="custom-tabs">
            <a-tab-pane key="admin" title="管理员模式">
              <a-form-item field="adminKey" label="管理密钥 (ADMIN_KEY)">
                <a-input-password v-model="form.adminKey" placeholder="请输入管理密钥" allow-clear />
              </a-form-item>
            </a-tab-pane>
            
            <a-tab-pane key="token" title="单账号模式">
              <a-form-item field="tokenKey" label="授权码 (TOKEN_KEY)">
                <a-input-password v-model="form.tokenKey" placeholder="请输入您的授权码" allow-clear />
              </a-form-item>
            </a-tab-pane>
          </a-tabs>

          <div class="extra-settings">
            <a-switch v-model="form.debug" size="small" />
            <span class="debug-label">开启调试模式</span>
          </div>

          <a-button type="primary" html-type="submit" :loading="loading" long size="large" class="glow-btn">
            {{ loginMode === 'admin' ? '验证管理身份' : '进入个人终端' }}
          </a-button>
          
          <div class="demo-card-container">
            <div class="demo-glass-card" @click="enterDemoMode">
              <span class="demo-glow-text">进入 DEMO 体验模式</span>
              <p class="demo-desc">秒级免扫码，零部署体验全套高阶功能</p>
            </div>
          </div>
        </a-form>
      </div>

      <!-- State 2: Admin Dashboard Choice -->
      <AdminDashboard
        v-else
        :base-url="form.baseUrl"
        :admin-key="form.adminKey"
        :debug="form.debug"
        @logout="logoutAdmin"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { useAccountStore } from '@/store/account';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { adminApi } from '@/api/modules/admin';
import AdminDashboard from '@/components/config/AdminDashboard.vue';

const accountStore = useAccountStore();
const router = useRouter();
const loading = ref(false);
const loginMode = ref('admin'); // 'admin' | 'token'
const adminVerified = ref(false);

const form = reactive({
  baseUrl: accountStore.baseUrl || '',
  adminKey: accountStore.adminKey || '',
  tokenKey: accountStore.tokenKey || '',
  debug: accountStore.debug?.all || false,
});

onMounted(() => {
  if (accountStore.tokenKey) {
    loginMode.value = 'token';
  } else {
    loginMode.value = 'admin';
  }
});

const saveBaseConfig = () => {
  localStorage.setItem('baseUrl', form.baseUrl);
  localStorage.setItem('iwe_base_url', form.baseUrl);
  
  const newDebugConfig = { ...(accountStore.debug || {}), all: form.debug };
  localStorage.setItem('debug_config', JSON.stringify(newDebugConfig));
  return newDebugConfig;
};

const enterDemoMode = async () => {
  localStorage.setItem('isDemoMode', 'true');
  accountStore.isDemoMode = true;
  await accountStore.syncAccountsFromServer();
  Message.success({
    content: '已成功开启 DEMO 演示体验模式！',
    duration: 3
  });
  router.replace('/');
};

const handleVerify = async () => {
  if (!form.baseUrl) return Message.warning('请填写服务器地址');
  
  localStorage.removeItem('isDemoMode');
  accountStore.isDemoMode = false;
  
  const debugConfig = saveBaseConfig();

  if (loginMode.value === 'admin') {
    if (!form.adminKey) return Message.warning('请输入管理密钥');
    
    loading.value = true;
    try {
      localStorage.setItem('ADMIN_KEY', form.adminKey);
      localStorage.setItem('iwe_admin_token', form.adminKey);
      
      await adminApi.ping(form.adminKey);
      
      accountStore.setGlobalConfig(form.baseUrl, form.adminKey, '', debugConfig);
      
      adminVerified.value = true;
      Message.success('管理员身份验证成功');
    } catch (err: any) {
      console.error('验证失败:', err);
      Message.error('验证失败，请检查密钥是否正确');
    } finally {
      loading.value = false;
    }
  } else {
    // 单账号模式的手动输入授权码登录
    if (!form.tokenKey) return Message.warning('请输入授权码');
    
    loading.value = true;
    try {
      localStorage.setItem('TOKEN_KEY', form.tokenKey);
      accountStore.setGlobalConfig(form.baseUrl, '', form.tokenKey, debugConfig);
      
      Message.success('进入个人终端');
      router.push('/');
    } catch (err) {
      console.error('进入失败:', err);
    } finally {
      loading.value = false;
    }
  }
};

const logoutAdmin = () => {
  adminVerified.value = false;
};
</script>

<style scoped src="./Config.css"></style>
