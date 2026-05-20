<template>
  <!-- 第一栏：账号栏 -->
  <div v-if="!accountStore.tokenKey" class="column account-bar">
    <!-- 顶部 Logo / 装饰 -->
    <div class="account-bar-logo">
      <div class="logo-inner">
        <icon-thunderbolt :size="16" />
      </div>
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
              <img v-if="getAccountAvatar(acc)" :src="getAccountAvatar(acc)" referrerpolicy="no-referrer" :style="acc.status === 'offline' ? { filter: 'grayscale(100%)', opacity: '0.6' } : {}" />
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
    <div class="nav-bar-header">
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
      
      <a-tooltip v-if="activeAccountOnlineStatus !== '在线'" :content="accountStore.tokenKey ? '扫码登录微信' : '手动输入授权码登录'" position="right">
        <div class="nav-item manual-login-item" @click="emit('manualLogin')">
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

const getContactAvatar = (c: any) => {
  const url = c.smallHeadImgUrl || c.SmallHeadImgUrl || c.headImgUrl || c.HeadImgUrl || c.avatar || '';
  const rawUrl = typeof url === 'string' ? url.trim().replace(/`/g, '') : '';
  if (!rawUrl) return '';
  return accountStore.avatarBlobMap[rawUrl] || rawUrl;
};

const getAccountAvatar = (acc: any) => {
  if (!acc) return '';
  const selfContact = accountStore.accountContactMaps[acc.uuid]?.[acc.uuid];
  if (selfContact) {
    const cached = getContactAvatar(selfContact);
    if (cached) return cached;
  }
  const activeContact = accountStore.contactMap[acc.uuid];
  if (activeContact) {
    const cached = getContactAvatar(activeContact);
    if (cached) return cached;
  }
  if (acc.avatar) {
    return accountStore.avatarBlobMap[acc.avatar] || acc.avatar;
  }
  return '';
};
</script>

<style scoped>
.column {
  height: 100%;
  display: flex;
  flex-direction: column;
}
/* 第一栏：账号栏 */
.account-bar {
  width: 76px;
  background: #111111;
  border-right: 1px solid #222222;
  align-items: center;
  padding: 18px 0;
  flex-shrink: 0;
}
.account-bar-logo {
  margin-bottom: 16px;
}
.logo-inner {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #07c160, #00d285);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(7, 193, 96, 0.3);
}
.bar-divider {
  width: 32px;
  height: 1px;
  background: #2e2e2e;
  margin-bottom: 20px;
}
.account-list {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  overflow-y: auto;
}
.account-list::-webkit-scrollbar {
  display: none;
}
.account-item {
  position: relative;
  cursor: pointer;
  padding: 2px;
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.active-indicator {
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%) scaleX(0);
  width: 4px;
  height: 24px;
  background: #07c160;
  border-radius: 0 4px 4px 0;
  transition: all 0.3s ease;
  transform-origin: left center;
}
.account-item.active .active-indicator {
  transform: translateY(-50%) scaleX(1);
}
.avatar-wrapper {
  position: relative;
  border-radius: 10px;
  padding: 2px;
  background: transparent;
  transition: all 0.3s;
}
.account-item.active .avatar-wrapper {
  background: linear-gradient(135deg, #07c160, #00d285);
  box-shadow: 0 4px 14px rgba(7, 193, 96, 0.4);
}
.acc-avatar {
  border: 2px solid #111111;
  transition: all 0.3s;
  background: #2a2a2a;
}
:deep(.acc-avatar.arco-avatar-square) {
  border-radius: 8px;
}
.account-item:hover .acc-avatar {
  transform: scale(1.05);
}
/* Neon online/offline indicators */
.online-neon {
  box-shadow: 0 0 10px rgba(7, 193, 96, 0.4);
}
.account-item.offline {
  opacity: 0.7;
}
.action-buttons-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
  padding-bottom: 20px;
}
.add-account-btn {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  border: 1px dashed #333333;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
  color: #86909c;
}
.add-account-btn:hover {
  border-color: #07c160;
  color: #07c160;
  background: rgba(7, 193, 96, 0.05);
  transform: translateY(-2px);
}
.account-bar-footer {
  width: 100%;
  display: flex;
  justify-content: center;
  padding-top: 15px;
  border-top: 1px solid #222222;
}
.global-settings-btn {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #86909c;
  transition: all 0.3s;
}
.global-settings-btn:hover {
  background: #2e2e2e;
  color: #ffffff;
  transform: rotate(45deg);
}

/* 第二栏：功能导航 */
.nav-bar {
  width: 68px;
  background: #181818;
  border-right: 1px solid #222222;
  align-items: center;
  padding: 15px 0;
  flex-shrink: 0;
}
.nav-bar-header {
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 25px;
}
.status-indicator {
  position: relative;
}
.status-pulse {
  width: 12px;
  height: 12px;
  background: #86909c;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.status-pulse.online {
  background: #07c160;
  box-shadow: 0 0 0 0 rgba(7, 193, 96, 0.7);
}
.pulse-ring {
  position: absolute;
  width: 24px;
  height: 24px;
  border: 2px solid #07c160;
  border-radius: 50%;
  opacity: 0;
  animation: none;
}
.status-pulse.online .pulse-ring {
  animation: pulse-animation 2s infinite;
}
@keyframes pulse-animation {
  0% {
    transform: scale(0.5);
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}
.nav-items-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  align-items: center;
}
.nav-item {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  color: #86909c;
  transition: all 0.3s;
}
.nav-item-bg {
  position: absolute;
  inset: 0;
  background: #07c160;
  border-radius: 10px;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 1;
}
.nav-icon {
  position: relative;
  z-index: 2;
  transition: all 0.3s;
}
.nav-item:hover {
  color: #ffffff;
}
.nav-item.active {
  color: #ffffff;
}
.nav-item.active .nav-item-bg {
  opacity: 1;
  transform: scale(1);
}
.nav-bar-footer {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  padding-top: 15px;
  border-top: 1px solid #222222;
}
.settings-item:hover {
  transform: rotate(30deg);
}

@media (max-width: 768px) {
  /* Scale down sizing for mobile comfort */
  .acc-avatar {
    width: 40px !important;
    height: 40px !important;
  }
  :deep(.acc-avatar.arco-avatar-square) {
    border-radius: 8px !important;
  }
  .action-buttons-group {
    gap: 8px !important;
  }
  .add-account-btn {
    width: 36px !important;
    height: 36px !important;
  }
  .global-settings-btn, .settings-item, .manual-login-item {
    width: 36px !important;
    height: 36px !important;
  }
  .nav-item {
    width: 36px !important;
    height: 36px !important;
  }
}
</style>
