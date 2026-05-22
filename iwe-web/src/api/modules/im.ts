import request from '@/utils/request';

export const loginApi = {
  getQrCode: (key?: string) => request.post(`/login/GetLoginQrCodeNewX${key ? `?key=${key}` : ''}`, {}),
  // 新扫码登录接口
  getQrCodeNew: (key?: string) => request.post(`/login/GetLoginQrCodeNew${key ? `?key=${key}` : ''}`, { Check: true }),
  checkLogin: (authCode: string) => request.get(`/login/CheckLoginStatus?key=${authCode}`),
  getOnlineAccounts: () => request.get('/equipment/GetOnlineInfo'),
  
  // A16 数据登录 (已注释)
  // a16Login: (data: any) => request.post('/login/A16Login', data),

  // 提取62数据
  get62Data: (license: string) => request.get(`/login/Get62Data?key=${license}`),
  
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

  // 获取单个好友关系
  getFriendRelation: (license: string, username: string) => 
    request.post(`/friend/GetFriendRelation?key=${license}`, { UserName: username }),

  // 删除好友
  delContact: (license: string, username: string) => 
    request.post(`/friend/DelContact?key=${license}`, { DelUserName: username }),

  getMsgBigImg: (license: string, fromUser: string, toUser: string, msgId: number, compressType = 0) => {
    const payload = {
      CompressType: compressType,
      FromUserName: fromUser,
      MsgId: msgId,
      Section: {
        DataLen: 61440,
        StartPos: 0
      },
      ToUserName: toUser,
      TotalLen: 0
    };
    console.log('[GetMsgBigImg] 实际请求体:', JSON.stringify(payload, null, 2));
    return request.post(`/message/GetMsgBigImg?key=${license}`, payload);
  },

  getMsgVoice: (license: string, fromUser: string, toUser: string, bufId: string, length: number, newMsgId: string) => {
    const payload = {
      BufId: bufId,
      FromUserName: fromUser,
      Length: length,
      NewMsgId: newMsgId,
      ToUserName: toUser
    };
    console.log('[GetMsgVoice] 实际请求体:', JSON.stringify(payload, null, 2));
    return request.post(`/message/GetMsgVoice?key=${license}`, payload);
  },

  sendCdnDownload: (license: string, aesKey: string, fileUrl: string, fileType = 4, fileSize = 0) => {
    const payload: any = {
      AesKey: aesKey,
      FileType: fileType,
      FileURL: fileUrl,
    };
    // 仅在 fileSize > 0 时传递大小信息
    if (fileSize > 0) {
      payload.TotalSize = fileSize;
      payload.SrcSize = fileSize;
    }
    console.log('[SendCdnDownload] 实际请求体:', JSON.stringify(payload, null, 2));
    return request.post(`/message/SendCdnDownload?key=${license}`, payload);
  },

  // 获取 Redis 缓存的最近消息快照
  getRedisSyncMsg: (license: string) => 
    request.post(`/other/GetRedisSyncMsg?key=${license}`, {}),
};
