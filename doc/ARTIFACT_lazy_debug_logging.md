# 延迟调试日志改造记录

## 背景

原先关闭 debug 开关后，内置日志面板不会继续收集大部分日志，但源头的 `console.log(...)` 仍会执行。对于 `JSON.stringify`、字节数组格式化、大对象响应预览、高频 Socket/Redis 流水日志，这会造成不必要的计算和浏览器控制台输出。

## 本次方案

在 `iwe-web/src/utils/debug.ts` 增加统一调试日志入口：

- `debugLog(module, template, ...args)`
- `debugWarn(module, template, ...args)`
- `debugError(module, template, ...args)`

调用时先判断 `isDebug(module)`，再解析参数。昂贵参数可写成 lambda：

```ts
debugLog('request', '响应预览: {}', () => JSON.stringify(res).slice(0, 300));
```

这样 debug 关闭时，lambda 不执行，日志内容不生成。

## 已接入范围

- 请求体日志：`iwe-web/src/api/modules/im.ts`
- 语音播放/解码日志：`iwe-web/src/composables/useVoicePlayer.ts`
- Redis 同步流水日志：`iwe-web/src/store/account/redis.ts`
- 联系人同步流水日志：`iwe-web/src/store/account/contacts.ts`
- Socket 普通状态日志：`iwe-web/src/utils/websocket.ts`、`iwe-web/src/utils/socketManager.ts`

## 后续规则

- 普通调试日志不要直接写 `console.log`，改用 `debugLog`。
- 大对象、数组格式化、`JSON.stringify`、长字符串裁剪必须放进 lambda。
- 真正异常仍优先保留 `console.error`，避免线上排障没有线索。
