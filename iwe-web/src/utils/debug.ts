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
    // 1. 若没有开启任何调试开关，直接不记录，保持内置终端彻底静默
    if (!cachedConfig.all && !cachedConfig.request && !cachedConfig.socket && !cachedConfig.cache) {
      return;
    }

    const text = formatArgs(args);

    // 2. 若调试总开关 (All) 关闭，但某些子模块调试开启，则实行精准拦截过滤
    if (!cachedConfig.all) {
      let allow = type === 'error' || type === 'warn'; // 错误和警告默认允许
      
      const lowerText = text.toLowerCase();
      if (!allow && cachedConfig.request && (lowerText.includes('[request]') || lowerText.includes('[api]') || lowerText.includes('api/'))) {
        allow = true;
      }
      if (!allow && cachedConfig.socket && (lowerText.includes('[socket') || lowerText.includes('[pollonce') || lowerText.includes('ws '))) {
        allow = true;
      }
      if (!allow && cachedConfig.cache && (lowerText.includes('[cache]') || lowerText.includes('[db]') || lowerText.includes('indexeddb') || lowerText.includes('[accountstore]'))) {
        allow = true;
      }

      if (!allow) {
        return; // 过滤非调试普通日志，防止终端无谓跳动
      }
    }

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
