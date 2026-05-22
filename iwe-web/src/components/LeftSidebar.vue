<template>
  <!-- 第一栏：账号栏 -->
  <div v-if="!accountStore.tokenKey" class="column account-bar">
    <!-- 顶部 Logo / 装饰 -->
    <div class="account-bar-logo" style="display: flex; flex-direction: column; align-items: center; height: auto;">
      <div class="logo-inner">
        <icon-thunderbolt :size="16" />
      </div>
      <div v-if="accountStore.isDemoMode" class="sidebar-demo-badge">DEMO</div>
    </div>
    
    <div class="bar-divider"></div>

    <!-- 账号列表 -->
    <div class="account-list">
      <div 
        v-for="(acc, index) in accountStore.accounts" 
        :key="acc.uuid || index"
        class="account-item"
        :class="{
          active: accountStore.activeAccountUuid === acc.uuid || pendingAccountUuid === acc.uuid,
          offline: acc.status === 'offline'
        }"
        @click="emit('switchAccount', acc.uuid)"
      >
        <!-- 悬浮发光背景和指示器 -->
        <div class="active-indicator"></div>
        
        <a-tooltip :content="`${acc.nickname} (${acc.status === 'online' ? '在线' : '离线'})`" position="right">
          <div class="avatar-wrapper">
            <a-avatar :size="46" shape="square" class="acc-avatar" :class="{ 'online-neon': acc.status === 'online' }">
              <img v-if="accountStore.getAccountAvatar(acc)" :src="accountStore.getAccountAvatar(acc)" referrerpolicy="no-referrer" :style="acc.status === 'offline' ? { filter: 'grayscale(100%)', opacity: '0.6' } : {}" />
              <template v-else>
                <span :style="acc.status === 'offline' ? { color: '#666' } : {}">{{ acc.nickname[0] }}</span>
              </template>
            </a-avatar>
          </div>
        </a-tooltip>
      </div>
      
      <!-- 功能按钮组：加号 & 钥匙 -->
      <div class="action-buttons-group">
        <a-tooltip content="扫码添加账号" position="right">
          <div class="add-account-btn" @click="emit('addAccount')">
            <div class="icon-wrapper">
              <icon-plus :size="18" />
            </div>
          </div>
        </a-tooltip>
        
        <a-tooltip content="手动输入授权码登录" position="right">
          <div class="add-account-btn manual-btn" @click="emit('manualLogin')">
            <div class="icon-wrapper">
              <icon-safe :size="16" />
            </div>
          </div>
        </a-tooltip>
      </div>
    </div>

    <!-- 底部系统设置 -->
    <div class="account-bar-footer">
      <a-tooltip content="系统管理控制台" position="right">
        <div class="global-settings-btn" @click="emit('openGlobalSettings')">
          <icon-tool :size="20" />
        </div>
      </a-tooltip>
    </div>
  </div>

  <!-- 第二栏：功能导航 -->
  <div class="column nav-bar">
    <!-- 顶部当前账号在线状态装饰 & 支持点击手动在线检测 -->
    <div class="nav-bar-header" style="display: flex; flex-direction: column; align-items: center; height: auto; gap: 4px; margin-bottom: 16px;">
      <div class="status-indicator" style="cursor: pointer;">
        <a-tooltip :content="activeAccountOnlineStatus === '在线' ? '当前账号在线 (点击重新检测)' : '当前账号离线 (点击检测上线)'" position="right">
          <div 
            class="status-pulse" 
            :class="{ online: activeAccountOnlineStatus === '在线' }"
            @click="emit('activeAccountManualCheck')"
          >
            <span class="pulse-ring"></span>
            <span class="pulse-dot"></span>
          </div>
        </a-tooltip>
      </div>
      <div v-if="accountStore.isDemoMode && accountStore.tokenKey" class="sidebar-demo-badge nav-demo-badge">DEMO</div>
    </div>

    <!-- 导航项列表 -->
    <div class="nav-items-list">
      <a-tooltip content="聊天会话" position="right">
        <div 
          class="nav-item" 
          :class="{ active: activeTab === 'chat' }"
          @click="emit('update:activeTab', 'chat')"
        >
          <div class="nav-item-bg"></div>
          <icon-message :size="22" class="nav-icon" />
        </div>
      </a-tooltip>
      
      <a-tooltip content="通讯录" position="right">
        <div 
          class="nav-item" 
          :class="{ active: activeTab === 'contact' }"
          @click="emit('switchContact')"
        >
          <div class="nav-item-bg"></div>
          <icon-user :size="22" class="nav-icon" />
        </div>
      </a-tooltip>
    </div>

    <!-- 底部配置与登录 -->
    <div class="nav-bar-footer">
      <a-tooltip content="当前账号设置" position="right">
        <div class="nav-item settings-item" @click="emit('openPersonalSettings')">
          <icon-settings :size="22" />
        </div>
      </a-tooltip>
      
      <a-tooltip v-if="activeAccountOnlineStatus !== '在线'" :content="loginBtnTooltip" position="right">
        <div class="nav-item manual-login-item" @click="handleLoginClick">
          <icon-import :size="22" />
        </div>
      </a-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAccountStore } from '@/store/account';
import { 
  IconThunderbolt, IconPlus, IconSafe, IconTool, 
  IconMessage, IconUser, IconSettings, IconImport 
} from '@arco-design/web-vue/es/icon';

const props = defineProps<{
  activeTab: 'chat' | 'contact';
  pendingAccountUuid: string;
}>();

const emit = defineEmits<{
  (e: 'update:activeTab', tab: 'chat' | 'contact'): void;
  (e: 'switchContact'): void;
  (e: 'switchAccount', uuid: string): void;
  (e: 'addAccount'): void;
  (e: 'manualLogin'): void;
  (e: 'openGlobalSettings'): void;
  (e: 'openPersonalSettings'): void;
  (e: 'activeAccountManualCheck'): void;
}>();

const accountStore = useAccountStore();

const activeAccountOnlineStatus = computed(() => {
  const acc = accountStore.accounts.find(a => a.uuid === accountStore.activeAccountUuid);
  return acc?.status === 'online' ? '在线' : '离线';
});

const loginBtnTooltip = computed(() => {
  if (!accountStore.tokenKey) return '个人登录';
  
  // 个人模式下，判断当前账号是否为“空槽位”（即 uuid 为空或等于 sessionKey）
  const acc = accountStore.accounts.find(a => a.uuid === accountStore.activeAccountUuid);
  const isEmptySlot = !acc?.uuid || acc.uuid === acc.sessionKey;
  
  return isEmptySlot ? '扫码登录微信' : '个人登录';
});

const handleLoginClick = () => {
  const acc = accountStore.accounts.find(a => a.uuid === accountStore.activeAccountUuid);
  const isEmptySlot = !acc?.uuid || acc.uuid === acc.sessionKey;

  if (isEmptySlot) {
    emit('addAccount'); // 复制全局 + 号内的扫码登录功能
  } else {
    emit('manualLogin'); // 触发普通登录/激活
  }
};
</script>

<style scoped>
.sidebar-demo-badge {
  font-size: 8px;
  font-weight: 800;
  color: #14c9c9;
  background: rgba(20, 201, 190, 0.15);
  border: 1px solid rgba(20, 201, 190, 0.4);
  padding: 1px 4px;
  border-radius: 4px;
  margin-top: 4px;
  letter-spacing: 0.5px;
  text-shadow: 0 0 6px rgba(20, 201, 190, 0.6);
  box-shadow: 0 0 8px rgba(20, 201, 190, 0.2);
  animation: demo-glow 1.5s infinite alternate ease-in-out;
  user-select: none;
  z-index: 5;
}

.nav-demo-badge {
  margin-top: 4px;
  font-size: 7px;
  padding: 0px 3px;
}

@keyframes demo-glow {
  0% {
    box-shadow: 0 0 4px rgba(20, 201, 190, 0.2);
    border-color: rgba(20, 201, 190, 0.3);
  }
  100% {
    box-shadow: 0 0 10px rgba(20, 201, 190, 0.5);
    border-color: rgba(20, 201, 190, 0.7);
  }
}
</style>


