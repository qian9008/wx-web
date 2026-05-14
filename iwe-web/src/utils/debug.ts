export const isDebug = (module: 'socket' | 'request' | 'cache') => {
  const configStr = localStorage.getItem('debug_config');
  if (!configStr) return false;
  try {
    const config = JSON.parse(configStr);
    return config.all || config[module];
  } catch (e) {
    return false;
  }
};
