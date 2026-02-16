<script setup lang="ts">
/**
 * MessageThread component
 *
 * Scrollable message thread for the active conversation.
 */
import { computed, ref, nextTick, watch } from 'vue'
import Avatar from '@/components/common/Avatar.vue'
import MediaPreview from './MediaPreview.vue'
import { useMessagesStore } from '@/stores/messages'
import { useProfilesStore } from '@/stores/profiles'
import { useAuthStore } from '@/stores/auth'
import { getDisplayName, formatMessageTime } from '@/utils/nostr'
import type { ChatMessage } from '@/types'

const props = defineProps<{
  conversationId: string
}>()

const messagesStore = useMessagesStore()
const profilesStore = useProfilesStore()
const authStore = useAuthStore()
const threadEl = ref<HTMLElement | null>(null)

const messages = computed(() => messagesStore.getMessages(props.conversationId))

/** Group consecutive messages by same sender within 5 minutes */
const groupedMessages = computed(() => {
  const groups: Array<{
    senderPubkey: string
    messages: ChatMessage[]
    isOwn: boolean
  }> = []

  for (const msg of messages.value) {
    const lastGroup = groups[groups.length - 1]
    const isOwn = msg.senderPubkey === authStore.pubkey

    if (
      lastGroup &&
      lastGroup.senderPubkey === msg.senderPubkey &&
      msg.createdAt - lastGroup.messages[lastGroup.messages.length - 1].createdAt < 300
    ) {
      lastGroup.messages.push(msg)
    } else {
      groups.push({
        senderPubkey: msg.senderPubkey,
        messages: [msg],
        isOwn,
      })
    }
  }

  return groups
})

/** Auto-scroll to bottom on new messages */
watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    if (threadEl.value) {
      threadEl.value.scrollTop = threadEl.value.scrollHeight
    }
  },
)

function getSenderName(pubkey: string): string {
  return getDisplayName(profilesStore.getProfile(pubkey), pubkey)
}

function getSenderPicture(pubkey: string): string | undefined {
  return profilesStore.getProfile(pubkey)?.picture
}
</script>

<template>
  <div ref="threadEl" class="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
    <!-- Empty state -->
    <div
      v-if="messages.length === 0"
      class="flex flex-col items-center justify-center h-full text-base-content/40"
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
          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
        />
      </svg>
      <p>No messages yet. Say hello! 🦫</p>
    </div>

    <!-- Message groups -->
    <div
      v-for="(group, gIdx) in groupedMessages"
      :key="gIdx"
      class="flex gap-2"
      :class="{ 'flex-row-reverse': group.isOwn }"
    >
      <!-- Avatar (only for non-own messages) -->
      <div v-if="!group.isOwn" class="shrink-0 self-end">
        <Avatar
          :src="getSenderPicture(group.senderPubkey)"
          :name="getSenderName(group.senderPubkey)"
          size="sm"
        />
      </div>

      <!-- Messages -->
      <div class="flex flex-col gap-0.5 max-w-[70%]" :class="{ 'items-end': group.isOwn }">
        <!-- Sender name (group chats, non-own) -->
        <span
          v-if="
            (!group.isOwn && gIdx === 0) ||
            (gIdx > 0 && groupedMessages[gIdx - 1]?.senderPubkey !== group.senderPubkey)
          "
          class="text-xs font-medium text-primary px-2"
        >
          {{ getSenderName(group.senderPubkey) }}
        </span>

        <div
          v-for="msg in group.messages"
          :key="msg.id"
          class="chat"
          :class="group.isOwn ? 'chat-end' : 'chat-start'"
        >
          <div
            class="chat-bubble"
            :class="{
              'chat-bubble-primary': group.isOwn,
              'opacity-60': msg.status === 'sending',
              'chat-bubble-error': msg.status === 'failed',
            }"
          >
            <!-- Media attachments -->
            <MediaPreview v-if="msg.media && msg.media.length > 0" :attachments="msg.media" />

            <!-- Text content -->
            <p v-if="msg.content" class="whitespace-pre-wrap break-words">
              {{ msg.content }}
            </p>

            <!-- Status & time -->
            <div
              class="flex items-center gap-1 mt-1"
              :class="group.isOwn ? 'justify-end' : 'justify-start'"
            >
              <span class="text-[10px] opacity-60">
                {{ formatMessageTime(msg.createdAt) }}
              </span>
              <!-- Send status -->
              <span v-if="group.isOwn && msg.status === 'sending'" class="text-[10px] opacity-50"
                >⏳</span
              >
              <span v-else-if="group.isOwn && msg.status === 'sent'" class="text-[10px] opacity-60"
                >✓</span
              >
              <span
                v-else-if="group.isOwn && msg.status === 'failed'"
                class="text-[10px] text-error"
                >✕</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
