/**
 * 核心聊天类型定义
 */

export type MessagePartnerType = 'individual' | 'chatroom' | 'official';

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
  isBigImageLoaded?: boolean;
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
  voiceBuffer?: string; // img_buf.buffer base64
  partnerId?: string;   // 业务字段：对话伙伴 ID
  partnerType?: MessagePartnerType; // 业务字段：对话伙伴类型
}

export interface Conversation {
  wxid: string;
  nickname: string;
  avatar: string;
  lastMsg: string;
  time: number;
  unread: number;
}
