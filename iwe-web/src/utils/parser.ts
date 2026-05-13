/**
 * ?????????????? XML/JSON ????????? AppMessage
 */

export interface AppMessage {
  id: string;
  msgId: number;
  from: string;
  to: string;
  time: number;
  type: 'text' | 'image' | 'voice' | 'video' | 'system' | 'unsupported';
  content: string;
  isSelf: boolean;
  isRevoked: boolean;
  rawXml?: string;
  imageUrl?: string;
}

export class MessageParser {
  private static parser = new DOMParser();

  public static parse(rawMsg: any, myWxid: string): AppMessage {
    const from = typeof rawMsg.FromUserName === 'object' ? (rawMsg.FromUserName.str || '') : (rawMsg.FromUserName || '');
    const to = typeof rawMsg.ToUserName === 'object' ? (rawMsg.ToUserName.str || '') : (rawMsg.ToUserName || '');

    // 规范化比较 ID，忽略大小写和首尾空格
    const normalizedFrom = String(from).trim().toLowerCase();
    const normalizedMyWxid = String(myWxid).trim().toLowerCase();
    const isSelf = normalizedFrom === normalizedMyWxid;

    const msg: AppMessage = {
      id: String(rawMsg.NewMsgId || rawMsg.MsgId || Date.now()),
      msgId: Number(rawMsg.MsgId || 0),
      from: from,
      to: to,
      time: rawMsg.CreateTime || Math.floor(Date.now() / 1000),
      type: 'unsupported',
      content: rawMsg.Content || '',
      isSelf: isSelf,
      isRevoked: false,
    };

    const msgType = rawMsg.MsgType;

    // 1. ????
    if (msgType === 1) {
      msg.type = 'text';
    } 
    // 2. ????
    else if (msgType === 3) {
      msg.type = 'image';
      msg.content = '[??]';
    }
    // 3. ???? (????)
    else if (msgType === 10002) {
      msg.type = 'system';
      msg.content = '?????????';
    }
    // 4. ?? XML (App??/???)
    else if (msgType === 49 || msgType === 47) {
      const xmlStr = rawMsg.Content;
      try {
        const doc = this.parser.parseFromString(xmlStr, 'text/xml');
        const title = doc.querySelector('title')?.textContent;
        msg.type = msgType === 47 ? 'image' : 'text';
        msg.content = title || (msgType === 47 ? '[??]' : '[????]');
      } catch (e) {
        msg.content = '[????]';
      }
    }

    return msg;
  }
}
