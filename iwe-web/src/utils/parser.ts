/**
 * 消息解析器：将后端的 XML/JSON 结构转换为前端通用的 AppMessage
 */

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
}

export class MessageParser {
  private static parser = new DOMParser();

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
    const normalizedFrom = String(from).trim().toLowerCase();
    const normalizedMyWxid = String(myWxid).trim().toLowerCase();
    const isSelf = normalizedFrom === normalizedMyWxid;

    const msgId = rawMsg.MsgId || rawMsg.msg_id || 0;
    const newMsgId = rawMsg.NewMsgId || rawMsg.new_msg_id || msgId || Date.now();
    const createTime = rawMsg.CreateTime || rawMsg.create_time || Math.floor(Date.now() / 1000);

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

    const msgType = rawMsg.MsgType || rawMsg.msg_type;

    // --- 特征检测：识别并过滤掉协议层的 XML 状态消息 ---
    // 如果内容包含 <msg><op 或 <voipinvitemsg 等特征，通常是协议控制消息
    const trimmedContent = content.trim();
    if (trimmedContent.startsWith('<msg>') && trimmedContent.includes('<op')) {
      msg.type = 'status_notify';
      return msg;
    }

    // --- 根据 msgType 进行分类 ---
    if (msgType === 1) {
      msg.type = 'text';
    } 
    else if (msgType === 3) {
      msg.type = 'image';
      msg.content = '[图片]';
    }
    else if (msgType === 34) {
      msg.type = 'voice';
      msg.content = '[语音]';
    }
    else if (msgType === 43) {
      msg.type = 'video';
      msg.content = '[视频]';
    }
    else if (msgType === 51) {
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
        const doc = this.parser.parseFromString(content, 'text/xml');
        const title = doc.querySelector('title')?.textContent;
        const type = doc.querySelector('type')?.textContent; // 49 协议内部的真正类型
        
        msg.type = msgType === 47 ? 'image' : 'text';
        // 如果是文件(6)、链接(5)等，可以在这里细化
        msg.content = title || (msgType === 47 ? '[表情]' : '[应用消息]');
      } catch (e) {
        msg.content = '[解析失败]';
      }
    }

    return msg;
  }
}
