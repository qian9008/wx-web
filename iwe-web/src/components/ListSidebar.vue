<template>
  <!-- 第三栏：列表展示 -->
  <div class="column chat-list">
    <div class="list-search">
      <a-input-search v-model="searchQuery" placeholder="搜索 (匹配名称/微信号/消息)" background-color="#2e2e2e" allow-clear />
    </div>
    
    <div class="scroll-area" @scroll="handleScroll">
      <div v-show="activeTab === 'chat'">
        <div 
          v-for="conv in currentConversations" 
          :key="conv.wxid"
          class="conv-item"
          :class="{ active: activeId === conv.wxid }"
          @click="emit('selectChat', conv.wxid)"
        >
          <a-badge :count="conv.unread" :dot="false" class="avatar-badge">
            <a-avatar :size="42" shape="square" :style="{ backgroundColor: '#ffb400' }">
              <img v-if="getConvAvatar(conv)" :src="getConvAvatar(conv)" loading="lazy" />
              <template v-else>{{ getConvName(conv) ? getConvName(conv)[0] : 'C' }}</template>
            </a-avatar>
          </a-badge>
          <div class="info">
            <div class="title">
              <span class="name">{{ getConvName(conv) }}</span>
              <span class="time">{{ formatTime(conv.time) }}</span>
            </div>
            <div class="desc">{{ formatText(conv.lastMsg) }}</div>
          </div>
        </div>
      </div>
      
      <div v-show="activeTab === 'contact'">
        <div class="contact-tabs">
          <div 
            class="tab-item" 
            :class="{ active: contactCategory === 'friend' }"
            @click="contactCategory = 'friend'"
          >好友({{ sortedContacts.friend.length }})</div>
          <div 
            class="tab-item" 
            :class="{ active: contactCategory === 'room' }"
            @click="contactCategory = 'room'"
          >群聊({{ sortedContacts.room.length }})</div>
          <div 
            class="tab-item" 
            :class="{ active: contactCategory === 'official' }"
            @click="contactCategory = 'official'"
          >公众号({{ sortedContacts.official.length }})</div>
        </div>
        <div v-show="contactCategory === 'friend'">
          <div 
            v-for="contact in slicedFriends" 
            :key="getContactId(contact)"
            class="conv-item"
            :class="{ active: activeId === getContactId(contact) }"
            @click="emit('selectContact', contact)"
            v-lazy-contact="getContactId(contact)"
          >
            <a-avatar :size="42" shape="square" :style="{ backgroundColor: '#337ecc' }">
              <!-- 🚀 优化：只有当该联系人真正进入可见视口，才挂载 <img> 并发起网络请求加载头像 -->
              <img v-if="visibleAvatars[getContactId(contact)] && getContactAvatar(contact)" :src="accountStore.avatarBlobMap[getContactAvatar(contact)] || getContactAvatar(contact)" referrerpolicy="no-referrer" loading="lazy" />
              <template v-else>{{ getContactName(contact)[0] }}</template>
            </a-avatar>
            <div class="info">
              <div class="title">
                <span class="name">{{ getContactName(contact) }}</span>
              </div>
              <div class="desc">{{ getContactId(contact) }}</div>
            </div>
          </div>
        </div>

        <div v-show="contactCategory === 'room'">
          <div 
            v-for="contact in slicedRooms" 
            :key="getContactId(contact)"
            class="conv-item"
            :class="{ active: activeId === getContactId(contact) }"
            @click="emit('selectContact', contact)"
            v-lazy-contact="getContactId(contact)"
          >
            <a-avatar :size="42" shape="square" :style="{ backgroundColor: '#337ecc' }">
              <!-- 🚀 优化：只有当该联系人真正进入可见视口，才挂载 <img> 并发起网络请求加载头像 -->
              <img v-if="visibleAvatars[getContactId(contact)] && getContactAvatar(contact)" :src="accountStore.avatarBlobMap[getContactAvatar(contact)] || getContactAvatar(contact)" referrerpolicy="no-referrer" loading="lazy" />
              <template v-else>{{ getContactName(contact)[0] }}</template>
            </a-avatar>
            <div class="info">
              <div class="title">
                <span class="name">{{ getContactName(contact) }}</span>
              </div>
              <div class="desc">{{ getContactId(contact) }}</div>
            </div>
          </div>
        </div>

        <div v-show="contactCategory === 'official'">
          <div 
            v-for="contact in slicedOfficials" 
            :key="getContactId(contact)"
            class="conv-item"
            :class="{ active: activeId === getContactId(contact) }"
            @click="emit('selectContact', contact)"
            v-lazy-contact="getContactId(contact)"
          >
            <a-avatar :size="42" shape="square" :style="{ backgroundColor: '#337ecc' }">
              <!-- 🚀 优化：只有当该联系人真正进入可见视口，才挂载 <img> 并发起网络请求加载头像 -->
              <img v-if="visibleAvatars[getContactId(contact)] && getContactAvatar(contact)" :src="accountStore.avatarBlobMap[getContactAvatar(contact)] || getContactAvatar(contact)" referrerpolicy="no-referrer" loading="lazy" />
              <template v-else>{{ getContactName(contact)[0] }}</template>
            </a-avatar>
            <div class="info">
              <div class="title">
                <span class="name">{{ getContactName(contact) }}</span>
              </div>
              <div class="desc">{{ getContactId(contact) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { useAccountStore } from '@/store/account';
import { useChatStore } from '@/store/chat';
import dayjs from 'dayjs';

const props = defineProps<{
  activeTab: 'chat' | 'contact';
  activeId: string;
}>();

const emit = defineEmits<{
  (e: 'selectChat', wxid: string): void;
  (e: 'selectContact', contact: any): void;
}>();

const accountStore = useAccountStore();
const chatStore = useChatStore();

const searchQuery = ref('');
const contactCategory = ref('friend'); // friend, room, official

const visibleFriendLimit = ref(100);
const visibleRoomLimit = ref(100);
const visibleOfficialLimit = ref(100);

const visibleAvatars = reactive<Record<string, boolean>>({});

// 重置页面滚动加载限制
watch([() => props.activeTab, () => contactCategory.value, () => accountStore.activeAccountUuid], () => {
  visibleFriendLimit.value = 100;
  visibleRoomLimit.value = 100;
  visibleOfficialLimit.value = 100;
});

// 切换账号时清空相关参数
watch(() => accountStore.activeAccountUuid, () => {
  searchQuery.value = '';
  Object.keys(visibleAvatars).forEach(key => delete visibleAvatars[key]);
});

const getContactId = (c: any) => {
  return c.userName?.str || c.UserName?.str || c.wxid || c.userName || c.UserName || '';
};

const getContactName = (c: any) => {
  const remark = c.remark || c.Remark;
  const remarkStr = remark && typeof remark === 'object' ? remark.str : remark || '';
  const nick = c.nickName || c.NickName || c.nickname;
  const nickStr = nick && typeof nick === 'object' ? nick.str : nick || '';
  return remarkStr || nickStr || getContactId(c) || '未知';
};

const getContactAvatar = (c: any) => {
  const url = c.smallHeadImgUrl || c.SmallHeadImgUrl || c.headImgUrl || c.HeadImgUrl || c.avatar || '';
  const rawUrl = typeof url === 'string' ? url.trim().replace(/`/g, '') : '';
  if (!rawUrl) return '';
  return accountStore.avatarBlobMap[rawUrl] || rawUrl;
};

const getConvName = (conv: any) => {
  if (conv.nickname && conv.nickname !== conv.wxid) return formatText(conv.nickname);
  const contact = accountStore.contactMap[conv.wxid];
  if (contact) {
    const name = getContactName(contact);
    if (name && name !== conv.wxid) return formatText(name);
  }
  if (conv.wxid === accountStore.activeAccountUuid) {
    const activeAcc = accountStore.accounts.find(a => a.uuid === accountStore.activeAccountUuid);
    if (activeAcc && activeAcc.nickname) return activeAcc.nickname;
  }
  return formatText(conv.nickname);
};

const getConvAvatar = (conv: any) => {
  let rawUrl = conv.avatar;
  if (!rawUrl) {
    const contact = accountStore.contactMap[conv.wxid];
    if (contact) {
      const url = contact.smallHeadImgUrl || contact.SmallHeadImgUrl || contact.headImgUrl || contact.HeadImgUrl || contact.avatar || '';
      rawUrl = typeof url === 'string' ? url.trim().replace(/`/g, '') : '';
    } else if (conv.wxid === accountStore.activeAccountUuid) {
      const activeAcc = accountStore.accounts.find(a => a.uuid === accountStore.activeAccountUuid);
      rawUrl = activeAcc?.avatar || '';
    }
  }
  if (!rawUrl) return '';
  accountStore.getAvatarUrl(rawUrl);
  return accountStore.avatarBlobMap[rawUrl] || rawUrl;
};

const formatTime = (t: number) => t ? dayjs(t * 1000).format('HH:mm') : '';
const formatText = (text: any) => {
  if (typeof text === 'object') return text.str || text.Str || JSON.stringify(text);
  return String(text || '');
};

// 内存镜像获取联系人并分类
const sortedContacts = computed(() => {
  if (props.activeTab !== 'contact') {
    return { friend: [], room: [], official: [] };
  }

  const all = Object.values(accountStore.contactMap);
  
  let filteredAll = all;
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    filteredAll = all.filter(c => {
      if (!c) return false;
      
      const id = getContactId(c).toLowerCase();
      const name = getContactName(c).toLowerCase();
      
      const nick = c.nickName || c.NickName || c.nickname;
      const nickStr = String((nick && typeof nick === 'object') ? nick.str : nick || '').toLowerCase();
      
      const remark = c.remark || c.Remark;
      const remarkStr = String((remark && typeof remark === 'object') ? remark.str : remark || '').toLowerCase();
      
      return id.includes(q) || name.includes(q) || nickStr.includes(q) || remarkStr.includes(q);
    });
  }

  const categories = {
    friend: [] as any[],
    room: [] as any[],
    official: [] as any[]
  };

  filteredAll.forEach(c => {
    const id = getContactId(c);
    if (!id) return;

    if (id.endsWith('@chatroom')) {
      categories.room.push(c);
    } else if (id.startsWith('gh_') || id === 'fmessage' || id === 'medianote' || id.includes('@official') || id.includes('@app')) {
      categories.official.push(c);
    } else {
      categories.friend.push(c);
    }
  });

  const collator = new Intl.Collator('zh-CN');
  const sortFn = (a: any, b: any) => collator.compare(getContactName(a), getContactName(b));
  
  categories.friend.sort(sortFn);
  categories.room.sort(sortFn);
  categories.official.sort(sortFn);

  return categories;
});

const slicedFriends = computed(() => {
  return sortedContacts.value.friend.slice(0, visibleFriendLimit.value);
});

const slicedRooms = computed(() => {
  return sortedContacts.value.room.slice(0, visibleRoomLimit.value);
});

const slicedOfficials = computed(() => {
  return sortedContacts.value.official.slice(0, visibleOfficialLimit.value);
});

const currentConversations = computed(() => {
  const accountUuid = accountStore.activeAccountUuid;
  if (!accountUuid || accountUuid === 'pending_login') return [];
  
  const convs = chatStore.accountConversations[accountUuid] || [];
  const mapped = convs.map(c => {
    const detail = accountStore.contactMap[c.wxid];
    return detail ? {
      ...c,
      nickname: getContactName(detail),
      avatar: getContactAvatar(detail)
    } : c;
  });

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    return mapped.filter(c => {
      const name = (getConvName(c) || '').toLowerCase();
      const wxid = (c.wxid || '').toLowerCase();
      const lastMsg = (c.lastMsg || '').toLowerCase();
      return name.includes(q) || wxid.includes(q) || lastMsg.includes(q);
    });
  }
  return mapped;
});

const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement;
  if (target.scrollHeight - target.scrollTop - target.clientHeight < 300) {
    if (contactCategory.value === 'friend' && visibleFriendLimit.value < sortedContacts.value.friend.length) {
      visibleFriendLimit.value += 100;
    } else if (contactCategory.value === 'room' && visibleRoomLimit.value < sortedContacts.value.room.length) {
      visibleRoomLimit.value += 100;
    } else if (contactCategory.value === 'official' && visibleOfficialLimit.value < sortedContacts.value.official.length) {
      visibleOfficialLimit.value += 100;
    }
  }
};

const lazyObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const wxid = entry.target.getAttribute('data-wxid');
      if (wxid) {
        visibleAvatars[wxid] = true;
        accountStore.enqueueContactDetails(wxid);
        
        const contact = accountStore.contactMap[wxid];
        if (contact) {
          const url = contact.smallHeadImgUrl || contact.SmallHeadImgUrl || contact.headImgUrl || contact.HeadImgUrl || contact.avatar || '';
          const rawUrl = typeof url === 'string' ? url.trim().replace(/`/g, '') : '';
          if (rawUrl) {
            accountStore.getAvatarUrl(rawUrl);
          }
        }
        lazyObserver.unobserve(entry.target);
      }
    }
  });
}, { rootMargin: '100px' });

const vLazyContact = {
  mounted: (el: HTMLElement, binding: any) => {
    const wxid = binding.value;
    if (wxid) {
      el.setAttribute('data-wxid', wxid);
      if (visibleAvatars[wxid]) return;
      lazyObserver.observe(el);
    }
  },
  unmounted: (el: HTMLElement) => {
    lazyObserver.unobserve(el);
  }
};
</script>

<style scoped>
.column {
  height: 100%;
  display: flex;
  flex-direction: column;
}
/* 第三栏：列表展示 */
.chat-list {
  width: 280px;
  background: #181818;
  border-right: 1px solid #222222;
  flex-shrink: 0;
}
.list-search {
  padding: 15px 12px;
  border-bottom: 1px solid #222222;
}
.scroll-area {
  flex: 1;
  overflow-y: auto;
}
.scroll-area::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.scroll-area::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
}
.scroll-area::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
.scroll-area::-webkit-scrollbar-track {
  background: transparent;
}
.conv-item {
  display: flex;
  padding: 12px 15px;
  border-bottom: 1px solid #222222;
  cursor: pointer;
  align-items: center;
  transition: all 0.2s;
  background: transparent;
}
.conv-item:hover {
  background: #2a2a2a;
}
.conv-item.active {
  background: #2e2e2e;
}
.conv-item .info {
  flex: 1;
  margin-left: 12px;
  min-width: 0;
}
.conv-item .title {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.conv-item .name {
  font-weight: 500;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #e5e6eb;
}
.conv-item .time {
  font-size: 12px;
  color: #86909c;
}
.conv-item .desc {
  font-size: 12px;
  color: #86909c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.avatar-badge :deep(.arco-badge-status-dot) {
  width: 8px;
  height: 8px;
}
.contact-tabs {
  display: flex;
  padding: 10px;
  background: #1a1a1a;
  border-bottom: 1px solid #2e2e2e;
  position: sticky;
  top: 0;
  z-index: 10;
}
.contact-tabs .tab-item {
  flex: 1;
  text-align: center;
  font-size: 12px;
  cursor: pointer;
  color: #86909c;
  padding: 4px 0;
  border-radius: 4px;
  transition: all 0.2s;
}
.contact-tabs .tab-item.active {
  background: #2e2e2e;
  color: #07c160;
  font-weight: bold;
}
</style>
