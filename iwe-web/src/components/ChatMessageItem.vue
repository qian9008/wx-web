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
        @error="(e) => handleAvatarError(e, msg.isSelf ? activeAccountUuid : String(msg.from))"
      />
      <template v-else>{{ msg.isSelf ? 'Me' : (partnerName ? partnerName[0] : 'U') }}</template>
    </a-avatar>
    <div class="msg-bubble">
      <!-- 图片消息 -->
      <div v-if="msg.type === 'image' && msg.imageUrl" class="content image-content">
        <!-- 1. 如果是 Hex 图片且尚未下载 -->
        <template v-if="isHexImage && !displayImageUrl">
          <div 
            class="image-download-placeholder" 
            :class="{ 'is-loading': loadingImage }"
            @click="handleManualDownload"
          >
            <template v-if="loadingImage">
              <a-spin :size="16" />
              <span class="loading-text">图片下载中...</span>
            </template>
            <template v-else>
              <icon-image :size="24" class="image-placeholder-icon" />
              <span class="download-text">点击下载图片</span>
            </template>
          </div>
        </template>
        <!-- 2. 已下载的 Hex 图片或标准图片链接 -->
        <div v-else-if="displayImageUrl || !isHexImage" class="image-wrapper">
          <a-image 
            :src="displayImageUrl || msg.imageUrl" 
            alt="图片" 
            :style="{ maxWidth: '200px', maxHeight: '200px', borderRadius: '4px', cursor: 'pointer' }" 
            referrerpolicy="no-referrer" 
            :preview="true"
            @click="handleImageClick"
          />
          <div v-if="loadingImage" class="image-loading-overlay">
            <a-spin :size="16" />
            <span class="loading-text">加载高清中...</span>
          </div>
        </div>
        <div v-else class="image-error-placeholder" @click="handleManualDownload">图片下载失败，点击重试</div>
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
import { ref, watch, computed } from 'vue';
import { IconSound, IconImage } from '@arco-design/web-vue/es/icon';
import { messageApi } from '@/api/modules/im';
import { useAccountStore } from '@/store/account';
import { useChatStore } from '@/store/chat';

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
  partnerId?: string;
  partnerType?: string;
  isBigImageLoaded?: boolean;
}

const props = defineProps<{
  msg: Message;
  selfAvatar: string;
  partnerAvatar: string;
  partnerName: string;
  playingVoiceId: string | number | null;
  downloadingVoiceIds: Record<string | number, boolean>;
  activeAccountUuid: string;
}>();

const emit = defineEmits<{
  (e: 'playVoice', msg: Message): void;
}>();

const accountStore = useAccountStore();
const chatStore = useChatStore();

const displayImageUrl = ref<string>('');
const loadingImage = ref(false);

// 模块全局去重集合，防重复刷屏拉取
const updatingAvatarWxids = new Set<string>();

const handleAvatarError = async (e: Event, wxid: string) => {
  const img = e.target as HTMLImageElement;
  // 1. 静默拉取最新资料
  if (!wxid || wxid === 'filehelper' || wxid === props.activeAccountUuid || updatingAvatarWxids.has(wxid)) return;

  updatingAvatarWxids.add(wxid);
  try {
    console.log(`[Avatar:Error] 聊天中发现头像加载失败，触发静默更新: ${wxid}`);
    await accountStore.forceUpdateContactDetails(wxid);
  } catch (err) {
    console.warn(`[Avatar:Error] 聊天头像自愈拉取资料失败: ${wxid}`, err);
  } finally {
    // 10秒防刷，防止失败死循环
    setTimeout(() => {
      updatingAvatarWxids.delete(wxid);
    }, 10000);
  }
};

// 解析并提取接口返回结果中的 base64 数据
const getBase64FromResponse = (res: any): string | null => {
  if (!res) return null;
  
  if (typeof res === 'string') {
    if (res.length > 100) return res;
    return null;
  }
  
  // 优先匹配 res.Data.Buffer (即后端返回的微信原始 Buffer)
  if (res.Data && typeof res.Data === 'object' && res.Data.Buffer) {
    return res.Data.Buffer;
  }
  
  // 兜底其它可能包含 base64 字符串的字段
  const directBase64 = res.Base64 || res.base64 || res.ImageBase64 || res.imageBase64 || res.FileData || res.fileData || res.Buffer || res.buffer;
  if (directBase64 && typeof directBase64 === 'string' && directBase64.length > 10) {
    return directBase64;
  }
  
  // 处理嵌套 of Data/data 属性 (若它是个普通 string 或对象)
  const dataField = res.Data || res.data;
  if (dataField) {
    if (typeof dataField === 'string' && dataField.length > 100) {
      return dataField;
    }
    if (typeof dataField === 'object') {
      const nestedB64 = dataField.Base64 || dataField.base64 || dataField.FileData || dataField.fileData || dataField.Buffer || dataField.buffer;
      if (nestedB64 && typeof nestedB64 === 'string' && nestedB64.length > 10) {
        return nestedB64;
      }
    }
  }
  return null;
};

// 将 base64 转化为 Uint8Array
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// 将 Uint8Array 转化为 base64
const uint8ArrayToBase64 = (uint8Array: Uint8Array): string => {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
};

const loadImage = async () => {
  const url = props.msg.imageUrl;
  const msgId = Number(props.msg.msgId || props.msg.id || 0);

  // 1. 如果已经下载过大图，或者没有有效的微信消息 ID（外部网络链接），则直接展示
  if (props.msg.isBigImageLoaded || !msgId || (url && url.startsWith('http') && !/^[0-9a-fA-F]+$/.test(url))) {
    if (url) {
      displayImageUrl.value = url;
    }
    return;
  }

  // 2. 从后端 API 循环拉取所有大图分片并拼接
  loadingImage.value = true;
  try {
    const selfWxid = props.activeAccountUuid;
    const activeAcc = accountStore.accounts.find(a => a.uuid === selfWxid);
    const license = activeAcc?.sessionKey || accountStore.tokenKey || selfWxid;
    
    const fromUser = props.msg.from || '';
    const toUser = props.msg.to || '';
    
    let startPos = 0;
    const dataLen = 65536; // 每次拉取 64KB
    let totalLen = 0;
    const chunks: Uint8Array[] = [];
    
    let hasMoreChunks = true;
    let safetyCounter = 0;
    
    while (hasMoreChunks && safetyCounter < 50) { // 最多安全下载 50 次 (约 3.2MB)
      safetyCounter++;
      console.log(`[ChatMessageItem:Download] 正在下载图片分片, startPos: ${startPos}, dataLen: ${dataLen}, totalLen: ${totalLen}`);
      
      const res = await messageApi.getMsgBigImg(license, fromUser, toUser, msgId, 0, startPos, dataLen, totalLen);
      
      if (!res) {
        console.warn('[ChatMessageItem:Download] 接口返回空值，终止下载');
        hasMoreChunks = false;
        break;
      }
      
      const chunkBase64 = getBase64FromResponse(res);
      if (!chunkBase64) {
        console.warn('[ChatMessageItem:Download] 未能解析出有效的 base64 字符串，终止下载');
        hasMoreChunks = false;
        break;
      }
      
      const chunkBytes = base64ToUint8Array(chunkBase64);
      chunks.push(chunkBytes);
      
      // 获取总文件长度和当前返回的分包大小
      const currentTotalLen = res.TotalLen ?? res.totalLen ?? 0;
      const currentStartPos = res.StartPos ?? res.startPos ?? 0;
      const currentDataLen = res.DataLen ?? res.dataLen ?? chunkBytes.length;
      
      if (currentTotalLen > 0) {
        totalLen = currentTotalLen;
      }
      
      startPos = currentStartPos + currentDataLen;
      
      const downloadedSoFar = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log(`[ChatMessageItem:Download] 分片下载完成, 本次大小: ${currentDataLen} 字节, 累计已下载: ${downloadedSoFar}/${totalLen} 字节`);
      
      // 若拉取完毕或本次返回数据长度为 0
      if (downloadedSoFar >= totalLen || currentDataLen === 0) {
        hasMoreChunks = false;
      }
    }
    
    if (chunks.length > 0) {
      const totalBytesLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const completeImageBytes = new Uint8Array(totalBytesLength);
      let offset = 0;
      for (const chunk of chunks) {
        completeImageBytes.set(chunk, offset);
        offset += chunk.length;
      }
      
      const finalBase64 = uint8ArrayToBase64(completeImageBytes);
      const imageBase64Url = `data:image/jpeg;base64,${finalBase64}`;
      displayImageUrl.value = imageBase64Url;
      
      // 回写到 store 中以供持久化与秒开
      const partnerId = props.msg.partnerId || (props.msg.isSelf ? toUser : fromUser);
      chatStore.updateMessageImageUrl(selfWxid, partnerId, String(props.msg.id), imageBase64Url, true);
    }
  } catch (err) {
    console.error('[ChatMessageItem] 拉取图片失败:', err);
  } finally {
    loadingImage.value = false;
  }
};

const handleImageClick = () => {
  if (props.msg.isBigImageLoaded || loadingImage.value) {
    return;
  }
  loadImage();
};

const isHexImage = computed(() => {
  const url = props.msg.imageUrl;
  return !!url && /^[0-9a-fA-F]+$/.test(url);
});

const handleManualDownload = async () => {
  if (loadingImage.value) return;
  await loadImage();
};

watch(() => props.msg.imageUrl, (newUrl) => {
  if (newUrl && (newUrl.startsWith('http') || newUrl.startsWith('data:'))) {
    displayImageUrl.value = newUrl;
  } else {
    displayImageUrl.value = '';
  }
}, { immediate: true });

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

.image-download-placeholder, .image-error-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 150px;
  height: 150px;
  background: var(--color-fill-2, #f2f3f5);
  border-radius: 8px;
  border: 1px dashed var(--color-border-3, #c9cdd4);
  color: var(--color-text-2, #4e5969);
  font-size: 12px;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  user-select: none;
}

.image-download-placeholder:hover, .image-error-placeholder:hover {
  background: var(--color-fill-3, #e5e6eb);
  border-color: var(--color-border-4, #86909c);
  color: var(--color-text-1, #1d2129);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.image-download-placeholder:active, .image-error-placeholder:active {
  transform: translateY(0);
}

.image-download-placeholder.is-loading {
  cursor: default;
  background: var(--color-fill-2, #f2f3f5);
  border-color: var(--color-border-3, #c9cdd4);
  transform: none !important;
  box-shadow: none !important;
}

.image-placeholder-icon {
  color: var(--color-text-3, #86909c);
}

.image-wrapper {
  position: relative;
  display: inline-block;
  line-height: 0;
}

.image-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  gap: 6px;
}

.image-loading-overlay .loading-text {
  color: #fff !important;
  font-size: 11px;
}

/* 深度穿透限制 Arco image 容器及图片大小，确保大图宽高锁定且等比缩放 */
.image-wrapper :deep(.arco-image) {
  max-width: 200px !important;
  max-height: 200px !important;
  border-radius: 4px;
}

.image-wrapper :deep(.arco-image-img) {
  max-width: 200px !important;
  max-height: 200px !important;
  border-radius: 4px;
  object-fit: contain;
}
</style>
