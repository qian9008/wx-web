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
            <div class="stat-group">
              <div class="stat-item">
                <span class="label">逻辑预估占用:</span>
                <span class="value">{{ cacheStats.estimatedSize }}</span>
              </div>
              <div class="stat-item">
                <span class="label">实际磁盘占用:</span>
                <span class="valueHighlight">{{ cacheStats.actualSize }}</span>
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
                   <span class="name">本地头像数据 (avatars)</span>
                   <span class="count">{{ cacheStats.avatarCount }} 张</span>
                 </div>
                 <a-popconfirm content="确定清空本地头像缓存吗？" @ok="handleClearStore('avatars')">
                   <a-button type="outline" size="mini" status="warning">清理</a-button>
                 </a-popconfirm>
               </div>

               <div class="store-item">
                <div class="store-info">
                  <span class="name">联系人 (contacts)</span>
                  <span class="count">{{ cacheStats.contactCount }} 条</span>
                </div>
                <a-popconfirm content="确定清空联系人缓存吗？" @ok="handleClearStore('contacts')">
                  <a-button type="outline" size="mini" status="warning">清理</a-button>
                </a-popconfirm>
              </div>
              
              <div class="store-item">
                <div class="store-info">
                  <span class="name">消息记录 (messages)</span>
                  <span class="count">{{ cacheStats.msgCount }} 条</span>
                </div>
                <a-space>
                  <a-popconfirm content="确定仅清理群消息吗？" @ok="handleClearGroupMessages">
                    <a-button type="outline" size="mini" status="warning">仅清理群消息</a-button>
                  </a-popconfirm>
                  <a-popconfirm content="确定仅清理公众号消息吗？" @ok="handleClearOfficialMessages">
                    <a-button type="outline" size="mini" status="warning">仅清理公众号</a-button>
                  </a-popconfirm>
                  <a-popconfirm content="确定清空所有消息记录吗？" @ok="handleClearStore('messages')">
                    <a-button type="outline" size="mini" status="danger">全部清理</a-button>
                  </a-popconfirm>
                </a-space>
              </div>

              <div class="store-item">
                <div class="store-info">
                  <span class="name">会话列表 (conversations)</span>
                  <span class="count">{{ cacheStats.convCount }} 条</span>
                </div>
                <a-popconfirm content="确定清空会话列表吗？" @ok="handleClearStore('conversations')">
                  <a-button type="outline" size="mini" status="warning">清理</a-button>
                </a-popconfirm>
              </div>

              <div class="store-item">
                <div class="store-info">
                  <span class="name">图片/头像缓存 (Browser Cache)</span>
                  <span class="count">{{ cacheStats.avatarCacheSize }}</span>
                </div>
                <a-popconfirm content="确定清空浏览器图片缓存吗？" @ok="handleClearAvatarCache">
                  <a-button type="outline" size="mini" status="warning">清理</a-button>
                </a-popconfirm>
              </div>
            </div>

            <a-divider />
            
            <a-popconfirm content="确定清空所有本地数据吗？" @ok="handleClearCache">
              <a-button type="primary" status="danger" long>全部清空 (慎重)</a-button>
            </a-popconfirm>
          </div>
        </a-tab-pane>

        <a-tab-pane v-if="context === 'global'" key="3" title="调试设置">
          <a-form :model="accountStore.debug" layout="vertical" style="margin-top: 15px;">
            <a-form-item label="总开关 (All)">
              <a-switch 
                :model-value="accountStore.debug.all" 
                @update:model-value="(val: any) => accountStore.updateDebugConfig({ all: val })" 
              />
            </a-form-item>
            <a-form-item label="请求日志 (Request)">
              <a-switch 
                :model-value="accountStore.debug.request" 
                @update:model-value="(val: any) => accountStore.updateDebugConfig({ request: val })" 
              />
            </a-form-item>
            <a-form-item label="通信日志 (Socket)">
              <a-switch 
                :model-value="accountStore.debug.socket" 
                @update:model-value="(val: any) => accountStore.updateDebugConfig({ socket: val })" 
              />
            </a-form-item>
            <a-form-item label="缓存日志 (Cache)">
              <a-switch 
                :model-value="accountStore.debug.cache" 
                @update:model-value="(val: any) => accountStore.updateDebugConfig({ cache: val })" 
              />
            </a-form-item>
            <a-alert type="info" show-icon style="margin-top: 10px;">开启后请在浏览器控制台(F12)查看日志</a-alert>
          </a-form>
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
            <a-form-item label="个人资料" help="从微信后端服务器手动拉取并强制同步您当前账号的最新昵称、微信号与自身头像">
              <a-button 
                type="primary" 
                size="small" 
                status="success" 
                @click="handleSyncSelfProfile" 
                :loading="syncSelfProfileLoading"
              >
                同步自身个人资料与头像
              </a-button>
            </a-form-item>
            <a-form-item label="好友列表" help="调用 /friend/GetFriendList 获取最新好友列表">
              <a-button type="primary" size="small" @click="handleGetFriendList" :loading="friendListLoading">获取好友列表</a-button>
            </a-form-item>
          </a-form>
        </a-tab-pane>

        <a-tab-pane v-if="accountStore.activeAccountUuid" key="invalid_contacts" title="失效联系人清理">
          <div style="margin-top: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div style="font-size: 14px; font-weight: bold; color: #86909c;">
                当前扫描账号: <span style="color: #07c160;">{{ activeAccountNickname }}</span>
              </div>
              <a-space>
                <a-button type="primary" size="small" :loading="isScanningInvalid" @click="scanInvalidContacts">
                  <template #icon><icon-search /></template>
                  一键扫描失效联系人
                </a-button>
                <a-popconfirm content="确定要批量删除选中的失效联系人吗？该操作将从本地缓存和会话彻底清除！" @ok="batchDeleteInvalidContacts">
                  <a-button type="primary" status="danger" size="small" :disabled="selectedInvalidRowKeys.length === 0">
                    <template #icon><icon-delete /></template>
                    批量删除选中 ({{ selectedInvalidRowKeys.length }})
                  </a-button>
                </a-popconfirm>
              </a-space>
            </div>

            <a-table 
              row-key="wxid"
              :loading="isScanningInvalid"
              :data="invalidContactsList"
              :row-selection="invalidRowSelection"
              v-model:selected-keys="selectedInvalidRowKeys"
              :pagination="{ pageSize: 10 }"
              size="small"
              :scroll="{ x: '100%' }"
            >
              <template #columns>
                <a-table-column title="头像" :width="65">
                  <template #cell="{ record }">
                    <a-avatar :size="30" shape="square" :style="{ backgroundColor: '#337ecc' }">
                      <img v-if="record.avatar" :src="record.avatar" referrerpolicy="no-referrer" />
                      <template v-else>{{ record.nickname ? record.nickname[0] : 'U' }}</template>
                    </a-avatar>
                  </template>
                </a-table-column>
                <a-table-column title="显示名称" data-index="nickname" />
                <a-table-column title="微信号/Wxid" data-index="wxid" />
                <a-table-column title="失效类型" :width="140">
                  <template #cell="{ record }">
                    <a-tag :color="record.relationColor" size="mini">
                      {{ record.relationLabel }}
                    </a-tag>
                  </template>
                </a-table-column>
                <a-table-column title="操作" :width="80">
                  <template #cell="{ record }">
                    <a-popconfirm content="确定要彻底删除该联系人吗？" @ok="deleteSingleInvalidContact(record.wxid)">
                      <a-link status="danger">删除</a-link>
                    </a-popconfirm>
                  </template>
                </a-table-column>
              </template>
            </a-table>
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, computed } from 'vue';
import { useAccountStore } from '@/store/account';
import { useChatStore } from '@/store/chat';
import { adminApi } from '@/api/modules/admin';
import { messageApi } from '@/api/modules/im';
import { contactCache } from '@/utils/contactCache';
import { Message } from '@arco-design/web-vue';
import { IconSearch, IconDelete } from '@arco-design/web-vue/es/icon';

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
const syncSelfProfileLoading = ref(false);
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
    loadCacheStats();
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

const handleSyncSelfProfile = async () => {
  const uuid = accountStore.activeAccountUuid;
  const acc = accountStore.accounts.find(a => a.uuid === uuid);
  if (!acc || !uuid || !acc.sessionKey) return Message.warning('请先选择活跃账号');

  try {
    syncSelfProfileLoading.value = true;
    Message.info('正在向微信后端同步自身个人资料与最新头像...');
    const result = await accountStore.fetchProfileAndFixUuid(acc.sessionKey);
    console.log('[AccountStore:SyncSelfProfile] 手动同步个人资料结果:', result);
    // 同步完成二次触发预加载以刷新内存
    await accountStore.preloadOfflineAccountAvatars();
    
    if (result && result.realAvatar) {
      Message.success({
        content: `自身个人资料与最新头像已手动同步成功！头像URL: ${result.realAvatar.substring(0, 60)}...`,
        duration: 8000,
        closable: true
      });
    } else {
      Message.warning({
        content: '同步完成，但未能从微信后端结构中读取到任何头像 URL 字段 (可能微信官方个人资料尚未更新头像)。',
        duration: 8000,
        closable: true
      });
    }
  } catch (err: any) {
    Message.error('资料同步失败: ' + (err.message || err));
  } finally {
    syncSelfProfileLoading.value = false;
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

const loadCacheStats = async () => {
  const uuid = accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login' ? accountStore.activeAccountUuid : undefined;
  
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
};

const handleClearAvatarCache = async () => {
  await contactCache.clearAvatarCache();
  Message.success('图片缓存已清空');
  await loadCacheStats();
};

const handleClearGroupMessages = async () => {
  if (!accountStore.activeAccountUuid) return;
  await chatStore.clearGroupMessages(accountStore.activeAccountUuid);
  Message.success('群消息已清空');
  await loadCacheStats();
};

const handleClearOfficialMessages = async () => {
  if (!accountStore.activeAccountUuid) return;
  await chatStore.clearOfficialMessages(accountStore.activeAccountUuid);
  Message.success('公众号消息已清空');
  await loadCacheStats();
};
 
const handleClearStore = async (name: string) => {
  const uuid = accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login' ? accountStore.activeAccountUuid : undefined;

  await contactCache.clearStore(name, uuid);
  
  if (uuid) {
    if (name === 'messages') {
      chatStore.accountMessages[uuid] = {};
    } else if (name === 'conversations') {
      chatStore.accountConversations[uuid] = [];
    } else if (name === 'contacts') {
      accountStore.accountContactMaps[uuid] = {};
    }
  }

  Message.success(`已清空 ${uuid ? '当前账号 ' : ''}${name} 表`);
  await loadCacheStats();
};

const handleClearCache = async () => {
  const uuid = accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login' ? accountStore.activeAccountUuid : undefined;

  await contactCache.clearAll(uuid);
  
  if (uuid) {
    chatStore.accountMessages[uuid] = {};
    chatStore.accountConversations[uuid] = [];
    accountStore.accountContactMaps[uuid] = {};
  }

  Message.success(`已清空${uuid ? '当前账号的' : '所有'}本地数据`);
  await loadCacheStats();
};

const isScanningInvalid = ref(false);
const invalidContactsList = ref<any[]>([]);
const selectedInvalidRowKeys = ref<string[]>([]);

const invalidRowSelection = {
  type: 'checkbox',
  showCheckedAll: true,
};

const scanInvalidContacts = async () => {
  const uuid = accountStore.activeAccountUuid;
  if (!uuid) {
    Message.warning('当前未选定账号');
    return;
  }

  isScanningInvalid.value = true;
  selectedInvalidRowKeys.value = [];
  try {
    // 1. 从 IndexedDB 加载当前账号的所有联系人缓存
    const contacts = await contactCache.getAll(uuid);
    
    // 2. 筛选出失效联系人 (friendRelation 为 3 被删, 2 被拉黑, 0 陌生人, 或带有 isDeleted=true)
    const list = contacts.filter((c: any) => {
      if (!c) return false;
      const relation = c.friendRelation !== undefined ? c.friendRelation : -1;
      return relation === 0 || relation === 2 || relation === 3 || c.isDeleted === true;
    }).map((c: any) => {
      const wxid = c.userName?.str || c.UserName?.str || c.wxid || c.userName;
      const nick = c.nickName || c.NickName || c.nickname;
      const nickStr = nick && typeof nick === 'object' ? nick.str : nick || '';
      const remark = c.remark || c.Remark;
      const remarkStr = remark && typeof remark === 'object' ? remark.str : remark || '';
      const displayName = remarkStr || nickStr || wxid || '未知';
      
      const relation = c.friendRelation !== undefined ? c.friendRelation : -1;
      let relationLabel = '陌生人';
      let relationColor = 'orange';
      if (relation === 3 || c.isDeleted === true) {
        relationLabel = '对方已删除您';
        relationColor = 'red';
      } else if (relation === 2) {
        relationLabel = '对方已拉黑您';
        relationColor = 'red';
      }

      const processedAvatar = accountStore.getContactAvatar(c);

      return {
        wxid,
        nickname: displayName,
        avatar: processedAvatar,
        relation,
        relationLabel,
        relationColor
      };
    });

    invalidContactsList.value = list;
    Message.success(`扫描完成，共找到 ${list.length} 个失效联系人`);
  } catch (err: any) {
    Message.error(`扫描失败: ${err.message || err}`);
  } finally {
    isScanningInvalid.value = false;
  }
};

const deleteSingleInvalidContact = async (wxid: string) => {
  try {
    await accountStore.deleteContact(wxid);
    invalidContactsList.value = invalidContactsList.value.filter(c => c.wxid !== wxid);
    selectedInvalidRowKeys.value = selectedInvalidRowKeys.value.filter(k => k !== wxid);
    Message.success('已彻底删除该失效联系人及本地缓存');
  } catch (err: any) {
    Message.error(`删除失败: ${err.message || err}`);
  }
};

const batchDeleteInvalidContacts = async () => {
  const toDelete = [...selectedInvalidRowKeys.value];
  if (toDelete.length === 0) return;

  isScanningInvalid.value = true;
  try {
    let successCount = 0;
    for (const wxid of toDelete) {
      try {
        await accountStore.deleteContact(wxid);
        successCount++;
      } catch (e) {
        console.warn(`批量删除联系人 ${wxid} 失败:`, e);
      }
    }
    
    invalidContactsList.value = invalidContactsList.value.filter(c => !toDelete.includes(c.wxid));
    selectedInvalidRowKeys.value = [];
    Message.success(`批量清理完成！成功删除 ${successCount} 个失效联系人及所有缓存`);
    await loadCacheStats();
  } catch (err: any) {
    Message.error(`批量删除失败: ${err.message || err}`);
  } finally {
    isScanningInvalid.value = false;
  }
};

// 监听 Tab 切换，切换到失效联系人面板时自动扫描
watch(() => activeAdminTab.value, (newKey) => {
  if (newKey === 'invalid_contacts') {
    scanInvalidContacts();
  }
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
.stat-item { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
.stat-item:last-child { margin-bottom: 0; }
.valueHighlight { color: #07c160; font-weight: bold; font-size: 16px; }
.store-grid { display: flex; flex-direction: column; gap: 10px; }
.store-item { display: flex; justify-content: space-between; align-items: center; background: #262626; padding: 10px 15px; border-radius: 6px; }
.store-info { display: flex; flex-direction: column; }
.store-info .name { font-size: 13px; color: #e5e6eb; }
.store-info .count { font-size: 11px; color: #86909c; }

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
