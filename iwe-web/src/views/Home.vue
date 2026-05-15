<template>
  <div class="workbench">
    <!-- 第一栏：账号栏 -->
    <div class="column account-bar">
      <div class="account-list">
        <div 
          v-for="(acc, index) in accountStore.accounts" 
          :key="acc.uuid || index"
          class="account-item"
          :class="{
            active: accountStore.activeAccountUuid === acc.uuid,
            offline: acc.status === 'offline'
          }"
          @click="accountStore.activeAccountUuid = acc.uuid"
        >
          <a-popover position="right" trigger="click" :content-style="{ padding: '0' }">
            <a-tooltip :content="acc.nickname" position="right">
              <a-avatar :size="48" shape="square" :style="{ backgroundColor: '#333' }">
                <img v-if="acc.avatar" :src="acc.avatar" :style="acc.status === 'offline' ? { filter: 'grayscale(100%)', opacity: '0.6' } : {}" />
                <template v-else>
                  <span :style="acc.status === 'offline' ? { color: '#666' } : {}">{{ acc.nickname[0] }}</span>
                </template>
              </a-avatar>
            </a-tooltip>
            <template #content>
              <div class="account-status-panel">
                <div class="panel-header">
                  <span class="nickname">{{ acc.nickname }}</span>
                  <a-tag size="mini" :color="acc.status === 'online' ? 'green' : 'gray'">
                    {{ acc.status === 'online' ? '在线' : '离线' }}
                  </a-tag>
                </div>
                
                <div class="status-actions">
                  <a-button size="mini" type="outline" @click="handleAccountStatusAction(acc, 'status')">
                    <template #icon><icon-check-circle /></template>在线查询
                  </a-button>
                  <a-button size="mini" type="outline" status="success" @click="handleAccountStatusAction(acc, 'wakeup')">
                    <template #icon><icon-thunderbolt /></template>唤醒登录
                  </a-button>
                  <a-popover position="right" trigger="click">
                    <a-button size="mini" type="outline" status="warning">
                      <template #icon><icon-safe /></template>验证码
                    </a-button>
                    <template #content>
                      <div style="padding: 10px; width: 220px;">
                        <a-input-group>
                          <a-input v-model="verifyMobile" placeholder="手机号" size="small" />
                          <a-button type="primary" size="small" @click="handleAccountVerifyCode(acc)">发送</a-button>
                        </a-input-group>
                      </div>
                    </template>
                  </a-popover>
                </div>

                <div v-if="accountResults[acc.uuid]" class="status-result">
                  <pre>{{ accountResults[acc.uuid] }}</pre>
                </div>
              </div>
            </template>
          </a-popover>
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
          <div class="contact-tabs">
            <div 
              class="tab-item" 
              :class="{ active: contactCategory === 'friend' }"
              @click="contactCategory = 'friend'"
            >好友({{ sortedContacts.friend.length }})</div>
            <div 
              class="tab-item" 
              :class="{ active: contactCategory === 'room' }"
              @click="contactCategory = 'room'"
            >群聊({{ sortedContacts.room.length }})</div>
            <div 
              class="tab-item" 
              :class="{ active: contactCategory === 'official' }"
              @click="contactCategory = 'official'"
            >公众号({{ sortedContacts.official.length }})</div>
          </div>
          <div 
            v-for="contact in displayContactList" 
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
              <div v-if="msg.type === 'image' && msg.imageUrl" class="content image-content">
                <img :src="msg.imageUrl" alt="图片" style="max-width: 200px; max-height: 200px; border-radius: 4px;" />
              </div>
              <div v-else class="content">{{ msg.content }}</div>
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
            <a-form :model="baseConfigForm" layout="vertical" style="margin-top: 15px;">
              <a-form-item label="服务器地址">
                <a-input v-model="baseConfigForm.baseUrl" placeholder="例如: http://192.168.1.10:8819" />
              </a-form-item>
              <a-form-item label="管理密钥">
                <a-input v-model="baseConfigForm.adminKey" />
              </a-form-item>
            </a-form>

            <a-divider>管理功能</a-divider>
            <div class="admin-actions">
              <a-space wrap>
                <a-button type="outline" size="small" @click="handleAdminAction('getList')">
                  获取授权码列表
                </a-button>
                <a-popover position="bottom" trigger="click">
                  <a-button type="outline" size="small" status="success">
                    生成授权码
                  </a-button>
                  <template #content>
                    <div style="padding: 10px; width: 200px;">
                      <a-input-number v-model="adminDays" placeholder="天数" size="small" :min="1" style="margin-bottom: 8px;" />
                      <a-button type="primary" size="small" long @click="handleAdminAction('gen')">确认生成</a-button>
                    </div>
                  </template>
                </a-popover>
                <a-popover position="bottom" trigger="click">
                  <a-button type="outline" size="small" status="warning">
                    授权码延期
                  </a-button>
                  <template #content>
                    <div style="padding: 10px; width: 220px;">
                      <a-input v-model="adminAuthKey" placeholder="授权码 (Auth Key)" size="small" style="margin-bottom: 8px;" />
                      <a-input-number v-model="adminDays" placeholder="延期天数" size="small" :min="1" style="margin-bottom: 8px;" />
                      <a-button type="primary" size="small" long @click="handleAdminAction('delay')">确认延期</a-button>
                    </div>
                  </template>
                </a-popover>
                <a-popover position="bottom" trigger="click">
                  <a-button type="outline" size="small" status="danger">
                    删除授权码
                  </a-button>
                  <template #content>
                    <div style="padding: 10px; width: 220px;">
                      <a-input v-model="adminAuthKey" placeholder="授权码 (Auth Key)" size="small" style="margin-bottom: 8px;" />
                      <a-button type="primary" status="danger" size="small" long @click="handleAdminAction('delete')">确认删除</a-button>
                    </div>
                  </template>
                </a-popover>
              </a-space>
            </div>

            <div v-if="adminActionResult" class="admin-result-panel">
              <div class="result-header">
                <span>操作反馈</span>
                <a-link size="mini" @click="adminActionResult = ''; adminActionData = null">清空</a-link>
              </div>
              <div v-if="Array.isArray(adminActionData)" class="admin-table-container">
                <a-table :data="adminActionData" :pagination="false" size="mini" :scroll="{ x: '100%' }">
                  <template #columns>
                    <a-table-column title="ID" data-index="id" :width="50" />
                    <a-table-column title="状态" :width="70">
                      <template #cell="{ record }">
                        <a-tag :color="record.status === 1 ? 'green' : 'gray'" size="mini">
                          {{ record.status === 1 ? '在线' : '离线' }}
                        </a-tag>
                      </template>
                    </a-table-column>
                    <a-table-column title="授权码 (License)" data-index="license" />
                    <a-table-column title="昵称" data-index="nick_name" />
                    <a-table-column title="到期时间" data-index="expiry_date" :width="110" />
                    <a-table-column title="操作" :width="120">
                      <template #cell="{ record }">
                        <a-space>
                          <a-button type="text" size="mini" @click="adminAuthKey = record.license; Message.info('授权码已填充，请在上方执行操作')">
                            选择
                          </a-button>
                        </a-space>
                      </template>
                    </a-table-column>
                  </template>
                </a-table>
              </div>
              <pre v-else class="result-content">{{ adminActionResult }}</pre>
            </div>
          </a-tab-pane>
          <a-tab-pane key="2" title="数据管理">
            <div class="data-mgmt">
              <div class="stat-group">
                <div class="stat-item">
                  <span class="label">逻辑预估占用:</span>
                  <span class="value">{{ cacheStats.estimatedSize }}</span>
                </div>
                <div class="stat-item">
                  <span class="label">实际磁盘占用:</span>
                  <span class="valueHighlight">{{ cacheStats.actualSize }}</span>
                </div>
              </div>
              
              <a-divider>分表管理</a-divider>
              
              <div class="store-grid">
                <div class="store-item">
                   <div class="store-info">
                     <span class="name">本地头像数据 (avatars)</span>
                     <span class="count">{{ cacheStats.avatarCount }} 张</span>
                   </div>
                   <a-popconfirm content="确定清空本地头像缓存吗？" @ok="handleClearStore('avatars')">
                     <a-button type="outline" size="mini" status="warning">清理</a-button>
                   </a-popconfirm>
                 </div>

                 <div class="store-item">
                  <div class="store-info">
                    <span class="name">联系人 (contacts)</span>
                    <span class="count">{{ cacheStats.contactCount }} 条</span>
                  </div>
                  <a-popconfirm content="确定清空联系人缓存吗？" @ok="handleClearStore('contacts')">
                    <a-button type="outline" size="mini" status="warning">清理</a-button>
                  </a-popconfirm>
                </div>
                
                <div class="store-item">
                  <div class="store-info">
                    <span class="name">消息记录 (messages)</span>
                    <span class="count">{{ cacheStats.msgCount }} 条</span>
                  </div>
                  <a-popconfirm content="确定清空所有消息记录吗？" @ok="handleClearStore('messages')">
                    <a-button type="outline" size="mini" status="warning">清理</a-button>
                  </a-popconfirm>
                </div>

                <div class="store-item">
                  <div class="store-info">
                    <span class="name">会话列表 (conversations)</span>
                    <span class="count">{{ cacheStats.convCount }} 条</span>
                  </div>
                  <a-popconfirm content="确定清空会话列表吗？" @ok="handleClearStore('conversations')">
                    <a-button type="outline" size="mini" status="warning">清理</a-button>
                  </a-popconfirm>
                </div>

                <div class="store-item">
                  <div class="store-info">
                    <span class="name">图片/头像缓存 (Browser Cache)</span>
                    <span class="count">{{ cacheStats.avatarCacheSize }}</span>
                  </div>
                  <a-popconfirm content="确定清空浏览器图片缓存吗？" @ok="handleClearAvatarCache">
                    <a-button type="outline" size="mini" status="warning">清理</a-button>
                  </a-popconfirm>
                </div>
              </div>

              <a-divider />
              
              <a-popconfirm content="确定清空所有本地数据吗？" @ok="handleClearCache">
                <a-button type="primary" status="danger" long>全部清空 (慎重)</a-button>
              </a-popconfirm>
            </div>
          </a-tab-pane>
          <a-tab-pane key="3" title="调试设置">
            <a-form :model="accountStore.debug" layout="vertical" style="margin-top: 15px;">
              <a-form-item label="总开关 (All)">
                <a-switch 
                  :model-value="accountStore.debug.all" 
                  @update:model-value="(val: any) => accountStore.updateDebugConfig({ all: val })" 
                />
              </a-form-item>
              <a-form-item label="请求日志 (Request)">
                <a-switch 
                  :model-value="accountStore.debug.request" 
                  @update:model-value="(val: any) => accountStore.updateDebugConfig({ request: val })" 
                />
              </a-form-item>
              <a-form-item label="通信日志 (Socket)">
                <a-switch 
                  :model-value="accountStore.debug.socket" 
                  @update:model-value="(val: any) => accountStore.updateDebugConfig({ socket: val })" 
                />
              </a-form-item>
              <a-form-item label="缓存日志 (Cache)">
                <a-switch 
                  :model-value="accountStore.debug.cache" 
                  @update:model-value="(val: any) => accountStore.updateDebugConfig({ cache: val })" 
                />
              </a-form-item>
              <a-alert type="info" show-icon style="margin-top: 10px;">开启后请在浏览器控制台(F12)查看日志</a-alert>
            </a-form>
          </a-tab-pane>
        </a-tabs>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue';
import { useAccountStore } from '@/store/account';
import { useChatStore } from '@/store/chat';
import { socketManager } from '@/utils/socketManager';
import { loginApi } from '@/api/modules/im';
import { adminApi } from '@/api/modules/admin';
import { Message } from '@arco-design/web-vue';
import { 
  IconPlus, IconMessage, IconUser, IconSettings, 
  IconFaceSmileFill, IconFolder, IconImage, IconTool,
  IconThunderbolt, IconCheckCircle, IconSafe
} from '@arco-design/web-vue/es/icon';
import { contactCache } from '@/utils/contactCache';
import Login from './Login.vue';
import dayjs from 'dayjs';

import { isDebug } from '@/utils/debug';
const accountStore = useAccountStore();
const chatStore = useChatStore();
const inputText = ref('');
const loginVisible = ref(false);
const adminVisible = ref(false);
const pendingSessionKey = ref('');
const verifyMobile = ref('');
const accountResults = ref<Record<string, any>>({});

// 表单数据绑定
const baseConfigForm = reactive({
  baseUrl: accountStore.baseUrl,
  adminKey: accountStore.adminKey
});

// 管理功能相关
const adminAuthKey = ref('');
const adminDays = ref(30);
const adminActionResult = ref('');
const adminActionData = ref<any>(null);

const handleAdminAction = async (type: string) => {
  try {
    let res: any;
    if (type === 'getList') {
      res = await adminApi.getAuthKey();
    } else if (type === 'gen') {
      res = await adminApi.genAuthKey({ Count: 1, Days: adminDays.value });
      Message.success('生成成功');
    } else if (type === 'delay') {
      if (!adminAuthKey.value) return Message.warning('请输入授权码');
      res = await adminApi.delayAuthKey({ 
        Key: adminAuthKey.value, 
        Days: adminDays.value,
        ExpiryDate: "" 
      });
      Message.success('延期成功');
    } else if (type === 'delete') {
      if (!adminAuthKey.value) return Message.warning('请输入授权码');
      res = await adminApi.deleteAuthKey({ 
        Key: adminAuthKey.value, 
        Opt: 0 
      });
      Message.success('删除成功');
    }
    adminActionData.value = res;
    adminActionResult.value = JSON.stringify(res, null, 2);
  } catch (err: any) {
    adminActionData.value = null;
    adminActionResult.value = `Error: ${err.message || err}`;
  }
};

const handleAccountStatusAction = async (acc: any, action: string) => {
  try {
    let res: any;
    if (action === 'status') {
      res = await loginApi.getOnlineStatus(acc.sessionKey);
    } else if (action === 'wakeup') {
      res = await loginApi.wakeUpLogin(acc.sessionKey);
      Message.success('唤醒指令已发送');
    }
    accountResults.value[acc.uuid] = JSON.stringify(res, null, 2);
  } catch (err: any) {
    accountResults.value[acc.uuid] = `Error: ${err.message || err}`;
  }
};

const handleAccountVerifyCode = async (acc: any) => {
  if (!verifyMobile.value) return Message.warning('请输入手机号');
  try {
    const res = await loginApi.getVerifyCode(acc.sessionKey, verifyMobile.value);
    accountResults.value[acc.uuid] = JSON.stringify(res, null, 2);
    Message.success('验证码请求已发送');
  } catch (err: any) {
    Message.error(err.message || '发送失败');
  }
};

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

const cacheStats = ref({ 
  contactCount: 0, 
  msgCount: 0, 
  convCount: 0, 
  avatarCount: 0,
  estimatedSize: '0 B',
  actualSize: '正在计算...',
  avatarCacheSize: '0 B'
});

const contactCategory = ref('friend'); // friend, room, official

// 内存镜像获取联系人并分类
const sortedContacts = computed(() => {
  const all = Object.values(accountStore.contactMap);
  const categories = {
    friend: [] as any[],
    room: [] as any[],
    official: [] as any[]
  };

  all.forEach(c => {
    const id = getContactId(c);
    if (id.endsWith('@chatroom')) {
      categories.room.push(c);
    } else if (id.startsWith('gh_') || id === 'fmessage' || id === 'medianote') {
      categories.official.push(c);
    } else {
      // 排除一些系统 ID 或者无效 ID
      if (id && !id.includes('@')) {
        categories.friend.push(c);
      }
    }
  });

  // 排序：按名称
  const sortFn = (a: any, b: any) => getContactName(a).localeCompare(getContactName(b), 'zh-CN');
  categories.friend.sort(sortFn);
  categories.room.sort(sortFn);
  categories.official.sort(sortFn);

  return categories;
});

const displayContactList = computed(() => {
  if (contactCategory.value === 'room') return sortedContacts.value.room;
  if (contactCategory.value === 'official') return sortedContacts.value.official;
  return sortedContacts.value.friend;
});

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
  const [c, m, v, a, est, act, avt] = await Promise.all([
    contactCache.getCount('contacts'),
    contactCache.getCount('messages'),
    contactCache.getCount('conversations'),
    contactCache.getCount('avatars'),
    contactCache.getEstimatedSize(),
    contactCache.getActualSize(),
    contactCache.getAvatarCacheSize()
  ]);
  
  cacheStats.value = {
    contactCount: c,
    msgCount: m,
    convCount: v,
    avatarCount: a,
    estimatedSize: est,
    actualSize: act,
    avatarCacheSize: avt
  };
};

const handleClearAvatarCache = async () => {
  await contactCache.clearAvatarCache();
  Message.success('图片缓存已清空');
  await loadCacheStats();
};

const handleClearStore = async (name: string) => {
  await contactCache.clearStore(name);
  Message.success(`已清空 ${name} 表`);
  await loadCacheStats();
};

const handleClearCache = async () => {
  await contactCache.clearAll();
  Message.success('已清空所有本地数据');
  await loadCacheStats();
};

const handleSaveConfig = () => {
  accountStore.setGlobalConfig(baseConfigForm.baseUrl, baseConfigForm.adminKey, accountStore.debug);
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
  const rawUrl = typeof url === 'string' ? url.trim().replace(/`/g, '') : '';
  if (!rawUrl) return '';
  
  // 触发异步加载/从内存缓存读取
  return accountStore.avatarBlobMap[rawUrl] || rawUrl;
};

// 监听 contactMap 变化，自动触发头像下载
watch(() => accountStore.contactMap, (newMap) => {
  Object.values(newMap).forEach(c => {
    const url = c.smallHeadImgUrl || c.SmallHeadImgUrl || c.headImgUrl || c.HeadImgUrl || c.avatar || '';
    if (typeof url === 'string' && url.trim()) {
      accountStore.getAvatarUrl(url.trim().replace(/`/g, ''));
    }
  });
}, { immediate: true, deep: true });

const formatTime = (t: number) => t ? dayjs(t * 1000).format('HH:mm') : '';
const formatText = (text: any) => {
  if (typeof text === 'object') return text.str || text.Str || JSON.stringify(text);
  return String(text || '');
};

watch(adminVisible, (v) => {
  if (v) {
    // 弹窗打开时同步最新配置到表单，避免监听器移除后数据不一致
    baseConfigForm.baseUrl = accountStore.baseUrl;
    baseConfigForm.adminKey = accountStore.adminKey;
    loadCacheStats();
  }
});

onMounted(async () => {
  document.body.setAttribute('arco-theme', 'dark');
  await accountStore.loadContactsFromCache();
  if (accountStore.adminKey) await accountStore.syncAccountsFromServer();
});
</script>

<style scoped>
.admin-panel { padding: 10px 0; }
.admin-actions { margin-top: 10px; }
.admin-result-panel {
  margin-top: 20px;
  background: #000;
  border-radius: 4px;
  padding: 10px;
  border: 1px solid #2e2e2e;
}
.admin-table-container {
  margin-top: 10px;
  background: #1a1a1a;
  border-radius: 4px;
}
:deep(.arco-table-container) {
  border: 1px solid #2e2e2e;
}
.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #86909c;
  font-size: 12px;
}
.result-content {
  margin: 0;
  font-size: 12px;
  color: #07c160;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}
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
.account-status-panel { padding: 15px; width: 280px; background: #1a1a1a; }
.account-status-panel .panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.account-status-panel .nickname { font-weight: bold; font-size: 14px; }
.status-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.status-result { background: #000; padding: 8px; border-radius: 4px; max-height: 200px; overflow-y: auto; }
.status-result pre { margin: 0; font-size: 11px; color: #07c160; white-space: pre-wrap; word-break: break-all; }
.data-mgmt { padding: 10px 0; }
.stat-group { background: #2e2e2e; padding: 15px; border-radius: 8px; margin-bottom: 10px; }
.stat-item { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
.stat-item:last-child { margin-bottom: 0; }
.valueHighlight { color: #07c160; font-weight: bold; font-size: 16px; }
.store-grid { display: flex; flex-direction: column; gap: 10px; }
.store-item { display: flex; justify-content: space-between; align-items: center; background: #262626; padding: 10px 15px; border-radius: 6px; }
.store-info { display: flex; flex-direction: column; }
.store-info .name { font-size: 13px; color: #e5e6eb; }
.store-info .count { font-size: 11px; color: #86909c; }
.avatar-badge :deep(.arco-badge-status-dot) { width: 8px; height: 8px; }
.contact-tabs { display: flex; padding: 10px; background: #1a1a1a; border-bottom: 1px solid #2e2e2e; sticky: top; top: 0; z-index: 10; }
.contact-tabs .tab-item { flex: 1; text-align: center; font-size: 12px; cursor: pointer; color: #86909c; padding: 4px 0; border-radius: 4px; transition: all 0.2s; }
.contact-tabs .tab-item.active { background: #2e2e2e; color: #07c160; font-weight: bold; }
</style>
