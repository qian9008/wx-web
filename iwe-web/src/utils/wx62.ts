import { useAccountStore } from '@/store/account';

// 声明 62 账号绑定关系接口
export interface Wx62Binding {
  username: string;     // 微信账号 (优先为 alias, 其次为 uuid / 输入账号)
  tokenKey: string;     // TOKEN_KEY (sessionKey)
  loginData: string;    // 62 数据
  nickname: string;     // 昵称
  updatedAt: number;
}

// 获取所有的 62 绑定关系，若没有则从旧数据迁移/初始化
export const getWx62Bindings = (): Wx62Binding[] => {
  const accountStore = useAccountStore();
  let bindings: Wx62Binding[] = [];
  try {
    const saved = localStorage.getItem('wx_62_bindings');
    if (saved) {
      bindings = JSON.parse(saved);
    }
  } catch (e) {
    console.error('解析 wx_62_bindings 失败:', e);
  }

  // 1. 自动从 store 里的在线账号与本地 62 数据匹配，智能丰富/纠正绑定关系
  accountStore.accounts.forEach(acc => {
    if (!acc.uuid || !acc.sessionKey) return;
    
    // 优先从 acc.alias、acc.uuid、acc.sessionKey 中拿数据
    const data = (acc.alias && localStorage.getItem(`wx_62_data_${acc.alias}`)) ||
                 localStorage.getItem(`wx_62_data_${acc.uuid}`) || 
                 localStorage.getItem(`wx_62_data_${acc.sessionKey}`);
    
    if (data) {
      // 微信账号优先使用 alias，其次用 uuid
      const resolvedUsername = acc.alias || acc.uuid;
      const existingIdx = bindings.findIndex(b => b.username === resolvedUsername || (acc.alias && b.username === acc.alias));
      if (existingIdx > -1) {
        // 如果已存在，更新关联 of tokenKey 和 62data 绑定关系
        bindings[existingIdx].username = resolvedUsername;
        bindings[existingIdx].tokenKey = acc.sessionKey;
        bindings[existingIdx].loginData = data;
        bindings[existingIdx].nickname = acc.nickname || bindings[existingIdx].nickname;
        bindings[existingIdx].updatedAt = Date.now();
      } else {
        bindings.push({
          username: resolvedUsername,
          tokenKey: acc.sessionKey,
          loginData: data,
          nickname: acc.nickname || '微信账号',
          updatedAt: Date.now()
        });
      }
    }
  });

  // 2. 从本地缓存的 wx_62_data_${key} 进行向下兼容补全
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('wx_62_data_')) {
      const val = key.substring('wx_62_data_'.length);
      // 排除备份兜底键和已有绑定
      if (val && val !== 'wx_62_data' && !bindings.some(b => b.username === val || b.tokenKey === val)) {
        const matchedAcc = accountStore.accounts.find(a => a.uuid === val || a.sessionKey === val || a.alias === val);
        const data = localStorage.getItem(key);
        if (data) {
          bindings.push({
            username: matchedAcc?.alias || matchedAcc?.uuid || val,
            tokenKey: matchedAcc?.sessionKey || val,
            loginData: data,
            nickname: matchedAcc?.nickname || '本地62账号',
            updatedAt: Date.now()
          });
        }
      }
    }
  }

  return bindings;
};

// 保存或更新单个绑定关系
export const saveWx62Binding = (username: string, tokenKey: string, loginData: string, nickname = '') => {
  if (!username || !tokenKey || !loginData) return;
  const bindings = getWx62Bindings();
  const accountStore = useAccountStore();
  
  // 查找对应账号，看看在 store 中有没有更完整的 alias 映射
  const matchedAcc = accountStore.accounts.find(a => a.uuid === username || a.sessionKey === tokenKey || a.alias === username);
  const resolvedUsername = matchedAcc?.alias || username;
  
  const idx = bindings.findIndex(b => b.username === resolvedUsername || (matchedAcc?.alias && b.username === matchedAcc.alias));
  const resolvedNickname = nickname || matchedAcc?.nickname || '本地62账号';

  if (idx > -1) {
    bindings[idx].username = resolvedUsername;
    bindings[idx].tokenKey = tokenKey;
    bindings[idx].loginData = loginData;
    bindings[idx].nickname = resolvedNickname;
    bindings[idx].updatedAt = Date.now();
  } else {
    bindings.push({
      username: resolvedUsername,
      tokenKey: tokenKey,
      loginData: loginData,
      nickname: resolvedNickname,
      updatedAt: Date.now()
    });
  }
  
  localStorage.setItem('wx_62_bindings', JSON.stringify(bindings));
};
