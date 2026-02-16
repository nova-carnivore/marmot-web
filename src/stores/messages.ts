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
   *
   * Deduplicates by:
   * 1. Exact event ID match (relay echoes after updateMessage sets the real ID)
   * 2. Optimistic message match (same sender + content + close timestamp)
   *    — merges the confirmed message into the optimistic entry to avoid
   *    showing both the optimistic send and the relay echo.
   * 3. Content-based duplicate guard (same sender + identical content + ≤5s)
   *    — catches edge cases where multiple relay deliveries or reactivity
   *    timing cause both optimistic and confirmed messages to coexist.
   */
  function addMessage(msg: ChatMessage): void {
    const existing = messages.value[msg.conversationId] ?? []

    // Check 1: exact ID match
    if (existing.some((m) => m.id === msg.id)) {
      console.debug(`[Messages] Skipped duplicate (exact ID: ${msg.id.slice(0, 8)}...)`)
      return
    }

    // Check 2: merge with optimistic message (same sender + content within 60s)
    const optimisticIdx = existing.findIndex(
      (m) =>
        (m.status === 'sending' || m.status === 'sent') &&
        m.senderPubkey === msg.senderPubkey &&
        m.content === msg.content &&
        Math.abs(m.createdAt - msg.createdAt) <= 60,
    )
    if (optimisticIdx !== -1) {
      // Replace the optimistic message with the confirmed one
      const updated = [...existing]
      updated[optimisticIdx] = { ...msg, status: 'sent' }
      messages.value = {
        ...messages.value,
        [msg.conversationId]: updated,
      }
      console.log(
        `[Messages] Merged relay echo with optimistic message (${msg.id.slice(0, 8)}...)`,
      )
      return
    }

    // Check 3: strict content-based duplicate guard
    // Prevents duplicates from multi-relay delivery or updateMessage race conditions.
    // Uses a tight 5-second window to avoid false positives across real messages.
    const isDuplicate = existing.some(
      (m) =>
        m.senderPubkey === msg.senderPubkey &&
        m.content === msg.content &&
        Math.abs(m.createdAt - msg.createdAt) <= 5,
    )
    if (isDuplicate) {
      console.log(
        `[Messages] Skipped content-duplicate (${msg.id.slice(0, 8)}..., sender: ${msg.senderPubkey.slice(0, 8)}...)`,
      )
      return
    }

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
