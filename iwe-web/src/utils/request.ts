import axios from 'axios';
import { Message } from '@arco-design/web-vue';

const service = axios.create({
  timeout: 30000,
});

service.interceptors.request.use(
  (config) => {
    const baseUrl = localStorage.getItem('baseUrl') || localStorage.getItem('iwe_base_url') || '';
    const adminKey = localStorage.getItem('ADMIN_KEY');
    const tokenKey = localStorage.getItem('TOKEN_KEY');
    const debugConfig = JSON.parse(localStorage.getItem('debug_config') || '{"all":false,"request":false}');

    if (debugConfig.all || debugConfig.request) {
      console.log(`[Request] ${config.method?.toUpperCase()} ${config.url}`, config.params || '', config.data || '');
    }

    if (baseUrl && config.url?.startsWith('/')) {
      config.url = `${baseUrl.replace(/\/$/, '')}${config.url}`;
    } else if (!config.url?.startsWith('http')) {
      config.url = `/api${config.url}`;
    }

    // 只有在 URL 和 params 中都没有 key 时，才注入默认的 key
    const hasKeyInUrl = config.url?.includes('key=');
    const hasKeyInParams = config.params?.key !== undefined;

    if (!hasKeyInUrl && !hasKeyInParams) {
      const key = adminKey || tokenKey;
      if (key) {
        config.params = { ...config.params, key };
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

service.interceptors.response.use(
  (response) => {
    const res = response.data;
    const debugConfig = JSON.parse(localStorage.getItem('debug_config') || '{"all":false,"request":false}');

    if (debugConfig.all || debugConfig.request) {
      console.log(`[Response] ${response.config.url}`, res);
    }

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
