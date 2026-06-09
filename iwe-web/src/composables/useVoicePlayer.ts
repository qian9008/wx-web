import { ref } from 'vue';
import { decode } from 'silk-wasm';
import { messageApi } from '@/api/modules/im';
import { Message } from '@arco-design/web-vue';
import { useAccountStore } from '@/store/account';
import { useChatStore } from '@/store/chat';
import { debugLog } from '@/utils/debug';

export function useVoicePlayer(
  activeAccountUuid: () => string,
  activeId: () => string
) {
  const accountStore = useAccountStore();
  const chatStore = useChatStore();

  const downloadingVoiceIds = ref<Record<string | number, boolean>>({});
  const playingVoiceId = ref<string | number | null>(null);
  let activeAudio: HTMLAudioElement | null = null;
  let activeAudioCtx: AudioContext | null = null;
  let activeAudioSource: AudioBufferSourceNode | null = null;

  // 获取消息正确的发送者和接收者
  const getMsgSenderReceiver = (msg: any) => {
    const selfWxid = activeAccountUuid();
    const partnerWxid = activeId();

    return { fromUser: msg.isSelf ? selfWxid : partnerWxid, toUser: msg.isSelf ? partnerWxid : selfWxid };
  };

  // 把 Base64 字符串归类为语音 MIME 格式
  const tagVoiceBase64 = (b64: string): string => {
    const s = b64.trim();
    if (s.startsWith('data:audio') || s.startsWith('data:application')) return s;
    if (s.startsWith('IyFTSUxL')) return `data:audio/silk;base64,${s}`;
    if (s.startsWith('IyFBTVI'))  return `data:audio/amr;base64,${s}`;
    return `data:audio/silk;base64,${s}`;
  };

  // 解析语音下载接口结果
  const parseVoiceDownloadResult = (res: any): string | null => {
    if (!res) return null;

    const baseResp = res.BaseResponse || res.baseResponse;
    if (baseResp) {
      const ret = baseResp.ret ?? baseResp.Ret;
      if (ret !== undefined && ret !== 0) {
        const errMsg = baseResp.errMsg?.str || baseResp.ErrMsg?.str || baseResp.errMsg || '';
        throw new Error(`[ret:${ret}] ${errMsg || '服务端业务失败'}`);
      }
    }
    
    if (res.RetCode !== undefined && res.RetCode !== 0) {
      throw new Error(`[RetCode:${res.RetCode}] 服务端下载失败`);
    }

    if (typeof res === 'string') {
      if (res.startsWith('http') || res.startsWith('data:')) return res;
      if (res.length > 100) return tagVoiceBase64(res);
      return null;
    }

    const url = res.Url || res.url || res.VoiceUrl || res.voiceUrl;
    if (url && typeof url === 'string') return url;

    const directBase64 = res.Base64 || res.base64 || res.VoiceBase64 || res.voiceBase64 || res.FileData || res.fileData;
    if (directBase64 && typeof directBase64 === 'string' && directBase64.length > 10) {
      return tagVoiceBase64(directBase64);
    }

    if (res.Text && typeof res.Text === 'string' && res.Text.length > 100) {
      if (res.Text.startsWith('data:audio') || res.Text.startsWith('data:application')) return res.Text;
      if (/^[A-Za-z0-9+/=\r\n]+$/.test(res.Text.trim())) {
        return tagVoiceBase64(res.Text.trim());
      }
    }

    const dataField = res.Data || res.data;
    if (dataField) {
      if (typeof dataField === 'string') {
        if (dataField.startsWith('data:audio') || dataField.startsWith('data:application')) return dataField;
        if (dataField.startsWith('http')) return dataField;
        if (dataField.length > 100) return tagVoiceBase64(dataField);
      }

      if (dataField.type === 'Buffer' && Array.isArray(dataField.data) && dataField.data.length > 0) {
        try {
          const uint8 = new Uint8Array(dataField.data);
          let binary = '';
          uint8.forEach(b => binary += String.fromCharCode(b));
          return tagVoiceBase64(btoa(binary));
        } catch (e) {
          console.warn('[parseVoiceDownloadResult] Buffer 转 base64 失败', e);
        }
      }

      if (typeof dataField === 'object') {
        const nestedUrl = dataField.Url || dataField.url;
        if (nestedUrl && typeof nestedUrl === 'string') return nestedUrl;

        const nestedB64 = dataField.Base64 || dataField.base64 || dataField.VoiceBase64 || dataField.voiceBase64
                       || dataField.FileData || dataField.fileData
                       || dataField.Buffer || dataField.buffer
                       || dataField.content || dataField.Content || dataField.data;
        if (nestedB64 && typeof nestedB64 === 'string' && nestedB64.length > 10) {
          return tagVoiceBase64(nestedB64);
        }
      }
    }

    return null;
  };

  // 转换 Base64 为 ArrayBuffer
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // 验证数据是否是 SILK 格式
  const isSilkFormat = (urlOrBase64: string, buffer?: ArrayBuffer): boolean => {
    if (urlOrBase64.includes('audio/silk') || urlOrBase64.includes('application/silk')) {
      return true;
    }
    const base64Part = urlOrBase64.includes('base64,') ? urlOrBase64.split('base64,')[1] : urlOrBase64;
    if (base64Part.startsWith('IyFTSUxL')) {
      return true;
    }
    if (buffer) {
      const view = new Uint8Array(buffer);
      const magic = [0x23, 0x21, 0x53, 0x49, 0x4c, 0x4b, 0x5f, 0x56, 0x33];
      for (let i = 0; i <= Math.min(20, view.length - magic.length); i++) {
        let match = true;
        for (let j = 0; j < magic.length; j++) {
          if (view[i + j] !== magic[j]) {
            match = false;
            break;
          }
        }
        if (match) return true;
      }
    }
    return false;
  };

  // 精确字节扫描定位 #!SILK_V3 头，保留可能存在的微信特有 0x02 前缀，并只裁剪无关的前导填充字节（如 0x00）
  const preprocessSilkBuffer = (arrayBuffer: ArrayBuffer): ArrayBuffer => {
    const bytes = new Uint8Array(arrayBuffer);
    const silkMagic = [0x23, 0x21, 0x53, 0x49, 0x4c, 0x4b, 0x5f, 0x56, 0x33]; // #!SILK_V3
    
    debugLog('parser', '[silk-wasm] 原始数据前 16 字节 (Hex): {}', () => Array.from(bytes.subarray(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));

    let magicIdx = -1;
    const searchRange = Math.min(256, bytes.length - silkMagic.length);
    for (let i = 0; i <= searchRange; i++) {
      let match = true;
      for (let j = 0; j < silkMagic.length; j++) {
        if (bytes[i + j] !== silkMagic[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        magicIdx = i;
        break;
      }
    }

    let activeBytes = bytes;
    if (magicIdx !== -1) {
      // 检查魔数头前一字节是否是微信特有的 0x02 标志。如果是，我们需要将其保留，因为 silk-wasm 内部实现了对 0x02 前缀的自动跳过/处理
      const hasWechatPrefix = magicIdx > 0 && bytes[magicIdx - 1] === 0x02;
      const startIdx = hasWechatPrefix ? magicIdx - 1 : magicIdx;
      
      debugLog('parser', '[silk-wasm] 定位到 SILK 魔数，起始位置: {}, 微信 0x02 前缀: {}', magicIdx, hasWechatPrefix ? '是' : '否');
      
      if (startIdx > 0) {
        debugLog('parser', '[silk-wasm] 成功裁剪头部 {} 字节的填充或前缀数据', startIdx);
        activeBytes = bytes.subarray(startIdx);
      }
    } else {
      // 兜底：寻找首个非零字节且为 0x02 或 0x23 (#)
      let firstNonZero = -1;
      for (let i = 0; i < Math.min(100, bytes.length); i++) {
        if (bytes[i] !== 0) {
          firstNonZero = i;
          break;
        }
      }
      if (firstNonZero > 0 && (bytes[firstNonZero] === 0x02 || bytes[firstNonZero] === 0x23)) {
        debugLog('parser', '[silk-wasm] 兜底定位到首个有效非零字节，起始位置: {}', firstNonZero);
        activeBytes = bytes.subarray(firstNonZero);
      } else {
        console.warn('[silk-wasm] 未能在前部区域定位到 SILK 特征魔数头');
      }
    }

    debugLog('parser', '[silk-wasm] 最终传入解码器的数据前 16 字节 (Hex): {}', () => Array.from(activeBytes.subarray(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));

    return activeBytes.buffer.slice(activeBytes.byteOffset, activeBytes.byteOffset + activeBytes.byteLength);
  };

  // 优雅停止所有播放，妥善关闭 AudioContext 与 SourceNode 并清除响应式状态，防止泄漏和死锁
  const stopAllAudio = async () => {
    const prevPlayingId = playingVoiceId.value;
    playingVoiceId.value = null;

    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.src = '';
      } catch (e) {
        console.warn('[audio-stop] 停止 HTMLAudio 失败:', e);
      }
      activeAudio = null;
    }

    if (activeAudioSource) {
      try {
        activeAudioSource.stop();
        activeAudioSource.disconnect();
      } catch (e) {}
      activeAudioSource = null;
    }

    if (activeAudioCtx) {
      try {
        if (activeAudioCtx.state !== 'closed') {
          await activeAudioCtx.close();
        }
      } catch (e) {
        console.warn('[audio-stop] 关闭 AudioContext 失败:', e);
      }
      activeAudioCtx = null;
    }

    if (prevPlayingId !== null) {
      debugLog('socket', '[audio-stop] 成功停止语音播放 (ID: {})', prevPlayingId);
    }
  };

  // 播放本地或已缓存的语音数据
  const playLocalData = async (urlOrBase64: string, msg: any) => {
    const base64Data = urlOrBase64.includes('base64,') ? urlOrBase64.split('base64,')[1] : urlOrBase64;
    const arrayBuffer = base64ToArrayBuffer(base64Data);
    
    const isSilk = isSilkFormat(urlOrBase64, arrayBuffer);
    const isAmr = urlOrBase64.includes('audio/amr') || base64Data.startsWith('IyFBTVI');

    if (isSilk) {
      try {
        debugLog('parser', '[silk-wasm] 开始解码并重采样 Silk 语音消息 (ID: {})...', () => msg.id);
        const decodeBuf = preprocessSilkBuffer(arrayBuffer);
        const targetSampleRate = 24000;
        const decoded = await decode(decodeBuf, targetSampleRate);
        debugLog('parser', '[silk-wasm] 解码成功！音频时长: {}ms, 目标采样率: {}Hz', () => decoded.duration, targetSampleRate);

        const pcmData = decoded.data;
        let pcmBuffer = pcmData.buffer;
        let pcmByteOffset = pcmData.byteOffset;
        let pcmByteLength = pcmData.byteLength;
        
        if (pcmByteOffset % 2 !== 0) {
          const aligned = new Uint8Array(pcmByteLength);
          aligned.set(pcmData);
          pcmBuffer = aligned.buffer;
          pcmByteOffset = 0;
        }
        const pcmInt16 = new Int16Array(pcmBuffer, pcmByteOffset, pcmByteLength / 2);
        
        const float32 = new Float32Array(pcmInt16.length);
        for (let i = 0; i < pcmInt16.length; i++) {
          float32[i] = pcmInt16[i] / 32768.0;
        }

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        activeAudioCtx = new AudioCtxClass();
        
        const audioBuffer = activeAudioCtx.createBuffer(1, float32.length, targetSampleRate);
        audioBuffer.getChannelData(0).set(float32);

        const source = activeAudioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(activeAudioCtx.destination);
        
        source.onended = () => {
          if (playingVoiceId.value === msg.id) {
            playingVoiceId.value = null;
            activeAudioSource = null;
            activeAudioCtx = null;
            debugLog('parser', '[silk-wasm] 语音播放自然结束 (ID: {})', () => msg.id);
          }
        };

        activeAudioSource = source;
        playingVoiceId.value = msg.id;
        source.start(0);
        debugLog('parser', '[silk-wasm] 音频已成功送入设备，正在高保真播放中...');

      } catch (err: any) {
        console.error('[silk-wasm] 解码播放失败，降级为直接下载:', err);
        Message.error('语音在线播放失败，已自动为您下载原 Silk 音频文件');
        
        const link = document.createElement('a');
        link.href = urlOrBase64;
        link.download = `voice_${msg.id}.silk`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      return;
    }

    if (isAmr) {
      Message.warning({
        content: '微信语音消息为 AMR 格式，浏览器暂不支持在线解码播放。已为您自动下载音频文件！',
        duration: 4000
      });
      const link = document.createElement('a');
      link.href = urlOrBase64;
      link.download = `voice_${msg.id}.amr`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    try {
      activeAudio = new Audio(urlOrBase64);
      playingVoiceId.value = msg.id;
      
      activeAudio.onended = () => {
        if (playingVoiceId.value === msg.id) {
          playingVoiceId.value = null;
          activeAudio = null;
        }
      };
      
      activeAudio.onerror = () => {
        if (playingVoiceId.value === msg.id) {
          playingVoiceId.value = null;
          activeAudio = null;
        }
        Message.error('音频播放失败，可能是当前浏览器不支持该编码格式');
      };
      
      activeAudio.play().catch(err => {
        console.warn('Audio play failed:', err);
        if (playingVoiceId.value === msg.id) {
          playingVoiceId.value = null;
          activeAudio = null;
        }
      });
    } catch (e) {
      playingVoiceId.value = null;
      activeAudio = null;
      Message.error('音频播放器初始化失败');
    }
  };

  // 播放或下载语音消息
  const handlePlayVoice = async (msg: any) => {
    debugLog('parser', '[handlePlayVoice] 触发播放语音，消息详情: {}', () => JSON.stringify({
      id: msg.id,
      type: msg.type,
      voiceBufId: msg.voiceBufId,
      voiceLength: msg.voiceLength,
      voiceAesKey: msg.voiceAesKey ? '✓有' : '✗无',
      voiceCdnUrl: msg.voiceCdnUrl ? ('✓有(' + msg.voiceCdnUrl.slice(0, 20) + '...)') : '✗无',
      voiceBuffer: msg.voiceBuffer ? ('✓有, 长度=' + msg.voiceBuffer.length) : '✗无',
      voiceUrl: msg.voiceUrl ? '✓已缓存' : '✗无',
      content: msg.content
    }, null, 2));

    if (downloadingVoiceIds.value[msg.id]) return;

    if (playingVoiceId.value === msg.id) {
      await stopAllAudio();
      return;
    }

    if (playingVoiceId.value !== null) {
      await stopAllAudio();
    }

    if (msg.voiceUrl) {
      await playLocalData(msg.voiceUrl, msg);
      return;
    }

    if (msg.voiceBuffer) {
      debugLog('parser', '[handlePlayVoice] 检测到实时内嵌语音数据，开始播放... {}', () => msg.voiceBuffer.length);
      const dataUrl = `data:audio/silk;base64,${msg.voiceBuffer}`;
      msg.voiceUrl = dataUrl;
      
      const chatStoreMsgs = chatStore.accountMessages[activeAccountUuid()]?.[activeId()];
      if (chatStoreMsgs) {
        const found = chatStoreMsgs.find(m => String(m.id) === String(msg.id));
        if (found) found.voiceUrl = dataUrl;
      }
      await playLocalData(dataUrl, msg);
      return;
    }

    downloadingVoiceIds.value[msg.id] = true;
    try {
      const activeAcc = accountStore.accounts.find(a => a.uuid === activeAccountUuid());
      const license = activeAcc?.sessionKey || accountStore.tokenKey || activeAccountUuid();
      const { fromUser, toUser } = getMsgSenderReceiver(msg);

      debugLog('request', '[handlePlayVoice] 调用 GetMsgVoice: voiceBufId={}, fromUser={}, toUser={}', () => msg.voiceBufId || '0', fromUser, toUser);

      let res: any = await messageApi.getMsgVoice(
        license,
        fromUser,
        toUser,
        msg.voiceBufId || '0',
        msg.voiceLength || 0,
        String(msg.id)
      );
      debugLog('request', '[handlePlayVoice] GetMsgVoice 响应预览: {}', () => JSON.stringify(res)?.slice(0, 300));

      const gotVoiceLength = res?.Data?.VoiceLength ?? res?.VoiceLength ?? -1;
      debugLog('request', '[handlePlayVoice] GetMsgVoice 返回的 VoiceLength: {}', gotVoiceLength);

      if (gotVoiceLength === 0 && msg.voiceCdnUrl && msg.voiceAesKey) {
        debugLog('request', '[handlePlayVoice] GetMsgVoice 提示未在设备端缓存，准备降级至 CDN 下载...');
        res = await messageApi.sendCdnDownload(
          license,
          msg.voiceAesKey,
          msg.voiceCdnUrl,
          2,
          msg.voiceLength || 0
        );
        debugLog('request', '[SendCdnDownload] CDN响应: RetCode={}, TotalSize={}, FileData长度={}', () => res?.RetCode, () => res?.TotalSize, () => res?.FileData?.length);
      }

      const voiceUrl = parseVoiceDownloadResult(res);
      if (voiceUrl) {
        msg.voiceUrl = voiceUrl;
        const chatStoreMsgs = chatStore.accountMessages[activeAccountUuid()]?.[activeId()];
        if (chatStoreMsgs) {
          const found = chatStoreMsgs.find(m => String(m.id) === String(msg.id));
          if (found) {
            found.voiceUrl = voiceUrl;
            found.voiceCdnUrl = msg.voiceCdnUrl;
            found.voiceAesKey = msg.voiceAesKey;
          }
        }
        await playLocalData(voiceUrl, msg);
      } else {
        Message.warning('语音获取成功，但未从结果中解析出有效的音频数据，请查看控制台');
      }
    } catch (err: any) {
      const errMsg = err?.message || err?.Text || '网络请求故障';
      Message.error(`下载语音失败: ${errMsg}`);
    } finally {
      downloadingVoiceIds.value[msg.id] = false;
    }
  };

  return {
    downloadingVoiceIds,
    playingVoiceId,
    handlePlayVoice,
    stopAllAudio
  };
}
