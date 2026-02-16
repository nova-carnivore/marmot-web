/**
 * Conversations store unit tests
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConversationsStore } from '@/stores/conversations'
import type { Conversation } from '@/types'
import type { MarmotGroupData } from 'marmot-ts'

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-' + Math.random().toString(36).substring(2),
    name: 'Test Group',
    description: '',
    members: ['a'.repeat(64), 'b'.repeat(64)],
    admins: ['a'.repeat(64)],
    relays: ['wss://relay.example.com'],
    groupData: {} as MarmotGroupData,
    unreadCount: 0,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
    isAdmin: true,
    ...overrides,
  }
}

describe('useConversationsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should start empty', () => {
    const store = useConversationsStore()
    expect(store.sortedConversations).toEqual([])
    expect(store.activeConversation).toBeUndefined()
    expect(store.totalUnread).toBe(0)
  })

  it('should add a conversation', () => {
    const store = useConversationsStore()
    const conv = createConversation({ id: 'test-1' })
    store.upsertConversation(conv)

    expect(store.sortedConversations).toHaveLength(1)
    expect(store.conversations['test-1']).toBeDefined()
  })

  it('should sort conversations by most recent', () => {
    const store = useConversationsStore()
    store.upsertConversation(createConversation({ id: 'old', updatedAt: 100 }))
    store.upsertConversation(createConversation({ id: 'new', updatedAt: 300 }))
    store.upsertConversation(createConversation({ id: 'mid', updatedAt: 200 }))

    const sorted = store.sortedConversations
    expect(sorted[0].id).toBe('new')
    expect(sorted[1].id).toBe('mid')
    expect(sorted[2].id).toBe('old')
  })

  it('should set active conversation', () => {
    const store = useConversationsStore()
    store.upsertConversation(createConversation({ id: 'active-test' }))
    store.setActive('active-test')

    expect(store.activeConversationId).toBe('active-test')
    expect(store.activeConversation?.id).toBe('active-test')
  })

  it('should clear unread when opening conversation', () => {
    const store = useConversationsStore()
    store.upsertConversation(createConversation({ id: 'unread-test', unreadCount: 5 }))

    store.setActive('unread-test')
    expect(store.conversations['unread-test'].unreadCount).toBe(0)
  })

  it('should update last message and increment unread', () => {
    const store = useConversationsStore()
    store.upsertConversation(createConversation({ id: 'msg-test' }))
    // Don't set active so unread increments
    store.setActive(null)

    store.updateLastMessage('msg-test', {
      content: 'New message',
      senderPubkey: 'b'.repeat(64),
      timestamp: 1000,
    })

    const conv = store.conversations['msg-test']
    expect(conv.lastMessage?.content).toBe('New message')
    expect(conv.unreadCount).toBe(1)
  })

  it('should not increment unread for active conversation', () => {
    const store = useConversationsStore()
    store.upsertConversation(createConversation({ id: 'active-msg' }))
    store.setActive('active-msg')

    store.updateLastMessage('active-msg', {
      content: 'Active message',
      senderPubkey: 'b'.repeat(64),
      timestamp: 1000,
    })

    expect(store.conversations['active-msg'].unreadCount).toBe(0)
  })

  it('should remove a conversation', () => {
    const store = useConversationsStore()
    store.upsertConversation(createConversation({ id: 'remove-me' }))
    store.setActive('remove-me')

    store.removeConversation('remove-me')
    expect(store.conversations['remove-me']).toBeUndefined()
    expect(store.activeConversationId).toBeNull()
  })

  it('should compute total unread count', () => {
    const store = useConversationsStore()
    store.upsertConversation(createConversation({ id: 'c1', unreadCount: 3 }))
    store.upsertConversation(createConversation({ id: 'c2', unreadCount: 7 }))

    expect(store.totalUnread).toBe(10)
  })
})
