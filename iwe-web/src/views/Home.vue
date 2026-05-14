<template>
  <div class="workbench">
    <!-- 第一栏：账号管理 (68px) -->
    <div class="column account-bar">
      <div class="account-list">
        <div 
          v-for="acc in accountStore.accounts" 
          :key="acc.uuid"
          class="account-item"
          :class="{ active: accountStore.activeAccountUuid === acc.uuid }"
          @click="switchAccount(acc.uuid)"
        >
          <a-avatar :size="42" shape="square" :style="{ backgroundColor: '#337ecc' }">
            <img v-if="acc.avatar" :src="acc.avatar" />
            <template v-else>{{ acc.nickname ? acc.nickname[0] : 'U' }}</template>
          </a-avatar>
        </div>
      </div>
      <div class="global-settings-btn" @click="showAdmin">
        <icon-settings :size="24" />
      </div>
      <div class="add-account-btn" @click="showAddAccount">
        <div class="icon-plus-wrapper">
          <icon-plus :size="24" />
        </div>
      </div>
    </div>

    <!-- 第二栏：功能导航 (60px) -->
    <div class="column nav-bar">
      <div class="nav-item" :class="{ active: activeTab === 'chat' }" @click="activeTab = 'chat'">
        <icon-message :size="26" />
      </div>
      <div class="nav-item" :class="{ active: activeTab === 'contact' }" @click="handleSwitchContact">
        <icon-user :size="26" />
      </div>
      <div class="nav-item settings-item" @click="Message.info('当前账号设置开发中...')">
        <icon-tool :size="26" />
      </div>
    </div>

    <!-- 第三栏：会话/联系人列表 (280px) -->
    <div class="column chat-list">
      <div class="list-search">
        <a-input-search :placeholder="activeTab === 'chat' ? '搜索会话...' : '搜索联系人...'" size="small" allow-clear />
      </div>
      <div class="scroll-area">
        <div v-if="contactLoading" style="padding: 20px; text-align: center;">
          <a-spin tip="加载通讯录..." />
        </div>
        <!-- 聊天会话列表 -->
        <template v-else-if="activeTab === 'chat'">
          <div 
            v-for="conv in currentConversations" 
            :key="conv.wxid"
            class="conv-item"
            :class="{ active: chatStore.activeId === conv.wxid }"
            @click="chatStore.activeId = conv.wxid"
          >
            <a-avatar :size="42" shape="square" :style="{ backgroundColor: '#ffb400' }">
              <img v-if="conv.avatar" :src="conv.avatar" />
              <template v-else>{{ conv.nickname ? conv.nickname[0] : 'C' }}</template>
            </a-avatar>
            <div class="info">
              <div class="title">
                <span class="name">{{ formatText(conv.nickname) }}</span>
                <span class="time">{{ formatTime(conv.time) }}</span>
              </div>
              <div class="desc">{{ formatText(conv.lastMsg) }}</div>
            </div>
          </div>
        </template>
        
        <!-- 通讯录列表 -->
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

    <!-- 第四栏：聊天视窗 -->
    <div class="column chat-window">
      <template v-if="chatStore.activeId">
        <div class="chat-header">
          <span class="title">{{ currentChatTitle }}</span>
        </div>
        <div class="messages-flow">
          <div 
            v-for="msg in currentMessages" 
            :key="msg.id"
            class="msg-row"
            :class="{ self: msg.isSelf }"
          >
            <div class="msg-bubble" :class="{ revoked: msg.isRevoked }">
              <div v-if="msg.type === 'image'" class="image-content" @click="handleImageClick(msg)">
                <div v-if="msg.imageUrl" class="image-wrapper">
                  <img :src="msg.imageUrl" style="max-width: 200px; max-height: 200px; border-radius: 4px; cursor: pointer;" />
                </div>
                <div v-else class="image-placeholder" style="width: 100px; height: 100px; background: #2e2e2e; display: flex; align-items: center; justify-content: center; border-radius: 4px; cursor: pointer;">
                  <icon-image :size="32" style="color: #4e5969" />
                </div>
              </div>
              <div v-else class="content">{{ formatText(msg.content) }}</div>
              <div v-if="msg.isRevoked" class="revoked-tag">对方撤回了此消息（已拦截）</div>
            </div>
          </div>
        </div>

        <a-image-preview
          v-model:visible="previewVisible"
          :src="previewImageUrl"
        />

        <div class="input-section">
          <div class="input-tools">
            <icon-face-smile-fill :size="20" />
            <icon-folder :size="20" />
          </div>
          <textarea v-model="inputText" @keyup.enter="sendMsg" placeholder="请输入消息..."></textarea>
          <div class="submit-bar">
            <a-button type="primary" size="small" @click="sendMsg">发送 (S)</a-button>
          </div>
        </div>
      </template>
      <div v-else class="empty-holder">
        <icon-message :size="100" style="color: #2e2e2e" />
        <div class="hint">选择会话开始聊天</div>
      </div>
    </div>

    <!-- 弹窗部分 -->
    <a-modal v-model:visible="loginVisible" title="添加微信账号" :footer="false" unmount-on-close>
       <Login @success="handleLoginSuccess" />
    </a-modal>

    <a-modal v-model:visible="adminVisible" title="全局设置" width="800px" :footer="false">
      <a-tabs default-active-key="1" type="capsule">
        <a-tab-pane key="1" title="授权管理">
          <div class="panel-header">
            <a-button type="primary" @click="fetchAuthKeys">拉取授权 Key</a-button>
          </div>
          <div style="margin-top: 20px">
            <a-table :data="authKeys" :pagination="false" :loading="adminLoading">
              <template #columns>
                <a-table-column title="授权 Key" data-index="AuthKey" />
                <a-table-column title="操作">
                  <template #cell="{ record }">
                    <a-space>
                      <a-button size="mini" @click="handleDelayKey(record.AuthKey)">续期</a-button>
                      <a-button size="mini" status="danger" @click="handleDeleteKey(record.AuthKey)">删除</a-button>
                    </a-space>
                  </template>
                </a-table-column>
              </template>
            </a-table>
          </div>
        </a-tab-pane>
        <a-tab-pane key="2" title="数据管理">
           <div class="admin-panel">
              <a-descriptions title="本地缓存状态 (IndexedDB)" :column="1" bordered>
                <a-descriptions-item label="数据库名称">iwe_cache</a-descriptions-item>
                <a-descriptions-item label="已缓存联系人">{{ dbStats.count }} 人</a-descriptions-item>
                <a-descriptions-item label="预估占用空间">{{ dbStats.size }}</a-descriptions-item>
              </a-descriptions>
              <div style="margin-top: 20px">
                <a-popconfirm content="将清空所有已缓存的联系人昵称和头像，确认清空?" @ok="handleClearCache">
                  <a-button type="primary" status="danger">清空本地缓存</a-button>
                </a-popconfirm>
              </div>
           </div>
        </a-tab-pane>
      </a-tabs>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useAccountStore } from '@/store/account';
import { useChatStore } from '@/store/chat';
import { socketManager } from '@/utils/socketManager';
import { messageApi } from '@/api/modules/im';
import { adminApi } from '@/api/modules/admin';
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
const previewVisible = ref(false);
const previewImageUrl = ref('');
const activeTab = ref('chat');
const contactList = ref<any[]>([]);
const contactLoading = ref(false);
const authKeys = ref<any[]>([]);
const adminLoading = ref(false);
const dbStats = ref({ count: 0, size: '' as string | number });

// 获取当前账号的会话列表，并自动补全头像/昵称
const currentConversations = computed(() => {
  const accountUuid = accountStore.activeAccountUuid;
  return chatStore.accountConversations[accountUuid] || [];
});

// 监听账号切换，加载会话列表
watch(() => accountStore.activeAccountUuid, async (newUuid) => {
  if (newUuid) {
    await chatStore.loadConversations(newUuid);
  }
}, { immediate: true });

// 这是一个专门用来异步补全会话详情的副作用
watch(() => currentConversations.value, async (convs) => {
  for (const conv of convs) {
    if (!conv.avatar || conv.nickname === conv.wxid) {
      const detail: any = await contactCache.get(conv.wxid);
      if (detail) {
        conv.nickname = detail.nickName || detail.NickName || conv.nickname;
        conv.avatar = detail.smallHeadImgUrl || detail.SmallHeadImgUrl || detail.headImgUrl || detail.HeadImgUrl || '';
      }
    }
  }
}, { deep: true });

const currentMessages = computed(() => {
  const accountUuid = accountStore.activeAccountUuid;
  const wxid = chatStore.activeId;
  return chatStore.accountMessages[accountUuid]?.[wxid] || [];
});

const currentChatTitle = computed(() => {
  const conv = currentConversations.value.find(c => c.wxid === chatStore.activeId);
  return conv?.nickname || '聊天';
});

// 监听活动对话 ID 变化，加载历史记录和被动解析联系人详情
watch(() => chatStore.activeId, async (newId) => {
  if (newId) {
    const accountUuid = accountStore.activeAccountUuid;
    const currentAcc = accountStore.accounts.find(a => a.uuid === accountUuid);

    // 1. 按需加载联系人详情（含头像）
    const cached: any = await contactCache.get(newId);
    const hasAvatar = cached && (cached.smallHeadImgUrl || cached.SmallHeadImgUrl || cached.headImgUrl || cached.HeadImgUrl);
    
    if (!hasAvatar && currentAcc) {
      try {
        console.log(`[Home] 按需加载联系人详情: ${newId}`);
        const detailRes: any = await messageApi.getContactDetailsList(currentAcc.sessionKey, [newId]);
        const dData = detailRes.Data || detailRes;
        const details = dData.contactList || dData.ContactList || [];
        if (details.length > 0) {
          await contactCache.set(newId, details[0]);
        }
      } catch (e) {
        console.error('[Home] 加载详情失败:', e);
      }
    }

    // 2. 加载历史记录
    if (!chatStore.accountMessages[accountUuid]?.[newId]) {
      await chatStore.loadHistory(accountUuid, newId);
    }
    scrollToBottom();
  }
});

// 监听消息变化，自动滚动到底部
watch(() => currentMessages.value.length, () => {
  scrollToBottom();
});

const scrollToBottom = () => {
  nextTick(() => {
    const el = document.querySelector('.messages-flow');
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });
};

const sendMsg = async () => {
  if (!inputText.value.trim() || !chatStore.activeId) return;
  const accountUuid = accountStore.activeAccountUuid;
  const currentAcc = accountStore.accounts.find(a => a.uuid === accountUuid);
  if (!currentAcc) return;

  const toUser = chatStore.activeId;
  const content = inputText.value;
  inputText.value = '';

  try {
    const res: any = await messageApi.sendText(currentAcc.sessionKey, toUser, content);
    chatStore.addParsedMessage(accountUuid, {
      id: String(res.MsgId || res.msgId || Date.now()),
      msgId: Number(res.MsgId || res.msgId || Date.now()),
      from: accountUuid,
      to: toUser,
      time: Math.floor(Date.now() / 1000),
      type: 'text',
      content: content,
      isSelf: true,
      isRevoked: false
    });
  } catch (err) {
    Message.error('消息发送失败');
  }
};

const handleImageClick = async (msg: any) => {
  if (msg.imageUrl) {
    previewImageUrl.value = msg.imageUrl;
    previewVisible.value = true;
    return;
  }
  const accountUuid = accountStore.activeAccountUuid;
  const currentAcc = accountStore.accounts.find(a => a.uuid === accountUuid);
  if (!currentAcc) return;
  try {
    const res: any = await messageApi.getMsgBigImg(currentAcc.sessionKey, msg.from, msg.to, msg.msgId);
    if (res && res.Data) {
       msg.imageUrl = `data:image/jpeg;base64,${res.Data}`;
       previewImageUrl.value = msg.imageUrl;
       previewVisible.value = true;
    } else {
       Message.error('获取高清大图失败');
    }
  } catch (err) {
    console.error('获取图片大图错误:', err);
    Message.error('获取大图失败');
  }
};

const switchAccount = (uuid: string) => {
  accountStore.activeAccountUuid = uuid;
  chatStore.activeId = ''; 
  const acc = accountStore.accounts.find(a => a.uuid === uuid);
  if (acc) {
    socketManager.registerAccount(acc.uuid, acc.sessionKey, acc.uuid);
  }
};

const showAddAccount = () => loginVisible.value = true;

const handleLoginSuccess = (newAcc: any) => {
  loginVisible.value = false;
  accountStore.addAccount({
    uuid: newAcc.uuid,
    sessionKey: newAcc.sessionKey,
    nickname: newAcc.nickname,
    avatar: newAcc.avatar,
    status: 'online'
  });
  socketManager.registerAccount(newAcc.uuid, newAcc.sessionKey, newAcc.uuid);
  accountStore.activeAccountUuid = newAcc.uuid;
  Message.success(`欢迎，${newAcc.nickname}`);
};

const showAdmin = () => {
  adminVisible.value = true;
  fetchAuthKeys();
  updateDbStats();
};

const updateDbStats = async () => {
  dbStats.value.count = await contactCache.getCount() as number;
  dbStats.value.size = await contactCache.getEstimatedSize();
};

const handleClearCache = async () => {
  await contactCache.clearAll();
  Message.success('缓存已清空');
  updateDbStats();
};

const fetchAuthKeys = async () => {
  adminLoading.value = true;
  try {
    const res: any = await adminApi.getAuthKey();
    authKeys.value = Array.isArray(res) ? res : (res ? [res] : []);
  } catch (err) {
    console.error('获取授权 Key 失败:', err);
  } finally {
    adminLoading.value = false;
  }
};

const handleDelayKey = async (key: string) => {
  try {
    await adminApi.delayAuthKey(key, 30);
    Message.success('续期成功 (30天)');
    fetchAuthKeys();
  } catch (err) {}
};

const handleDeleteKey = async (key: string) => {
  try {
    await adminApi.deleteAuthKey(key);
    Message.success('删除成功');
    fetchAuthKeys();
  } catch (err) {}
};

const handleSwitchContact = async () => {
  activeTab.value = 'contact';
  const accountUuid = accountStore.activeAccountUuid;
  const currentAcc = accountStore.accounts.find(a => a.uuid === accountUuid);
  if (!currentAcc) return;

  // 1. 先从本地加载缓存，保证 UI 响应
  const allCached: any = await contactCache.getAll();
  if (allCached && allCached.length > 0) {
    contactList.value = allCached;
  }

  // 2. 被动同步：点击图标时触发同步逻辑
  contactLoading.value = true;
  try {
    console.log('[Home] 开始被动同步通讯录...');
    // 调用 store 中的分页同步逻辑
    await accountStore.syncFullContactList(currentAcc.uuid, currentAcc.sessionKey);
    
    // 3. 同步完成后再次刷新列表
    const updatedList: any = await contactCache.getAll();
    contactList.value = updatedList;
  } catch (err) {
    console.error('通讯录加载错误:', err);
    Message.error('通讯录加载失败');
  } finally {
    contactLoading.value = false;
  }
};

const handleSelectContact = (contact: any) => {
  chatStore.activeId = getContactId(contact);
  activeTab.value = 'chat';
};

const getContactId = (c: any) => {
  if (!c) return '';
  const user = c.userName || c.UserName || c.wxid;
  if (user && typeof user === 'object') return user.str || '';
  return user || '';
};

const getContactName = (c: any) => {
  if (!c) return '未知';
  const nick = c.nickName || c.NickName || c.nickname;
  if (nick && typeof nick === 'object') return nick.str || '未知';
  const remark = c.remark || c.Remark;
  if (remark && typeof remark === 'object' && remark.str) return remark.str;
  return remark || nick || getContactId(c) || '未知';
};

const getContactAvatar = (c: any) => {
  if (!c) return '';
  const url = c.smallHeadImgUrl || c.SmallHeadImgUrl || c.headImgUrl || c.HeadImgUrl || c.avatar || '';
  return typeof url === 'string' ? url.trim().replace(/`/g, '') : '';
};

const formatTime = (t: number) => t ? dayjs(t * 1000).format('HH:mm') : '';

const formatText = (text: any) => {
  if (!text) return '';
  if (typeof text === 'string') return text;
  if (typeof text === 'object') return text.str || text.Str || JSON.stringify(text);
  return String(text);
};

onMounted(async () => {
  document.body.setAttribute('arco-theme', 'dark');
  if (accountStore.adminToken) {
    await accountStore.syncAccountsFromServer();
  }
});
</script>

<style scoped>
.workbench { display: flex; height: 100vh; width: 100vw; overflow: hidden; background: #171717; color: #e5e6eb; }
.column { height: 100%; display: flex; flex-direction: column; }

/* 第一栏：账号栏 */
.account-bar { width: 68px; background: #0a0a0a; align-items: center; padding: 20px 0; border-right: 1px solid #2e2e2e; }
.account-list { flex: 1; display: flex; flex-direction: column; align-items: center; width: 100%; }
.account-item { margin-bottom: 18px; cursor: pointer; transition: all 0.3s; padding: 0 4px; }
.account-item.active { border-left: 4px solid #07c160; }
.add-account-btn { cursor: pointer; color: #86909c; margin-bottom: 20px; transition: color 0.3s; }
.add-account-btn:hover { color: #fff; }
.global-settings-btn { cursor: pointer; color: #86909c; margin-bottom: 25px; transition: color 0.3s; }
.global-settings-btn:hover { color: #fff; }
.icon-plus-wrapper { background: #2e2e2e; padding: 8px; border-radius: 4px; }

/* 第二栏：功能导航 */
.nav-bar { width: 60px; background: #1e1e1e; align-items: center; padding: 25px 0; border-right: 1px solid #2e2e2e; }
.nav-item { color: #919191; margin-bottom: 30px; cursor: pointer; transition: color 0.2s; }
.nav-item:hover { color: #fff; }
.nav-item.active { color: #07c160; }
.settings-item { margin-top: auto; }

/* 第三栏：会话列表 */
.chat-list { width: 280px; background: #232323; border-right: 1px solid #2e2e2e; }
.list-search { padding: 15px; background: #232323; }
.scroll-area { flex: 1; overflow-y: auto; }
.conv-item { display: flex; padding: 12px 15px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid #2e2e2e; }
.conv-item:hover { background: #2e2e2e; }
.conv-item.active { background: #333333; }
.conv-item .info { flex: 1; margin-left: 12px; overflow: hidden; }
.conv-item .title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.conv-item .name { font-weight: 500; font-size: 14px; color: #e5e6eb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conv-item .time { font-size: 12px; color: #86909c; }
.conv-item .desc { font-size: 12px; color: #86909c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 第四栏：聊天视窗 */
.chat-window { flex: 1; background: #1a1a1a; display: flex; flex-direction: column; }
.chat-header { height: 60px; border-bottom: 1px solid #2e2e2e; display: flex; align-items: center; padding: 0 20px; background: #1a1a1a; }
.chat-header .title { font-size: 16px; font-weight: 600; color: #e5e6eb; }
.messages-flow { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; }
.msg-row { display: flex; margin-bottom: 20px; }
.msg-row.self { flex-direction: row-reverse; }
.msg-bubble { max-width: 70%; padding: 10px 14px; border-radius: 8px; background: #2e2e2e; box-shadow: 0 2px 4px rgba(0,0,0,0.1); position: relative; color: #e5e6eb; }
.self .msg-bubble { background: #268d44; color: #fff; }
.msg-bubble .content { word-break: break-all; white-space: pre-wrap; font-size: 14px; }
.revoked-tag { font-size: 12px; color: #86909c; margin-top: 4px; }
.input-section { height: 160px; background: #1a1a1a; border-top: 1px solid #2e2e2e; display: flex; flex-direction: column; }
.input-tools { height: 40px; display: flex; align-items: center; padding: 0 15px; gap: 15px; color: #86909c; }
.input-tools > span { cursor: pointer; transition: color 0.2s; }
.input-tools > span:hover { color: #e5e6eb; }
.input-section textarea { flex: 1; border: none; padding: 0 15px; outline: none; resize: none; font-size: 14px; background: transparent; color: #e5e6eb; }
.submit-bar { height: 40px; display: flex; justify-content: flex-end; align-items: center; padding: 0 15px; }
.empty-holder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #2e2e2e; }
.empty-holder .hint { margin-top: 15px; font-size: 14px; color: #4e5969; }
.admin-panel { padding: 10px; }
</style>
