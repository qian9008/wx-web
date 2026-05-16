import request from '@/utils/request';

export const loginApi = {
  getQrCode: (key?: string) => request.post(`/login/GetLoginQrCodeNewX${key ? `?key=${key}` : ''}`, {}),
  // 新扫码登录接口
  getQrCodeNew: (key?: string) => request.post(`/login/GetLoginQrCodeNew${key ? `?key=${key}` : ''}`, {}),
  checkLogin: (uuid: string, key?: string) => request.get(`/login/CheckLoginStatus?uuid=${uuid}${key ? `&key=${key}` : ''}`),
  getOnlineAccounts: () => request.get('/equipment/GetOnlineInfo'),
  
  // A16 数据登录
  a16Login: (data: any) => request.post('/login/A16Login', data),
  
  // 62 账号密码登录
  deviceLogin: (license: string, data: any) => request.post(`/login/DeviceLogin?key=${license}`, data),

  // 检测是否可以设置微信号
  checkCanSetAlias: (license: string) => request.get(`/login/CheckCanSetAlias?key=${license}`),
  
  // 获取在线状态 (Key 模式)
  getOnlineStatus: (license: string) => request.get(`/login/GetLoginStatus?key=${license}`),

  // 唤醒登录
  wakeUpLogin: (license: string) => request.post(`/login/WakeUpLogin?key=${license}`),

  // 获取验证码 (绑定手机)
  getVerifyCode: (license: string, mobile: string) => request.post(`/login/WxBindOpMobileForReg?key=${license}`, { Mobile: mobile }),

  // 获取个人资料信息
  getProfile: (license: string) => request.get(`/user/GetProfile?key=${license}`),

  // 获取链接数量
  getIWXConnect: () => request.get('/login/GetIWXConnect'),
};

export const messageApi = {
  // 同步增量消息
  syncMsg: (license: string, count = 0) => 
    request.post(`/message/HttpSyncMsg?key=${license}`, { Count: count }),
    
  // 同步历史消息
  syncHistoryMsg: (license: string) =>
    request.post(`/message/NewSyncHistoryMessage?key=${license}`, { Count: 0 }),

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

  // 获取 Redis 缓存的最近消息快照
  getRedisSyncMsg: (license: string) => 
    request.post(`/other/GetRedisSyncMsg?key=${license}`, {}),
};
