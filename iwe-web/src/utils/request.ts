import axios from 'axios';
import { Message } from '@arco-design/web-vue';

const service = axios.create({
  timeout: 10000,
});

service.interceptors.request.use(
  (config) => {
    const baseUrl = localStorage.getItem('iwe_base_url') || '';
    const adminToken = localStorage.getItem('iwe_admin_token');

    if (baseUrl && config.url?.startsWith('/')) {
      config.url = `${baseUrl.replace(/\/$/, '')}${config.url}`;
    } else if (!config.url?.startsWith('http')) {
      config.url = `/api${config.url}`;
    }

    // 只有在 URL 和 params 中都没有 key 时，才注入默认的 adminToken
    const hasKeyInUrl = config.url?.includes('key=');
    const hasKeyInParams = config.params?.key !== undefined;

    if (adminToken && !hasKeyInUrl && !hasKeyInParams) {
      config.params = { ...config.params, key: adminToken };
    }
    return config;
  },
  (error) => Promise.reject(error)
);

service.interceptors.response.use(
  (response) => {
    const res = response.data;
    // 【防御性逻辑】自动识别并拆除 Code/Data 外壳
    if (res && typeof res === 'object' && 'Code' in res) {
      if (res.Code === 200 || res.Code === 0) {
        return res.Data !== undefined ? res.Data : res;
      } else {
        Message.error(res.Text || '业务请求失败');
        return Promise.reject(res);
      }
    }
    return res;
  },
  (error) => {
    const msg = error.response?.data?.Text || error.message || '网络错误';
    Message.error(msg);
    return Promise.reject(error);
  }
);

export default service;
