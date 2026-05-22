/**
 * 消息解析器：将后端的 XML/JSON 结构转换为前端通用的 AppMessage
 */

import { isDebug } from './debug';

export interface AppMessage {
  id: string;
  msgId: number;
  from: string;
  to: string;
  time: number;
  type: 'text' | 'image' | 'voice' | 'video' | 'system' | 'status_notify' | 'unsupported';
  content: string;
  isSelf: boolean;
  isRevoked: boolean;
  rawXml?: string;
  imageUrl?: string;
  statusNotifyData?: {
    username: string;
    lastMessageSvrId: string;
    msgCreateTime: number;
  };
  voiceBufId?: string;
  voiceLength?: number;
  voiceUrl?: string;
  voiceAesKey?: string;
  voiceCdnUrl?: string;
  voiceFormat?: number;
  voiceBuffer?: string; // img_buf.buffer base64 (已内嵌在 WS 消息中的裸 SILK 数据)
}

export class MessageParser {
  private static parser = new DOMParser();

  private static getCleanXml(content: string): string {
    const idx = content.indexOf('<');
    return idx !== -1 ? content.slice(idx) : content;
  }

  public static parse(rawMsg: any, myWxid: string): AppMessage {
    // 兼容两种命名格式：FromUserName (HTTP) vs from_user_name (WS)
    const fromRaw = rawMsg.FromUserName || rawMsg.from_user_name;
    const toRaw = rawMsg.ToUserName || rawMsg.to_user_name;
    const from = typeof fromRaw === 'object' ? (fromRaw.str || '') : (fromRaw || '');
    const to = typeof toRaw === 'object' ? (toRaw.str || '') : (toRaw || '');
    
    // 内容提取逻辑
    let contentRaw = rawMsg.Content || rawMsg.content || '';
    let content = '';
    if (contentRaw && typeof contentRaw === 'object') {
      content = contentRaw.str || contentRaw.Str || '';
    } else {
      content = String(contentRaw);
    }

    // 规范化比较 ID
    const normalizedFrom = String(from).trim(); // 移除 toLowerCase
    const normalizedMyWxid = String(myWxid).trim(); // 移除 toLowerCase
    const isSelf = normalizedFrom === normalizedMyWxid;

    // 提取消息 ID
    const msgId = rawMsg.MsgId || rawMsg.msg_id || rawMsg.Msgid || 0;
    const newMsgId = rawMsg.NewMsgId || rawMsg.new_msg_id || rawMsg.Newmsgid || msgId || Date.now();
    const createTime = rawMsg.CreateTime || rawMsg.create_time || rawMsg.Createtime || Math.floor(Date.now() / 1000);

    const msg: AppMessage = {
      id: String(newMsgId),
      msgId: Number(msgId),
      from: from,
      to: to,
      time: Number(createTime),
      type: 'unsupported',
      content: content,
      isSelf: isSelf,
      isRevoked: false,
    };

    const msgType = Number(rawMsg.MsgType || rawMsg.msg_type || rawMsg.Msgtype || 0);

    // --- 特征检测：识别并过滤掉协议层的 XML 状态消息 ---
    // 如果内容包含 <msg><op 或 <voipinvitemsg 等特征，通常是协议控制消息
    const trimmedContent = content.trim();
    if (trimmedContent.includes('<msg>') && trimmedContent.includes('<op')) {
      msg.type = 'status_notify';
      try {
        const cleanXml = this.getCleanXml(trimmedContent);
        const doc = this.parser.parseFromString(cleanXml, 'text/xml');
        const opNode = doc.querySelector('op');
        if (opNode) {
          const username = doc.querySelector('username')?.textContent || '';
          const name = doc.querySelector('name')?.textContent || '';
          const argText = doc.querySelector('arg')?.textContent || '';
          
          if (name === 'lastMessage' && argText) {
            const argJson = JSON.parse(argText);
            msg.statusNotifyData = {
              username: username.trim(),
              lastMessageSvrId: String(argJson.messageSvrId || ''),
              msgCreateTime: Number(argJson.MsgCreateTime || 0)
            };
          }
        }
      } catch (e) {
        console.warn('[Parser] status_notify XML 解析失败', e);
      }
      return msg;
    }

    // --- 根据 msgType 进行分类 ---
    if (msgType === 1) {
      msg.type = 'text';
    } 
    else if (msgType === 3) {
      msg.type = 'image';
      msg.content = '[图片]';
      
      // 尝试解析图片 XML 提取 URL
      if (content.includes('<img')) {
        try {
          const cleanXml = this.getCleanXml(content);
          const doc = this.parser.parseFromString(cleanXml, 'text/xml');
          const imgNode = doc.querySelector('img');
          if (imgNode) {
            // 尝试提取 cdnmidimgurl 或 cdnthumburl
            const midUrl = imgNode.getAttribute('cdnmidimgurl');
            const thumbUrl = imgNode.getAttribute('cdnthumburl');
            const bigUrl = imgNode.getAttribute('cdnbigimgurl');
            
            // 微信协议的 cdn url 有时是一个类似 hex 字符串而不是真正的 url
            // 如果后端接口支持直接拼接，就拼上，暂时保存下来
            const targetUrl = midUrl || thumbUrl || bigUrl;
            if (targetUrl) {
               msg.imageUrl = targetUrl;
            }
          }
        } catch (e) {
          console.warn('[Parser] 图片 XML 解析失败', e);
        }
      }
    }
    else if (msgType === 34) {
      msg.type = 'voice';
      msg.content = '[语音]';
      if (isDebug('parser')) {
        console.log('[Parser] 语音消息原始 content:', content);
      }
      
      if (content.includes('<voicemsg')) {
        try {
          const cleanXml = this.getCleanXml(content);
          const doc = this.parser.parseFromString(cleanXml, 'text/xml');
          const voiceNode = doc.querySelector('voicemsg');
          if (voiceNode) {
            const bufid = voiceNode.getAttribute('bufid');
            const length = voiceNode.getAttribute('length');
            const voicelength = voiceNode.getAttribute('voicelength'); // duration in ms
            const aeskey = voiceNode.getAttribute('aeskey');
            const voiceurl = voiceNode.getAttribute('voiceurl');
            const voiceformat = voiceNode.getAttribute('voiceformat');
            
            if (bufid) msg.voiceBufId = bufid;
            if (length) msg.voiceLength = Number(length);
            if (aeskey) msg.voiceAesKey = aeskey;
            if (voiceurl) msg.voiceCdnUrl = voiceurl;
            if (voiceformat) msg.voiceFormat = Number(voiceformat);
            
            if (voicelength) {
              const seconds = Math.round(Number(voicelength) / 1000) || 1;
              msg.content = `[语音 ${seconds}"]`;
            }
          }
        } catch (e) {
          console.warn('[Parser] 语音 XML 解析失败', e);
        }
      }

      // 提取内嵌语音数据（WS 实时消息的 img_buf.buffer 字段）
      const imgBuf = rawMsg.img_buf || rawMsg.ImgBuf;
      if (imgBuf?.buffer && typeof imgBuf.buffer === 'string' && imgBuf.buffer.length > 10) {
        msg.voiceBuffer = imgBuf.buffer;
      }
    }
    else if (msgType === 43) {
      msg.type = 'video';
      msg.content = '[视频]';
    }
    else if (msgType === 51 || msgType === 10001 || msgType === 9999) {
      msg.type = 'status_notify';
      msg.content = ''; 
    }
    else if (msgType === 10000 || msgType === 10002) {
      msg.type = 'system';
      // 简单处理撤回特征
      if (content.includes('revokemsg')) {
        msg.isRevoked = true;
        msg.content = isSelf ? '你撤回了一条消息' : '对方撤回了一条消息';
      } else {
        msg.content = content.replace(/<[^>]+>/g, '') || '系统消息';
      }
    }
    else if (msgType === 49 || msgType === 47) {
      try {
        const cleanXml = this.getCleanXml(content);
        const doc = this.parser.parseFromString(cleanXml, 'text/xml');
        const title = doc.querySelector('title')?.textContent;
        const type = doc.querySelector('type')?.textContent; // 49 协议内部的真正类型
        
        msg.type = msgType === 47 ? 'image' : 'text';
        // 如果是文件(6)、链接(5)等，可以在这里细化
        msg.content = title || (msgType === 47 ? '[表情]' : '[应用消息]');
      } catch (e) {
        msg.content = '[解析失败]';
      }
    }
    // TODO: 新增支持小程序卡片、视频号等更多复合类型
    
    // 取消对 unsupported 类型的丢弃警告，因为只要有 content，也可以当普通文本展示，避免有些消息悄悄消失
    if (msg.type === 'unsupported') {
      console.warn(`[Parser] 未知消息结构，保留为 unsupported 并尝试展示, msgType: ${msgType}`, JSON.stringify(rawMsg).slice(0, 300));
    }

    if (msg.type === 'unsupported') {
      console.warn(`[Parser] 未知消息结构，原始数据:`, JSON.stringify(rawMsg).slice(0, 300));
    }

    return msg;
  }
}
