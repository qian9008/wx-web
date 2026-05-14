import request from '@/utils/request';

export const adminApi = {
  // 允许显式传入 key 用于验证
  ping: (key?: string) => request.get('/admin/GetAuthKey', { params: key ? { key } : {} }),

  // 获取在线账号列表
  getOnlineAccounts: () => request.get('/admin/GetAuthKey'),
  
  // 获取授权码列表
  getAuthKey: () => request.get('/admin/GetAuthKey'),
  
  // 生成授权码(新设备)
  genAuthKey: (days: number) => request.post('/admin/GenAuthKey1', { days }),
  
  // 授权码延期
  delayAuthKey: (authKey: string, days: number) => request.post('/admin/DelayAuthKey', { authKey, days }),
  
  // 删除授权码
  deleteAuthKey: (authKey: string) => request.post('/admin/DeleteAuthKey', { authKey }),
};
