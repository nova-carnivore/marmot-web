/**
 * Conversations Store
 *
 * Manages chat conversations (groups and 1:1).
 *
 * NOTE: We use direct Vue reactivity (spread/assign) instead of Immer's produce().
 * Immer's proxy-based drafts conflict with Vue's reactive proxy system,
 * causing "get on proxy: property X is read-only" errors on nested objects.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Conversation, MessagePreview } from '@/types'
import { saveMlsState, loadMlsState, removeMlsState } from '@/services/mlsStorage'
import { deriveExporterSecret } from 'marmot-ts/mls'
import type { ClientState } from 'marmot-ts/mls'

/** Runtime cache of MLS ClientState objects (not serializable, not persisted via Pinia) */
const mlsStates = new Map<string, ClientState>()

export const useConversationsStore = defineStore('conversations', () => {
  // State
  const conversations = ref<Record<string, Conversation>>({})
  const activeConversationId = ref<string | null>(null)
  const loading = ref(false)

  // Getters
  /** Sorted conversation list (most recent first) */
  const sortedConversations = computed(() => {
    return Object.values(conversations.value).sort((a, b) => b.updatedAt - a.updatedAt)
  })

  /** Get the active conversation */
  const activeConversation = computed((): Conversation | undefined => {
    if (!activeConversationId.value) return undefined
    return conversations.value[activeConversationId.value]
  })

  /** Total unread count across all conversations */
  const totalUnread = computed(() => {
    return Object.values(conversations.value).reduce((sum, c) => sum + c.unreadCount, 0)
  })

  /**
   * Add or update a conversation.
   */
  function upsertConversation(conversation: Conversation): void {
    conversations.value = {
      ...conversations.value,
      [conversation.id]: { ...conversation },
    }
  }

  /**
   * Remove a conversation.
   */
  function removeConversation(id: string): void {
    const { [id]: _removed, ...rest } = conversations.value
    conversations.value = rest
    mlsStates.delete(id)
    removeMlsState(id).catch((err) => {
      console.warn(`[Conversations] Failed to remove MLS state for ${id}:`, err)
    })
    if (activeConversationId.value === id) {
      activeConversationId.value = null
    }
  }

  /**
   * Set the active conversation.
   */
  function setActive(id: string | null): void {
    activeConversationId.value = id
    // Clear unread count when opening
    if (id && conversations.value[id]) {
      const conv = conversations.value[id]
      conversations.value = {
        ...conversations.value,
        [id]: { ...conv, unreadCount: 0 },
      }
    }
  }

  /**
   * Update last message preview.
   */
  function updateLastMessage(conversationId: string, preview: MessagePreview): void {
    const conv = conversations.value[conversationId]
    if (!conv) return

    const unreadCount =
      activeConversationId.value !== conversationId ? conv.unreadCount + 1 : conv.unreadCount

    conversations.value = {
      ...conversations.value,
      [conversationId]: {
        ...conv,
        lastMessage: { ...preview },
        updatedAt: preview.timestamp,
        unreadCount,
      },
    }
  }

  /**
   * Update members list.
   */
  function updateMembers(conversationId: string, members: string[]): void {
    const conv = conversations.value[conversationId]
    if (!conv) return

    conversations.value = {
      ...conversations.value,
      [conversationId]: { ...conv, members: [...members] },
    }
  }

  // ─── MLS State Management ──────────────────────────────────────────────

  /**
   * Store MLS ClientState for a conversation (runtime cache + IndexedDB).
   */
  async function setMlsState(
    conversationId: string,
    state: ClientState,
    encodedState: Uint8Array,
    exporterSecret: Uint8Array,
  ): Promise<void> {
    mlsStates.set(conversationId, state)

    // Update conversation with MLS metadata
    const conv = conversations.value[conversationId]
    if (conv) {
      conversations.value = {
        ...conversations.value,
        [conversationId]: {
          ...conv,
          exporterSecret,
          hasMlsSession: true,
          mlsGroupId: state.groupContext.groupId,
        },
      }
    }

    // Persist to IndexedDB
    await saveMlsState(conversationId, encodedState)
  }

  /**
   * Get the MLS ClientState for a conversation.
   * Loads from IndexedDB if not in runtime cache.
   */
  async function getMlsState(conversationId: string): Promise<ClientState | null> {
    // Check runtime cache first
    const cached = mlsStates.get(conversationId)
    if (cached) return cached

    // Load from IndexedDB
    const state = await loadMlsState(conversationId)
    if (state) {
      mlsStates.set(conversationId, state)

      // Restore exporter secret to conversation
      try {
        const exporterSecret = await deriveExporterSecret(state)
        const conv = conversations.value[conversationId]
        if (conv) {
          conversations.value = {
            ...conversations.value,
            [conversationId]: {
              ...conv,
              exporterSecret,
              hasMlsSession: true,
            },
          }
        }
      } catch (err) {
        console.warn(`[Conversations] Failed to derive exporter secret for ${conversationId}:`, err)
      }
    }

    return state
  }

  /**
   * Check if a conversation has an MLS state (cached).
   */
  function hasMlsState(conversationId: string): boolean {
    return mlsStates.has(conversationId)
  }

  /**
   * Restore MLS states for all conversations on app load.
   */
  async function restoreAllMlsStates(): Promise<void> {
    const convIds = Object.keys(conversations.value)
    for (const id of convIds) {
      const conv = conversations.value[id]
      if (conv.hasMlsSession) {
        await getMlsState(id)
      }
    }
  }

  return {
    conversations,
    activeConversationId,
    loading,
    sortedConversations,
    activeConversation,
    totalUnread,
    upsertConversation,
    removeConversation,
    setActive,
    updateLastMessage,
    updateMembers,
    // MLS state management
    setMlsState,
    getMlsState,
    hasMlsState,
    restoreAllMlsStates,
  }
})
