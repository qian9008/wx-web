<template>
  <div class="chat-header">
    <div class="chat-header-back" @click="emit('back')">
      <icon-left :size="18" />
      <span>返回</span>
    </div>
    <div class="title-area">
      <div class="title">{{ partnerName }}</div>
      <a-tag v-slot:default v-if="relationLabel" :color="relationColor" size="small" class="relation-tag">
        {{ relationLabel }}
      </a-tag>
    </div>
    <a-space v-if="activeId" class="header-actions">
      <a-button 
        type="outline" 
        size="mini" 
        status="success" 
        class="relation-btn"
        :loading="isCheckingRelation"
        @click="handleCheckRelation"
      >
        <template #icon><icon-safe /></template>
        检测关系
      </a-button>
      <a-button 
        type="outline" 
        size="mini" 
        class="refresh-btn"
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
      >
        <a-button 
          type="outline" 
          size="mini" 
          status="danger" 
          class="delete-btn"
          :loading="isDeletingContact"
        >
          <template #icon><icon-delete /></template>
          删除好友
        </a-button>
      </a-popconfirm>
    </a-space>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { 
  IconLeft, IconSafe, IconRefresh, IconDelete 
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
