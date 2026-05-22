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
      <div v-else class="admin-dashboard">
        <div class="success-header">
           <icon-check-circle-fill size="32" style="color: #0fc6c2" />
           <h3>管理员身份已确认</h3>
        </div>

        <div class="action-cards">
          <div class="action-card primary-action" @click="enterMultiAccount">
            <div class="icon-wrapper"><icon-apps size="28" /></div>
            <div class="card-text">
              <h4>进入多账户主控室</h4>
              <p>全局管理、监控所有账号状态</p>
            </div>
            <icon-right size="20" class="arrow" />
          </div>
        </div>

        <div class="divider">
          <span>或选择单个授权账号进入</span>
        </div>

        <div class="auth-list">
           <a-spin :loading="fetchingAuths">
             <div v-if="authList.length === 0" class="empty-state">
                暂无绑定的授权码，请先在主控室生成
             </div>
             <div 
               v-else
               v-for="auth in authList" 
               :key="auth.id" 
               class="auth-item" 
               @click="enterSingleAccount(auth.license)"
             >
                <div class="auth-avatar">
                   <icon-user size="20" />
                </div>
                <div class="auth-info">
                  <div class="auth-name-row">
                    <span class="auth-name">{{ auth.nick_name || '未登录账号' }}</span>
                    <span class="auth-status" :class="auth.status === 1 ? 'online' : 'offline'">
                      {{ auth.status === 1 ? '在线' : '离线' }}
                    </span>
                  </div>
                  <div class="auth-license">{{ maskLicense(auth.license) }}</div>
                </div>
                <icon-right size="16" class="arrow" />
             </div>
           </a-spin>
        </div>

        <a-button type="text" long @click="logoutAdmin" class="back-btn">
          <template #icon><icon-left /></template> 返回
        </a-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { useAccountStore } from '@/store/account';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { adminApi } from '@/api/modules/admin';
import { loginApi } from '@/api/modules/im';
import { 
  IconCheckCircleFill, IconApps, IconRight, IconUser, IconLeft 
} from '@arco-design/web-vue/es/icon';

const accountStore = useAccountStore();
const router = useRouter();
const loading = ref(false);
const loginMode = ref('admin'); // 'admin' | 'token'
const adminVerified = ref(false);
const fetchingAuths = ref(false);
const authList = ref<any[]>([]);

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

const maskLicense = (license: string) => {
  if (!license || license.length <= 8) return license;
  return license.slice(0, 4) + '****' + license.slice(-4);
};

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
      fetchAuthList();
    } catch (err: any) {
      console.error('验证失败:', err);
      Message.error('验证失败，请检查密钥是否正确');
    } finally {
      loading.value = false;
    }
  } else {
    // 单账号模式
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

const fetchAuthList = async () => {
  fetchingAuths.value = true;
  try {
    const res: any = await adminApi.getAuthKey();
    if (Array.isArray(res)) {
      authList.value = res;
      
      // 🚀 修复 Vue 响应式：必须循环 `authList.value`（代理对象）而非 raw `res`，这样异步修改 status 才能触发 Vue 的 DOM 更新！
      authList.value.forEach(async (auth: any) => {
        try {
          const statusRes: any = await loginApi.getOnlineStatus(auth.license);
          const data = statusRes?.Data || statusRes;
          if (data) {
            // loginState === 1 代表在线
            auth.status = data.loginState === 1 ? 1 : 0;
            // 顺便补全最新的微信昵称
            if (data.nickname || data.Nickname) {
              auth.nick_name = data.nickname || data.Nickname;
            }
          }
        } catch (err) {
          console.warn(`获取授权码 ${auth.license} 实时状态失败:`, err);
          auth.status = 0; // 查询失败则默认为离线
        }
      });
    } else {
      authList.value = [];
    }
  } catch (err) {
    Message.error('获取授权码列表失败');
  } finally {
    fetchingAuths.value = false;
  }
};

const enterMultiAccount = () => {
  localStorage.removeItem('TOKEN_KEY');
  const debugConfig = { ...(accountStore.debug || {}), all: form.debug };
  accountStore.setGlobalConfig(form.baseUrl, form.adminKey, '', debugConfig);
  router.push('/');
};

const enterSingleAccount = (license: string) => {
  localStorage.setItem('TOKEN_KEY', license);
  const debugConfig = { ...(accountStore.debug || {}), all: form.debug };
  accountStore.setGlobalConfig(form.baseUrl, form.adminKey, license, debugConfig);
  Message.success('进入个人终端');
  router.push('/');
};

const logoutAdmin = () => {
  adminVerified.value = false;
  authList.value = [];
};
</script>

<style scoped>
/* 定义变量和重置 */
.config-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #0f1115;
  background-image: radial-gradient(circle at 50% 0%, #1f2229 0%, #0f1115 100%);
  color: #e5e6eb;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

/* 磨砂玻璃卡片 */
.glass-card {
  width: 100%;
  max-width: 440px;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.02) inset;
  transition: all 0.3s ease;
}

/* 头部样式 */
.header {
  text-align: center;
  margin-bottom: 32px;
}

.glow-text {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 0 20px rgba(15, 198, 194, 0.4);
  letter-spacing: 1px;
}

.subtitle {
  margin-top: 8px;
  font-size: 13px;
  color: #86909c;
  letter-spacing: 0.5px;
}

/* 表单定制 */
:deep(.arco-form-item-label-col > label) {
  color: #a9aeb8;
  font-weight: 500;
}

:deep(.arco-input-wrapper) {
  background-color: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #e5e6eb;
}

:deep(.arco-input-wrapper:hover), :deep(.arco-input-wrapper.arco-input-focus) {
  border-color: #0fc6c2;
  background-color: rgba(0, 0, 0, 0.3);
}

:deep(.arco-input) {
  color: #e5e6eb;
}

/* Tabs 定制 */
.custom-tabs {
  margin-bottom: 24px;
}
:deep(.arco-tabs-nav-type-capsule .arco-tabs-tab) {
  background-color: rgba(0, 0, 0, 0.2);
  color: #86909c;
  border-radius: 6px;
}
:deep(.arco-tabs-nav-type-capsule .arco-tabs-tab-active) {
  background-color: #0fc6c2;
  color: #1d2129;
  font-weight: 600;
}

/* 调试开关 */
.extra-settings {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  padding-top: 8px;
}

.debug-label {
  margin-left: 8px;
  font-size: 13px;
  color: #86909c;
}

/* 发光按钮 */
.glow-btn {
  background: linear-gradient(135deg, #0fc6c2 0%, #14c9c9 100%);
  border: none;
  border-radius: 8px;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  color: #000;
  box-shadow: 0 8px 16px rgba(15, 198, 194, 0.2);
  transition: all 0.3s ease;
  cursor: pointer;
}

.glow-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 20px rgba(15, 198, 194, 0.4);
}

/* 管理员 Dashboard 状态 */
.success-header {
  text-align: center;
  margin-bottom: 32px;
}

.success-header h3 {
  margin: 12px 0 0 0;
  color: #e5e6eb;
  font-weight: 600;
}

.action-cards {
  margin-bottom: 24px;
}

.action-card {
  display: flex;
  align-items: center;
  padding: 16px;
  border-radius: 12px;
  background: rgba(15, 198, 194, 0.1);
  border: 1px solid rgba(15, 198, 194, 0.2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-card:hover {
  background: rgba(15, 198, 194, 0.15);
  border-color: rgba(15, 198, 194, 0.4);
  transform: translateY(-2px);
}

.action-card .icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: linear-gradient(135deg, #0fc6c2 0%, #14c9c9 100%);
  color: #000;
  margin-right: 16px;
}

.action-card .card-text h4 {
  margin: 0 0 4px 0;
  color: #e5e6eb;
  font-size: 15px;
}

.action-card .card-text p {
  margin: 0;
  color: #86909c;
  font-size: 12px;
}

.action-card .arrow {
  margin-left: auto;
  color: #86909c;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 24px 0;
  color: #4e5969;
  font-size: 12px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.divider span {
  padding: 0 12px;
}

.auth-list {
  max-height: 200px;
  overflow-y: auto;
  padding-right: 4px;
}

/* 滚动条美化 */
.auth-list::-webkit-scrollbar {
  width: 4px;
}
.auth-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.empty-state {
  text-align: center;
  color: #86909c;
  padding: 20px 0;
  font-size: 13px;
}

.auth-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  margin-bottom: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.auth-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
}

.auth-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  color: #e5e6eb;
}

.auth-info {
  flex: 1;
}

.auth-name-row {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.auth-name {
  font-size: 14px;
  color: #e5e6eb;
  margin-right: 8px;
  font-weight: 500;
}

.auth-status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.auth-status.online {
  background: rgba(0, 180, 42, 0.1);
  color: #00b42a;
}

.auth-status.offline {
  background: rgba(134, 144, 156, 0.1);
  color: #86909c;
}

.auth-license {
  font-size: 12px;
  color: #86909c;
  font-family: monospace;
}

.auth-item .arrow {
  color: #4e5969;
}

.back-btn {
  margin-top: 16px;
  color: #86909c;
}
.back-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e5e6eb;
}

@media (max-width: 480px) {
  .glass-card {
    padding: 24px 20px;
  }
  .glow-text {
    font-size: 24px;
  }
}

/* DEMO 体验卡片 */
.demo-card-container {
  margin-top: 16px;
}

.demo-glass-card {
  padding: 14px 20px;
  background: rgba(20, 201, 190, 0.05);
  border: 1px dashed rgba(20, 201, 190, 0.25);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  text-align: center;
  position: relative;
  overflow: hidden;
  box-shadow: 0 0 10px rgba(20, 201, 190, 0.05);
}

.demo-glass-card:hover {
  background: rgba(20, 201, 190, 0.12);
  border-color: rgba(20, 201, 190, 0.6);
  box-shadow: 0 0 20px rgba(20, 201, 190, 0.25);
  transform: translateY(-1px);
}

.demo-glow-text {
  font-size: 15px;
  font-weight: 600;
  color: #14c9c9;
  text-shadow: 0 0 12px rgba(20, 201, 190, 0.35);
  letter-spacing: 0.5px;
  display: block;
}

.demo-desc {
  margin: 4px 0 0 0;
  font-size: 11px;
  color: #86909c;
}
</style>
