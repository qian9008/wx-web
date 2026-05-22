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

        <a-tab-pane v-if="context === 'global' || context === 'personal'" key="2" title="数据管理">
          <div class="data-mgmt">
            <!-- 清理范围选择器 (仅管理员菜单下展示) -->
            <div v-if="context === 'global'" style="margin-bottom: 15px; display: flex; align-items: center; gap: 12px; background: #1e1e1e; padding: 10px; border-radius: 4px; border: 1px solid #333;">
              <span style="font-size: 13px; font-weight: bold; color: #e5e6eb;">清理范围:</span>
              <a-radio-group v-model="cleanScope" type="button" size="small" @change="handleCleanScopeChange">
                <a-radio value="active">当前活跃账号 ({{ activeAccountNickname }})</a-radio>
                <a-radio value="all">系统全部账号 ({{ accountStore.accounts.length }}个)</a-radio>
              </a-radio-group>
            </div>

            <div class="scan-all-action" style="margin-bottom: 15px;">
              <a-button type="primary" long :loading="scanLoading.all" @click="handleScanAll">
                <template #icon><icon-search /></template>
                {{ context === 'global' && cleanScope === 'all' ? '一键扫描所有账号数据占用' : '一键扫描当前账号数据占用' }}
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
              <!-- 手动同步通讯录 (仅在当前账号模式下展示) -->
              <div v-if="context !== 'global' || cleanScope === 'active'" class="store-item">
                <div class="store-info">
                  <span class="name">通讯录同步</span>
                  <span class="count">{{ Object.keys(accountStore.contactMap).length }} 个联系人</span>
                </div>
                <a-button type="primary" size="mini" :loading="contactLoading" @click="handleManualSyncContacts">手动同步</a-button>
              </div>

               <div class="store-item">
                <div class="store-info">
                  <span class="name">联系人 (contacts)</span>
                  <span class="count">
                    <template v-if="isScanned.contacts">
                      <span v-if="context === 'global' && cleanScope === 'all'">总计: </span>{{ cacheStats.contactCount }} 条
                    </template>
                    <template v-else>未扫描</template>
                  </span>
                </div>
                <a-space>
                  <a-button v-if="!isScanned.contacts" type="outline" size="mini" :loading="scanLoading.contacts" @click="handleScanSingle('contacts')">扫描</a-button>
                  <a-popconfirm :content="context === 'global' && cleanScope === 'all' ? '确定清空所有账号的联系人缓存吗？' : '确定清空联系人缓存吗？'" @ok="handleClearStore('contacts')">
                    <a-button type="outline" size="mini" status="warning" :loading="clearLoading.contacts">清理</a-button>
                  </a-popconfirm>
                </a-space>
              </div>
              
              <div class="store-item" style="flex-direction: column; align-items: stretch; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 8px;">
                  <div class="store-info">
                    <span class="name" style="font-weight: bold;">消息记录 (messages)</span>
                    <span class="count">
                      <template v-if="isScanned.messages">
                        {{ context === 'global' && cleanScope === 'all' ? '全部账号总消息数' : '总消息数' }}: {{ cacheStats.msgCount }} 条
                        <span v-if="(context === 'global' && cleanScope === 'all') || (accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login')" style="margin-left: 8px; color: #86909c;">
                          (已过期: <span style="color: #ff9900; font-weight: bold;">{{ cacheStats.expiredMsgCount }}</span> 条 / 
                          超限: <span style="color: #ff9900; font-weight: bold;">{{ cacheStats.exceededMsgCount }}</span> 条)
                        </span>
                      </template>
                      <template v-else>未扫描</template>
                    </span>
                  </div>
                  <a-space wrap>
                    <a-button v-if="!isScanned.messages" type="outline" size="mini" :loading="scanLoading.messages" @click="handleScanSingle('messages')">扫描</a-button>
                    <a-space v-else wrap>
                      <template v-if="(context === 'global' && cleanScope === 'all') || (accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login')">
                        <a-popconfirm :content="context === 'global' && cleanScope === 'all' ? '确定清理全部账号下所有已过期的消息吗？' : '确定清理所有已过期的消息吗？'" @ok="handleClearExpired">
                          <a-button type="outline" size="mini" status="warning" :loading="clearLoading.expiredMessages" :disabled="cacheStats.expiredMsgCount === 0">清理已过期</a-button>
                        </a-popconfirm>
                        <a-popconfirm :content="context === 'global' && cleanScope === 'all' ? '确定清理全部账号下超出单会话上限的消息吗？' : '确定清理超出单会话上限的消息吗？'" @ok="handleClearExceeded">
                          <a-button type="outline" size="mini" status="warning" :loading="clearLoading.exceededMessages" :disabled="cacheStats.exceededMsgCount === 0">清理已超限</a-button>
                        </a-popconfirm>
                        <a-popconfirm :content="context === 'global' && cleanScope === 'all' ? '确定清理全部账号消息（过期 + 超限）吗？' : '确定执行 A+B 深度清理（清理过期 + 清理超限）吗？'" @ok="handleDeepCleanAB">
                          <a-button type="primary" size="mini" status="warning" :loading="clearLoading.deepClean" :disabled="cacheStats.expiredMsgCount === 0 && cacheStats.exceededMsgCount === 0">一键 A+B 深度清理</a-button>
                        </a-popconfirm>
                      </template>
                      <a-popconfirm :content="context === 'global' && cleanScope === 'all' ? '确定清空全部账号的群消息吗？' : '确定仅清理群消息吗？'" @ok="handleClearGroupMessages">
                        <a-button type="outline" size="mini" status="warning" :loading="clearLoading.groupMessages">仅清理群消息</a-button>
                      </a-popconfirm>
                      <a-popconfirm :content="context === 'global' && cleanScope === 'all' ? '确定清空全部账号的公众号消息吗？' : '确定仅清理公众号吗？'" @ok="handleClearOfficialMessages">
                        <a-button type="outline" size="mini" status="warning" :loading="clearLoading.officialMessages">仅清理公众号</a-button>
                      </a-popconfirm>
                      <a-popconfirm :content="context === 'global' && cleanScope === 'all' ? '确定清空全部账号的所有消息记录吗？' : '确定清空所有消息记录吗？'" @ok="handleClearStore('messages')">
                        <a-button type="outline" size="mini" status="danger" :loading="clearLoading.messages">全部清理</a-button>
                      </a-popconfirm>
                    </a-space>
                  </a-space>
                </div>

                <!-- 消息限额参数配置区 -->
                <div v-if="(context === 'personal' || cleanScope === 'active') && accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login'" style="background: #1e1e1e; padding: 10px; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                  <span style="font-size: 12px; color: #86909c;">当前账号消息清理参数配置:</span>
                  <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span style="font-size: 12px; color: #e5e6eb;">单会话限制:</span>
                      <a-select 
                        :model-value="activeAccountConfig.maxMessagesPerConv" 
                        size="mini" 
                        style="width: 90px;"
                        @change="(val) => handleUpdateMsgLimit('maxMessagesPerConv', val)"
                      >
                        <a-option :value="50">50 条</a-option>
                        <a-option :value="100">100 条</a-option>
                        <a-option :value="200">200 条</a-option>
                        <a-option :value="500">500 条</a-option>
                        <a-option :value="1000">1000 条</a-option>
                      </a-select>
                    </div>

                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span style="font-size: 12px; color: #e5e6eb;">过期天数:</span>
                      <a-select 
                        :model-value="activeAccountConfig.msgTtlDays" 
                        size="mini" 
                        style="width: 100px;"
                        @change="(val) => handleUpdateMsgLimit('msgTtlDays', val)"
                      >
                        <a-option :value="0">永久保留</a-option>
                        <a-option :value="3">3 天</a-option>
                        <a-option :value="7">7 天</a-option>
                        <a-option :value="30">30 天</a-option>
                        <a-option :value="90">90 天</a-option>
                      </a-select>
                    </div>
                  </div>
                </div>
                <div v-else-if="context === 'global' && cleanScope === 'all'" style="background: #1e1e1e; padding: 6px 10px; border-radius: 4px; font-size: 12px; color: #86909c; text-align: center; width: 100%;">
                  “全部账号”模式下已合并统计，各项清理参数将依据各自账号的独立配置分别执行。
                </div>
                <div v-else style="background: #1e1e1e; padding: 6px 10px; border-radius: 4px; font-size: 12px; color: #86909c; text-align: center; width: 100%;">
                  请先在“当前账号设置”中激活并登录一个在线或离线账号，以开启单会话超限与过期自动筛选管理。
                </div>
              </div>

              <div class="store-item">
                <div class="store-info">
                  <span class="name">会话列表 (conversations)</span>
                  <span class="count">
                    <template v-if="isScanned.conversations">
                      <span v-if="context === 'global' && cleanScope === 'all'">总计: </span>{{ cacheStats.convCount }} 条
                    </template>
                    <template v-else>未扫描</template>
                  </span>
                </div>
                <a-space>
                  <a-button v-if="!isScanned.conversations" type="outline" size="mini" :loading="scanLoading.conversations" @click="handleScanSingle('conversations')">扫描</a-button>
                  <a-popconfirm :content="context === 'global' && cleanScope === 'all' ? '确定清空所有账号的会话列表吗？' : '确定清空会话列表吗？'" @ok="handleClearStore('conversations')">
                    <a-button type="outline" size="mini" status="warning" :loading="clearLoading.conversations">清理</a-button>
                  </a-popconfirm>
                </a-space>
              </div>
            </div>

            <a-divider />
            
            <a-popconfirm :content="context === 'global' && cleanScope === 'all' ? '确定清空系统所有账号的所有本地数据吗？（这无法撤销！）' : '确定清空所有本地数据吗？'" @ok="handleClearCache">
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
              <a-col :span="4">
                <a-form-item label="通信日志 (Socket)">
                  <a-switch 
                    :model-value="accountStore.debug.socket" 
                    @update:model-value="(val: any) => accountStore.updateDebugConfig({ socket: val })" 
                  />
                </a-form-item>
              </a-col>
              <a-col :span="4">
                <a-form-item label="缓存日志 (Cache)">
                  <a-switch 
                    :model-value="accountStore.debug.cache" 
                    @update:model-value="(val: any) => accountStore.updateDebugConfig({ cache: val })" 
                  />
                </a-form-item>
              </a-col>
              <a-col :span="4">
                <a-form-item label="解析日志 (Parser)">
                  <a-switch 
                    :model-value="accountStore.debug.parser" 
                    @update:model-value="(val: any) => accountStore.updateDebugConfig({ parser: val })" 
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
            <a-form-item label="默认 Redis 极速模式" help="开启后所有新账号默认使用 Redis 同步，跳过 IndexedDB">
              <a-switch 
                :model-value="accountStore.globalAvatarConfig.isRedisLanMode" 
                @update:model-value="(val: any) => accountStore.updateAvatarConfig({ isRedisLanMode: val }, true)" 
              />
            </a-form-item>
            <a-form-item label="默认新 Redis 服务地址 (可选)" help="仅需输入新 Redis 的协议、域名 (IP) 和端口即可。系统会自动拼装具体的读写接口">
              <div style="display: flex; gap: 8px; width: 100%;">
                <a-input 
                  v-model="tempGlobalRedisUrl" 
                  placeholder="例如: http://192.168.50.99:7379"
                />
                <a-button type="primary" @click="handleSaveGlobalRedisUrl">保存全局地址</a-button>
              </div>
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
            <a-divider>数据通道</a-divider>
            <a-form-item label="局域网 Redis 极速模式" help="开启后从原只读 Redis 快照极速获取数据，跳过 IndexedDB。如果配置了新 Redis 地址，则同步启用回写与读回机制。">
              <a-switch 
                :model-value="accountStore.getEffectiveAvatarConfig().isRedisLanMode" 
                @update:model-value="(val: any) => accountStore.updateAvatarConfig({ isRedisLanMode: val })" 
              />
            </a-form-item>
            <a-form-item 
              v-if="accountStore.getEffectiveAvatarConfig().isRedisLanMode"
              label="新 Redis 服务地址 (可选)" 
              help="仅需输入新 Redis 的协议、域名 (IP) 和端口，系统会自动拼装接口来进行同步、回写和备份"
            >
              <div style="display: flex; gap: 8px; width: 100%;">
                <a-input 
                  v-model="tempPersonalRedisUrl" 
                  placeholder="例如: http://192.168.50.99:7379"
                />
                <a-button type="primary" @click="handleSavePersonalRedisUrl">保存账号地址</a-button>
              </div>
            </a-form-item>
            <a-form-item 
              v-if="accountStore.getEffectiveAvatarConfig().isRedisLanMode"
              label="通讯录同步回写" 
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
            <a-form-item 
              v-if="accountStore.getEffectiveAvatarConfig().isRedisLanMode"
              label="聊天记录云备份/恢复" 
              help="手动将当前账号的所有聊天记录与会话列表备份到新 Redis 数据库，或者从新 Redis 读回"
            >
              <a-space>
                <a-button 
                  type="outline" 
                  size="small" 
                  status="success" 
                  @click="handleSaveAllMessagesToRedis"
                  :loading="saveAllMessagesLoading"
                >
                  批量备份聊天记录
                </a-button>
                <a-button 
                  type="outline" 
                  size="small" 
                  status="warning" 
                  @click="handleLoadAllMessagesFromRedis"
                  :loading="loadAllMessagesLoading"
                >
                  读回聊天记录
                </a-button>
              </a-space>
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

const tempGlobalRedisUrl = ref('');
const tempPersonalRedisUrl = ref('');

const contactLoading = ref(false);
const friendListLoading = ref(false);
const saveAllContactsLoading = ref(false);
const saveAllMessagesLoading = ref(false);
const loadAllMessagesLoading = ref(false);

const cacheStats = ref({ 
  contactCount: 0, 
  msgCount: 0, 
  expiredMsgCount: 0,
  exceededMsgCount: 0,
  estimatedSize: '0 B', 
  actualSize: '0 B',
  convCount: 0
});

const isScanned = reactive({
  estimatedSize: false,
  actualSize: false,
  contacts: false,
  messages: false,
  conversations: false
});

const scanLoading = reactive({
  all: false,
  estimatedSize: false,
  actualSize: false,
  contacts: false,
  messages: false,
  conversations: false
});

const clearLoading = reactive({
  all: false,
  contacts: false,
  messages: false,
  groupMessages: false,
  officialMessages: false,
  conversations: false,
  expiredMessages: false,
  exceededMessages: false,
  deepClean: false
});

const activeAccountConfig = computed(() => {
  return accountStore.getEffectiveAvatarConfig(accountStore.activeAccountUuid);
});

const handleUpdateMsgLimit = (key: 'maxMessagesPerConv' | 'msgTtlDays', val: any) => {
  accountStore.updateAvatarConfig({ [key]: Number(val) });
  isScanned.messages = false;
};

const cleanScope = ref<'active' | 'all'>('active');

const handleCleanScopeChange = () => {
  // 重置扫描状态，避免展示过时的缓存数据
  Object.keys(isScanned).forEach(k => {
    (isScanned as any)[k] = false;
  });
  cacheStats.value = {
    contactCount: 0,
    msgCount: 0,
    expiredMsgCount: 0,
    exceededMsgCount: 0,
    estimatedSize: '0 B',
    actualSize: '0 B',
    convCount: 0
  };
};

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
    baseConfigForm.baseUrl = accountStore.isDemoMode ? '' : accountStore.baseUrl;
    baseConfigForm.adminKey = accountStore.isDemoMode ? '' : accountStore.adminKey;
    
    // 初始化本地临时 Redis 地址，防止输入过程触发实时同步
    tempGlobalRedisUrl.value = (accountStore.isDemoMode ? '' : (accountStore.globalAvatarConfig.redisWriteBackUrl || ''));
    tempPersonalRedisUrl.value = (accountStore.isDemoMode ? '' : (accountStore.getEffectiveAvatarConfig().redisWriteBackUrl || ''));

    cleanScope.value = 'active';

    // 重置扫描状态，避免打开时展示过时的缓存数据
    Object.keys(isScanned).forEach(k => {
      (isScanned as any)[k] = false;
    });
  }
});

// 当切换当前账号时，也需要重新加载对应的 Redis 地址
watch(() => accountStore.activeAccountUuid, () => {
  tempPersonalRedisUrl.value = accountStore.getEffectiveAvatarConfig().redisWriteBackUrl || '';
});

const handleSaveConfig = () => {
  localStorage.removeItem('isDemoMode');
  accountStore.isDemoMode = false;
  accountStore.setGlobalConfig(baseConfigForm.baseUrl, baseConfigForm.adminKey, accountStore.tokenKey, accountStore.debug);
  window.location.reload();
};

const handleSaveGlobalRedisUrl = () => {
  accountStore.updateAvatarConfig({ redisWriteBackUrl: tempGlobalRedisUrl.value }, true);
  Message.success('全局默认 Redis 地址已成功保存！');
};

const handleSavePersonalRedisUrl = () => {
  accountStore.updateAvatarConfig({ redisWriteBackUrl: tempPersonalRedisUrl.value });
  Message.success('当前账号 Redis 地址已成功保存，已触发同步！');
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

const handleSaveAllMessagesToRedis = async () => {
  const uuid = accountStore.activeAccountUuid;
  if (!uuid) return Message.warning('请先选择活跃账号');
  try {
    saveAllMessagesLoading.value = true;
    Message.info('开始手动备份聊天记录到 Redis...');
    await chatStore.saveAllMessagesToRedis(uuid);
    Message.success('聊天记录备份成功！');
  } catch (err: any) {
    Message.error('备份失败: ' + err.message);
  } finally {
    saveAllMessagesLoading.value = false;
  }
};

const handleLoadAllMessagesFromRedis = async () => {
  const uuid = accountStore.activeAccountUuid;
  if (!uuid) return Message.warning('请先选择活跃账号');
  try {
    loadAllMessagesLoading.value = true;
    Message.info('开始从 Redis 读回聊天记录...');
    await chatStore.loadAllMessagesFromRedis(uuid);
    Message.success('聊天记录读回成功！');
  } catch (err: any) {
    Message.error('读回失败: ' + err.message);
  } finally {
    loadAllMessagesLoading.value = false;
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
  try {
    const isAll = props.context === 'global' && cleanScope.value === 'all';
    const uuid = !isAll && accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login' ? accountStore.activeAccountUuid : undefined;

    const [c, m, v, est, act] = await Promise.all([
      contactCache.getCount('contacts', uuid),
      contactCache.getCount('messages', uuid),
      contactCache.getCount('conversations', uuid),
      contactCache.getEstimatedSize(uuid),
      contactCache.getActualSize()
    ]);

    let expired = 0;
    let exceeded = 0;

    if (isAll) {
      const accounts = accountStore.accounts.filter(a => a.uuid && a.uuid !== 'pending_login');
      if (accounts.length > 0) {
        const results = await Promise.all(
          accounts.map(async (a) => {
            const config = accountStore.getEffectiveAvatarConfig(a.uuid);
            const [exp, exc] = await Promise.all([
              contactCache.getExpiredCount(a.uuid, config.msgTtlDays || 0),
              contactCache.getExceededCount(a.uuid, config.maxMessagesPerConv || 500)
            ]);
            return { exp, exc };
          })
        );
        results.forEach(res => {
          expired += res.exp;
          exceeded += res.exc;
        });
      }
    } else if (uuid) {
      const config = accountStore.getEffectiveAvatarConfig(uuid);
      const [exp, exc] = await Promise.all([
        contactCache.getExpiredCount(uuid, config.msgTtlDays || 0),
        contactCache.getExceededCount(uuid, config.maxMessagesPerConv || 500)
      ]);
      expired = exp;
      exceeded = exc;
    }

    cacheStats.value = {
      contactCount: c,
      msgCount: m,
      convCount: v,
      estimatedSize: est,
      actualSize: act,
      expiredMsgCount: expired,
      exceededMsgCount: exceeded
    };
    isScanned.contacts = true;
    isScanned.messages = true;
    isScanned.conversations = true;
    isScanned.estimatedSize = true;
    isScanned.actualSize = true;
    Message.success('一键扫描完成');
  } catch (err: any) {
    Message.error('扫描失败: ' + err.message);
  } finally {
    scanLoading.all = false;
  }
};

// 局部单项扫描
const handleScanSingle = async (key: keyof typeof isScanned) => {
  const isAll = props.context === 'global' && cleanScope.value === 'all';
  const uuid = !isAll && accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login' ? accountStore.activeAccountUuid : undefined;
  scanLoading[key] = true;
  try {
    if (key === 'contacts') {
      cacheStats.value.contactCount = await contactCache.getCount('contacts', uuid);
    } else if (key === 'messages') {
      const msgCount = await contactCache.getCount('messages', uuid);
      let expired = 0;
      let exceeded = 0;
      if (isAll) {
        const accounts = accountStore.accounts.filter(a => a.uuid && a.uuid !== 'pending_login');
        if (accounts.length > 0) {
          const results = await Promise.all(
            accounts.map(async (a) => {
              const config = accountStore.getEffectiveAvatarConfig(a.uuid);
              const [exp, exc] = await Promise.all([
                contactCache.getExpiredCount(a.uuid, config.msgTtlDays || 0),
                contactCache.getExceededCount(a.uuid, config.maxMessagesPerConv || 500)
              ]);
              return { exp, exc };
            })
          );
          results.forEach(res => {
            expired += res.exp;
            exceeded += res.exc;
          });
        }
      } else if (uuid) {
        const config = accountStore.getEffectiveAvatarConfig(uuid);
        expired = await contactCache.getExpiredCount(uuid, config.msgTtlDays || 0);
        exceeded = await contactCache.getExceededCount(uuid, config.maxMessagesPerConv || 500);
      }
      cacheStats.value.msgCount = msgCount;
      cacheStats.value.expiredMsgCount = expired;
      cacheStats.value.exceededMsgCount = exceeded;
    } else if (key === 'conversations') {
      cacheStats.value.convCount = await contactCache.getCount('conversations', uuid);
    } else if (key === 'estimatedSize') {
      cacheStats.value.estimatedSize = await contactCache.getEstimatedSize(uuid);
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

const handleClearGroupMessages = async () => {
  const isAll = props.context === 'global' && cleanScope.value === 'all';
  
  try {
    clearLoading.groupMessages = true;
    if (isAll) {
      const accounts = accountStore.accounts.filter(a => a.uuid && a.uuid !== 'pending_login');
      let totalDeleted = 0;
      await Promise.all(
        accounts.map(async (a) => {
          const deletedCount = await contactCache.clearGroupMessages(a.uuid);
          chatStore.clearMemoryAll(a.uuid);
          totalDeleted += deletedCount;
        })
      );
      Message.success(`所有账号的群消息已清空，共清理了 ${totalDeleted} 条消息`);
    } else {
      const uuid = accountStore.activeAccountUuid;
      if (!uuid) return Message.warning('请先选择活跃账号');
      await contactCache.clearGroupMessages(uuid);
      chatStore.clearMemoryAll(uuid);
      Message.success('当前账号群消息已清空');
    }
    
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
  const isAll = props.context === 'global' && cleanScope.value === 'all';
  
  try {
    clearLoading.officialMessages = true;
    if (isAll) {
      const accounts = accountStore.accounts.filter(a => a.uuid && a.uuid !== 'pending_login');
      let totalDeleted = 0;
      await Promise.all(
        accounts.map(async (a) => {
          const deletedCount = await contactCache.clearOfficialMessages(a.uuid);
          chatStore.clearMemoryAll(a.uuid);
          totalDeleted += deletedCount;
        })
      );
      Message.success(`所有账号的公众号消息已清空，共清理了 ${totalDeleted} 条消息`);
    } else {
      const uuid = accountStore.activeAccountUuid;
      if (!uuid) return Message.warning('请先选择活跃账号');
      await contactCache.clearOfficialMessages(uuid);
      chatStore.clearMemoryAll(uuid);
      Message.success('当前账号公众号消息已清空');
    }
    
    if (isScanned.messages) {
      await handleScanSingle('messages');
    }
  } catch (err: any) {
    Message.error('清理公众号消息失败: ' + err.message);
  } finally {
    clearLoading.officialMessages = false;
  }
};

const handleClearExpired = async () => {
  const isAll = props.context === 'global' && cleanScope.value === 'all';
  
  if (isAll) {
    const accounts = accountStore.accounts.filter(a => a.uuid && a.uuid !== 'pending_login');
    if (accounts.length === 0) return Message.warning('没有可清理的账号');
    
    try {
      clearLoading.expiredMessages = true;
      let totalDeleted = 0;
      await Promise.all(
        accounts.map(async (a) => {
          const config = accountStore.getEffectiveAvatarConfig(a.uuid);
          const ttlDays = config.msgTtlDays || 0;
          if (ttlDays > 0) {
            const count = await contactCache.pruneExpiredMessages(a.uuid, ttlDays);
            chatStore.clearMemoryAll(a.uuid);
            totalDeleted += count;
          }
        })
      );
      Message.success(`成功清理了全部账号共 ${totalDeleted} 条已过期的消息记录`);
      if (isScanned.messages) {
        await handleScanSingle('messages');
      }
    } catch (err: any) {
      Message.error('清理过期消息失败: ' + err.message);
    } finally {
      clearLoading.expiredMessages = false;
    }
  } else {
    const uuid = accountStore.activeAccountUuid;
    if (!uuid || uuid === 'pending_login') return Message.warning('请先选择活跃账号');
    
    const config = accountStore.getEffectiveAvatarConfig(uuid);
    const ttlDays = config.msgTtlDays || 0;
    if (ttlDays <= 0) return Message.warning('当前账号未配置消息过期天数限制');

    try {
      clearLoading.expiredMessages = true;
      const deletedCount = await contactCache.pruneExpiredMessages(uuid, ttlDays);
      chatStore.clearMemoryAll(uuid);
      Message.success(`成功清理了 ${deletedCount} 条已过期的消息记录`);
      if (isScanned.messages) {
        await handleScanSingle('messages');
      }
    } catch (err: any) {
      Message.error('清理过期消息失败: ' + err.message);
    } finally {
      clearLoading.expiredMessages = false;
    }
  }
};

const handleClearExceeded = async () => {
  const isAll = props.context === 'global' && cleanScope.value === 'all';
  
  if (isAll) {
    const accounts = accountStore.accounts.filter(a => a.uuid && a.uuid !== 'pending_login');
    if (accounts.length === 0) return Message.warning('没有可清理的账号');

    try {
      clearLoading.exceededMessages = true;
      let totalDeleted = 0;
      await Promise.all(
        accounts.map(async (a) => {
          const config = accountStore.getEffectiveAvatarConfig(a.uuid);
          const maxMessages = config.maxMessagesPerConv || 500;
          const count = await contactCache.pruneExceededMessages(a.uuid, maxMessages);
          chatStore.clearMemoryAll(a.uuid);
          totalDeleted += count;
        })
      );
      Message.success(`成功清理了全部账号共 ${totalDeleted} 条超出单会话上限的消息记录`);
      if (isScanned.messages) {
        await handleScanSingle('messages');
      }
    } catch (err: any) {
      Message.error('清理超限消息失败: ' + err.message);
    } finally {
      clearLoading.exceededMessages = false;
    }
  } else {
    const uuid = accountStore.activeAccountUuid;
    if (!uuid || uuid === 'pending_login') return Message.warning('请先选择活跃账号');

    const config = accountStore.getEffectiveAvatarConfig(uuid);
    const maxMessages = config.maxMessagesPerConv || 500;

    try {
      clearLoading.exceededMessages = true;
      const deletedCount = await contactCache.pruneExceededMessages(uuid, maxMessages);
      chatStore.clearMemoryAll(uuid);
      Message.success(`成功清理了 ${deletedCount} 条超出单会话上限的消息记录`);
      if (isScanned.messages) {
        await handleScanSingle('messages');
      }
    } catch (err: any) {
      Message.error('清理超限消息失败: ' + err.message);
    } finally {
      clearLoading.exceededMessages = false;
    }
  }
};

const handleDeepCleanAB = async () => {
  const isAll = props.context === 'global' && cleanScope.value === 'all';

  if (isAll) {
    const accounts = accountStore.accounts.filter(a => a.uuid && a.uuid !== 'pending_login');
    if (accounts.length === 0) return Message.warning('没有可清理的账号');

    try {
      clearLoading.deepClean = true;
      let totalExpired = 0;
      let totalExceeded = 0;
      
      await Promise.all(
        accounts.map(async (a) => {
          const config = accountStore.getEffectiveAvatarConfig(a.uuid);
          const ttlDays = config.msgTtlDays || 0;
          const maxMessages = config.maxMessagesPerConv || 500;
          
          const [expiredCount, exceededCount] = await Promise.all([
            ttlDays > 0 ? contactCache.pruneExpiredMessages(a.uuid, ttlDays) : Promise.resolve(0),
            contactCache.pruneExceededMessages(a.uuid, maxMessages)
          ]);
          chatStore.clearMemoryAll(a.uuid);
          totalExpired += expiredCount;
          totalExceeded += exceededCount;
        })
      );
      
      Message.success(`深度清理完成：共清理了全部账号 ${totalExpired + totalExceeded} 条消息 (过期: ${totalExpired} 条, 超限: ${totalExceeded} 条)`);
      if (isScanned.messages) {
        await handleScanSingle('messages');
      }
    } catch (err: any) {
      Message.error('深度清理失败: ' + err.message);
    } finally {
      clearLoading.deepClean = false;
    }
  } else {
    const uuid = accountStore.activeAccountUuid;
    if (!uuid || uuid === 'pending_login') return Message.warning('请先选择活跃账号');

    const config = accountStore.getEffectiveAvatarConfig(uuid);
    const ttlDays = config.msgTtlDays || 0;
    const maxMessages = config.maxMessagesPerConv || 500;

    try {
      clearLoading.deepClean = true;
      const [expiredCount, exceededCount] = await Promise.all([
        contactCache.pruneExpiredMessages(uuid, ttlDays),
        contactCache.pruneExceededMessages(uuid, maxMessages)
      ]);
      chatStore.clearMemoryAll(uuid);
      Message.success(`深度清理完成：共清理了 ${expiredCount + exceededCount} 条消息 (过期: ${expiredCount} 条, 超限: ${exceededCount} 条)`);
      if (isScanned.messages) {
        await handleScanSingle('messages');
      }
    } catch (err: any) {
      Message.error('深度清理失败: ' + err.message);
    } finally {
      clearLoading.deepClean = false;
    }
  }
};

const handleClearStore = async (name: string) => {
  const isAll = props.context === 'global' && cleanScope.value === 'all';
  const uuid = !isAll && accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login' ? accountStore.activeAccountUuid : undefined;

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
        accountStore.clearMemoryAll(uuid);
      }
    } else {
      if (name === 'messages') {
        chatStore.accountMessages = {};
        chatStore.clearMemoryAll();
      } else if (name === 'conversations') {
        chatStore.accountConversations = {};
      } else if (name === 'contacts') {
        accountStore.accountContactMaps = {};
        accountStore.clearMemoryAll();
      }
    }

    // 内存直接置 0 并设为已扫描，无须再次触发繁杂的全盘扫描
    if (name === 'contacts') {
      cacheStats.value.contactCount = 0;
      isScanned.contacts = true;
    } else if (name === 'messages') {
      cacheStats.value.msgCount = 0;
      cacheStats.value.expiredMsgCount = 0;
      cacheStats.value.exceededMsgCount = 0;
      isScanned.messages = true;
    } else if (name === 'conversations') {
      cacheStats.value.convCount = 0;
      isScanned.conversations = true;
    }

    Message.success(`已清空 ${uuid ? '当前账号 ' : '全部账号的 '}${name} 表`);
  } catch (err: any) {
    Message.error('清理失败: ' + err.message);
  } finally {
    (clearLoading as any)[name] = false;
  }
};

const handleClearCache = async () => {
  const isAll = props.context === 'global' && cleanScope.value === 'all';
  const uuid = !isAll && accountStore.activeAccountUuid && accountStore.activeAccountUuid !== 'pending_login' ? accountStore.activeAccountUuid : undefined;

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
      expiredMsgCount: 0,
      exceededMsgCount: 0,
      convCount: 0,
      estimatedSize: '0 B',
      actualSize: '0 B'
    };
    
    isScanned.contacts = true;
    isScanned.messages = true;
    isScanned.conversations = true;
    isScanned.estimatedSize = true;
    isScanned.actualSize = true;

    Message.success(`已清空${uuid ? '当前账号的' : '系统内所有账号的'}本地数据`);
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
