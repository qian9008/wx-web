import { ref } from 'vue';

interface DebugConfig {
  all: boolean;
  request: boolean;
  socket: boolean;
  cache: boolean;
}

// 内存中的 Debug 配置缓存副本，规避高频同步访问 localStorage 的性能损耗
let cachedConfig: DebugConfig = {
  all: false,
  request: false,
  socket: false,
  cache: false
};

// 初始化从 localStorage 读取或同步最新的配置
export const syncDebugConfig = (newConfig?: Partial<DebugConfig>) => {
  if (newConfig) {
    cachedConfig = { ...cachedConfig, ...newConfig };
    return;
  }
  
  try {
    const configStr = localStorage.getItem('debug_config');
    if (configStr) {
      const parsed = JSON.parse(configStr);
      cachedConfig = {
        all: !!parsed.all,
        request: !!parsed.request,
        socket: !!parsed.socket,
        cache: !!parsed.cache
      };
    } else {
      cachedConfig = { all: false, request: false, socket: false, cache: false };
    }
  } catch (e) {
    console.error('[Debug] 加载本地配置失败:', e);
  }
};

// 预先初始化一次
syncDebugConfig();

// 优化后的极速 isDebug 检测，直接利用内存镜像进行 O(1) 判定
export const isDebug = (module: 'socket' | 'request' | 'cache'): boolean => {
  return !!(cachedConfig.all || cachedConfig[module]);
};

// --- 内置控制台日志拦截捕获机制 ---
export interface InterceptedLog {
  type: 'log' | 'warn' | 'error';
  text: string;
  time: string;
}

const MAX_LOGS_LIMIT = 200;
export const logsQueue = ref<InterceptedLog[]>([]);

let isInterceptingInstalled = false;

// 安全地拦截 console.log / warn / error
export const initLogInterceptor = () => {
  if (isInterceptingInstalled) return;
  isInterceptingInstalled = true;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  const formatArgs = (args: any[]): string => {
    return args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  };

  const pushToQueue = (type: 'log' | 'warn' | 'error', args: any[]) => {
    const text = formatArgs(args);
    const time = new Date().toLocaleTimeString();
    
    logsQueue.value.push({ type, text, time });
    
    // 超过上限淘汰最旧日志
    if (logsQueue.value.length > MAX_LOGS_LIMIT) {
      logsQueue.value.shift();
    }
  };

  console.log = (...args) => {
    originalLog(...args);
    pushToQueue('log', args);
  };

  console.warn = (...args) => {
    originalWarn(...args);
    pushToQueue('warn', args);
  };

  console.error = (...args) => {
    originalError(...args);
    pushToQueue('error', args);
  };
  
  console.log('[Debug] 内存日志拦截器已成功挂载，已开启实时捕获。');
};
