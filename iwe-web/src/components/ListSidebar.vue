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
              <img v-if="getConvAvatar(conv)" :src="getConvAvatar(conv)" referrerpolicy="no-referrer" loading="lazy" />
              <template v-else>{{ getConvName(conv) ? getConvName(conv)[0] : 'C' }}</template>
            </a-avatar>
          </a-badge>
          <div class="info">
            <div class="title">
              <span class="name">{{ getConvName(conv) }}</span>
              <span class="time">{{ formatTime(conv.time) }}</span>
            </div>
            <div class="desc">
              <span class="desc-text">{{ formatText(conv.lastMsg) }}</span>
              <icon-close class="delete-conv-btn" @click.stop="handleDeleteConv(conv.wxid)" />
            </div>
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
            <a-badge 
              v-if="getContactRelation(contact) !== undefined"
              :text="getRelationText(getContactRelation(contact))"
              :color="getRelationColor(getContactRelation(contact))"
              class="relation-badge"
            >
              <a-avatar :size="42" shape="square" :style="{ backgroundColor: '#337ecc' }">
                <img v-if="visibleAvatars[getContactId(contact)] && accountStore.getContactAvatar(contact)" :src="accountStore.getContactAvatar(contact)" referrerpolicy="no-referrer" loading="lazy" />
                <template v-else>{{ getContactName(contact)[0] }}</template>
              </a-avatar>
            </a-badge>
            <a-avatar v-else :size="42" shape="square" :style="{ backgroundColor: '#337ecc' }">
              <!-- 🚀 优化：只有当该联系人真正进入可见视口，才挂载 <img> 并发起网络请求加载头像 -->
              <img v-if="visibleAvatars[getContactId(contact)] && accountStore.getContactAvatar(contact)" :src="accountStore.getContactAvatar(contact)" referrerpolicy="no-referrer" loading="lazy" />
              <template v-else>{{ getContactName(contact)[0] }}</template>
            </a-avatar>
            <div class="info">
              <div class="title">
                <span class="name">{{ getContactName(contact) }}</span>
              </div>
              <div class="desc">{{ getContactAlias(contact) }}</div>
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
              <img v-if="visibleAvatars[getContactId(contact)] && accountStore.getContactAvatar(contact)" :src="accountStore.getContactAvatar(contact)" referrerpolicy="no-referrer" loading="lazy" />
              <template v-else>{{ getContactName(contact)[0] }}</template>
            </a-avatar>
            <div class="info">
              <div class="title">
                <span class="name">{{ getContactName(contact) }}</span>
              </div>
              <div class="desc">{{ getContactAlias(contact) }}</div>
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
              <img v-if="visibleAvatars[getContactId(contact)] && accountStore.getContactAvatar(contact)" :src="accountStore.getContactAvatar(contact)" referrerpolicy="no-referrer" loading="lazy" />
              <template v-else>{{ getContactName(contact)[0] }}</template>
            </a-avatar>
            <div class="info">
              <div class="title">
                <span class="name">{{ getContactName(contact) }}</span>
              </div>
              <div class="desc">{{ getContactAlias(contact) }}</div>
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
import { IconClose } from '@arco-design/web-vue/es/icon';
import { Message } from '@arco-design/web-vue';
import { contactCache } from '@/utils/contactCache';

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
  const user = c.userName || c.UserName || c.wxid;
  return String((user && typeof user === 'object') ? (user.str || '') : (user || ''));
};

const getContactName = (c: any) => {
  const remark = c.remark || c.Remark;
  const remarkStr = remark && typeof remark === 'object' ? remark.str : remark || '';
  const nick = c.nickName || c.NickName || c.nickname;
  const nickStr = nick && typeof nick === 'object' ? nick.str : nick || '';
  return remarkStr || nickStr || getContactId(c) || '未知';
};

const getContactAlias = (c: any) => {
  if (!c) return '';
  const alias = c.alias || c.Alias;
  const aliasStr = (alias && typeof alias === 'object') ? alias.str : alias;
  if (aliasStr && aliasStr.trim()) return aliasStr.trim();
  return getContactId(c);
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
  if (rawUrl.startsWith('http://')) {
    rawUrl = rawUrl.replace('http://', 'https://');
  }
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
      
      const alias = c.alias || c.Alias;
      const aliasStr = String((alias && typeof alias === 'object') ? alias.str : alias || '').toLowerCase();
      
      return id.includes(q) || aliasStr.includes(q) || name.includes(q) || nickStr.includes(q) || remarkStr.includes(q);
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
      avatar: accountStore.getContactAvatar(detail)
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
        
        const contact = accountStore.contactMap[wxid];
        const isPlaceholder = !contact || contact.isPlaceholder;
        
        // 🚀 核心优化 1：只有在没有资料（完全不存在，或者是占位符）时才触发详情补全接口请求，有详情的联系人跳过请求 API
        if (isPlaceholder) {
          accountStore.enqueueContactDetails(wxid);
        } else {
          // 🚀 核心优化 2：只有是常规可访问的 HTTP 链接才触发本地 Blob 缓存；srt2ihe 这种微信原生不可直连的协议头直接跳过，避免无效 fetch 报错
          const url = contact.smallHeadImgUrl || contact.SmallHeadImgUrl || contact.headImgUrl || contact.HeadImgUrl || contact.avatar || '';
          const rawUrl = typeof url === 'string' ? url.trim().replace(/`/g, '') : '';
          const isHttpUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://');
          if (rawUrl && isHttpUrl) {
            accountStore.getAvatarUrl(rawUrl);
          }
        }
        
        lazyObserver.unobserve(entry.target);
      }
    }
  });
}, { rootMargin: '100px' });

const getContactRelation = (c: any) => {
  return c?.friendRelation;
};

const getRelationText = (r: number | undefined) => {
  if (r === 0) return '陌生';
  if (r === 1) return '好友';
  if (r === 2) return '拉黑';
  if (r === 3) return '被删';
  return '';
};

const getRelationColor = (r: number | undefined) => {
  if (r === 0) return '#ff7d00';
  if (r === 1) return '#00b42a';
  if (r === 2) return '#f53f3f';
  if (r === 3) return '#f53f3f';
  return '#86909c';
};

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

const handleDeleteConv = async (wxid: string) => {
  const userName = accountStore.activeAccountUuid;
  if (!userName) return;
  
  try {
    // 1. 从内存和 IndexedDB 中清理会话记录
    if (chatStore.accountConversations[userName]) {
      chatStore.accountConversations[userName] = chatStore.accountConversations[userName].filter(c => c.wxid !== wxid);
    }
    await contactCache.deleteConversation(wxid, userName);

    // 2. 核心联动：“删除对话框时触发清空资料” -> 彻底清空联系人信息
    // 🚀 【智能守护机制】：
    // A. 如果是正常好友 (friendRelation === 1)，仅关闭对话框并清理聊天记录，保留通讯录好友资料，防止其从好友列表中消失！
    // B. 如果是失效联系人 (对方已删 3 / 对方已拉黑 2 / 陌生人 0 / 临时占位符等)，则触发深度物理清空，抹去本地一切缓存！
    const contact = accountStore.contactMap[wxid];
    const relation = contact?.friendRelation;
    const isPlaceholder = !contact || contact.isPlaceholder;

    if (isPlaceholder || relation === 0 || relation === 2 || relation === 3 || contact?.isDeleted) {
      await accountStore.deleteContact(wxid);
      Message.success('已清空该对话框并彻底清除失效联系人本地缓存');
    } else {
      Message.success('已关闭该对话框（已保留通讯录好友资料）');
    }

    // 3. 如果当前处于该聊天视窗，自动切退
    if (props.activeId === wxid) {
      emit('selectChat', '');
    }
  } catch (err: any) {
    Message.error(`清理失败: ${err.message || err}`);
  }
};
</script>


