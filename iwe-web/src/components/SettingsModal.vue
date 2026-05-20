<template>
  <a-modal 
    :visible="visible" 
    :title="context === 'global' ? '全局管理控制台' : '个人偏好设置'" 
    width="800px" 
    :footer="false"
    @cancel="emit('update:visible', false)"
  >
    <div class="admin-panel">
      <a-tabs v-model:active-key="activeAdminTab" type="line">
        <a-tab-pane v-if="context === 'global'" key="1" title="系统管理">
          <a-form :model="baseConfigForm" layout="vertical" style="margin-top: 15px;">
            <a-form-item label="服务器地址">
              <a-input v-model="baseConfigForm.baseUrl" placeholder="例如: http://192.168.1.10:8819" />
            </a-form-item>
            <a-form-item label="管理密钥">
              <a-input v-model="baseConfigForm.adminKey" />
            </a-form-item>
            <a-form-item>
              <a-button type="primary" long @click="handleSaveConfig">保存配置并刷新页面</a-button>
            </a-form-item>
          </a-form>

          <a-divider>管理功能</a-divider>
          <div class="admin-actions">
            <a-space wrap>
              <a-button type="outline" size="small" @click="handleAdminAction('getList')">
                获取授权码列表
              </a-button>
              <a-popover position="bottom" trigger="click">
                <a-button type="outline" size="small" status="success">
                  生成授权码
                </a-button>
                <template #content>
                  <div style="padding: 10px; width: 200px;">
                    <a-input-number v-model="adminDays" placeholder="天数" size="small" :min="1" style="margin-bottom: 8px;" />
                    <a-button type="primary" size="small" long @click="handleAdminAction('gen')">确认生成</a-button>
                  </div>
                </template>
              </a-popover>
              <a-popover position="bottom" trigger="click">
                <a-button type="outline" size="small" status="warning">
                  授权码延期
                </a-button>
                <template #content>
                  <div style="padding: 10px; width: 220px;">
                    <a-input v-model="adminAuthKey" placeholder="授权码 (Auth Key)" size="small" style="margin-bottom: 8px;" />
                    <a-input-number v-model="adminDays" placeholder="延期天数" size="small" :min="1" style="margin-bottom: 8px;" />
                    <a-button type="primary" size="small" long @click="handleAdminAction('delay')">确认延期</a-button>
                  </div>
                </template>
              </a-popover>
              <a-popover position="bottom" trigger="click">
                <a-button type="outline" size="small" status="danger">
                  删除授权码
                </a-button>
                <template #content>
                  <div style="padding: 10px; width: 220px;">
                    <a-input v-model="adminAuthKey" placeholder="授权码 (Auth Key)" size="small" style="margin-bottom: 8px;" />
                    <a-button type="primary" status="danger" size="small" long @click="handleAdminAction('delete')">确认删除</a-button>
                  </div>
                </template>
              </a-popover>
              <a-button type="outline" size="small" @click="handleAdminAction('getCallback')">
                获取回调地址
              </a-button>
              <a-popover position="bottom" trigger="click">
                <a-button type="outline" size="small" status="success">
                  设置回调地址
                </a-button>
                <template #content>
                  <div style="padding: 10px; width: 260px;">
                    <a-input v-model="adminAuthKey" placeholder="授权码 (Auth Key)" size="small" style="margin-bottom: 8px;" />
                    <a-input v-model="adminCallbackUrl" placeholder="回调地址 (Url)" size="small" style="margin-bottom: 8px;" />
                    <a-button type="primary" size="small" long @click="handleAdminAction('setCallback')">确认设置</a-button>
                  </div>
                </template>
              </a-popover>
            </a-space>
          </div>

          <div v-if="adminActionResult" class="admin-result-panel">
            <div class="result-header">
              <span>操作反馈</span>
              <a-link size="mini" @click="adminActionResult = ''; adminActionData = null">清空</a-link>
            </div>
            <div v-if="Array.isArray(adminActionData)" class="admin-table-container">
              <a-table :data="adminActionData" :pagination="false" size="mini" :scroll="{ x: '100%' }">
                <template #columns>
                  <a-table-column title="ID" data-index="id" :width="50" />
                  <a-table-column title="状态" :width="70">
                    <template #cell="{ record }">
                      <a-tag :color="record.status === 1 ? 'green' : 'gray'" size="mini">
                        {{ record.status === 1 ? '在线' : '离线' }}
                      </a-tag>
                    </template>
                  </a-table-column>
                  <a-table-column title="授权码 (License)" data-index="license" />
                  <a-table-column title="昵称" data-index="nick_name" />
                  <a-table-column title="到期时间" data-index="expiry_date" :width="110" />
                  <a-table-column title="操作" :width="120">
                    <template #cell="{ record }">
                      <a-space>
                        <a-button type="text" size="mini" @click="adminAuthKey = record.license; Message.info('授权码已填充，请在上方执行操作')">
                          选择
                        </a-button>
                      </a-space>
                    </template>
                  </a-table-column>
                </template>
              </a-table>
            </div>
            <pre v-else class="result-content">{{ adminActionResult }}</pre>
          </div>
        </a-tab-pane>

        <a-tab-pane v-if="context === 'global'" key="2" title="数据管理">
          <div class="data-mgmt">
            <div class="scan-all-action" style="margin-bottom: 15px;">
              <a-button type="primary" long :loading="scanLoading.all" @click="handleScanAll">
                <template #icon><icon-search /></template>
                一键扫描所有数据占用
              </a-button>
            </div>

            <div class="stat-group">
              <div class="stat-item">
                <span class="label">逻辑预估占用:</span>
                <span class="value">
                  <template v-if="isScanned.estimatedSize">
                    {{ cacheStats.estimatedSize }}
                  </template>
                  <template v-else>
                    <a-button type="text" size="mini" :loading="scanLoading.estimatedSize" @click="handleScanSingle('estimatedSize')">点击扫描</a-button>
                  </template>
                </span>
              </div>
              <div class="stat-item">
                <span class="label">实际磁盘占用:</span>
                <span class="valueHighlight">
                  <template v-if="isScanned.actualSize">
                    {{ cacheStats.actualSize }}
                  </template>
                  <template v-else>
                    <a-button type="text" size="mini" :loading="scanLoading.actualSize" @click="handleScanSingle('actualSize')">点击扫描</a-button>
                  </template>
                </span>
              </div>
            </div>
            
            <a-divider>分表管理</a-divider>
            
            <div class="store-grid">
              <div class="store-item">
                <div class="store-info">
                  <span class="name">通讯录同步</span>
                  <span class="count">{{ Object.keys(accountStore.contactMap).length }} 个联系人</span>
                </div>
                <a-button type="primary" size="mini" :loading="contactLoading" @click="handleManualSyncContacts">手动同步</a-button>
              </div>

              <div class="store-item">
                 <div class="store-info">
                   <span class="name">本地头像 data (avatars)</span>
                   <span class="count">
                     <template v-if="isScanned.avatars">{{ cacheStats.avatarCount }} 张</template>
                     <template v-else>未扫描</template>
                   </span>
                 </div>
                 <a-space>
                   <a-button v-if="!isScanned.avatars" type="outline" size="mini" :loading="scanLoading.avatars" @click="handleScanSingle('avatars')">扫描</a-button>
                   <a-popconfirm content="确定清空本地头像缓存吗？" @ok="handleClearStore('avatars')">
                     <a-button type="outline" size="mini" status="warning" :loading="clearLoading.avatars">清理</a-button>
                   </a-popconfirm>
                 </a-space>
               </div>

               <div class="store-item">
                <div class="store-info">
                  <span class="name">联系人 (contacts)</span>
                  <span class="count">
                    <template v-if="isScanned.contacts">{{ cacheStats.contactCount }} 条</template>
                    <template v-else>未扫描</template>
                  </span>
                </div>
                <a-space>
                  <a-button v-if="!isScanned.contacts" type="outline" size="mini" :loading="scanLoading.contacts" @click="handleScanSingle('contacts')">扫描</a-button>
                  <a-popconfirm content="确定清空联系人缓存吗？" @ok="handleClearStore('contacts')">
                    <a-button type="outline" size="mini" status="warning" :loading="clearLoading.contacts">清理</a-button>
                  </a-popconfirm>
                </a-space>
              </div>
              
              <div class="store-item">
                <div class="store-info">
                  <span class="name">消息记录 (messages)</span>
                  <span class="count">
                    <template v-if="isScanned.messages">{{ cacheStats.msgCount }} 条</template>
                    <template v-else>未扫描</template>
                  </span>
                </div>
                <a-space>
                  <a-button v-if="!isScanned.messages" type="outline" size="mini" :loading="scanLoading.messages" @click="handleScanSingle('messages')">扫描</a-button>
                  <a-popconfirm content="确定仅清理群消息吗？" @ok="handleClearGroupMessages">
                    <a-button type="outline" size="mini" status="warning" :loading="clearLoading.groupMessages">仅清理群消息</a-button>
                  </a-popconfirm>
                  <a-popconfirm content="确定仅清理公众号消息吗？" @ok="handleClearOfficialMessages">
                    <a-button type="outline" size="mini" status="warning" :loading="clearLoading.officialMessages">仅清理公众号</a-button>
                  </a-popconfirm>
                  <a-popconfirm content="确定清空所有消息记录吗？" @ok="handleClearStore('messages')">
                    <a-button type="outline" size="mini" status="danger" :loading="clearLoading.messages">全部清理</a-button>
                  </a-popconfirm>
                </a-space>
              </div>

              <div class="store-item">
                <div class="store-info">
                  <span class="name">会话列表 (conversations)</span>
                  <span class="count">
                    <template v-if="isScanned.conversations">{{ cacheStats.convCount }} 条</template>
                    <template v-else>未扫描</template>
                  </span>
                </div>
                <a-space>
                  <a-button v-if="!isScanned.conversations" type="outline" size="mini" :loading="scanLoading.conversations" @click="handleScanSingle('conversations')">扫描</a-button>
                  <a-popconfirm content="确定清空会话列表吗？" @ok="handleClearStore('conversations')">
                    <a-button type="outline" size="mini" status="warning" :loading="clearLoading.conversations">清理</a-button>
                  </a-popconfirm>
                </a-space>
              </div>

              <div class="store-item">
                <div class="store-info">
                  <span class="name">图片/头像缓存 (Browser Cache)</span>
                  <span class="count">
                    <template v-if="isScanned.avatarCache">{{ cacheStats.avatarCacheSize }}</template>
                    <template v-else>未扫描</template>
                  </span>
                </div>
                <a-space>
                  <a-button v-if="!isScanned.avatarCache" type="outline" size="mini" :loading="scanLoading.avatarCache" @click="handleScanSingle('avatarCache')">扫描</a-button>
                  <a-popconfirm content="确定清空浏览器图片缓存吗？" @ok="handleClearAvatarCache">
                    <a-button type="outline" size="mini" status="warning" :loading="clearLoading.avatarCache">清理</a-button>
                  </a-popconfirm>
                </a-space>
              </div>
            </div>

            <a-divider />
            
            <a-popconfirm content="确定清空所有本地数据吗？" @ok="handleClearCache">
              <a-button type="primary" status="danger" long :loading="clearLoading.all">全部清空 (慎重)</a-button>
            </a-popconfirm>
          </div>
        </a-tab-pane>

        <a-tab-pane v-if="context === 'global' || context === 'personal'" key="3" title="调试设置">
          <a-form :model="accountStore.debug" layout="vertical" style="margin-top: 15px;">
            <a-row :gutter="16">
              <a-col :span="6">
                <a-form-item label="总开关 (All)">
                  <a-switch 
                    :model-value="accountStore.debug.all" 
                    @update:model-value="(val: any) => handleAllDebugSwitch(val)" 
                  />
                </a-form-item>
              </a-col>
              <a-col :span="6">
                <a-form-item label="请求日志 (Request)">
                  <a-switch 
                    :model-value="accountStore.debug.request" 
                    @update:model-value="(val: any) => accountStore.updateDebugConfig({ request: val })" 
                  />
                </a-form-item>
              </a-col>
              <a-col :span="6">
                <a-form-item label="通信日志 (Socket)">
                  <a-switch 
                    :model-value="accountStore.debug.socket" 
                    @update:model-value="(val: any) => accountStore.updateDebugConfig({ socket: val })" 
                  />
                </a-form-item>
              </a-col>
              <a-col :span="6">
                <a-form-item label="缓存日志 (Cache)">
                  <a-switch 
                    :model-value="accountStore.debug.cache" 
                    @update:model-value="(val: any) => accountStore.updateDebugConfig({ cache: val })" 
                  />
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>

          <a-divider>内置调试控制台 <a-tag color="arcoblue" size="small" style="margin-left: 8px;">v1.3.0 (静默过滤防爆版)</a-tag></a-divider>
          <div class="terminal-container">
            <div class="terminal-header">
              <div class="terminal-dots">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
              </div>
              <span class="terminal-title">iwe-web real-time debug console</span>
              <a-space size="small">
                <a-checkbox v-model="autoScrollLogs" size="small">自动滚动</a-checkbox>
                <a-button type="text" size="mini" @click="handleCopyLogs">
                  <template #icon><icon-copy /></template>复制
                </a-button>
                <a-button type="text" size="mini" status="danger" @click="handleClearPanelLogs">
                  <template #icon><icon-delete /></template>清空
                </a-button>
              </a-space>
            </div>
            <div class="terminal-body" ref="logConsoleRef">
              <div v-if="logsQueue.length === 0" class="log-line empty">
                [SYSTEM] 暂无拦截日志。开启调试日志开关，并操作微信即可捕获数据。
              </div>
              <div 
                v-for="(log, idx) in logsQueue" 
                :key="idx" 
                :class="['log-line', log.type]"
              >
                <span class="log-time">[{{ log.time }}]</span>
                <span class="log-type">[{{ log.type.toUpperCase() }}]</span>
                <span v-if="log.count && log.count > 1" class="log-badge">x{{ log.count }}</span>
                <pre class="log-text">{{ log.text }}</pre>
              </div>
            </div>
          </div>
        </a-tab-pane>

        <a-tab-pane v-if="context === 'global'" key="personal_global" title="全局个人设置">
          <a-form :model="accountStore.globalAvatarConfig" layout="vertical" style="margin-top: 15px;">
            <a-alert type="info" style="margin-bottom: 16px;">此处的设置将作为所有账号的默认值</a-alert>
            <a-form-item label="默认头像下载">
              <a-switch 
                :model-value="accountStore.globalAvatarConfig.downloadEnabled" 
                @update:model-value="(val: any) => accountStore.updateAvatarConfig({ downloadEnabled: val }, true)" 
              />
            </a-form-item>
            <a-form-item label="默认头像缓存">
              <a-switch 
                :model-value="accountStore.globalAvatarConfig.cacheEnabled" 
                @update:model-value="(val: any) => accountStore.updateAvatarConfig({ cacheEnabled: val }, true)" 
              />
            </a-form-item>
            <a-form-item label="默认 Redis 极速模式" help="开启后所有新账号默认使用 Redis 同步，跳过 IndexedDB">
              <a-switch 
                :model-value="accountStore.globalAvatarConfig.isRedisLanMode" 
                @update:model-value="(val: any) => accountStore.updateAvatarConfig({ isRedisLanMode: val }, true)" 
              />
            </a-form-item>
            <a-form-item label="默认新 Redis 地址 (可选)" help="额外配置新 Redis 读写服务，默认启动回写联系人与读回功能">
              <a-input 
                :model-value="accountStore.globalAvatarConfig.redisWriteBackUrl" 
                @update:model-value="(val: any) => accountStore.updateAvatarConfig({ redisWriteBackUrl: val }, true)" 
                placeholder="例如: http://192.168.50.99:7377/other/SaveContactToRedis?key="
              />
            </a-form-item>
          </a-form>
        </a-tab-pane>

        <a-tab-pane v-if="context === 'personal'" key="personal" title="当前账号设置">
          <div v-if="!accountStore.activeAccountUuid" style="padding: 20px; text-align: center; color: #86909c;">
            请先在左侧选择一个账号后再进行个人设置
          </div>
          <a-form v-else :model="accountStore.getEffectiveAvatarConfig()" layout="vertical" style="margin-top: 15px;">
            <div style="margin-bottom: 16px; color: #07c160; font-weight: bold;">
              正在设置账号: {{ activeAccountNickname }}
            </div>
            <a-form-item label="头像下载" help="关闭后将不自动尝试下载原始头像到本地">
              <a-switch 
                :model-value="accountStore.getEffectiveAvatarConfig().downloadEnabled" 
                @update:model-value="(val: any) => accountStore.updateAvatarConfig({ downloadEnabled: val })" 
              />
            </a-form-item>
            <a-form-item label="头像缓存" help="关闭后将仅使用原始网络链接，不从本地数据库读取/保存">
              <a-switch 
                :model-value="accountStore.getEffectiveAvatarConfig().cacheEnabled" 
                @update:model-value="(val: any) => accountStore.updateAvatarConfig({ cacheEnabled: val })" 
              />
            </a-form-item>
            <a-divider>数据通道</a-divider>
            <a-form-item label="局域网 Redis 极速模式" help="开启后从原只读 Redis 快照极速获取数据，跳过 IndexedDB。如果配置了新 Redis 地址，则同步启用回写与读回机制。">
              <a-switch 
                :model-value="accountStore.getEffectiveAvatarConfig().isRedisLanMode" 
                @update:model-value="(val: any) => accountStore.updateAvatarConfig({ isRedisLanMode: val })" 
              />
            </a-form-item>
            <a-form-item 
              v-if="accountStore.getEffectiveAvatarConfig().isRedisLanMode"
              label="新 Redis 地址 (可选)" 
              help="配置在不同服务器的新 Redis 接口，用于自动补写并读回联系人"
            >
              <a-input 
                :model-value="accountStore.getEffectiveAvatarConfig().redisWriteBackUrl" 
                @update:model-value="(val: any) => accountStore.updateAvatarConfig({ redisWriteBackUrl: val })" 
                placeholder="例如: http://192.168.50.99:7377/other/SaveContactToRedis?key="
              />
            </a-form-item>
            <a-form-item 
              v-if="accountStore.getEffectiveAvatarConfig().isRedisLanMode"
              label="回写操作" 
              help="手动将当前账号的所有联系人一次性批量补写保存到新 Redis 服务器"
            >
              <a-button 
                type="outline" 
                size="small" 
                status="success" 
                @click="handleSaveAllContactsToRedis"
                :loading="saveAllContactsLoading"
              >
                批量补写所有联系人到新 Redis
              </a-button>
            </a-form-item>
            <a-divider>数据获取</a-divider>
            <a-form-item label="好友列表" help="调用 /friend/GetFriendList 获取最新好友列表">
              <a-button type="primary" size="small" @click="handleGetFriendList" :loading="friendListLoading">获取好友列表</a-button>
            </a-form-item>
          </a-form>
        </a-tab-pane>
      </a-tabs>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, computed, onMounted } from 'vue';
import { useAccountStore } from '@/store/account';
import { useChatStore } from '@/store/chat';
import { adminApi } from '@/api/modules/admin';
import { messageApi } from '@/api/modules/im';
import { contactCache } from '@/utils/contactCache';
import { Message } from '@arco-design/web-vue';
import { IconSearch, IconCopy, IconDelete } from '@arco-design/web-vue/es/icon';
import { logsQueue, initLogInterceptor } from '@/utils/debug';

const props = defineProps<{
  visible: boolean;
  context: 'global' | 'personal';
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
}>();

const accountStore = useAccountStore();
const chatStore = useChatStore();

const activeAdminTab = ref('1');

const baseConfigForm = reactive({
  baseUrl: accountStore.baseUrl,
  adminKey: accountStore.adminKey
});

const adminAuthKey = ref('');
const adminDays = ref(365);
const adminCallbackUrl = ref('');
const adminActionResult = ref('');
const adminActionData = ref<any>(null);

const contactLoading = ref(false);
const friendListLoading = ref(false);
const saveAllContactsLoading = ref(false);

const cacheStats = ref({ 
  contactCount: 0, 
  msgCount: 0, 
  estimatedSize: '0 B', 
  actualSize: '0 B',
  avatarCount: 0,
  convCount: 0,
  avatarCacheSize: '0 B'
});

const isScanned = reactive({
  estimatedSize: false,
  actualSize: false,
  contacts: false,
  messages: false,
  conversations: false,
  avatars: false,
  avatarCache: false
});

const scanLoading = reactive({
  all: false,
  estimatedSize: false,
  actualSize: false,
  contacts: false,
  messages: false,
  conversations: false,
  avatars: false,
  avatarCache: false
});

const clearLoading = reactive({
  all: false,
  avatars: false,
  contacts: false,
  messages: false,
  groupMessages: false,
  officialMessages: false,
  conversations: false,
  avatarCache: false
});

// 内置控制台组件逻辑
const logConsoleRef = ref<HTMLDivElement | null>(null);
const autoScrollLogs = ref(true);

watch(logsQueue, () => {
  if (autoScrollLogs.value) {
    nextTick(() => {
      if (logConsoleRef.value) {
        logConsoleRef.value.scrollTop = logConsoleRef.value.scrollHeight;
      }
    });
  }
}, { deep: true });

const handleCopyLogs = () => {
  const logText = logsQueue.value.map(log => `[${log.time}] [${log.type.toUpperCase()}] ${log.text}`).join('\n');
  if (!logText) {
    Message.warning('当前无可用日志');
    return;
  }
  navigator.clipboard.writeText(logText).then(() => {
    Message.success('日志已成功复制到剪贴板');
  }).catch(err => {
    Message.error('复制失败: ' + err);
  });
};

const handleClearPanelLogs = () => {
  logsQueue.value = [];
  Message.success('面板显示日志已清空');
};

const handleAllDebugSwitch = (val: boolean) => {
  accountStore.updateDebugConfig({
    all: val,
    request: val,
    socket: val,
    cache: val
  });
};

const activeAccountNickname = computed(() => {
  if (!accountStore.activeAccountUuid) return '未知账号';
  const activeAcc = accountStore.accounts.find(a => a.uuid === accountStore.activeAccountUuid || a.sessionKey === accountStore.activeAccountUuid);
  return activeAcc ? activeAcc.nickname : '未知账号';
});

// Watch visible changes to trigger sync and tab routing
watch(() => props.visible, (newVal) => {
  if (newVal) {
    activeAdminTab.value = props.context === 'personal' ? 'personal' : '1';
    baseConfigForm.baseUrl = accountStore.baseUrl;
    baseConfigForm.adminKey = accountStore.adminKey;
    // 重置扫描状态，避免打开时展示过时的缓存数据
    Object.keys(isScanned).forEach(k => {
      (isScanned as any)[k] = false;
    });
  }
});

const handleSaveConfig = () => {
  accountStore.setGlobalConfig(baseConfigForm.baseUrl, baseConfigForm.adminKey, accountStore.tokenKey, accountStore.debug);
  window.location.reload();
};

const handleAdminAction = async (type: string) => {
  try {
    let res: any;
    if (type === 'getList') {
      res = await adminApi.getAuthKey();
    } else if (type === 'gen') {
      res = await adminApi.genAuthKey({ Count: 1, Days: adminDays.value });
      Message.success('生成成功');
    } else if (type === 'delay') {
      if (!adminAuthKey.value) return Message.warning('请输入授权码');
      res = await adminApi.delayAuthKey({ 
        Key: adminAuthKey.value, 
        Days: adminDays.value,
        ExpiryDate: "" 
      });
      Message.success('延期成功');
    } else if (type === 'delete') {
      if (!adminAuthKey.value) return Message.warning('请输入授权码');
      res = await adminApi.deleteAuthKey({ 
        Key: adminAuthKey.value, 
        Opt: 0 
      });
      Message.success('删除成功');
    } else if (type === 'getCallback') {
      if (!adminAuthKey.value) return Message.warning('请输入授权码');
      const key = baseConfigForm.adminKey || accountStore.adminKey;
      if (!key) return Message.warning('管理密钥 (ADMIN_KEY) 不能为空');
      res = await adminApi.getCallBackUrl(key, { 
        Key: adminAuthKey.value 
      });
      Message.success('获取成功');
    } else if (type === 'setCallback') {
      if (!adminAuthKey.value) return Message.warning('请输入授权码');
      if (!adminCallbackUrl.value) return Message.warning('请输入回调地址');
      const key = baseConfigForm.adminKey || accountStore.adminKey;
      if (!key) return Message.warning('管理密钥 (ADMIN_KEY) 不能为空');
      res = await adminApi.setCallBackUrl(key, { 
        Key: adminAuthKey.value,
        Url: adminCallbackUrl.value
      });
      Message.success('设置成功');
    }
    adminActionData.value = res;
    adminActionResult.value = JSON.stringify(res, null, 2);
  } catch (err: any) {
    adminActionData.value = null;
    adminActionResult.value = `Error: ${err.message || err}`;
  }
};

const handleManualSyncContacts = async () => {
  const uuid = accountStore.activeAccountUuid;
  const acc = accountStore.accounts.find(a => a.uuid === uuid);
  if (!acc || !uuid) return Message.warning('请先选择活跃账号');
  
  try {
    contactLoading.value = true;
    Message.info('开始手动同步通讯录...');
    await accountStore.syncFullContactList(uuid, acc.sessionKey, true);
    Message.success('通讯录同步请求已发送，请观察控制台补全进度');
  } catch (err: any) {
    Message.error('同步失败: ' + err.message);
  } finally {
    contactLoading.value = false;
  }
};

const handleSaveAllContactsToRedis = async () => {
  const uuid = accountStore.activeAccountUuid;
  if (!uuid) return Message.warning('请先选择活跃账号');
  try {
    saveAllContactsLoading.value = true;
    Message.info('开始批量回写所有联系人到 Redis...');
    await accountStore.saveAllContactsToRedis(uuid);
    Message.success('批量回写成功！');
  } catch (err: any) {
    Message.error('回写失败: ' + err.message);
  } finally {
    saveAllContactsLoading.value = false;
  }
};

const handleGetFriendList = async () => {
  const uuid = accountStore.activeAccountUuid;
  const acc = accountStore.accounts.find(a => a.uuid === uuid);
  if (!acc || !uuid) return Message.warning('请先选择活跃账号');
  
  try {
    friendListLoading.value = true;
    Message.info('开始获取好友列表...');
    const res = await messageApi.getFriendList(acc.sessionKey);
    console.log('[GetFriendList]', res);
    
    const friendData = res.Data || res;
    const friendList = friendData.friendList || [];
    let updatedCount = 0;
    
    if (friendList.length > 0) {
      for (const f of friendList) {
        const wxid = f.userName?.str || f.UserName?.str || f.wxid || f.userName || f.UserName;
        if (wxid) {
          await accountStore.updateContact(wxid, f, uuid);
          updatedCount++;
        }
      }
    }
    
    Message.success(`好友列表获取成功，已并入 ${updatedCount} 个联系人`);
  } catch (err: any) {
    Message.error('获取失败: ' + err.message);
  } finally {
    friendListLoading.value = false;
  }
};

// 一键扫描所有 IndexedDB 分表
const handleScanAll = async () => {
  scanLoading.all = true;
  const uuid = accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login' ? accountStore.activeAccountUuid : undefined;
  try {
    const [c, m, v, a, est, act, avt] = await Promise.all([
      contactCache.getCount('contacts', uuid),
      contactCache.getCount('messages', uuid),
      contactCache.getCount('conversations', uuid),
      contactCache.getCount('avatars', uuid),
      contactCache.getEstimatedSize(),
      contactCache.getActualSize(),
      contactCache.getAvatarCacheSize()
    ]);
    cacheStats.value = {
      contactCount: c,
      msgCount: m,
      convCount: v,
      avatarCount: a,
      estimatedSize: est,
      actualSize: act,
      avatarCacheSize: avt
    };
    isScanned.contacts = true;
    isScanned.messages = true;
    isScanned.conversations = true;
    isScanned.avatars = true;
    isScanned.estimatedSize = true;
    isScanned.actualSize = true;
    isScanned.avatarCache = true;
    Message.success('一键扫描完成');
  } catch (err: any) {
    Message.error('扫描失败: ' + err.message);
  } finally {
    scanLoading.all = false;
  }
};

// 局部单项扫描
const handleScanSingle = async (key: keyof typeof isScanned) => {
  const uuid = accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login' ? accountStore.activeAccountUuid : undefined;
  scanLoading[key] = true;
  try {
    if (key === 'contacts') {
      cacheStats.value.contactCount = await contactCache.getCount('contacts', uuid);
    } else if (key === 'messages') {
      cacheStats.value.msgCount = await contactCache.getCount('messages', uuid);
    } else if (key === 'conversations') {
      cacheStats.value.convCount = await contactCache.getCount('conversations', uuid);
    } else if (key === 'avatars') {
      cacheStats.value.avatarCount = await contactCache.getCount('avatars', uuid);
    } else if (key === 'avatarCache') {
      cacheStats.value.avatarCacheSize = await contactCache.getAvatarCacheSize();
    } else if (key === 'estimatedSize') {
      cacheStats.value.estimatedSize = await contactCache.getEstimatedSize();
    } else if (key === 'actualSize') {
      cacheStats.value.actualSize = await contactCache.getActualSize();
    }
    isScanned[key] = true;
    Message.success('扫描完成');
  } catch (err: any) {
    Message.error('扫描项失败: ' + err.message);
  } finally {
    scanLoading[key] = false;
  }
};

const handleClearAvatarCache = async () => {
  try {
    clearLoading.avatarCache = true;
    await contactCache.clearAvatarCache();
    cacheStats.value.avatarCacheSize = '0 B';
    isScanned.avatarCache = true;
    Message.success('图片缓存已清空');
  } catch (err: any) {
    Message.error('清理图片缓存失败: ' + err.message);
  } finally {
    clearLoading.avatarCache = false;
  }
};

const handleClearGroupMessages = async () => {
  if (!accountStore.activeAccountUuid) return;
  try {
    clearLoading.groupMessages = true;
    await chatStore.clearGroupMessages(accountStore.activeAccountUuid);
    Message.success('群消息已清空');
    // 如果已经扫描过了，自动重新扫描该项，确保界面数据实时一致
    if (isScanned.messages) {
      await handleScanSingle('messages');
    }
  } catch (err: any) {
    Message.error('清理群消息失败: ' + err.message);
  } finally {
    clearLoading.groupMessages = false;
  }
};

const handleClearOfficialMessages = async () => {
  if (!accountStore.activeAccountUuid) return;
  try {
    clearLoading.officialMessages = true;
    await chatStore.clearOfficialMessages(accountStore.activeAccountUuid);
    Message.success('公众号消息已清空');
    // 如果已经扫描过了，自动重新扫描该项
    if (isScanned.messages) {
      await handleScanSingle('messages');
    }
  } catch (err: any) {
    Message.error('清理公众号消息失败: ' + err.message);
  } finally {
    clearLoading.officialMessages = false;
  }
};
 
const handleClearStore = async (name: string) => {
  const uuid = accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login' ? accountStore.activeAccountUuid : undefined;

  try {
    (clearLoading as any)[name] = true;
    await contactCache.clearStore(name, uuid);
    
    if (uuid) {
      if (name === 'messages') {
        chatStore.accountMessages[uuid] = {};
        chatStore.clearMemoryAll(uuid);
      } else if (name === 'conversations') {
        chatStore.accountConversations[uuid] = [];
      } else if (name === 'contacts') {
        accountStore.accountContactMaps[uuid] = {};
        accountStore.clearMemoryAll(uuid); // 清空内存中的去重/同步锁/时间/加载状态
      }
    } else {
      if (name === 'messages') {
        chatStore.clearMemoryAll();
      } else if (name === 'conversations') {
        chatStore.accountConversations = {};
      } else if (name === 'contacts') {
        accountStore.clearMemoryAll();
      }
    }

    // 内存直接置 0 并设为已扫描，无须再次触发繁杂的全盘扫描
    if (name === 'avatars') {
      cacheStats.value.avatarCount = 0;
      isScanned.avatars = true;
    } else if (name === 'contacts') {
      cacheStats.value.contactCount = 0;
      isScanned.contacts = true;
    } else if (name === 'messages') {
      cacheStats.value.msgCount = 0;
      isScanned.messages = true;
    } else if (name === 'conversations') {
      cacheStats.value.convCount = 0;
      isScanned.conversations = true;
    }

    Message.success(`已清空 ${uuid ? '当前账号 ' : ''}${name} 表`);
  } catch (err: any) {
    Message.error('清理失败: ' + err.message);
  } finally {
    (clearLoading as any)[name] = false;
  }
};

const handleClearCache = async () => {
  const uuid = accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login' ? accountStore.activeAccountUuid : undefined;

  try {
    clearLoading.all = true;
    await contactCache.clearAll(uuid);
    
    if (uuid) {
      chatStore.clearMemoryAll(uuid);
      accountStore.clearMemoryAll(uuid);
    } else {
      chatStore.clearMemoryAll();
      accountStore.clearMemoryAll();
    }

    // 内存置零并标记已扫描
    cacheStats.value = {
      contactCount: 0,
      msgCount: 0,
      convCount: 0,
      avatarCount: 0,
      estimatedSize: '0 B',
      actualSize: '0 B',
      avatarCacheSize: '0 B'
    };
    
    isScanned.contacts = true;
    isScanned.messages = true;
    isScanned.conversations = true;
    isScanned.avatars = true;
    isScanned.estimatedSize = true;
    isScanned.actualSize = true;
    isScanned.avatarCache = true;

    Message.success(`已清空${uuid ? '当前账号的' : '所有'}本地数据`);
  } catch (err: any) {
    Message.error('全部清空失败: ' + err.message);
  } finally {
    clearLoading.all = false;
  }
};

onMounted(() => {
  initLogInterceptor();
});
</script>

<style scoped>
.admin-panel {
  padding: 10px 0;
}
.admin-actions {
  margin-bottom: 15px;
}
.admin-result-panel {
  margin-top: 15px;
  background: #2e2e2e;
  padding: 10px;
  border-radius: 6px;
}
.admin-result-panel .result-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  color: #86909c;
}
.admin-result-panel .result-content {
  background: #000;
  color: #07c160;
  padding: 8px;
  border-radius: 4px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 250px;
  overflow-y: auto;
}
.data-mgmt { padding: 10px 0; }
.stat-group { background: #2e2e2e; padding: 15px; border-radius: 8px; margin-bottom: 10px; }
.stat-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; }
.stat-item:last-child { margin-bottom: 0; }
.valueHighlight { color: #07c160; font-weight: bold; font-size: 16px; }
.store-grid { display: flex; flex-direction: column; gap: 10px; }
.store-item { display: flex; justify-content: space-between; align-items: center; background: #262626; padding: 10px 15px; border-radius: 6px; }
.store-info { display: flex; flex-direction: column; }
.store-info .name { font-size: 13px; color: #e5e6eb; }
.store-info .count { font-size: 11px; color: #86909c; }

/* Terminal styling */
.terminal-container {
  background: #1e1e1e;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  border: 1px solid #333;
}
.terminal-header {
  background: #2d2d2d;
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #1a1a1a;
}
.terminal-dots {
  display: flex;
  gap: 6px;
}
.terminal-dots .dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}
.terminal-dots .dot.red { background: #ff5f56; }
.terminal-dots .dot.yellow { background: #ffbd2e; }
.terminal-dots .dot.green { background: #27c93f; }
.terminal-title {
  color: #a9b2c3;
  font-size: 11px;
  font-family: monospace;
}
.terminal-body {
  height: 300px;
  overflow-y: auto;
  padding: 12px;
  font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #d4d4d4;
  background: #181818;
}
.log-line {
  margin-bottom: 8px;
  word-break: break-all;
  white-space: pre-wrap;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.log-line.empty {
  color: #858585;
  font-style: italic;
}
.log-line.log {
  color: #4ec9b0;
}
.log-line.warn {
  color: #ce9178;
}
.log-line.error {
  color: #f44747;
}
.log-time {
  color: #858585;
  flex-shrink: 0;
}
.log-type {
  font-weight: bold;
  flex-shrink: 0;
}
.log-badge {
  background: #ff9900;
  color: #000000;
  font-size: 10px;
  font-weight: bold;
  padding: 0px 5px;
  border-radius: 10px;
  margin-left: 2px;
  flex-shrink: 0;
  display: inline-block;
  line-height: 1.4;
  vertical-align: middle;
  animation: badge-pop 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
}
@keyframes badge-pop {
  0% { transform: scale(0.6); }
  100% { transform: scale(1); }
}
.log-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
  flex-grow: 1;
}

@media (max-width: 768px) {
  .store-item {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 12px !important;
  }
  :deep(.arco-space) {
    flex-wrap: wrap !important;
    width: 100% !important;
  }
  :deep(.arco-space-item) {
    margin-bottom: 6px !important;
  }
  .admin-panel :deep(.arco-tabs-nav-tab) {
    justify-content: flex-start !important;
  }
}
</style>
