import { ref } from 'vue';

interface DebugConfig {
  all: boolean;
  request: boolean;
  socket: boolean;
  cache: boolean;
  parser: boolean;
}

export type DebugModule = Exclude<keyof DebugConfig, 'all'>;
type LazyDebugArg = unknown | (() => unknown);

// 🚀 在 window 对象上挂载全局唯一的配置，彻底击碎打包环境中由“模块多实例”引起的配置状态分裂死穴！
const getGlobalConfig = (): DebugConfig => {
  if (typeof window !== 'undefined') {
    if (!(window as any).__iwe_debug_config__) {
      (window as any).__iwe_debug_config__ = {
        all: false,
        request: false,
        socket: false,
        cache: false,
        parser: false
      };
    }
    return (window as any).__iwe_debug_config__;
  }
  return { all: false, request: false, socket: false, cache: false, parser: false };
};

// 初始化从 localStorage 读取或同步最新的配置
export const syncDebugConfig = (newConfig?: Partial<DebugConfig>) => {
  const globalConf = getGlobalConfig();
  if (newConfig) {
    Object.assign(globalConf, newConfig);
    return;
  }
  
  try {
    const configStr = localStorage.getItem('debug_config');
    if (configStr) {
      const parsed = JSON.parse(configStr);
      globalConf.all = !!parsed.all;
      globalConf.request = !!parsed.request;
      globalConf.socket = !!parsed.socket;
      globalConf.cache = !!parsed.cache;
      globalConf.parser = !!parsed.parser;
    } else {
      globalConf.all = false;
      globalConf.request = false;
      globalConf.socket = false;
      globalConf.cache = false;
      globalConf.parser = false;
    }
  } catch (e) {
    console.error('[Debug] 加载本地配置失败:', e);
  }
};

// 预先初始化一次
syncDebugConfig();

// 优化后的极速 isDebug 检测，直接利用全局 window 内存镜像进行 O(1) 判定
export const isDebug = (module: DebugModule): boolean => {
  const globalConf = getGlobalConfig();
  // 🔴 强力总阀门（电闸）逻辑：总开关 (All) 关闭时，一切调试断电静默，isDebug 必为 false！
  return !!(globalConf.all && globalConf[module]);
};

const resolveLazyArgs = (args: LazyDebugArg[]) => {
  return args.map(arg => typeof arg === 'function' ? (arg as () => unknown)() : arg);
};

const formatDebugTemplate = (template: string, args: unknown[]) => {
  let index = 0;
  const text = template.replace(/\{\}/g, () => {
    const value = args[index++];
    return typeof value === 'string' ? value : String(value);
  });
  return index < args.length ? [text, ...args.slice(index)] : [text];
};

const emitDebug = (
  level: 'log' | 'warn' | 'error',
  module: DebugModule,
  template: string,
  args: LazyDebugArg[]
) => {
  if (!isDebug(module)) return;

  const resolvedArgs = resolveLazyArgs(args);
  const outputArgs = formatDebugTemplate(template, resolvedArgs);
  console[level](...outputArgs);
};

export const debugLog = (module: DebugModule, template: string, ...args: LazyDebugArg[]) => {
  emitDebug('log', module, template, args);
};

export const debugWarn = (module: DebugModule, template: string, ...args: LazyDebugArg[]) => {
  emitDebug('warn', module, template, args);
};

export const debugError = (module: DebugModule, template: string, ...args: LazyDebugArg[]) => {
  emitDebug('error', module, template, args);
};

// --- 内置控制台日志拦截捕获机制 ---
export interface InterceptedLog {
  type: 'log' | 'warn' | 'error';
  text: string;
  time: string;
  count?: number;
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
          // 🚀 优化：先尝试最快速度的单行无缩进序列化，规避极度耗时的格式化缩进计算
          const flatStr = JSON.stringify(arg);
          if (flatStr.length > 2000) {
            // 超大对象直接截断返回，阻止数万行的长文本渲染直接击瘫DOM！
            return flatStr.substring(0, 1500) + `... [日志过长已自动截断，总长度: ${flatStr.length} 字符]`;
          }
          // 普通小对象才使用缩进美化，确保体验
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      const s = String(arg);
      if (s.length > 2000) {
        return s.substring(0, 1500) + `... [日志过长已自动截断，总长度: ${s.length} 字符]`;
      }
      return s;
    }).join(' ');
  };

  const pushToQueue = (type: 'log' | 'warn' | 'error', args: any[]) => {
    const globalConf = getGlobalConfig();
    // 1. 若没有开启任何调试开关，直接不记录，保持内置终端彻底静默
    if (!globalConf.all && !globalConf.request && !globalConf.socket && !globalConf.cache) {
      return;
    }

    // 2. 若调试总开关 (All) 关闭，但某些子模块调试开启，则实行【前置轻量级预过滤】
    // 🚀 核心优化：避免在过滤前就对巨型对象执行昂贵的 formatArgs 序列化开销，从源头彻底阻断卡死！
    if (!globalConf.all) {
      let allow = type === 'error' || type === 'warn'; // 错误和警告默认允许
      
      if (!allow) {
        // 轻量级预过滤：只需快速检查参数中是否有包含模块标识的字符串，不用序列化任何对象！
        allow = args.some(arg => {
          if (typeof arg !== 'string') return false;
          const lower = arg.toLowerCase();
          if (globalConf.request && (lower.includes('[request]') || lower.includes('[api]') || lower.includes('api/'))) return true;
          if (globalConf.socket && (lower.includes('[socket') || lower.includes('[pollonce') || lower.includes('ws '))) return true;
          if (globalConf.cache && (lower.includes('[cache]') || lower.includes('[db]') || lower.includes('indexeddb') || lower.includes('[accountstore]'))) return true;
          if (globalConf.parser && (lower.includes('[parser]'))) return true;
          return false;
        });
      }

      if (!allow) {
        return; // 成功拦截不匹配的日志，在格式化前直接返回，零性能损耗！
      }
    }

    // 3. 安全通过过滤后，才执行格式化，开销降低 99.9%
    const text = formatArgs(args);
    const time = new Date().toLocaleTimeString();

    // 🚀 重复日志折叠计数引擎：如果与最后一条日志的内容和类型完全一致，则直接累加 count
    const len = logsQueue.value.length;
    if (len > 0 && logsQueue.value[len - 1].text === text && logsQueue.value[len - 1].type === type) {
      const lastLog = logsQueue.value[len - 1];
      lastLog.count = (lastLog.count || 1) + 1;
      lastLog.time = time;
      return;
    }
    
    logsQueue.value.push({ type, text, time, count: 1 });
    
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
