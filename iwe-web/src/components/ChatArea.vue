<template>
  <div class="chat-window">
    <template v-if="activeId">
      <div class="chat-header">
        <div class="chat-header-back" @click="emit('back')">
          <icon-left :size="18" />
          <span>返回</span>
        </div>
        <div class="title-area">
          <div class="title">{{ partnerName }}</div>
          <a-tag v-if="relationLabel" :color="relationColor" size="small" class="relation-tag">
            {{ relationLabel }}
          </a-tag>
        </div>
        <a-space v-if="activeId" class="header-actions">
          <a-button 
            type="outline" 
            size="mini" 
            status="success" 
            class="relation-btn"
            :loading="isCheckingRelation"
            @click="handleCheckRelation"
          >
            <template #icon><icon-safe /></template>
            检测关系
          </a-button>
          <a-button 
            type="outline" 
            size="mini" 
            class="refresh-btn"
            :loading="isRefreshingDetails"
            @click="handleRefreshDetails"
          >
            <template #icon><icon-refresh /></template>
            更新资料
          </a-button>
          <a-popconfirm 
            content="确定要彻底删除该好友吗？此操作不可逆！" 
            type="warning" 
            @ok="handleDeleteContact"
          >
            <a-button 
              type="outline" 
              size="mini" 
              status="danger" 
              class="delete-btn"
              :loading="isDeletingContact"
            >
              <template #icon><icon-delete /></template>
              删除好友
            </a-button>
          </a-popconfirm>
        </a-space>
      </div>
      
      <div class="messages-flow" ref="msgFlow">
        <div 
          v-for="msg in messages" 
          :key="msg.id"
          class="msg-row"
          :class="{ self: msg.isSelf }"
        >
          <a-avatar :size="36" shape="square" class="msg-avatar">
            <img v-if="msg.isSelf ? selfAvatar : partnerAvatar" :src="msg.isSelf ? selfAvatar : partnerAvatar" referrerpolicy="no-referrer" loading="lazy" />
            <template v-else>{{ (msg.isSelf ? 'Me' : partnerName[0]) }}</template>
          </a-avatar>
          <div class="msg-bubble">
            <div v-if="msg.type === 'image' && msg.imageUrl" class="content image-content">
              <img :src="msg.imageUrl" alt="图片" style="max-width: 200px; max-height: 200px; border-radius: 4px;" loading="lazy" />
            </div>
            <div v-else class="content">{{ msg.content }}</div>
            <div v-if="msg.isRevoked" class="revoked-tag">消息已撤回</div>
            <!-- 消息发送时间戳 -->
            <div class="msg-time">{{ formatTime(msg.time) }}</div>
          </div>
        </div>
      </div>

      <div class="input-section">
        <!-- 防爆粉风控警告条 -->
        <div v-if="showRiskWarning" class="risk-warning-bar">
          <icon-exclamation-circle-fill />
          <span class="warning-text">
            防风控提醒：检测到对方非正常好友（关系: [{{ relationLabel }}]）。给非好友发送消息极易被微信风控系统标记拦截并限制功能，请谨慎操作！
          </span>
        </div>
        <div class="input-tools">
          <icon-face-smile-fill :size="20" />
          <icon-folder :size="20" />
          <icon-image :size="20" />
        </div>
        <textarea 
          v-model="inputText" 
          placeholder="请输入消息..." 
          @keyup.enter.exact="handleSendMessageLocal"
        ></textarea>
        <div class="submit-bar">
          <a-button type="primary" size="small" @click="handleSendMessageLocal">发送(S)</a-button>
        </div>
      </div>
    </template>

    <div v-else-if="activeAccountUuid === 'pending_login' && !hasConversations" class="empty-holder offline-holder">
      <icon-user :size="80" />
      <p class="hint">账号待登录</p>
      <p class="sub-hint">检测到该授权码关联账号尚未在线</p>
      <a-button type="primary" size="large" style="margin-top: 20px;" @click="emit('addAccount')">
        立即登录微信
      </a-button>
    </div>

    <div v-else class="empty-holder">
      <icon-message :size="80" />
      <p class="hint">未选择会话</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { 
  IconLeft, IconFaceSmileFill, IconFolder, IconImage, 
  IconUser, IconMessage, IconSafe, IconExclamationCircleFill, IconRefresh, IconDelete
} from '@arco-design/web-vue/es/icon';
import { useAccountStore } from '@/store/account';
import { Modal, Message } from '@arco-design/web-vue';

interface Message {
  id: string | number;
  content: string;
  isSelf: boolean;
  type?: string;
  imageUrl?: string;
  isRevoked?: boolean;
  time: number;
}

const props = defineProps<{
  activeId: string;
  partnerName: string;
  messages: Message[];
  selfAvatar: string;
  partnerAvatar: string;
  activeAccountUuid: string;
  hasConversations: boolean;
}>();

const emit = defineEmits<{
  (e: 'sendMessage', text: string): void;
  (e: 'addAccount'): void;
  (e: 'back'): void;
}>();

const inputText = ref('');
const msgFlow = ref<HTMLElement | null>(null);

const accountStore = useAccountStore();

const contactDetail = computed(() => {
  if (!props.activeId) return null;
  return accountStore.contactMap[props.activeId] || null;
});

const relationValue = computed(() => {
  return contactDetail.value?.friendRelation;
});

const relationLabel = computed(() => {
  const r = relationValue.value;
  if (r === 0) return '陌生人';
  if (r === 1) return '互为好友';
  if (r === 2) return '被拉黑';
  if (r === 3) return '已被删除';
  return '';
});

const relationColor = computed(() => {
  const r = relationValue.value;
  if (r === 0) return 'orange';
  if (r === 1) return 'green';
  if (r === 2) return 'red';
  if (r === 3) return 'red';
  return 'gray';
});

const showRiskWarning = computed(() => {
  const r = relationValue.value;
  // 如果关系是陌生人(0)、拉黑(2)、被删除(3)，显示风控提示
  return r === 0 || r === 2 || r === 3;
});

const isCheckingRelation = ref(false);

const handleCheckRelation = async () => {
  if (!props.activeId) return;
  isCheckingRelation.value = true;
  try {
    const res = await accountStore.checkFriendRelation(props.activeId);
    const relation = res?.FriendRelation;
    
    if (relation === 1) {
      Message.success('关系检测完成：您与对方互为正常好友！');
    } else if (relation === 0) {
      Message.warning('关系检测完成：对方当前为您的陌生人（非好友）。');
    } else if (relation === 3) {
      Message.error('关系检测完成：对方已将您删除！');
    } else if (relation === 2) {
      Message.error('关系检测完成：您已被对方拉入黑名单！');
    } else {
      Message.info('关系检测完成。');
    }
  } catch (err: any) {
    const errMsg = err?.Text || err?.message || '请求失败，请稍后重试';
    Message.error(`检测失败: ${errMsg}`);
  } finally {
    isCheckingRelation.value = false;
  }
};

const isRefreshingDetails = ref(false);

const handleRefreshDetails = async () => {
  if (!props.activeId) return;
  isRefreshingDetails.value = true;
  try {
    const detail = await accountStore.forceUpdateContactDetails(props.activeId);
    
    const remark = detail.remark || detail.Remark;
    const remarkStr = remark && typeof remark === 'object' ? remark.str : remark || '';
    const nick = detail.nickName || detail.NickName || detail.nickname;
    const nickStr = nick && typeof nick === 'object' ? nick.str : nick || '';
    const newName = remarkStr || nickStr || props.activeId;

    Message.success(`资料更新成功！最新名称: ${newName}`);
  } catch (err: any) {
    const errMsg = err?.Text || err?.message || '请求失败，请稍后重试';
    Message.error(`资料更新失败: ${errMsg}`);
  } finally {
    isRefreshingDetails.value = false;
  }
};

const isDeletingContact = ref(false);

const handleDeleteContact = async () => {
  if (!props.activeId) return;
  isDeletingContact.value = true;
  try {
    await accountStore.deleteContact(props.activeId);
    Message.success('好友删除成功！已清空本地会话与联系人缓存。');
    emit('back'); // 自动返回列表页，关闭聊天视窗
  } catch (err: any) {
    const errMsg = err?.Text || err?.message || '请求失败，请稍后重试';
    Message.error(`删除好友失败: ${errMsg}`);
  } finally {
    isDeletingContact.value = false;
  }
};

const handleSendMessageLocal = () => {
  if (!inputText.value.trim()) return;
  
  if (showRiskWarning.value) {
    // 防爆粉风控弹窗拦截确认！
    Modal.warning({
      title: '防爆粉风控警告',
      content: `检测到对方并非您的好友（当前状态: [${relationLabel.value}]）。给非好友高频发消息极易被微信风控系统拦截，甚至导致微信号被封禁限制。是否依然确定要发送此消息？`,
      okText: '确认发送',
      cancelText: '取消',
      showCancel: true,
      onOk: () => {
        emit('sendMessage', inputText.value);
        inputText.value = '';
      }
    });
  } else {
    emit('sendMessage', inputText.value);
    inputText.value = '';
  }
};

const scrollToBottom = async () => {
  await nextTick();
  if (msgFlow.value) {
    msgFlow.value.scrollTop = msgFlow.value.scrollHeight;
  }
};

// 监听消息变化自动滚动
watch(() => props.messages, () => {
  scrollToBottom();
}, { deep: true });

// 监听激活会话变化自动滚动并清空输入框
watch(() => props.activeId, () => {
  inputText.value = '';
  scrollToBottom();
});

// 格式化消息发送时间
const formatTime = (time: number) => {
  if (!time) return '';
  const date = new Date(time);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};
</script>


