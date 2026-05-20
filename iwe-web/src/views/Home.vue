<template>
  <div class="workbench" :class="{ 'has-active-chat': !!chatStore.activeId }">
    <!-- 第一栏与第二栏：侧边栏与功能导航 -->
    <LeftSidebar
      v-model:active-tab="activeTab"
      :pending-account-uuid="pendingAccountUuid"
      @switch-contact="handleSwitchContact"
      @switch-account="handleSwitchAccount"
      @add-account="handleAddAccount"
      @manual-login="handleManualLogin"
      @open-global-settings="handleOpenGlobalSettings"
      @open-personal-settings="handleOpenPersonalSettings"
      @active-account-manual-check="handleActiveAccountManualCheck"
    />

    <!-- 第三栏：列表展示 -->
    <ListSidebar
      :active-tab="activeTab"
      :active-id="chatStore.activeId"
      @select-chat="handleSelectChat"
      @select-contact="handleSelectContact"
    />

    <!-- 第四栏：内容视窗 -->
    <ChatArea
      :active-id="chatStore.activeId"
      :partner-name="currentChatPartnerName"
      :messages="currentMessages"
      :self-avatar="currentAccountAvatar"
      :partner-avatar="currentPartnerAvatar"
      :active-account-uuid="accountStore.activeAccountUuid"
      :has-conversations="currentConversations.length > 0"
      @send-message="handleSendMessage"
      @add-account="handleAddAccount"
      @back="chatStore.activeId = ''"
    />

    <!-- 弹窗部分 -->
    <LoginModal
      v-model:visible="loginVisible"
      :pending-session-key="pendingSessionKey"
      @success="handleLoginSuccess"
    />

    <SettingsModal
      v-model:visible="adminVisible"
      :context="adminPanelContext"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useAccountStore } from '@/store/account';
import { useChatStore } from '@/store/chat';
import { socketManager } from '@/utils/socketManager';
import { loginApi, messageApi } from '@/api/modules/im';
import { adminApi } from '@/api/modules/admin';
import { Message } from '@arco-design/web-vue';
import { 
  IconPlus, IconMessage, IconUser, IconSettings, 
  IconFaceSmileFill, IconFolder, IconImage, IconTool,
  IconThunderbolt, IconCheckCircle, IconSafe, IconCloseCircle,
  IconImport, IconLeft
} from '@arco-design/web-vue/es/icon';
import { contactCache } from '@/utils/contactCache';
import ChatArea from '@/components/ChatArea.vue';
import SettingsModal from '@/components/SettingsModal.vue';
import LeftSidebar from '@/components/LeftSidebar.vue';
import ListSidebar from '@/components/ListSidebar.vue';
import LoginModal from '@/components/LoginModal.vue';
import dayjs from 'dayjs';

import { isDebug } from '@/utils/debug';
const accountStore = useAccountStore();
const chatStore = useChatStore();

// --- 基础辅助工具函数（优先提升至初始化顶部，避免 TDZ 问题） ---
const getContactId = (c: any) => {
  if (!c) return '';
  const user = c.userName || c.UserName || c.wxid;
  return (user && typeof user === 'object') ? (user.str || '') : (user || '');
};

const getContactName = (c: any) => {
  if (!c) return '未知';
  const nick = c.nickName || c.NickName || c.nickname;
  const nickStr = (nick && typeof nick === 'object') ? nick.str : nick;
  const remark = c.remark || c.Remark;
  const remarkStr = (remark && typeof remark === 'object') ? remark.str : remark;
  return remarkStr || nickStr || getContactId(c) || '未知';
};

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

const loginVisible = ref(false);
const adminVisible = ref(false);
const adminPanelContext = ref<'global' | 'personal'>('global');

const pendingAccountUuid = ref('');
const activeAccountOnlineStatus = computed(() => {
  const acc = accountStore.accounts.find(a => a.uuid === accountStore.activeAccountUuid);
  return acc?.status === 'online' ? '在线' : '离线';
});

const handleSwitchAccount = async (uuid: string) => {
  if (accountStore.activeAccountUuid === uuid) return;
  pendingAccountUuid.value = uuid;
  
  try {
    // 🚀 核心控制：在切换 activeAccountUuid 之前，预先并行加载目标账号的联系人与会话缓存进入内存
    // 确保切换后所有依赖 activeAccountUuid 的 computed 属性能够直接同步且完美地加载渲染，杜绝 UI 抖动与临时降级 placeholder 的尴尬
    await Promise.all([
      accountStore.loadContactsFromCache(uuid),
      chatStore.loadConversations(uuid)
    ]);
  } catch (err) {
    console.warn('[Home] 切换账号时预加载缓存失败:', err);
  } finally {
    accountStore.activeAccountUuid = uuid;
    pendingAccountUuid.value = '';
    // 自动重置当前聊天，防跨账号会话串屏
    chatStore.activeId = '';
  }
};

const handleManualCheckOnline = async (acc: any) => {
  if (!acc.sessionKey) return;
  try {
    Message.info(`正在检测账号 ${acc.nickname || '微信'} 的在线状态...`);
    const isOnline = await accountStore.checkSingleAccountStatus(acc.sessionKey);
    if (isOnline) {
      Message.success(`账号 ${acc.nickname || '微信'} 当前已成功上线！`);
    } else {
      Message.warning(`账号 ${acc.nickname || '微信'} 当前处于离线状态。`);
    }
  } catch (err: any) {
    Message.error(`状态检测失败: ${err.message || err}`);
  }
};

const handleActiveAccountManualCheck = async () => {
  const acc = accountStore.accounts.find(a => a.uuid === accountStore.activeAccountUuid || a.sessionKey === accountStore.activeAccountUuid);
  if (!acc) {
    Message.warning('当前未选择活跃账号');
    return;
  }
  await handleManualCheckOnline(acc);
};

const handleOpenGlobalSettings = () => {
  adminPanelContext.value = 'global';
  adminVisible.value = true;
};

const handleOpenPersonalSettings = () => {
  adminPanelContext.value = 'personal';
  adminVisible.value = true;
};

const pendingSessionKey = ref('');
const accountResults = ref<Record<string, any>>({});

// 表单数据绑定

// 管理功能相关

const handleAddAccount = () => {
  // 自动分配一个未使用的槽位 Key
  const idleAccount = accountStore.accounts.find(a => a.status === 'offline' && a.sessionKey);
  if (idleAccount) {
    pendingSessionKey.value = idleAccount.sessionKey;
    console.log(`[Home] 自动分配槽位 Key: ${pendingSessionKey.value}`);
  } else {
    pendingSessionKey.value = '';
    console.log('[Home] 无空闲槽位，将尝试创建新账号');
  }
  loginVisible.value = true;
};

const handleManualLogin = () => {
  // 1. 如果是个人模式，直接使用个人授权码
  if (accountStore.tokenKey) {
    pendingSessionKey.value = accountStore.tokenKey.trim();
    loginVisible.value = true;
    return;
  }
  
  // 2. 如果是管理员模式，并且当前选中了一个账号（包括离线账号），直接复用其密钥，不弹窗
  const activeAcc = accountStore.accounts.find(a => a.uuid === accountStore.activeAccountUuid);
  if (activeAcc && activeAcc.sessionKey) {
    pendingSessionKey.value = activeAcc.sessionKey.trim();
    loginVisible.value = true;
    return;
  }

  // 3. 自动分配空闲槽位密钥，避免弹窗
  const idleAccount = accountStore.accounts.find(a => a.status === 'offline' && a.sessionKey);
  if (idleAccount) {
    pendingSessionKey.value = idleAccount.sessionKey.trim();
    loginVisible.value = true;
  } else {
    // 4. 终极兜底：没有任何活跃账号与槽位密钥时，才弹窗请求输入
    const key = prompt('请输入您的授权码（Auth Code）', '');
    if (key !== null) {
      pendingSessionKey.value = key.trim();
      loginVisible.value = true;
    }
  }
};

const handleLoginSuccess = () => {
  loginVisible.value = false;
  accountStore.syncAccountsFromServer();
};

const activeTab = ref('chat');


const currentMessages = computed(() => {
  const accountUuid = accountStore.activeAccountUuid;
  const partnerId = chatStore.activeId;
  if (!accountUuid || accountUuid === 'pending_login' || !partnerId) return [];
  
  const messages = chatStore.accountMessages[accountUuid]?.[partnerId] || [];
  if (isDebug('socket')) {
    console.log(`[Debug:Home] 试图查找消息: accountUuid=${accountUuid}, partnerId=${partnerId}`);
    console.log(`[Debug:Home] accountMessages 中已有的 accountUuid 列表:`, Object.keys(chatStore.accountMessages));
    if (chatStore.accountMessages[accountUuid]) {
      console.log(`[Debug:Home] 该账号下已有的 partnerId 列表:`, Object.keys(chatStore.accountMessages[accountUuid]));
    }
    console.log(`[Debug:Home] 最终查找到的消息数量:`, messages.length);
  }
  
  return messages;
});

const currentChatPartnerName = computed(() => {
  const detail = accountStore.contactMap[chatStore.activeId];
  return detail ? getContactName(detail) : chatStore.activeId;
});

const currentAccountAvatar = computed(() => {
  const acc = accountStore.accounts.find(a => a.uuid === accountStore.activeAccountUuid);
  if (!acc) return '';
  return getAccountAvatar(acc);
});

const currentPartnerAvatar = computed(() => {
  const detail = accountStore.contactMap[chatStore.activeId];
  if (detail) {
    const avatar = getContactAvatar(detail);
    if (avatar) return accountStore.avatarBlobMap[avatar] || avatar;
  }
  return '';
});


watch(() => accountStore.activeAccountUuid, async (newUuid) => {
  if (newUuid && newUuid !== 'pending_login') {
    // 统一使用 userName 作为唯一标识（uuid === userName === 真实微信 ID）
    const userName = newUuid;
    
    await Promise.all([
      accountStore.loadContactsFromCache(userName),
      chatStore.loadConversations(userName)
    ]);
  }
}, { immediate: true });

const handleSelectChat = async (wxid: string) => {
  chatStore.activeId = wxid;
  const accountUuid = accountStore.activeAccountUuid;
  await chatStore.loadHistory(accountUuid, wxid);
  // 清除未读并持久化到本地缓存
  await chatStore.clearUnread(accountUuid, wxid);
};

const handleSwitchContact = async () => {
  console.log('[Home] 切换到联系人页');
  activeTab.value = 'contact';
  
  // 移除：切换 Tab 时不再自动触发同步，仅依赖本地缓存和手动同步
};

const handleSendMessage = async (text: string) => {
  const userName = accountStore.activeAccountUuid;
  const partnerId = chatStore.activeId;
  const acc = accountStore.accounts.find(a => a.uuid === userName);
  if (!acc || !partnerId) return;

  try {
    await messageApi.sendText(acc.sessionKey, partnerId, text);
    chatStore.addParsedMessage(userName, {
      id: String(Date.now()),
      msgId: Date.now(),
      from: userName,
      to: partnerId,
      time: Math.floor(Date.now() / 1000),
      type: 'text',
      content: text,
      isSelf: true,
      isRevoked: false
    });
  } catch (err) {
    Message.error('发送失败');
  }
};

  const handleSelectContact = (contact: any) => {
  handleSelectChat(getContactId(contact));
  activeTab.value = 'chat';
};

// Note: getContactId and getContactName have been hoisted to the top of script setup to prevent temporal dead zone issues.

// 账号头像：优先从联系人缓存取（已有本地 blob），回退到 acc.avatar
// (watch removed to prevent eager avatar fetching for all contacts)
const formatTime = (t: number) => t ? dayjs(t * 1000).format('HH:mm') : '';
const formatText = (text: any) => {
  if (typeof text === 'object') return text.str || text.Str || JSON.stringify(text);
  return String(text || '');
};

onMounted(async () => {
  accountStore.startStatusPolling();
  document.body.setAttribute('arco-theme', 'dark');
  // 只要有管理密钥或授权码，就同步账号
  if (accountStore.adminKey || accountStore.tokenKey) {
    await accountStore.syncAccountsFromServer();
  }
});

onUnmounted(() => {
  accountStore.stopStatusPolling();
});
</script>

<style scoped src="./Home.css"></style>
