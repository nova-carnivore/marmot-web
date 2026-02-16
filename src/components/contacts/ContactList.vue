<script setup lang="ts">
/**
 * ContactList component
 *
 * Displays the user's following list with search and KeyPackage status.
 */
import { computed, ref } from 'vue'
import SearchBar from '@/components/common/SearchBar.vue'
import ContactCard from './ContactCard.vue'
import { useContactsStore } from '@/stores/contacts'
import { useProfilesStore } from '@/stores/profiles'
import { useKeyPackagesStore } from '@/stores/keyPackages'
import { getDisplayName } from '@/utils/nostr'

defineProps<{
  selectable?: boolean
  selectedPubkeys?: string[]
}>()

const emit = defineEmits<{
  select: [pubkey: string]
  startChat: [pubkey: string]
}>()

const contactsStore = useContactsStore()
const profilesStore = useProfilesStore()
const keyPackagesStore = useKeyPackagesStore()
const searchQuery = ref('')

/** Filter contacts by search query (matches name, npub) */
const filteredContacts = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return contactsStore.following

  return contactsStore.following.filter((pubkey) => {
    const profile = profilesStore.getProfile(pubkey)
    const name = getDisplayName(profile, pubkey).toLowerCase()
    return name.includes(q) || pubkey.includes(q)
  })
})

/** Sort: contacts with KeyPackages first, then alphabetically */
const sortedContacts = computed(() => {
  return [...filteredContacts.value].sort((a, b) => {
    const aHasKP = keyPackagesStore.hasKeyPackage(a) ? 0 : 1
    const bHasKP = keyPackagesStore.hasKeyPackage(b) ? 0 : 1
    if (aHasKP !== bHasKP) return aHasKP - bHasKP

    const aName = getDisplayName(profilesStore.getProfile(a), a)
    const bName = getDisplayName(profilesStore.getProfile(b), b)
    return aName.localeCompare(bName)
  })
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-3">
      <SearchBar v-model="searchQuery" placeholder="Search contacts..." />
    </div>

    <div v-if="contactsStore.loading" class="flex items-center justify-center p-8">
      <span class="loading loading-spinner loading-md" />
    </div>

    <div
      v-else-if="sortedContacts.length === 0"
      class="flex flex-col items-center justify-center p-8 text-base-content/50"
    >
      <svg
        class="w-12 h-12 mb-2"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
      <p v-if="searchQuery">No contacts found for "{{ searchQuery }}"</p>
      <p v-else>No contacts yet</p>
    </div>

    <div v-else class="flex-1 overflow-y-auto scrollbar-thin">
      <ContactCard
        v-for="pubkey in sortedContacts"
        :key="pubkey"
        :pubkey="pubkey"
        :selectable="selectable"
        :selected="selectedPubkeys?.includes(pubkey)"
        @click="emit('select', pubkey)"
        @start-chat="emit('startChat', pubkey)"
      />
    </div>

    <div class="p-2 text-xs text-center text-base-content/40 border-t border-base-200">
      {{ contactsStore.contactCount }} contacts
    </div>
  </div>
</template>
