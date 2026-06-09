<template>
  <div class="chat-window">
    <template v-if="activeId">
      <!-- 独立的会话头部组件 -->
      <ChatHeader 
        :active-id="activeId" 
        :partner-name="partnerName" 
        @back="emit('back')"
      />
      
      <!-- 消息流滚动视窗 -->
      <div class="messages-flow" ref="msgFlow">
        <ChatMessageItem
          v-for="msg in messages" 
          :key="msg.id"
          :msg="msg"
          :self-avatar="selfAvatar"
          :partner-avatar="partnerAvatar"
          :partner-name="partnerName"
          :playing-voice-id="playingVoiceId"
          :downloading-voice-ids="downloadingVoiceIds"
          :active-account-uuid="activeAccountUuid"
          @play-voice="handlePlayVoice"
        />
      </div>

      <!-- 底部消息输入区域 -->
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

    <!-- 离线或待登录占位提示 -->
    <div v-else-if="activeAccountUuid === 'pending_login' && !hasConversations" class="empty-holder offline-holder">
      <icon-user :size="80" />
      <p class="hint">账号待登录</p>
      <p class="sub-hint">检测到该授权码关联账号尚未在线</p>
      <a-button type="primary" size="large" style="margin-top: 20px;" @click="emit('addAccount')">
        立即登录微信
      </a-button>
    </div>

    <!-- 未选择会话提示 -->
    <div v-else class="empty-holder">
      <icon-message :size="80" />
      <p class="hint">未选择会话</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { 
  IconFaceSmileFill, IconFolder, IconImage, 
  IconUser, IconMessage, IconExclamationCircleFill
} from '@arco-design/web-vue/es/icon';
import { useAccountStore } from '@/store/account';
import { Modal } from '@arco-design/web-vue';
import { useVoicePlayer } from '@/composables/useVoicePlayer';
import ChatHeader from './ChatHeader.vue';
import ChatMessageItem from './ChatMessageItem.vue';

interface Message {
  id: string | number;
  content: string;
  isSelf: boolean;
  type?: string;
  imageUrl?: string;
  isRevoked?: boolean;
  time: number;
  from?: string;
  to?: string;
  msgId?: number | string;
  voiceBufId?: string;
  voiceLength?: number;
  voiceUrl?: string;
  voiceCdnUrl?: string;
  voiceAesKey?: string;
  voiceBuffer?: string;
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

// 引入高内聚的语音播放及解码控制器 Composable
const {
  downloadingVoiceIds,
  playingVoiceId,
  handlePlayVoice
} = useVoicePlayer(
  () => props.activeAccountUuid,
  () => props.activeId
);

// 关系状态及风控告警轻量逻辑
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

const showRiskWarning = computed(() => {
  const r = relationValue.value;
  return r === 0 || r === 2 || r === 3;
});

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
</script>

<style scoped>
/* 本地样式仅保留布局与容器等微调，特定业务气泡样式已移入子组件 */
</style>
