<script setup lang="ts">
/**
 * AddMembersDialog component
 *
 * Modal dialog for adding new members to an existing group conversation.
 * Shows contacts that are not yet members and have valid KeyPackages.
 */
import { ref, computed } from 'vue'
import Avatar from '@/components/common/Avatar.vue'
import { useContactsStore } from '@/stores/contacts'
import { useProfilesStore } from '@/stores/profiles'
import { useKeyPackagesStore } from '@/stores/keyPackages'
import { useGroupManagement } from '@/composables/useGroupManagement'
import { getDisplayName, shortenNpub, pubkeyToNpub } from '@/utils/nostr'
import type { Conversation } from '@/types'

const props = defineProps<{
  show: boolean
  conversation: Conversation
}>()

const emit = defineEmits<{
  close: []
  membersAdded: [pubkeys: string[]]
}>()

const contactsStore = useContactsStore()
const profilesStore = useProfilesStore()
const keyPackagesStore = useKeyPackagesStore()
const { addMembers } = useGroupManagement()

const selectedPubkeys = ref<string[]>([])
const status = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const statusMessage = ref('')
const searchQuery = ref('')

/** Contacts that are NOT yet members of this conversation */
const availableContacts = computed(() => {
  const memberSet = new Set(props.conversation.members)
  return contactsStore.following.filter((pk) => !memberSet.has(pk))
})

/** Filter by search query */
const filteredContacts = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return availableContacts.value

  return availableContacts.value.filter((pubkey) => {
    const profile = profilesStore.getProfile(pubkey)
    const name = getDisplayName(profile, pubkey).toLowerCase()
    return name.includes(q) || pubkey.includes(q)
  })
})

/** Sort: contacts with KeyPackages first */
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

function toggleMember(pubkey: string): void {
  const idx = selectedPubkeys.value.indexOf(pubkey)
  if (idx >= 0) {
    selectedPubkeys.value = selectedPubkeys.value.filter((pk) => pk !== pubkey)
  } else {
    selectedPubkeys.value = [...selectedPubkeys.value, pubkey]
  }
}

/** Only members with KeyPackages can be added */
const canAdd = computed(() => {
  return (
    selectedPubkeys.value.length > 0 &&
    selectedPubkeys.value.every((pk) => keyPackagesStore.hasKeyPackage(pk))
  )
})

async function handleAddMembers(): Promise<void> {
  if (!canAdd.value) return

  status.value = 'loading'
  statusMessage.value = `Adding ${selectedPubkeys.value.length} member(s)...`

  try {
    const result = await addMembers(props.conversation.id, selectedPubkeys.value)

    if (result.added.length > 0) {
      status.value = 'success'
      statusMessage.value = `Added ${result.added.length} member(s)!${result.failed.length > 0 ? ` ${result.failed.length} failed.` : ''}`
      emit('membersAdded', result.added)

      setTimeout(() => {
        resetAndClose()
      }, 1500)
    } else {
      status.value = 'error'
      statusMessage.value = 'Failed to add members. Check that they have valid KeyPackages.'
    }
  } catch (err) {
    console.error('[AddMembers] Failed:', err)
    status.value = 'error'
    statusMessage.value = err instanceof Error ? err.message : 'Failed to add members'
  }
}

function resetAndClose(): void {
  selectedPubkeys.value = []
  status.value = 'idle'
  statusMessage.value = ''
  searchQuery.value = ''
  emit('close')
}
</script>

<template>
  <div v-if="show" class="modal modal-open" @click.self="resetAndClose">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg mb-2">➕ Add Members</h3>
      <p class="text-sm text-base-content/60 mb-4">
        Select contacts to add to "{{ conversation.name || 'Group Chat' }}"
      </p>

      <!-- Search -->
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search contacts..."
        class="input input-bordered input-sm w-full mb-3"
        :disabled="status === 'loading'"
      />

      <!-- Selected count -->
      <div v-if="selectedPubkeys.length > 0" class="mb-2">
        <span class="badge badge-primary">{{ selectedPubkeys.length }} selected</span>
      </div>

      <!-- Contact list -->
      <div class="max-h-64 overflow-y-auto border border-base-200 rounded-lg">
        <div
          v-if="sortedContacts.length === 0"
          class="p-4 text-center text-sm text-base-content/50"
        >
          <span v-if="availableContacts.length === 0">
            All your contacts are already members of this group.
          </span>
          <span v-else>
            No contacts match "{{ searchQuery }}"
          </span>
        </div>

        <div
          v-for="pubkey in sortedContacts"
          :key="pubkey"
          class="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-base-200"
          :class="{ 'bg-base-200': selectedPubkeys.includes(pubkey) }"
          @click="keyPackagesStore.hasKeyPackage(pubkey) && toggleMember(pubkey)"
        >
          <Avatar
            :src="profilesStore.getProfile(pubkey)?.picture"
            :name="getDisplayName(profilesStore.getProfile(pubkey), pubkey)"
            size="sm"
          />

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium truncate text-sm">
                {{ getDisplayName(profilesStore.getProfile(pubkey), pubkey) }}
              </span>
              <span
                v-if="keyPackagesStore.hasKeyPackage(pubkey)"
                class="badge badge-success badge-xs"
                title="Has KeyPackage"
              >
                🔐
              </span>
              <span v-else class="badge badge-warning badge-xs" title="No KeyPackage">
                ⚠️
              </span>
            </div>
            <p class="text-xs text-base-content/60 truncate">
              {{ shortenNpub(pubkeyToNpub(pubkey)) }}
            </p>
          </div>

          <input
            type="checkbox"
            class="checkbox checkbox-primary checkbox-sm"
            :checked="selectedPubkeys.includes(pubkey)"
            :disabled="!keyPackagesStore.hasKeyPackage(pubkey)"
            @click.stop
            @change="toggleMember(pubkey)"
          />
        </div>
      </div>

      <!-- Status -->
      <div v-if="statusMessage" class="mt-3">
        <div
          class="alert text-sm"
          :class="{
            'alert-info': status === 'loading',
            'alert-success': status === 'success',
            'alert-error': status === 'error',
          }"
        >
          <span v-if="status === 'loading'" class="loading loading-spinner loading-xs" />
          <span>{{ statusMessage }}</span>
        </div>
      </div>

      <div class="modal-action">
        <button class="btn btn-ghost" @click="resetAndClose" :disabled="status === 'loading'">
          Cancel
        </button>
        <button
          class="btn btn-primary"
          :disabled="!canAdd || status === 'loading'"
          @click="handleAddMembers"
        >
          <span v-if="status === 'loading'" class="loading loading-spinner loading-xs" />
          Add ({{ selectedPubkeys.length }})
        </button>
      </div>
    </div>
  </div>
</template>
