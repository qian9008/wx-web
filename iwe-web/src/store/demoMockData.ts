/**
 * Demo 体验模式高仿真静态 Mock 数据与填充逻辑
 * 由自动化脚本从 store/account.ts 中原子化剥离，以优化首屏体积与性能
 */

export function populateDemoData(accountStore: any, chatStore: any) {
      // 1. 初始化联系人 Map
      const xiaomingContacts: Record<string, any> = {
        'mock_xiaoming': {
          userName: { str: 'mock_xiaoming' },
          nickName: { str: '小明 (开发助理)' },
          smallHeadImgUrl: '',
          headImgUrl: '',
          contactType: 0
        },
        'mock_user_a': {
          userName: { str: 'mock_user_a' },
          nickName: { str: '张三 (客户商务)' },
          remark: { str: '张三' },
          smallHeadImgUrl: '',
          headImgUrl: '',
          contactType: 1
        },
        'mock_user_b': {
          userName: { str: 'mock_user_b' },
          nickName: { str: '李四 (技术售后)' },
          remark: { str: '李四' },
          smallHeadImgUrl: '',
          headImgUrl: '',
          contactType: 1
        },
        'mock_group_c': {
          userName: { str: 'mock_group_c' },
          nickName: { str: 'IWE 极客技术交流群' },
          remark: { str: '' },
          smallHeadImgUrl: '',
          headImgUrl: '',
          contactType: 2,
          chatRoomMembers: ['mock_xiaoming', 'mock_linjingli', 'mock_user_a', 'mock_user_b']
        },
        'gh_official_a': {
          userName: { str: 'gh_official_a' },
          nickName: { str: 'IWE 终端官方发布' },
          remark: { str: '' },
          smallHeadImgUrl: '',
          headImgUrl: '',
          contactType: 3
        },
        'filehelper': {
          userName: { str: 'filehelper' },
          nickName: { str: '文件传输助手' },
          remark: { str: '' },
          smallHeadImgUrl: '',
          headImgUrl: '',
          contactType: 0
        }
      };

      const linContacts: Record<string, any> = {
        'mock_linjingli': {
          userName: { str: 'mock_linjingli' },
          nickName: { str: '林经理 (产品经理)' },
          smallHeadImgUrl: '',
          headImgUrl: '',
          contactType: 0
        },
        'mock_user_d': {
          userName: { str: 'mock_user_d' },
          nickName: { str: '王五 (UI/UX设计师)' },
          remark: { str: '王五' },
          smallHeadImgUrl: '',
          headImgUrl: '',
          contactType: 1
        },
        'mock_user_e': {
          userName: { str: 'mock_user_e' },
          nickName: { str: '赵六 (研发总监)' },
          remark: { str: '赵六' },
          smallHeadImgUrl: '',
          headImgUrl: '',
          contactType: 1
        },
        'filehelper': {
          userName: { str: 'filehelper' },
          nickName: { str: '文件传输助手' },
          remark: { str: '' },
          smallHeadImgUrl: '',
          headImgUrl: '',
          contactType: 0
        }
      };

      accountStore.accountContactMaps['mock_xiaoming'] = xiaomingContacts;
      accountStore.accountContactMaps['mock_linjingli'] = linContacts;
      accountStore.accountContactMaps['mock_backup_slot'] = {};

      accountStore.isContactListLoadedMap['mock_xiaoming'] = true;
      accountStore.isContactListLoadedMap['mock_linjingli'] = true;
      accountStore.isContactListLoadedMap['mock_backup_slot'] = false;

      // 2. 初始化对话和消息
      
      // 演示消息定义
      const now = Math.floor(Date.now() / 1000);
      
      const xiaomingMsgs: Record<string, any[]> = {
        'mock_user_a': [
          {
            id: 'm1_1',
            msgId: 10001,
            from: 'mock_user_a',
            to: 'mock_xiaoming',
            time: now - 3600 * 2,
            type: 'text',
            content: '你好小明，我们这边新系统的授权码怎么申请？',
            isSelf: false,
            isRevoked: false
          },
          {
            id: 'm1_2',
            msgId: 10002,
            from: 'mock_xiaoming',
            to: 'mock_user_a',
            time: now - 3600 * 2 + 60,
            type: 'text',
            content: '三哥好！在我们的管理控制台，点击左下角齿轮，然后选择【授权管理】->【生成授权码】即可，可以选择到期时间。',
            isSelf: true,
            isRevoked: false
          },
          {
            id: 'm1_3',
            msgId: 10003,
            from: 'mock_user_a',
            to: 'mock_xiaoming',
            time: now - 3600 * 2 + 120,
            type: 'text',
            content: '好的，我已经生成了一个，并且在单账号模式下登录成功了！这个界面反应太快了，简直像本地桌面软件一样丝滑！👍',
            isSelf: false,
            isRevoked: false
          },
          {
            id: 'm1_4',
            msgId: 10004,
            from: 'mock_xiaoming',
            to: 'mock_user_a',
            time: now - 3600 + 300,
            type: 'text',
            content: '那是当然的，我们采用了全内存消息镜像，消息在前端是不入库的，每会话严格限制在 50 条，极大地降低了浏览器的渲染和存储负担。',
            isSelf: true,
            isRevoked: false
          },
          {
            id: 'm1_5',
            msgId: 10005,
            from: 'mock_user_a',
            to: 'mock_xiaoming',
            time: now - 1800,
            type: 'text',
            content: '我记得以前的网页端，挂几十个号几十分钟就卡死了，咱们这个真的抗压吗？',
            isSelf: false,
            isRevoked: false
          }
        ],
        'mock_user_b': [
          {
            id: 'm2_1',
            msgId: 20001,
            from: 'mock_user_b',
            to: 'mock_xiaoming',
            time: now - 3600,
            type: 'text',
            content: '小明，刚才我们做了一次微信头像的防盗链测试。',
            isSelf: false,
            isRevoked: false
          },
          {
            id: 'm2_2',
            msgId: 20002,
            from: 'mock_user_b',
            to: 'mock_xiaoming',
            time: now - 3500,
            type: 'text',
            content: '微信如果封锁 Referer，可能会导致图片 403 无法显示。',
            isSelf: false,
            isRevoked: false
          },
          {
            id: 'm2_3',
            msgId: 20003,
            from: 'mock_xiaoming',
            to: 'mock_user_b',
            time: now - 3400,
            type: 'text',
            content: '是的，我们在 <img> 标签中加入了 referrerpolicy="no-referrer" 策略，完美绕过微信的防盗链限制，结合本地 LRU 缓存，再次加载就完全零网络开销了！',
            isSelf: true,
            isRevoked: false
          },
          {
            id: 'm2_4',
            msgId: 20004,
            from: 'mock_user_b',
            to: 'mock_xiaoming',
            time: now - 3300,
            type: 'text',
            content: '这是一条机密信息，稍后我将测试防撤回拦截功能...',
            isSelf: false,
            isRevoked: false
          },
          {
            id: 'm2_5',
            msgId: 20005,
            from: 'mock_user_b',
            to: 'mock_xiaoming',
            time: now - 3290,
            type: 'text',
            content: '这行文字将被撤回，但在 IWE 中将被强力留存拦截！',
            isSelf: false,
            isRevoked: true // 撤回标记
          }
        ],
        'mock_group_c': [
          {
            id: 'm3_1',
            msgId: 30001,
            from: 'mock_user_a',
            to: 'mock_group_c',
            time: now - 7200,
            type: 'text',
            content: '今天研发部的人都在吗？我们要讨论一下移动端双栏自适应布局的合并。',
            isSelf: false,
            isRevoked: false
          },
          {
            id: 'm3_2',
            msgId: 30002,
            from: 'mock_user_b',
            to: 'mock_group_c',
            time: now - 7100,
            type: 'text',
            content: '在的，移动端适配已经完美搞定了！当屏幕宽度小于 768px 时，左侧导航和聊天视窗会自动合并成单视图。在聊天视窗顶部加了手势返回按钮，点击后清空 activeId 返回主列表，效果很丝滑。',
            isSelf: false,
            isRevoked: false
          },
          {
            id: 'm3_3',
            msgId: 30003,
            from: 'mock_linjingli',
            to: 'mock_group_c',
            time: now - 7000,
            type: 'text',
            content: '很好！这个双栏合并的交互非常契合手机用户的习惯，大赞！',
            isSelf: false,
            isRevoked: false
          },
          {
            id: 'm3_4',
            msgId: 30004,
            from: 'mock_xiaoming',
            to: 'mock_group_c',
            time: now - 6900,
            type: 'text',
            content: '是的，而且我们还把 SettingsModal, ChatArea, LeftSidebar, ListSidebar 彻底重构拆分出来了，Home.vue 从 2200 多行精简到了 360 多行，可读性一流，便于后续持续交付！',
            isSelf: true,
            isRevoked: false
          }
        ],
        'gh_official_a': [
          {
            id: 'm4_1',
            msgId: 40001,
            from: 'gh_official_a',
            to: 'mock_xiaoming',
            time: now - 86400,
            type: 'text',
            content: '【IWE 终端升级公告】V1.0 暗黑极客版正式上线！首创先连后补 WebSocket/HTTP 时序去重算法，极速 Redis 极速冷启动双引擎，24小时头像写网关，多账户自由多开！',
            isSelf: false,
            isRevoked: false
          }
        ],
        'filehelper': [
          {
            id: 'm5_1',
            msgId: 50001,
            from: 'mock_xiaoming',
            to: 'filehelper',
            time: now - 300,
            type: 'text',
            content: '今日测试备忘录：\n1. 测试 62 智能提取与防抖自动填充 ✅\n2. 测试多账号 WebSocket 按需懒加载延迟初始化 ✅\n3. 测试聊天记录云端 Hash (哈希表) 手动同步备份 ✅',
            isSelf: true,
            isRevoked: false
          }
        ]
      };

      const linMsgs: Record<string, any[]> = {
        'mock_user_d': [
          {
            id: 'm6_1',
            msgId: 60001,
            from: 'mock_user_d',
            to: 'mock_linjingli',
            time: now - 1800,
            type: 'text',
            content: '林经理，新设计的磨砂玻璃质感登录配置页效果图出炉了，您看一下。',
            isSelf: false,
            isRevoked: false
          },
          {
            id: 'm6_2',
            msgId: 60002,
            from: 'mock_linjingli',
            to: 'mock_user_d',
            time: now - 1700,
            type: 'text',
            content: '非常不错！配合 Glow 霓虹呼吸发光特效，显得极其高阶和现代，这就是我们追求的极客质感。',
            isSelf: true,
            isRevoked: false
          }
        ],
        'mock_user_e': [
          {
            id: 'm7_1',
            msgId: 70001,
            from: 'mock_user_e',
            to: 'mock_linjingli',
            time: now - 3600,
            type: 'text',
            content: '林总，后端的 Redis Hash 哈希表升级计划已经通过，性能提升约 300%，读写耗时基本归零。',
            isSelf: false,
            isRevoked: false
          },
          {
            id: 'm7_2',
            msgId: 70002,
            from: 'mock_linjingli',
            to: 'mock_user_e',
            time: now - 3500,
            type: 'text',
            content: '太棒了，这配合我们前端的 Redis 极速模式（跳过 IndexedDB 直接进行内存镜像填充），可以做到真正的全云端缓存运行，多端无缝秒开。',
            isSelf: true,
            isRevoked: false
          }
        ],
        'filehelper': [
          {
            id: 'm8_1',
            msgId: 80001,
            from: 'mock_linjingli',
            to: 'filehelper',
            time: now - 1000,
            type: 'text',
            content: '产品路线图 V2.0 规划：\n1. 支持网页端端到端高强度对称加密存储\n2. 进一步优化巨型群组下，单帧流式渲染的高性能调度算法',
            isSelf: true,
            isRevoked: false
          }
        ]
      };

      chatStore.accountMessages['mock_xiaoming'] = xiaomingMsgs;
      chatStore.accountMessages['mock_linjingli'] = linMsgs;
      chatStore.accountMessages['mock_backup_slot'] = {};

      // 构造 Conversation 列表
      const xiaomingConvs = [
        {
          wxid: 'mock_user_a',
          nickname: '张三 (客户商务)',
          avatar: '',
          lastMsg: '我记得以前的网页端，挂几十个号几十分钟就卡死了，咱们这个真的抗压吗？',
          time: now - 1800,
          unread: 1
        },
        {
          wxid: 'mock_user_b',
          nickname: '李四 (技术售后)',
          avatar: '',
          lastMsg: '这行文字将被撤回，但在 IWE 中将被强力留存拦截！',
          time: now - 3290,
          unread: 0
        },
        {
          wxid: 'mock_group_c',
          nickname: 'IWE 极客技术交流群',
          avatar: '',
          lastMsg: '小明: 是的，而且我们还把 SettingsModal, ChatArea... 进行了拆分...',
          time: now - 6900,
          unread: 0
        },
        {
          wxid: 'filehelper',
          nickname: '文件传输助手',
          avatar: '',
          lastMsg: '今日测试备忘录：1. 测试 62 智能提取...',
          time: now - 300,
          unread: 0
        },
        {
          wxid: 'gh_official_a',
          nickname: 'IWE 终端官方发布',
          avatar: '',
          lastMsg: '【IWE 终端升级公告】V1.0 暗黑极客版正式上线！',
          time: now - 86400,
          unread: 0
        }
      ];

      const linConvs = [
        {
          wxid: 'mock_user_d',
          nickname: '王五 (UI/UX设计师)',
          avatar: '',
          lastMsg: '非常不错！配合 Glow 霓虹呼吸发光特效，显得极其高阶和现代...',
          time: now - 1700,
          unread: 0
        },
        {
          wxid: 'mock_user_e',
          nickname: '赵六 (研发总监)',
          avatar: '',
          lastMsg: '这配合我们前端的 Redis 极速模式，可以做到真正的全云端缓存运行，多端无缝秒开。',
          time: now - 3500,
          unread: 0
        },
        {
          wxid: 'filehelper',
          nickname: '文件传输助手',
          avatar: '',
          lastMsg: '产品路线图 V2.0 规划：...',
          time: now - 1000,
          unread: 0
        }
      ];

      chatStore.accountConversations['mock_xiaoming'] = xiaomingConvs;
      chatStore.accountConversations['mock_linjingli'] = linConvs;
      chatStore.accountConversations['mock_backup_slot'] = [];
}
