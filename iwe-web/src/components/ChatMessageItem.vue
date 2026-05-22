<template>
  <div 
    class="msg-row"
    :class="{ self: msg.isSelf }"
  >
    <a-avatar :size="36" shape="square" class="msg-avatar">
      <img 
        v-if="msg.isSelf ? selfAvatar : partnerAvatar" 
        :src="msg.isSelf ? selfAvatar : partnerAvatar" 
        referrerpolicy="no-referrer" 
        loading="lazy" 
        alt="Avatar"
      />
      <template v-else>{{ msg.isSelf ? 'Me' : (partnerName ? partnerName[0] : 'U') }}</template>
    </a-avatar>
    <div class="msg-bubble">
      <!-- 图片消息 -->
      <div v-if="msg.type === 'image' && msg.imageUrl" class="content image-content">
        <img 
          :src="msg.imageUrl" 
          alt="图片" 
          style="max-width: 200px; max-height: 200px; border-radius: 4px;" 
          loading="lazy" 
        />
      </div>
      
      <!-- 微信语音消息 -->
      <div 
        v-else-if="msg.type === 'voice'" 
        class="content voice-content" 
        :class="{ 
          'is-playing': playingVoiceId === msg.id, 
          'is-loading': downloadingVoiceIds[msg.id] 
        }" 
        @click="emit('playVoice', msg)"
      >
        <div class="voice-bubble-inner" :style="{ width: getVoiceBubbleWidth(msg) }">
          <template v-if="downloadingVoiceIds[msg.id]">
            <a-spin :size="12" />
          </template>
          <template v-else>
            <icon-sound class="voice-icon" :class="{ 'playing-anim': playingVoiceId === msg.id }" />
            <span class="voice-duration">{{ getVoiceDuration(msg) }}"</span>
          </template>
        </div>
      </div>
      
      <!-- 文本或其他类型消息 -->
      <div v-else class="content">{{ msg.content }}</div>
      
      <!-- 撤回消息标识 -->
      <div v-if="msg.isRevoked" class="revoked-tag">消息已撤回</div>
      
      <!-- 消息发送时间戳 -->
      <div class="msg-time">{{ formatTime(msg.time) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconSound } from '@arco-design/web-vue/es/icon';

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
  msg: Message;
  selfAvatar: string;
  partnerAvatar: string;
  partnerName: string;
  playingVoiceId: string | number | null;
  downloadingVoiceIds: Record<string | number, boolean>;
}>();

const emit = defineEmits<{
  (e: 'playVoice', msg: Message): void;
}>();

// 获取语音消息实际时长
const getVoiceDuration = (msg: Message): number => {
  if (msg.content && msg.content.includes('语音')) {
    const match = msg.content.match(/语音\s*(\d+)/);
    if (match) return Number(match[1]);
  }
  return 1;
};

// 根据时长计算语音气泡宽度，限制在 70px 至 220px 之间
const getVoiceBubbleWidth = (msg: Message): string => {
  const duration = getVoiceDuration(msg);
  const width = Math.min(220, 70 + duration * 3.5);
  return `${width}px`;
};

// 格式化消息发送时间 (HH:MM)
const formatTime = (time: number) => {
  if (!time) return '';
  const timestamp = time < 99999999999 ? time * 1000 : time;
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};
</script>

<style scoped>
/* 微信语音消息现代化自适应高对比度样式 */
.voice-content {
  display: inline-block;
  cursor: pointer;
  user-select: none;
  background: var(--color-fill-3, #f2f3f5);
  border: 1px solid var(--color-border-2, #e5e6eb);
  border-radius: 8px;
  padding: 8px 14px;
  min-width: 75px;
  max-width: 220px;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  position: relative;
}

/* 悬停微调高亮与阴影 */
.voice-content:hover {
  background: var(--color-fill-4, #e5e6eb);
  border-color: var(--color-border-3, #c9cdd4);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

/* 激活按压物理反馈 */
.voice-content:active {
  transform: translateY(1px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

/* 自身发送的语音消息（右侧微信绿） */
.msg-row.self .voice-content {
  background: var(--color-success-light-5, rgba(0, 180, 42, 0.15));
  border-color: var(--color-success-light-3, rgba(0, 180, 42, 0.3));
}

.msg-row.self .voice-content:hover {
  background: var(--color-success-light-4, rgba(0, 180, 42, 0.22));
  border-color: var(--color-success-light-2, rgba(0, 180, 42, 0.4));
}

/* 加载中状态样式 */
.voice-content.is-loading {
  background: var(--color-fill-2, #f2f3f5);
  border-color: var(--color-border-1, #f2f3f5);
  cursor: default;
  transform: none !important;
  box-shadow: none !important;
}

/* 气泡内部弹性对齐 */
.voice-bubble-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
  height: 20px;
}

/* 自身发送：图标置于右侧且翻转，时长置于左侧 */
.msg-row.self .voice-bubble-inner {
  flex-direction: row-reverse;
}

/* 语音声波图标样式 */
.voice-icon {
  font-size: 16px;
  color: var(--color-text-2, #4e5969);
  transition: color 0.2s;
}

.msg-row.self .voice-icon {
  color: var(--color-success, #00b42a);
  transform: scaleX(-1); /* 发送方的波纹镜像朝左 */
}

/* 播放时的声波闪烁呼吸动画 */
.voice-icon.playing-anim {
  animation: voice-wave-breath 1s infinite ease-in-out;
  color: var(--color-success, #00b42a) !important;
}

/* 现代化数字时长字效 */
.voice-duration {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-1, #1d2129);
  font-family: 'Outfit', 'Inter', system-ui, sans-serif;
  user-select: none;
}

.msg-row.self .voice-duration {
  color: var(--color-success, #00b42a);
}

/* 精准动感声波呼吸关键帧 */
@keyframes voice-wave-breath {
  0% {
    opacity: 0.4;
    transform: scale(0.95) scaleX(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.1) scaleX(1.1);
  }
  100% {
    opacity: 0.4;
    transform: scale(0.95) scaleX(1);
  }
}

/* 自身发送的声波播放时也需要保持 scaleX 镜像翻转 */
.msg-row.self .voice-icon.playing-anim {
  animation: voice-wave-breath-self 1s infinite ease-in-out;
}

@keyframes voice-wave-breath-self {
  0% {
    opacity: 0.4;
    transform: scale(0.95) scaleX(-1);
  }
  50% {
    opacity: 1;
    transform: scale(1.1) scaleX(-1.1);
  }
  100% {
    opacity: 0.4;
    transform: scale(0.95) scaleX(-1);
  }
}
</style>
