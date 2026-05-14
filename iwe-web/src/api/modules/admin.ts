import request from '@/utils/request';

export const adminApi = {
  // 允许显式传入 key 用于验证
  ping: (key?: string) => request.get('/admin/GetAuthKey', { params: key ? { key } : {} }),

  // 获取在线账号列表
  getOnlineAccounts: () => request.get('/admin/GetAuthKey'),
  
  getAuthKey: () => request.get('/admin/GetAuthKey'),
  
  genAuthKey: (days: number) => request.get('/admin/GenAuthKey1', { params: { days } }),
  
  delayAuthKey: (authKey: string, days: number) => request.get('/admin/DelayAuthKey', { params: { authKey, days } }),
  
  deleteAuthKey: (authKey: string) => request.get('/admin/DeleteAuthKey', { params: { authKey } }),
};
