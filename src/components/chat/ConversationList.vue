<script setup lang="ts">
/**
 * ConversationList component
 *
 * Telegram-style left sidebar with conversation previews.
 */
import { computed } from 'vue'
import Avatar from '@/components/common/Avatar.vue'
import { useConversationsStore } from '@/stores/conversations'
import { useProfilesStore } from '@/stores/profiles'
import { getDisplayName, formatTimestamp } from '@/utils/nostr'
import { truncate } from '@/utils'
import type { Conversation } from '@/types'

const conversationsStore = useConversationsStore()
const profilesStore = useProfilesStore()

const conversations = computed(() => conversationsStore.sortedConversations)

function getConversationAvatar(conv: Conversation): string | undefined {
  if (conv.imageUrl) return conv.imageUrl
  // For 1:1, show the other member's avatar
  if (conv.members.length === 2) {
    const otherPubkey = conv.members.find((pk) => pk !== conv.admins[0])
    if (otherPubkey) return profilesStore.getProfile(otherPubkey)?.picture
  }
  return undefined
}

function getConversationName(conv: Conversation): string {
  if (conv.name) return conv.name
  // For 1:1, show the other member's name
  if (conv.members.length === 2) {
    const otherPubkey = conv.members.find((pk) => pk !== conv.admins[0])
    if (otherPubkey) return getDisplayName(profilesStore.getProfile(otherPubkey), otherPubkey)
  }
  return 'Group Chat'
}

function getLastMessageSender(conv: Conversation): string {
  if (!conv.lastMessage) return ''
  const profile = profilesStore.getProfile(conv.lastMessage.senderPubkey)
  return getDisplayName(profile, conv.lastMessage.senderPubkey)
}

function selectConversation(id: string): void {
  conversationsStore.setActive(id)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Empty state -->
    <div
      v-if="conversations.length === 0"
      class="flex flex-col items-center justify-center flex-1 p-6 text-base-content/50"
    >
      <svg
        class="w-16 h-16 mb-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
      <p class="text-center">
        No conversations yet.<br />
        Start a chat from your contacts!
      </p>
    </div>

    <!-- Conversation list -->
    <div v-else class="flex-1 overflow-y-auto scrollbar-thin">
      <div
        v-for="conv in conversations"
        :key="conv.id"
        class="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-base-200"
        :class="{ 'bg-primary/10': conversationsStore.activeConversationId === conv.id }"
        role="button"
        :aria-label="`Conversation: ${getConversationName(conv)}`"
        tabindex="0"
        @click="selectConversation(conv.id)"
        @keydown.enter="selectConversation(conv.id)"
      >
        <!-- Avatar -->
        <Avatar :src="getConversationAvatar(conv)" :name="getConversationName(conv)" size="md" />

        <!-- Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <span class="font-medium truncate">{{ getConversationName(conv) }}</span>
            <span v-if="conv.lastMessage" class="text-xs text-base-content/50 shrink-0 ml-2">
              {{ formatTimestamp(conv.lastMessage.timestamp) }}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <p v-if="conv.lastMessage" class="text-sm text-base-content/60 truncate">
              <span v-if="conv.members.length > 2" class="font-medium">
                {{ getLastMessageSender(conv) }}:
              </span>
              {{ truncate(conv.lastMessage.content, 40) }}
            </p>
            <p v-else class="text-sm text-base-content/40 italic">No messages</p>
            <!-- Unread badge -->
            <span v-if="conv.unreadCount > 0" class="badge badge-primary badge-sm ml-2 shrink-0">
              {{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
