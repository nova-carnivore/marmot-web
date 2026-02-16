<script setup lang="ts">
/**
 * Chat page
 *
 * Main two-column chat layout: conversations list | active conversation.
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import ConversationList from '@/components/chat/ConversationList.vue'
import MessageThread from '@/components/chat/MessageThread.vue'
import MessageComposer from '@/components/chat/MessageComposer.vue'
import ContactKeyPackageSelector from '@/components/chat/ContactKeyPackageSelector.vue'
import ContactList from '@/components/contacts/ContactList.vue'
import ContactSearch from '@/components/contacts/ContactSearch.vue'
import Avatar from '@/components/common/Avatar.vue'
import { useAuthStore } from '@/stores/auth'
import { useConversationsStore } from '@/stores/conversations'
import { useProfilesStore } from '@/stores/profiles'
import { useRelaysStore } from '@/stores/relays'
import { useKeyPackagesStore } from '@/stores/keyPackages'
import { useNostr } from '@/composables/useNostr'
import { useMarmot } from '@/composables/useMarmot'
import { useKeyPackages } from '@/composables/useKeyPackages'
import { getDisplayName } from '@/utils/nostr'
import { DEFAULT_RELAYS } from '@/types'
import type { Conversation } from '@/types'
import { unwrapWelcome, parseWelcomeEvent } from 'marmot-ts/mip02'
import type { Event as NostrEvent } from 'nostr-tools'

const router = useRouter()
const authStore = useAuthStore()
const conversationsStore = useConversationsStore()
const profilesStore = useProfilesStore()
const relaysStore = useRelaysStore()
const keyPackagesStore = useKeyPackagesStore()
const {
  fetchContacts,
  fetchUserRelays,
  syncRelayStatus,
  ensureRelayConnections,
  subscribeToWelcomes,
} = useNostr()
const { createGroup, sendMessage, handleWelcome } = useMarmot()
const { checkKeyPackages } = useKeyPackages()

// UI state
const sidebarView = ref<'chats' | 'contacts' | 'search' | 'newGroup'>('chats')
const showGroupModal = ref(false)
const newGroupName = ref('')
const newGroupDescription = ref('')
const selectedMembers = ref<string[]>([])
/** Per-member selected KeyPackage IDs: pubkey -> eventId[] */
const selectedKeyPackages = ref<Record<string, string[]>>({})
const mobileShowChat = ref(false)

const activeConversation = computed(() => conversationsStore.activeConversation)

/** Initialize data on mount */
onMounted(async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }

  const pubkey = authStore.pubkey!

  // Fetch user's relay list
  await fetchUserRelays(pubkey)

  // Fetch contacts
  await fetchContacts(pubkey)

  // Check KeyPackages for contacts
  const contacts = (await import('@/stores/contacts')).useContactsStore()
  if (contacts.following.length > 0) {
    await checkKeyPackages(contacts.following)
  }

  // Eagerly connect to all relays and sync status to UI
  await ensureRelayConnections()

  // Periodically sync relay status (every 10 seconds)
  relayStatusInterval = window.setInterval(() => {
    syncRelayStatus()
  }, 10000)

  // Subscribe to Welcome events (MIP-02)
  console.log('[Chat] Subscribing to Welcome events...')
  welcomeSubscription = subscribeToWelcomes(async (event: NostrEvent) => {
    console.log('[Chat] Received Welcome event:', event.id)
    try {
      // Get signer to unwrap NIP-59 gift wrap
      const signer = authStore.signer
      if (!signer) {
        console.error('[Chat] No signer available')
        return
      }

      // Unwrap the gift-wrapped Welcome
      const welcomeRumor = await unwrapWelcome(signer, event)
      console.log('[Chat] Unwrapped Welcome rumor:', welcomeRumor)
      console.log('[Chat] Welcome rumor tags:', JSON.stringify(welcomeRumor.tags))

      // Parse the Welcome rumor using marmot-ts
      const parsed = parseWelcomeEvent(welcomeRumor)
      console.log('[Chat] Parsed Welcome:', {
        keyPackageEventId: parsed.keyPackageEventId,
        welcomeDataLen: parsed.welcomeData.length,
        relays: parsed.relays,
      })

      // Process the Welcome with MLS
      const conversation = await handleWelcome(
        parsed.welcomeData,
        parsed.keyPackageEventId,
        parsed.relays,
      )

      if (conversation) {
        console.log('[Chat] Welcome processed successfully — group joined!', conversation.id)
        // Optionally switch to the new conversation
        conversationsStore.setActive(conversation.id)
      } else {
        console.error('[Chat] Failed to create conversation from Welcome')
      }
    } catch (err) {
      console.error('[Chat] Failed to process Welcome:', err)
    }
  })
})

// Relay status polling interval
let relayStatusInterval: number | undefined
let welcomeSubscription: { close(): void } | undefined

onUnmounted(() => {
  if (relayStatusInterval) {
    clearInterval(relayStatusInterval)
  }
  if (welcomeSubscription) {
    welcomeSubscription.close()
  }
})

// On conversation change, show chat panel on mobile
watch(
  () => conversationsStore.activeConversationId,
  (id) => {
    if (id) mobileShowChat.value = true
  },
)

/** Get conversation header info */
function getConversationName(conv: Conversation): string {
  if (conv.name) return conv.name
  if (conv.members.length === 2) {
    const other = conv.members.find((pk) => pk !== authStore.pubkey)
    if (other) return getDisplayName(profilesStore.getProfile(other), other)
  }
  return 'Group Chat'
}

function getConversationSubtitle(conv: Conversation): string {
  return `${conv.members.length} members`
}

/** Handle sending a message */
async function handleSendMessage(content: string): Promise<void> {
  if (!activeConversation.value) return
  try {
    await sendMessage(activeConversation.value.id, content)
  } catch (err) {
    console.error('Failed to send message:', err)
  }
}

/** Handle starting a 1:1 chat */
async function handleStartChat(pubkey: string): Promise<void> {
  const conversation = await createGroup({
    name: '',
    memberPubkeys: [pubkey],
    relays: relaysStore.allRelayUrls.length > 0 ? relaysStore.allRelayUrls : DEFAULT_RELAYS,
  })
  conversationsStore.setActive(conversation.id)
  sidebarView.value = 'chats'
}

/** Handle creating a group */
async function handleCreateGroup(): Promise<void> {
  if (!newGroupName.value || selectedMembers.value.length === 0) return

  const conversation = await createGroup({
    name: newGroupName.value,
    description: newGroupDescription.value,
    memberPubkeys: selectedMembers.value,
    relays: relaysStore.allRelayUrls.length > 0 ? relaysStore.allRelayUrls : DEFAULT_RELAYS,
  })

  conversationsStore.setActive(conversation.id)
  showGroupModal.value = false
  newGroupName.value = ''
  newGroupDescription.value = ''
  selectedMembers.value = []
  selectedKeyPackages.value = {}
  sidebarView.value = 'chats'
}

function toggleMember(pubkey: string): void {
  const idx = selectedMembers.value.indexOf(pubkey)
  if (idx >= 0) {
    selectedMembers.value = selectedMembers.value.filter((pk) => pk !== pubkey)
    // Clean up KeyPackage selection for removed member
    const { [pubkey]: _, ...rest } = selectedKeyPackages.value
    selectedKeyPackages.value = rest
  } else {
    selectedMembers.value = [...selectedMembers.value, pubkey]
  }
}

function updateMemberKeyPackages(pubkey: string, keyPackageIds: string[]): void {
  selectedKeyPackages.value = { ...selectedKeyPackages.value, [pubkey]: keyPackageIds }
}

/** Check if any selected member has no KeyPackages selected */
const hasInvalidMembers = computed(() => {
  return selectedMembers.value.some((pk) => {
    const kps = keyPackagesStore.getKeyPackagesForPubkey(pk)
    return kps.length === 0
  })
})

/** Members that have no KeyPackages at all */
const membersWithoutKeyPackages = computed(() => {
  return selectedMembers.value.filter((pk) => {
    const kps = keyPackagesStore.getKeyPackagesForPubkey(pk)
    return kps.length === 0
  })
})

function goBack(): void {
  mobileShowChat.value = false
  conversationsStore.setActive(null)
}

function navigateToSettings(): void {
  router.push('/settings')
}

function openNewGroup(): void {
  showGroupModal.value = true
  sidebarView.value = 'newGroup'
}

function logout(): void {
  authStore.disconnect()
  router.push('/login')
}
</script>

<template>
  <div class="h-screen flex bg-base-100">
    <!-- Left Sidebar -->
    <div
      class="w-80 border-r border-base-200 flex flex-col shrink-0"
      :class="{ 'hidden md:flex': mobileShowChat }"
    >
      <!-- Sidebar header -->
      <div class="flex items-center justify-between p-3 border-b border-base-200">
        <div class="dropdown">
          <div tabindex="0" role="button" class="btn btn-ghost btn-sm btn-circle">
            <svg
              class="w-5 h-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </div>
          <ul
            tabindex="0"
            class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-50"
          >
            <li>
              <a @click="sidebarView = 'contacts'"> 👥 Contacts </a>
            </li>
            <li>
              <a @click="openNewGroup"> ➕ New Group </a>
            </li>
            <li>
              <a @click="sidebarView = 'search'"> 🔍 Search </a>
            </li>
            <li>
              <a @click="navigateToSettings"> ⚙️ Settings </a>
            </li>
            <li class="text-error">
              <a @click="logout"> 🚪 Logout </a>
            </li>
          </ul>
        </div>

        <h2 class="font-semibold text-lg">
          {{
            sidebarView === 'chats'
              ? 'Chats'
              : sidebarView === 'contacts'
                ? 'Contacts'
                : sidebarView === 'search'
                  ? 'Search'
                  : 'New Group'
          }}
        </h2>

        <div class="flex items-center gap-1">
          <button
            v-if="sidebarView !== 'chats'"
            class="btn btn-ghost btn-sm btn-circle"
            @click="sidebarView = 'chats'"
          >
            ←
          </button>

          <!-- Relay status indicator -->
          <div
            class="badge badge-sm gap-1"
            :class="relaysStore.connectedCount > 0 ? 'badge-success' : 'badge-error'"
            :title="`${relaysStore.connectedCount} relays connected`"
          >
            📡 {{ relaysStore.connectedCount }}
          </div>
        </div>
      </div>

      <!-- Sidebar content -->
      <div class="flex-1 overflow-hidden">
        <!-- Chats view -->
        <ConversationList v-if="sidebarView === 'chats'" />

        <!-- Contacts view -->
        <ContactList v-else-if="sidebarView === 'contacts'" @start-chat="handleStartChat" />

        <!-- Search view -->
        <div v-else-if="sidebarView === 'search'" class="p-3">
          <ContactSearch
            @select-contact="handleStartChat"
            @select-message="(msg) => conversationsStore.setActive(msg.conversationId)"
          />
        </div>

        <!-- New Group view -->
        <div v-else-if="sidebarView === 'newGroup'" class="flex flex-col h-full">
          <div class="p-3 space-y-3">
            <input
              v-model="newGroupName"
              type="text"
              placeholder="Group name"
              class="input input-bordered w-full"
            />
            <textarea
              v-model="newGroupDescription"
              placeholder="Description (optional)"
              class="textarea textarea-bordered w-full"
              rows="2"
            />
            <p class="text-sm text-base-content/60">
              Select members ({{ selectedMembers.length }} selected):
            </p>
          </div>

          <!-- Selected members' KeyPackage selection -->
          <div v-if="selectedMembers.length > 0" class="px-3 pb-2 border-b border-base-200">
            <p class="text-xs font-semibold text-base-content/70 mb-1">Device selection:</p>
            <ContactKeyPackageSelector
              v-for="pubkey in selectedMembers"
              :key="pubkey"
              :contact-pubkey="pubkey"
              @update:selected="(ids) => updateMemberKeyPackages(pubkey, ids)"
            />
            <div
              v-if="membersWithoutKeyPackages.length > 0"
              class="alert alert-warning text-xs mt-2 py-2"
            >
              ⚠️ {{ membersWithoutKeyPackages.length }} member(s) cannot be invited — no KeyPackages
              available.
            </div>
          </div>

          <div class="flex-1 overflow-y-auto">
            <ContactList selectable :selected-pubkeys="selectedMembers" @select="toggleMember" />
          </div>
          <div class="p-3 border-t border-base-200">
            <button
              class="btn btn-primary w-full"
              :disabled="!newGroupName.trim() || selectedMembers.length === 0 || hasInvalidMembers"
              @click="handleCreateGroup"
            >
              Create Group ({{ selectedMembers.length }} members)
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Panel: Active Conversation -->
    <div class="flex-1 flex flex-col" :class="{ 'hidden md:flex': !mobileShowChat }">
      <template v-if="activeConversation">
        <!-- Conversation header -->
        <div class="flex items-center gap-3 p-3 border-b border-base-200 bg-base-100">
          <!-- Back button (mobile) -->
          <button class="btn btn-ghost btn-sm btn-circle md:hidden" @click="goBack">←</button>

          <Avatar
            :src="activeConversation.imageUrl"
            :name="getConversationName(activeConversation)"
            size="sm"
          />

          <div class="flex-1 min-w-0">
            <h3 class="font-semibold truncate">
              {{ getConversationName(activeConversation) }}
            </h3>
            <p class="text-xs text-base-content/50">
              {{ getConversationSubtitle(activeConversation) }}
            </p>
          </div>

          <!-- Group info dropdown -->
          <div class="dropdown dropdown-end">
            <div tabindex="0" role="button" class="btn btn-ghost btn-sm btn-circle">
              <svg
                class="w-5 h-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </div>
            <ul
              tabindex="0"
              class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-50"
            >
              <li>
                <a>👥 Members ({{ activeConversation.members.length }})</a>
              </li>
              <li v-if="activeConversation.isAdmin">
                <a>➕ Add Member</a>
              </li>
              <li class="text-error">
                <a>🚪 Leave Group</a>
              </li>
            </ul>
          </div>
        </div>

        <!-- Messages -->
        <MessageThread :conversation-id="activeConversation.id" />

        <!-- Composer -->
        <MessageComposer
          @send="handleSendMessage"
          @attach-file="(file) => console.log('TODO: upload', file.name)"
        />
      </template>

      <!-- Empty state: no conversation selected -->
      <div v-else class="flex-1 flex flex-col items-center justify-center text-base-content/40">
        <div class="text-8xl mb-4">🦫</div>
        <h2 class="text-2xl font-semibold mb-2">Marmot Web</h2>
        <p class="text-center max-w-md">
          Select a conversation or start a new chat.<br />
          End-to-end encrypted with MLS + Nostr.
        </p>
      </div>
    </div>
  </div>
</template>
