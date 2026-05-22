<template>
  <div class="admin-dashboard">
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

    <a-button type="text" long @click="emit('logout')" class="back-btn">
      <template #icon><icon-left /></template> 返回
    </a-button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAccountStore } from '@/store/account';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { adminApi } from '@/api/modules/admin';
import { loginApi } from '@/api/modules/im';
import { 
  IconCheckCircleFill, IconApps, IconRight, IconUser, IconLeft
} from '@arco-design/web-vue/es/icon';

const props = defineProps<{
  baseUrl: string;
  adminKey: string;
  debug: boolean;
}>();

const emit = defineEmits<{
  (e: 'logout'): void;
}>();

const accountStore = useAccountStore();
const router = useRouter();

const fetchingAuths = ref(false);
const authList = ref<any[]>([]);

onMounted(() => {
  fetchAuthList();
});

const maskLicense = (license: string) => {
  if (!license || license.length <= 8) return license;
  return license.slice(0, 4) + '****' + license.slice(-4);
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
  const debugConfig = { ...(accountStore.debug || {}), all: props.debug };
  accountStore.setGlobalConfig(props.baseUrl, props.adminKey, '', debugConfig);
  router.push('/');
};

const enterSingleAccount = (license: string) => {
  localStorage.setItem('TOKEN_KEY', license);
  const debugConfig = { ...(accountStore.debug || {}), all: props.debug };
  accountStore.setGlobalConfig(props.baseUrl, props.adminKey, license, debugConfig);
  Message.success('进入个人终端');
  router.push('/');
};
</script>

<style scoped src="../../views/Config.css"></style>

