<script setup lang="ts">
/**
 * AddContactDialog component
 *
 * Dialog for adding a new contact by npub or hex pubkey.
 * Publishes a kind:3 follow event and fetches profile + KeyPackages.
 */
import { ref, computed } from 'vue'
import { nip19 } from 'nostr-tools'
import { useAuthStore } from '@/stores/auth'
import { useContactsStore } from '@/stores/contacts'
import { useNostr } from '@/composables/useNostr'
import { isValidHexPubkey } from '@/utils/nostr'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  added: [pubkey: string]
}>()

const authStore = useAuthStore()
const contactsStore = useContactsStore()
const { publishEvent, fetchProfiles, fetchKeyPackages } = useNostr()

const npubInput = ref('')
const status = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const statusMessage = ref('')

/** Validate input and extract pubkey */
const parsedPubkey = computed((): string | null => {
  const input = npubInput.value.trim()
  if (!input) return null

  // Try npub
  if (input.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(input)
      if (decoded.type === 'npub') {
        return decoded.data as string
      }
    } catch {
      return null
    }
  }

  // Try hex
  if (isValidHexPubkey(input)) {
    return input
  }

  return null
})

const isValidInput = computed(() => parsedPubkey.value !== null)

const isAlreadyFollowing = computed(() => {
  if (!parsedPubkey.value) return false
  return contactsStore.following.includes(parsedPubkey.value)
})

const isSelf = computed(() => {
  if (!parsedPubkey.value) return false
  return parsedPubkey.value === authStore.pubkey
})

async function addContact(): Promise<void> {
  const pubkey = parsedPubkey.value
  if (!pubkey) return

  if (isSelf.value) {
    status.value = 'error'
    statusMessage.value = 'You cannot add yourself as a contact.'
    return
  }

  if (isAlreadyFollowing.value) {
    status.value = 'error'
    statusMessage.value = 'You are already following this contact.'
    return
  }

  if (!authStore.signer) {
    status.value = 'error'
    statusMessage.value = 'No signer available. Please re-authenticate.'
    return
  }

  status.value = 'loading'
  statusMessage.value = 'Publishing follow event...'

  try {
    // Build kind:3 follow event with all existing follows + new one
    const existingFollows = contactsStore.following
    const newFollows = [...existingFollows, pubkey]

    const followEvent = {
      kind: 3,
      pubkey: authStore.pubkey!,
      created_at: Math.floor(Date.now() / 1000),
      tags: newFollows.map((p: string) => ['p', p]),
      content: '',
    }

    const signed = await authStore.signer.signEvent(followEvent)
    await publishEvent(signed as unknown as import('nostr-tools').Event)
    console.log('[AddContact] Follow event published for', pubkey.slice(0, 12))

    // Update local store
    contactsStore.addContact(pubkey)

    // Fetch profile + KeyPackages for the new contact
    statusMessage.value = 'Fetching profile & KeyPackages...'
    await Promise.allSettled([
      fetchProfiles([pubkey]),
      fetchKeyPackages([pubkey]),
    ])

    status.value = 'success'
    statusMessage.value = 'Contact added! You can now start a chat.'

    emit('added', pubkey)

    // Auto-close after success
    setTimeout(() => {
      resetAndClose()
    }, 1500)
  } catch (err) {
    console.error('[AddContact] Failed:', err)
    status.value = 'error'
    statusMessage.value = err instanceof Error ? err.message : 'Failed to add contact'
  }
}

function resetAndClose(): void {
  npubInput.value = ''
  status.value = 'idle'
  statusMessage.value = ''
  emit('close')
}
</script>

<template>
  <div v-if="show" class="modal modal-open" @click.self="resetAndClose">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg mb-4">➕ Add Contact</h3>

      <div class="form-control w-full">
        <label class="label">
          <span class="label-text">Enter npub or hex pubkey</span>
        </label>
        <input
          v-model="npubInput"
          type="text"
          placeholder="npub1... or 64-character hex"
          class="input input-bordered w-full font-mono text-sm"
          :class="{
            'input-error': npubInput.trim() && !isValidInput,
            'input-success': isValidInput && !isAlreadyFollowing && !isSelf,
            'input-warning': isAlreadyFollowing || isSelf,
          }"
          :disabled="status === 'loading'"
          @keydown.enter="isValidInput && !isAlreadyFollowing && !isSelf && addContact()"
        />
        <label v-if="npubInput.trim() && !isValidInput" class="label">
          <span class="label-text-alt text-error">Invalid format. Use npub1... or 64-char hex.</span>
        </label>
        <label v-else-if="isAlreadyFollowing" class="label">
          <span class="label-text-alt text-warning">Already following this contact.</span>
        </label>
        <label v-else-if="isSelf" class="label">
          <span class="label-text-alt text-warning">That's your own pubkey.</span>
        </label>
      </div>

      <!-- Status message -->
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
          :disabled="!isValidInput || isAlreadyFollowing || isSelf || status === 'loading'"
          @click="addContact"
        >
          <span v-if="status === 'loading'" class="loading loading-spinner loading-xs" />
          Add Contact
        </button>
      </div>
    </div>
  </div>
</template>
