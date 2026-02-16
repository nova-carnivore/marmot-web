<script setup lang="ts">
/**
 * ContactSearch component
 *
 * Global search for contacts and conversations.
 */
import { ref, computed } from 'vue'
import SearchBar from '@/components/common/SearchBar.vue'
import Avatar from '@/components/common/Avatar.vue'
import { useContactsStore } from '@/stores/contacts'
import { useProfilesStore } from '@/stores/profiles'
import { useMessagesStore } from '@/stores/messages'
import { getDisplayName } from '@/utils/nostr'
import { truncate } from '@/utils'
import type { ChatMessage } from '@/types'

const emit = defineEmits<{
  selectContact: [pubkey: string]
  selectMessage: [message: ChatMessage]
}>()

const query = ref('')
const contactsStore = useContactsStore()
const profilesStore = useProfilesStore()
const messagesStore = useMessagesStore()

const matchingContacts = computed(() => {
  if (!query.value) return []
  const q = query.value.toLowerCase()
  return contactsStore.following
    .filter((pk) => {
      const profile = profilesStore.getProfile(pk)
      const name = getDisplayName(profile, pk).toLowerCase()
      return name.includes(q) || pk.includes(q)
    })
    .slice(0, 5)
})

const matchingMessages = computed(() => {
  if (!query.value || query.value.length < 2) return []
  return messagesStore.searchMessages(query.value).slice(0, 10)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <SearchBar v-model="query" placeholder="Search contacts & messages..." />

    <!-- Contact results -->
    <div v-if="matchingContacts.length > 0" class="space-y-1">
      <h3 class="text-xs font-semibold uppercase text-base-content/50 px-2">Contacts</h3>
      <div
        v-for="pubkey in matchingContacts"
        :key="pubkey"
        class="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-base-200"
        @click="emit('selectContact', pubkey)"
      >
        <Avatar
          :src="profilesStore.getProfile(pubkey)?.picture"
          :name="getDisplayName(profilesStore.getProfile(pubkey), pubkey)"
          size="sm"
        />
        <span class="text-sm">{{ getDisplayName(profilesStore.getProfile(pubkey), pubkey) }}</span>
      </div>
    </div>

    <!-- Message results -->
    <div v-if="matchingMessages.length > 0" class="space-y-1">
      <h3 class="text-xs font-semibold uppercase text-base-content/50 px-2">Messages</h3>
      <div
        v-for="msg in matchingMessages"
        :key="msg.id"
        class="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-base-200"
        @click="emit('selectMessage', msg)"
      >
        <Avatar
          :src="profilesStore.getProfile(msg.senderPubkey)?.picture"
          :name="getDisplayName(profilesStore.getProfile(msg.senderPubkey), msg.senderPubkey)"
          size="sm"
        />
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">
            {{ getDisplayName(profilesStore.getProfile(msg.senderPubkey), msg.senderPubkey) }}
          </p>
          <p class="text-xs text-base-content/60 truncate">
            {{ truncate(msg.content, 60) }}
          </p>
        </div>
      </div>
    </div>

    <!-- No results -->
    <div
      v-if="query && matchingContacts.length === 0 && matchingMessages.length === 0"
      class="text-center text-sm text-base-content/50 py-4"
    >
      No results for "{{ query }}"
    </div>
  </div>
</template>
