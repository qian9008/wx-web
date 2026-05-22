<template>
  <div class="chat-header">
    <div class="chat-header-back" @click="emit('back')">
      <icon-left :size="18" />
      <span>返回</span>
    </div>
    
    <a-popover 
      v-if="activeId" 
      trigger="click" 
      position="bottom"
    >
      <div class="title-area interactive">
        <div class="title">{{ partnerName }}</div>
        <a-tag v-slot:default v-if="relationLabel" :color="relationColor" size="small" class="relation-tag">
          {{ relationLabel }}
        </a-tag>
        <icon-down class="title-arrow" />
      </div>
      
      <template #content>
        <div style="width: 260px; padding: 4px; color: #e5e6eb;">
          <!-- 头部简要信息 -->
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; color: #86909c;">
              <icon-user :size="20" />
            </div>
            <div style="flex: 1; overflow: hidden;">
              <div style="font-size: 15px; font-weight: bold; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {{ partnerName }}
              </div>
              <div style="font-size: 11px; color: #86909c; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; user-select: text;">
                ID: {{ activeId }}
              </div>
            </div>
          </div>
          
          <!-- 关系标签 -->
          <div v-if="relationLabel" style="display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 12px; background: rgba(255, 255, 255, 0.02); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.04);">
            <span style="color: #86909c;">好友关系:</span>
            <a-tag :color="relationColor" size="small" style="border-radius: 4px; font-weight: 500;">
              {{ relationLabel }}
            </a-tag>
          </div>
          
          <a-divider style="margin: 8px 0; border-bottom-color: rgba(255, 255, 255, 0.08);" />
          
          <!-- 操作按钮区域 -->
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
            <a-button 
              type="outline" 
              size="small" 
              status="success" 
              style="width: 100%; border-radius: 6px; justify-content: center;"
              :loading="isCheckingRelation"
              @click="handleCheckRelation"
            >
              <template #icon><icon-safe /></template>
              检测关系
            </a-button>
            
            <a-button 
              type="outline" 
              size="small" 
              style="width: 100%; border-radius: 6px; justify-content: center; color: #e5e6eb; border-color: rgba(255, 255, 255, 0.25);"
              :loading="isRefreshingDetails"
              @click="handleRefreshDetails"
            >
              <template #icon><icon-refresh /></template>
              更新资料
            </a-button>
            
            <a-popconfirm 
              content="确定要彻底删除该好友吗？此操作不可逆！" 
              type="warning" 
              @ok="handleDeleteContact"
              position="top"
            >
              <a-button 
                type="outline" 
                size="small" 
                status="danger" 
                style="width: 100%; border-radius: 6px; justify-content: center;"
                :loading="isDeletingContact"
              >
                <template #icon><icon-delete /></template>
                删除好友
              </a-button>
            </a-popconfirm>
          </div>
        </div>
      </template>
    </a-popover>
    
    <div v-else class="title-area">
      <div class="title">{{ partnerName }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { 
  IconLeft, IconSafe, IconRefresh, IconDelete, IconDown, IconUser 
} from '@arco-design/web-vue/es/icon';
import { useAccountStore } from '@/store/account';
import { Message } from '@arco-design/web-vue';

const props = defineProps<{
  activeId: string;
  partnerName: string;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
}>();

const accountStore = useAccountStore();

const contactDetail = computed(() => {
  if (!props.activeId) return null;
  return accountStore.contactMap[props.activeId] || null;
});

const relationValue = computed(() => {
  return contactDetail.value?.friendRelation;
});

const relationLabel = computed(() => {
  const r = relationValue.value;
  if (r === 0) return '陌生人';
  if (r === 1) return '互为好友';
  if (r === 2) return '被拉黑';
  if (r === 3) return '已被删除';
  return '';
});

const relationColor = computed(() => {
  const r = relationValue.value;
  if (r === 0) return 'orange';
  if (r === 1) return 'green';
  if (r === 2) return 'red';
  if (r === 3) return 'red';
  return 'gray';
});

const isCheckingRelation = ref(false);

const handleCheckRelation = async () => {
  if (!props.activeId) return;
  isCheckingRelation.value = true;
  try {
    const res = await accountStore.checkFriendRelation(props.activeId);
    const relation = res?.FriendRelation;
    
    if (relation === 1) {
      Message.success('关系检测完成：您与对方互为正常好友！');
    } else if (relation === 0) {
      Message.warning('关系检测完成：对方当前为您的陌生人（非好友）。');
    } else if (relation === 3) {
      Message.error('关系检测完成：对方已将您删除！');
    } else if (relation === 2) {
      Message.error('关系检测完成：您已被对方拉入黑名单！');
    } else {
      Message.info('关系检测完成。');
    }
  } catch (err: any) {
    const errMsg = err?.Text || err?.message || '请求失败，请稍后重试';
    Message.error(`检测失败: ${errMsg}`);
  } finally {
    isCheckingRelation.value = false;
  }
};

const isRefreshingDetails = ref(false);

const handleRefreshDetails = async () => {
  if (!props.activeId) return;
  isRefreshingDetails.value = true;
  try {
    const detail = await accountStore.forceUpdateContactDetails(props.activeId);
    
    const remark = detail.remark || detail.Remark;
    const remarkStr = remark && typeof remark === 'object' ? remark.str : remark || '';
    const nick = detail.nickName || detail.NickName || detail.nickname;
    const nickStr = nick && typeof nick === 'object' ? nick.str : nick || '';
    const newName = remarkStr || nickStr || props.activeId;

    Message.success(`资料更新成功！最新名称: ${newName}`);
  } catch (err: any) {
    const errMsg = err?.Text || err?.message || '请求失败，请稍后重试';
    Message.error(`资料更新失败: ${errMsg}`);
  } finally {
    isRefreshingDetails.value = false;
  }
};

const isDeletingContact = ref(false);

const handleDeleteContact = async () => {
  if (!props.activeId) return;
  isDeletingContact.value = true;
  try {
    await accountStore.deleteContact(props.activeId);
    Message.success('好友删除成功！已清空本地会话与联系人缓存。');
    emit('back'); // 自动返回列表页，关闭聊天视窗
  } catch (err: any) {
    const errMsg = err?.Text || err?.message || '请求失败，请稍后重试';
    Message.error(`删除好友失败: ${errMsg}`);
  } finally {
    isDeletingContact.value = false;
  }
};
</script>

<style scoped>
.title-area.interactive {
  cursor: pointer;
  padding: 4px 8px;
  margin-left: -8px;
  border-radius: 6px;
  transition: all 0.2s ease-in-out;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-area.interactive:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.title-area.interactive:active {
  background-color: rgba(255, 255, 255, 0.12);
}

.title-arrow {
  font-size: 12px;
  color: #86909c;
  transition: transform 0.2s ease, color 0.2s ease;
}

.title-area.interactive:hover .title-arrow {
  color: #07c160;
  transform: translateY(1px);
}
</style>
