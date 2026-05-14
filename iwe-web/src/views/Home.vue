<template>
  <div class="workbench">
    <!-- 第一栏：账号栏 -->
    <div class="column account-bar">
      <div class="account-list">
        <div 
          v-for="acc in accountStore.accounts.filter(a => a.status === 'online')" 
          :key="acc.uuid"
          class="account-item"
          :class="{ active: accountStore.activeAccountUuid === acc.uuid }"
          @click="accountStore.activeAccountUuid = acc.uuid"
        >
          <a-tooltip :content="acc.nickname" position="right">
            <a-avatar :size="48" shape="square" :style="{ backgroundColor: '#333' }">
              <img v-if="acc.avatar" :src="acc.avatar" />
              <template v-else>{{ acc.nickname[0] }}</template>
            </a-avatar>
          </a-tooltip>
        </div>
        
        <div class="add-account-btn" @click="handleAddAccount">
          <div class="icon-plus-wrapper">
            <icon-plus :size="20" />
          </div>
        </div>
      </div>

      <div class="global-settings-btn" @click="adminVisible = true">
        <icon-tool :size="20" />
      </div>
    </div>

    <!-- 第二栏：功能导航 -->
    <div class="column nav-bar">
      <div 
        class="nav-item" 
        :class="{ active: activeTab === 'chat' }"
        @click="activeTab = 'chat'"
      >
        <icon-message :size="24" />
      </div>
      <div 
        class="nav-item" 
        :class="{ active: activeTab === 'contact' }"
        @click="handleSwitchContact"
      >
        <icon-user :size="24" />
      </div>
      <div class="nav-item settings-item" @click="adminVisible = true">
        <icon-settings :size="24" />
      </div>
    </div>

    <!-- 第三栏：列表展示 -->
    <div class="column chat-list">
      <div class="list-search">
        <a-input-search placeholder="搜索" background-color="#2e2e2e" />
      </div>
      
      <div class="scroll-area">
        <template v-if="activeTab === 'chat'">
          <div 
            v-for="conv in currentConversations" 
            :key="conv.wxid"
            class="conv-item"
            :class="{ active: chatStore.activeId === conv.wxid }"
            @click="handleSelectChat(conv.wxid)"
          >
            <a-badge :count="conv.unread" :dot="false" class="avatar-badge">
              <a-avatar :size="42" shape="square" :style="{ backgroundColor: '#ffb400' }">
                <img v-if="conv.avatar" :src="conv.avatar" />
                <template v-else>{{ conv.nickname ? conv.nickname[0] : 'C' }}</template>
              </a-avatar>
            </a-badge>
            <div class="info">
              <div class="title">
                <span class="name">{{ formatText(conv.nickname) }}</span>
                <span class="time">{{ formatTime(conv.time) }}</span>
              </div>
              <div class="desc">{{ formatText(conv.lastMsg) }}</div>
            </div>
          </div>
        </template>
        
        <template v-else>
          <div 
            v-for="contact in contactList" 
            :key="getContactId(contact)"
            class="conv-item"
            :class="{ active: chatStore.activeId === getContactId(contact) }"
            @click="handleSelectContact(contact)"
          >
            <a-avatar :size="42" shape="square" :style="{ backgroundColor: '#337ecc' }">
              <img v-if="getContactAvatar(contact)" :src="getContactAvatar(contact)" />
              <template v-else>{{ getContactName(contact)[0] }}</template>
            </a-avatar>
            <div class="info">
              <div class="title">
                <span class="name">{{ getContactName(contact) }}</span>
              </div>
              <div class="desc">{{ getContactId(contact) }}</div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 第四栏：内容视窗 -->
    <div class="column chat-window">
      <template v-if="chatStore.activeId">
        <div class="chat-header">
          <div class="title">{{ currentChatPartnerName }}</div>
        </div>
        
        <div class="messages-flow" ref="msgFlow">
          <div 
            v-for="msg in currentMessages" 
            :key="msg.id"
            class="msg-row"
            :class="{ self: msg.isSelf }"
          >
            <a-avatar :size="36" shape="square">
              <img v-if="msg.isSelf ? currentAccountAvatar : currentPartnerAvatar" :src="msg.isSelf ? currentAccountAvatar : currentPartnerAvatar" />
              <template v-else>{{ (msg.isSelf ? 'Me' : currentChatPartnerName[0]) }}</template>
            </a-avatar>
            <div class="msg-bubble">
              <div class="content">{{ msg.content }}</div>
              <div v-if="msg.isRevoked" class="revoked-tag">消息已撤回</div>
            </div>
          </div>
        </div>

        <div class="input-section">
          <div class="input-tools">
            <icon-face-smile-fill :size="20" />
            <icon-folder :size="20" />
            <icon-image :size="20" />
          </div>
          <textarea 
            v-model="inputText" 
            placeholder="请输入消息..." 
            @keyup.enter.exact="handleSendMessage"
          ></textarea>
          <div class="submit-bar">
            <a-button type="primary" size="small" @click="handleSendMessage">发送(S)</a-button>
          </div>
        </div>
      </template>

      <div v-else class="empty-holder">
        <icon-message :size="80" />
        <p class="hint">未选择会话</p>
      </div>
    </div>

    <!-- 弹窗部分 -->
    <a-modal v-model:visible="loginVisible" title="添加微信账号" :footer="false" unmount-on-close>
      <Login :assigned-key="pendingSessionKey" @success="handleLoginSuccess" />
    </a-modal>

    <a-modal v-model:visible="adminVisible" title="系统设置" @ok="handleSaveConfig">
      <div class="admin-panel">
        <a-tabs default-active-key="1">
          <a-tab-pane key="1" title="基础配置">
            <a-form layout="vertical" style="margin-top: 15px;">
              <a-form-item label="服务器地址">
                <a-input v-model="accountStore.baseUrl" placeholder="例如: http://192.168.1.10:8819" />
              </a-form-item>
              <a-form-item label="管理密钥">
                <a-input v-model="accountStore.adminToken" />
              </a-form-item>
            </a-form>
          </a-tab-pane>
          <a-tab-pane key="2" title="数据管理">
            <div class="data-mgmt">
              <div class="stat-item">
                <span class="label">联系人缓存:</span>
                <span class="value">{{ cacheStats.count }} 个</span>
              </div>
              <div class="stat-item">
                <span class="label">预估空间占用:</span>
                <span class="value">{{ cacheStats.size }}</span>
              </div>
              <a-divider />
              <a-popconfirm content="确定清空所有本地数据吗？" @ok="handleClearCache">
                <a-button type="outline" status="danger" long>清空所有本地数据</a-button>
              </a-popconfirm>
            </div>
          </a-tab-pane>
        </a-tabs>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useAccountStore } from '@/store/account';
import { useChatStore } from '@/store/chat';
import { socketManager } from '@/utils/socketManager';
import { messageApi } from '@/api/modules/im';
import { Message } from '@arco-design/web-vue';
import { 
  IconPlus, IconMessage, IconUser, IconSettings, 
  IconFaceSmileFill, IconFolder, IconImage, IconTool
} from '@arco-design/web-vue/es/icon';
import { contactCache } from '@/utils/contactCache';
import Login from './Login.vue';
import dayjs from 'dayjs';

const accountStore = useAccountStore();
const chatStore = useChatStore();
const inputText = ref('');
const loginVisible = ref(false);
const adminVisible = ref(false);
const pendingSessionKey = ref('');

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

const handleLoginSuccess = () => {
  loginVisible.value = false;
  accountStore.syncAccountsFromServer();
};
const activeTab = ref('chat');
const contactLoading = ref(false);
const msgFlow = ref<HTMLElement | null>(null);

const cacheStats = ref({ count: 0, size: '0 B' });

// 内存镜像获取联系人
const contactList = computed(() => Object.values(accountStore.contactMap));

const currentConversations = computed(() => {
  const accountUuid = accountStore.activeAccountUuid;
  const convs = chatStore.accountConversations[accountUuid] || [];
  return convs.map(c => {
    const detail = accountStore.contactMap[c.wxid];
    return detail ? {
      ...c,
      nickname: getContactName(detail),
      avatar: getContactAvatar(detail)
    } : c;
  });
});

const currentMessages = computed(() => {
  const accountUuid = accountStore.activeAccountUuid;
  const partnerId = chatStore.activeId;
  if (!accountUuid || !partnerId) return [];
  return chatStore.accountMessages[accountUuid]?.[partnerId] || [];
});

const currentChatPartnerName = computed(() => {
  const detail = accountStore.contactMap[chatStore.activeId];
  return detail ? getContactName(detail) : chatStore.activeId;
});

const currentAccountAvatar = computed(() => {
  const acc = accountStore.accounts.find(a => a.uuid === accountStore.activeAccountUuid);
  return acc?.avatar || '';
});

const currentPartnerAvatar = computed(() => {
  const detail = accountStore.contactMap[chatStore.activeId];
  return detail ? getContactAvatar(detail) : '';
});

const scrollToBottom = async () => {
  await nextTick();
  if (msgFlow.value) msgFlow.value.scrollTop = msgFlow.value.scrollHeight;
};

watch(currentMessages, () => scrollToBottom(), { deep: true });

watch(() => accountStore.activeAccountUuid, async (newUuid) => {
  if (newUuid) {
    await chatStore.loadConversations(newUuid);
    const acc = accountStore.accounts.find(a => a.uuid === newUuid);
    if (acc) socketManager.registerAccount(newUuid, acc.sessionKey, newUuid);
  }
});

const handleSelectChat = async (wxid: string) => {
  chatStore.activeId = wxid;
  const accountUuid = accountStore.activeAccountUuid;
  await chatStore.loadHistory(accountUuid, wxid);
  // 清除未读
  const list = chatStore.accountConversations[accountUuid];
  if (list) {
    const conv = list.find(c => c.wxid === wxid);
    if (conv) conv.unread = 0;
  }
};

const handleSwitchContact = async () => {
  activeTab.value = 'contact';
  const accountUuid = accountStore.activeAccountUuid;
  const acc = accountStore.accounts.find(a => a.uuid === accountUuid);
  if (acc) await accountStore.syncFullContactList(accountUuid, acc.sessionKey);
};

const handleSendMessage = async () => {
  if (!inputText.value.trim()) return;
  const accountUuid = accountStore.activeAccountUuid;
  const partnerId = chatStore.activeId;
  const acc = accountStore.accounts.find(a => a.uuid === accountUuid);
  if (!acc || !partnerId) return;

  try {
    const text = inputText.value;
    inputText.value = '';
    await messageApi.sendText(acc.sessionKey, partnerId, text);
    chatStore.addParsedMessage(accountUuid, {
      id: String(Date.now()),
      msgId: Date.now(),
      from: accountUuid,
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

const loadCacheStats = async () => {
  cacheStats.value.count = await contactCache.getCount() as number;
  cacheStats.value.size = await contactCache.getEstimatedSize();
};

const handleClearCache = async () => {
  await contactCache.clearAll();
  Message.success('已清空本地数据');
  await loadCacheStats();
};

const handleSaveConfig = () => {
  accountStore.setGlobalConfig(accountStore.baseUrl, accountStore.adminToken);
  window.location.reload();
};

const handleSelectContact = (contact: any) => {
  handleSelectChat(getContactId(contact));
  activeTab.value = 'chat';
};

const getContactId = (c: any) => {
  const user = c.userName || c.UserName || c.wxid;
  return (user && typeof user === 'object') ? (user.str || '') : (user || '');
};

const getContactName = (c: any) => {
  const nick = c.nickName || c.NickName || c.nickname;
  const nickStr = (nick && typeof nick === 'object') ? nick.str : nick;
  const remark = c.remark || c.Remark;
  const remarkStr = (remark && typeof remark === 'object') ? remark.str : remark;
  return remarkStr || nickStr || getContactId(c) || '未知';
};

const getContactAvatar = (c: any) => {
  const url = c.smallHeadImgUrl || c.SmallHeadImgUrl || c.headImgUrl || c.HeadImgUrl || c.avatar || '';
  return typeof url === 'string' ? url.trim().replace(/`/g, '') : '';
};

const formatTime = (t: number) => t ? dayjs(t * 1000).format('HH:mm') : '';
const formatText = (text: any) => {
  if (typeof text === 'object') return text.str || text.Str || JSON.stringify(text);
  return String(text || '');
};

watch(adminVisible, (v) => v && loadCacheStats());

onMounted(async () => {
  document.body.setAttribute('arco-theme', 'dark');
  await accountStore.loadContactsFromCache();
  if (accountStore.adminToken) await accountStore.syncAccountsFromServer();
});
</script>

<style scoped>
.workbench { display: flex; height: 100vh; width: 100vw; overflow: hidden; background: #171717; color: #e5e6eb; }
.column { height: 100%; display: flex; flex-direction: column; }
.account-bar { width: 68px; background: #0a0a0a; align-items: center; padding: 20px 0; border-right: 1px solid #2e2e2e; }
.account-list { flex: 1; display: flex; flex-direction: column; align-items: center; width: 100%; }
.account-item { margin-bottom: 18px; cursor: pointer; transition: all 0.3s; padding: 0 4px; }
.account-item.active { border-left: 4px solid #07c160; }
.add-account-btn { cursor: pointer; color: #86909c; margin-bottom: 20px; }
.icon-plus-wrapper { background: #2e2e2e; padding: 8px; border-radius: 4px; }
.nav-bar { width: 60px; background: #1e1e1e; align-items: center; padding: 25px 0; border-right: 1px solid #2e2e2e; }
.nav-item { color: #919191; margin-bottom: 30px; cursor: pointer; }
.nav-item.active { color: #07c160; }
.settings-item { margin-top: auto; }
.chat-list { width: 280px; background: #232323; border-right: 1px solid #2e2e2e; }
.list-search { padding: 15px; }
.scroll-area { flex: 1; overflow-y: auto; }
.conv-item { display: flex; padding: 12px 15px; cursor: pointer; border-bottom: 1px solid #2e2e2e; }
.conv-item.active { background: #333333; }
.conv-item .info { flex: 1; margin-left: 12px; overflow: hidden; }
.conv-item .title { display: flex; justify-content: space-between; margin-bottom: 4px; }
.conv-item .name { font-weight: 500; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conv-item .time { font-size: 12px; color: #86909c; }
.conv-item .desc { font-size: 12px; color: #86909c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-window { flex: 1; background: #1a1a1a; display: flex; flex-direction: column; }
.chat-header { height: 60px; border-bottom: 1px solid #2e2e2e; display: flex; align-items: center; padding: 0 20px; }
.messages-flow { flex: 1; overflow-y: auto; padding: 20px; }
.msg-row { display: flex; margin-bottom: 20px; }
.msg-row.self { flex-direction: row-reverse; }
.msg-bubble { max-width: 70%; padding: 10px 14px; border-radius: 8px; background: #2e2e2e; margin: 0 12px; }
.self .msg-bubble { background: #268d44; color: #fff; }
.input-section { height: 160px; border-top: 1px solid #2e2e2e; display: flex; flex-direction: column; }
.input-tools { height: 40px; display: flex; padding: 0 15px; gap: 15px; align-items: center; color: #86909c; }
.input-section textarea { flex: 1; border: none; padding: 10px 15px; background: transparent; color: #e5e6eb; outline: none; resize: none; }
.submit-bar { height: 40px; display: flex; justify-content: flex-end; padding: 0 15px; }
.empty-holder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.3; }
.data-mgmt { padding: 10px 0; }
.stat-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
.avatar-badge :deep(.arco-badge-status-dot) { width: 8px; height: 8px; }
</style>
