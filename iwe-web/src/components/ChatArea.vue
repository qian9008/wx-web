<template>
  <div class="chat-window">
    <template v-if="activeId">
      <div class="chat-header">
        <div class="chat-header-back" @click="emit('back')">
          <icon-left :size="18" />
          <span>返回</span>
        </div>
        <div class="title">{{ partnerName }}</div>
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
import { ref, watch, nextTick } from 'vue';
import { 
  IconLeft, IconFaceSmileFill, IconFolder, IconImage, 
  IconUser, IconMessage 
} from '@arco-design/web-vue/es/icon';

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

const handleSendMessageLocal = () => {
  if (!inputText.value.trim()) return;
  emit('sendMessage', inputText.value);
  inputText.value = '';
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

<style scoped>
.chat-window { flex: 1; background: #1a1a1a; display: flex; flex-direction: column; height: 100%; }
.chat-header { height: 60px; border-bottom: 1px solid #2e2e2e; display: flex; align-items: center; padding: 0 20px; }
.chat-header .title { font-weight: 500; font-size: 16px; color: #e5e6eb; }
.messages-flow { flex: 1; overflow-y: auto; padding: 20px; }

/* Sleek custom scrollbars */
.messages-flow::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.messages-flow::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
}
.messages-flow::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
.messages-flow::-webkit-scrollbar-track {
  background: transparent;
}

.msg-row { display: flex; margin-bottom: 20px; }
.msg-row.self { flex-direction: row-reverse; }
.msg-avatar { flex-shrink: 0; }
.msg-bubble {
  max-width: 70%;
  padding: 10px 14px 6px 14px;
  border-radius: 8px;
  background: #2e2e2e;
  margin: 0 12px;
  display: flex;
  flex-direction: column;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
  color: #e5e6eb;
}
.self .msg-bubble { background: #268d44; color: #fff; }
.msg-time {
  align-self: flex-end;
  font-size: 11px;
  color: #86909c;
  margin-top: 4px;
  user-select: none;
  line-height: 1;
}
.self .msg-time {
  color: rgba(255, 255, 255, 0.7);
}
.revoked-tag {
  font-size: 11px;
  color: #ee4d2d;
  margin-top: 4px;
}
.input-section { height: 160px; border-top: 1px solid #2e2e2e; display: flex; flex-direction: column; background: #1a1a1a; }
.input-tools { height: 40px; display: flex; padding: 0 15px; gap: 15px; align-items: center; color: #86909c; }
.input-section textarea { flex: 1; border: none; padding: 10px 15px; background: transparent; color: #e5e6eb; outline: none; resize: none; font-family: inherit; }
.submit-bar { height: 40px; display: flex; justify-content: flex-end; padding: 0 15px; }
.empty-holder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.3; color: #e5e6eb; }
.empty-holder .hint { margin-top: 12px; font-size: 14px; }
.empty-holder .sub-hint { font-size: 12px; margin-top: 4px; }

/* Mobile Adaptation */
.chat-header-back {
  display: none;
}

@media (max-width: 768px) {
  .chat-header {
    padding: 0 12px !important;
    gap: 8px;
  }
  .chat-header-back {
    display: flex !important;
    align-items: center;
    color: #07c160;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    margin-right: 8px;
    padding: 6px 0;
  }
  .chat-header-back span {
    margin-left: 2px;
  }
  .msg-bubble {
    max-width: 85% !important;
  }
  .input-section {
    height: 120px !important;
  }
  .input-section textarea {
    padding: 8px 12px !important;
    font-size: 14px !important;
  }
}
</style>
