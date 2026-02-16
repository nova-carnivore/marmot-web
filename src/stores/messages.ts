/**
 * Messages Store
 *
 * Manages chat messages per conversation.
 *
 * Uses direct Vue reactivity instead of Immer to avoid proxy conflicts.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatMessage } from '@/types'

export const useMessagesStore = defineStore('messages', () => {
  // State: conversationId -> messages[]
  const messages = ref<Record<string, ChatMessage[]>>({})
  const loading = ref(false)

  // Getters
  /** Get messages for a conversation, sorted by timestamp */
  const getMessages = computed(() => {
    return (conversationId: string): ChatMessage[] => {
      const msgs = messages.value[conversationId]
      if (!msgs) return []
      return [...msgs].sort((a, b) => a.createdAt - b.createdAt)
    }
  })

  /** Get the latest message for a conversation */
  const getLatestMessage = computed(() => {
    return (conversationId: string): ChatMessage | undefined => {
      const msgs = messages.value[conversationId]
      if (!msgs || msgs.length === 0) return undefined
      return msgs.reduce((latest, msg) => (msg.createdAt > latest.createdAt ? msg : latest))
    }
  })

  /**
   * Add a message to a conversation.
   */
  function addMessage(msg: ChatMessage): void {
    const existing = messages.value[msg.conversationId] ?? []
    // Don't add duplicates
    if (existing.some((m) => m.id === msg.id)) return

    messages.value = {
      ...messages.value,
      [msg.conversationId]: [...existing, { ...msg }],
    }
  }

  /**
   * Update a message (e.g., change status from 'sending' to 'sent').
   */
  function updateMessage(
    conversationId: string,
    messageId: string,
    updates: Partial<ChatMessage>,
  ): void {
    const msgs = messages.value[conversationId]
    if (!msgs) return

    messages.value = {
      ...messages.value,
      [conversationId]: msgs.map((m) =>
        m.id === messageId ? { ...m, ...updates } : m,
      ),
    }
  }

  /**
   * Remove a message.
   */
  function removeMessage(conversationId: string, messageId: string): void {
    const msgs = messages.value[conversationId]
    if (!msgs) return

    messages.value = {
      ...messages.value,
      [conversationId]: msgs.filter((m) => m.id !== messageId),
    }
  }

  /**
   * Clear all messages for a conversation.
   */
  function clearMessages(conversationId: string): void {
    const { [conversationId]: _removed, ...rest } = messages.value
    messages.value = rest
  }

  /**
   * Search messages across all conversations.
   */
  function searchMessages(query: string): ChatMessage[] {
    const q = query.toLowerCase()
    const results: ChatMessage[] = []
    for (const msgs of Object.values(messages.value)) {
      for (const msg of msgs) {
        if (msg.content.toLowerCase().includes(q)) {
          results.push(msg)
        }
      }
    }
    return results.sort((a, b) => b.createdAt - a.createdAt)
  }

  return {
    messages,
    loading,
    getMessages,
    getLatestMessage,
    addMessage,
    updateMessage,
    removeMessage,
    clearMessages,
    searchMessages,
  }
})
