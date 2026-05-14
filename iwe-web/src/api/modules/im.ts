import request from '@/utils/request';

export const loginApi = {
  getQrCode: () => request.post('/login/GetLoginQrCodeNewX', {}),
  checkLogin: (uuid: string) => request.get(`/login/CheckLoginStatus?uuid=${uuid}`),
  getOnlineStatus: () => request.get('/login/GetLoginStatus'),
  getOnlineAccounts: () => request.get('/equipment/GetOnlineInfo'),
};

export const messageApi = {
  syncMsg: (license: string, count = 0) => 
    request.post(`/message/HttpSyncMsg?key=${license}`, { Count: count }, { timeout: 60000 }),
    
  sendText: (license: string, toUser: string, content: string) => 
    request.post(`/message/SendTextMessage?key=${license}`, { 
      MsgItem: [
        {
          AtWxIDList: [],
          ImageContent: "",
          MsgType: 1,
          TextContent: content,
          ToUserName: toUser
        }
      ]
    }),

  sendAppMsg: (license: string, toUser: string, contentType: number, contentXml: string) => 
    request.post(`/message/SendAppMessage?key=${license}`, { 
      AppList: [
        {
          ContentType: contentType,
          ContentXML: contentXml,
          ToUserName: toUser
        }
      ]
    }),

  // 获取通讯录列表 (仅返回 ID 列表)
  getContactList: (license: string, contactSeq = 0, chatRoomSeq = 0) => 
    request.post(`/friend/GetContactList?key=${license}`, { 
      CurrentWxcontactSeq: contactSeq, 
      CurrentChatRoomContactSeq: chatRoomSeq 
    }),

  getContactDetailsList: (license: string, userList: string[]) => 
    request.post(`/friend/GetContactDetailsList?key=${license}`, { 
      UserNames: userList 
    }),

  getFriendList: (license: string) => 
    request.get(`/friend/GetFriendList?key=${license}`),

  getMsgBigImg: (license: string, fromUser: string, toUser: string, msgId: number) => 
    request.post(`/message/GetMsgBigImg?key=${license}`, {
      CompressType: 0,
      FromUserName: fromUser,
      MsgId: msgId,
      Section: {
        ClientMsgId: "",
        DataLen: 0,
        TotalLen: 0
      },
      ToUserName: toUser,
      TotalLen: 0
    }),
};
