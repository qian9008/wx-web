/**
 * 消息分发器：将原始协议消息路由到对应的业务处理逻辑
 */

import { MessageParser } from './parser';
import { useChatStore } from '@/store/chat';
import { useAccountStore } from '@/store/account';
import { isDebug } from './debug';
import type { MessagePartnerType } from '@/types/chat';

export class MessageDispatcher {
  /**
   * 获取联系人类型
   */
  public static getPartnerType(partnerId: string): MessagePartnerType {
    if (partnerId.endsWith('@chatroom')) {
      return 'chatroom';
    }
    const specialIds = ['fmessage', 'medianote', 'floatbottle', 'newsapp', 'helper_entry', 'filehelper'];
    if (partnerId.startsWith('gh_') || specialIds.includes(partnerId)) {
      return 'official';
    }
    return 'individual';
  }

  /**
   * 分发原始消息
   */
  public static async dispatch(userName: string, rawMsg: any) {
    if (!rawMsg) return;

    const chatStore = useChatStore();
    const accountStore = useAccountStore();

    // 1. 拦截独立的联系人/群聊信息更新
    const isContactUpdate = (rawMsg.userName || rawMsg.UserName) &&
                            (rawMsg.pyinitial || rawMsg.pyInitial || rawMsg.quanPin || rawMsg.imgFlag !== undefined || rawMsg.contactType !== undefined);

    if (isContactUpdate) {
      const wxid = rawMsg.userName?.str || rawMsg.UserName?.str || rawMsg.wxid || rawMsg.userName || rawMsg.UserName;
      if (wxid && typeof wxid === 'string') {
        if (isDebug('socket')) {
          console.log(`[Dispatcher:${userName}] 收到联系人/群聊属性变更: ${wxid}`);
        }
        accountStore.updateContact(wxid, rawMsg, userName);
      }
      return;
    }

    const rawType = Number(rawMsg.Type || rawMsg.MsgType || rawMsg.msg_type || 0);

    // 2. 拦截并处理联系人同步消息 (Type 10001)
    if (rawType === 10001) {
      this.handleContactSync(userName, rawMsg);
      return;
    }

    // 3. 去重检查
    const msgId = rawMsg.NewMsgId || rawMsg.MsgId || rawMsg.msg_id || rawMsg.new_msg_id || rawMsg.UUID;
    if (msgId && chatStore._msgIdDedup.has(String(msgId))) {
      if (isDebug('socket')) console.log(`[Dispatcher:${userName}] 消息 ID ${msgId} 已存在，跳过`);
      return;
    }

    // 4. 解析消息
    const parsedMsg = MessageParser.parse(rawMsg, userName);

    // 补充业务字段
    const myWxid = userName.trim();
    const fromId = parsedMsg.from.trim();
    const toId = parsedMsg.to.trim();
    const partnerId = (fromId === myWxid) ? (toId || fromId) : (fromId || toId);

    parsedMsg.partnerId = partnerId;
    parsedMsg.partnerType = this.getPartnerType(partnerId);

    // 5. 拦截状态通知和其他非显示类消息
    if (parsedMsg.type === 'status_notify' || (!parsedMsg.content && parsedMsg.type === 'unsupported')) {
      if (parsedMsg.type === 'status_notify' && parsedMsg.statusNotifyData?.username) {
        const targetWxid = parsedMsg.statusNotifyData.username;
        if (isDebug('socket')) {
          console.log(`[Dispatcher:${userName}] 收到状态同步，清除未读: ${targetWxid}`);
        }
        chatStore.clearUnread(userName, targetWxid).catch(() => {});
      }
      return;
    }

    // 6. 提交到 Store 存储与显示
    chatStore.addParsedMessage(userName, parsedMsg).catch(err => {
      console.error(`[Dispatcher:${userName}] 存储消息异常:`, err);
    });
  }

  /**
   * 处理联系人同步 (Type 10001)
   */
  private static handleContactSync(userName: string, rawMsg: any) {
    const accountStore = useAccountStore();

    // 修改/更新
    const modContacts = rawMsg.ModContacts || rawMsg.modContacts || rawMsg.ModContactList || rawMsg.modContactList;
    if (modContacts && Array.isArray(modContacts)) {
      modContacts.forEach((contact: any) => {
        const wxid = contact.userName?.str || contact.UserName?.str || contact.wxid || contact.userName;
        if (wxid) accountStore.updateContact(wxid, contact, userName);
      });
    }

    // 删除
    const delContacts = rawMsg.DelContacts || rawMsg.delContacts || rawMsg.DelContactList || rawMsg.delContactList;
    if (delContacts && Array.isArray(delContacts)) {
      delContacts.forEach(async (contact: any) => {
        const wxid = contact.userName?.str || contact.UserName?.str || contact.wxid || contact.userName;
        if (wxid) {
          await accountStore.updateContact(wxid, {
            friendRelation: 3,
            isDeleted: true
          }, userName, false);
        }
      });
    }
  }
}
