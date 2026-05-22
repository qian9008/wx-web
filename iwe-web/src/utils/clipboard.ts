import { Message } from '@arco-design/web-vue';

/**
 * 复制文本到剪贴板，支持现代 API 和旧浏览器 Fallback
 * @param text 要复制的文本内容
 * @param successMsg 复制成功时的提示文字，默认为 '已复制到剪贴板'
 */
export const copyToClipboard = async (text: string, successMsg = '已复制到剪贴板') => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    Message.success(successMsg);
  } catch (err) {
    // 兼容旧浏览器
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // 隐藏文本域以避免页面抖动
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '2em';
    textarea.style.height = '2em';
    textarea.style.padding = '0';
    textarea.style.border = 'none';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.background = 'transparent';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      Message.success(successMsg);
    } catch (e) {
      Message.error('复制失败，请手动选择复制');
    }
    document.body.removeChild(textarea);
  }
};
