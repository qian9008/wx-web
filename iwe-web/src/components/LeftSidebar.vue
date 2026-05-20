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
</script>


