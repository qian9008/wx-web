/**
 * Account Store 辅助函数与头像处理工具模块
 */

export const extractAvatarString = (obj: any): string => {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'object') {
    if (obj.str && typeof obj.str === 'string') return obj.str;
    if (obj.Str && typeof obj.Str === 'string') return obj.Str;
    if (obj.Url && typeof obj.Url === 'string') return obj.Url;
    if (obj.url && typeof obj.url === 'string') return obj.url;
    if (obj.Val && typeof obj.Val === 'string') return obj.Val;
    if (obj.val && typeof obj.val === 'string') return obj.val;
  }
  return '';
};

export async function getAvatarUrl(url: string): Promise<string> {
  if (!url) return '';
  // 🚀 核心防御：如果不是常规的 HTTP 链接（比如微信原生的 srt2ihe: 协议），直接返回原字符串，防止网络 fetch 抛错
  const isHttp = url.startsWith('http://') || url.startsWith('https://');
  if (!isHttp) return url;

  // 统一将 http 协议强转为 https，防止部署在 HTTPS 环境下时由于 Mixed Content (混合内容) 被浏览器直接拦截
  if (url.startsWith('http://')) {
    url = url.replace('http://', 'https://');
  }
  return url;
}

export function getContactAvatar(c: any): string {
  if (!c) return '';
  const urlVal = c.smallHeadImgUrl || c.SmallHeadImgUrl || c.headImgUrl || c.HeadImgUrl || c.avatar || '';
  let rawUrl = extractAvatarString(urlVal).trim().replace(/\u0060/g, '');
  if (!rawUrl) return '';
  if (rawUrl.startsWith('http://')) {
    rawUrl = rawUrl.replace('http://', 'https://');
  }
  return rawUrl;
}

export function getAccountAvatar(store: any, acc: any): string {
  if (!acc) return '';
  const selfContact = store.accountContactMaps[acc.uuid]?.[acc.uuid];
  if (selfContact) {
    const cached = getContactAvatar(selfContact);
    if (cached) return cached;
  }
  let avatarUrl = acc.avatar;
  if (avatarUrl) {
    let rawUrl = extractAvatarString(avatarUrl).trim().replace(/\u0060/g, '');
    if (rawUrl) {
      if (rawUrl.startsWith('http://')) {
        rawUrl = rawUrl.replace('http://', 'https://');
      }
      return rawUrl;
    }
  }
  return '';
}
