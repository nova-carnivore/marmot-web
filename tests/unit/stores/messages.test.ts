/**
 * Messages store unit tests
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMessagesStore } from '@/stores/messages'
import type { ChatMessage } from '@/types'

function createMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-' + Math.random().toString(36).substring(2),
    conversationId: 'conv-1',
    senderPubkey: 'a'.repeat(64),
    content: 'Hello',
    kind: 9,
    createdAt: Math.floor(Date.now() / 1000),
    status: 'sent',
    ...overrides,
  }
}

describe('useMessagesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should start empty', () => {
    const store = useMessagesStore()
    expect(store.getMessages('conv-1')).toEqual([])
  })

  it('should add a message', () => {
    const store = useMessagesStore()
    const msg = createMsg()
    store.addMessage(msg)
    expect(store.getMessages('conv-1')).toHaveLength(1)
    expect(store.getMessages('conv-1')[0].content).toBe('Hello')
  })

  it('should not add duplicate messages', () => {
    const store = useMessagesStore()
    const msg = createMsg({ id: 'unique-id' })
    store.addMessage(msg)
    store.addMessage(msg)
    expect(store.getMessages('conv-1')).toHaveLength(1)
  })

  it('should sort messages by timestamp', () => {
    const store = useMessagesStore()
    const msg1 = createMsg({ createdAt: 100 })
    const msg2 = createMsg({ createdAt: 50 })
    const msg3 = createMsg({ createdAt: 200 })
    store.addMessage(msg1)
    store.addMessage(msg2)
    store.addMessage(msg3)

    const messages = store.getMessages('conv-1')
    expect(messages[0].createdAt).toBe(50)
    expect(messages[1].createdAt).toBe(100)
    expect(messages[2].createdAt).toBe(200)
  })

  it('should update a message', () => {
    const store = useMessagesStore()
    const msg = createMsg({ id: 'update-me', status: 'sending' })
    store.addMessage(msg)

    store.updateMessage('conv-1', 'update-me', { status: 'sent' })
    expect(store.getMessages('conv-1')[0].status).toBe('sent')
  })

  it('should remove a message', () => {
    const store = useMessagesStore()
    const msg = createMsg({ id: 'remove-me' })
    store.addMessage(msg)
    expect(store.getMessages('conv-1')).toHaveLength(1)

    store.removeMessage('conv-1', 'remove-me')
    expect(store.getMessages('conv-1')).toHaveLength(0)
  })

  it('should clear messages for a conversation', () => {
    const store = useMessagesStore()
    store.addMessage(createMsg())
    store.addMessage(createMsg())
    expect(store.getMessages('conv-1')).toHaveLength(2)

    store.clearMessages('conv-1')
    expect(store.getMessages('conv-1')).toEqual([])
  })

  it('should get latest message', () => {
    const store = useMessagesStore()
    store.addMessage(createMsg({ id: 'old', createdAt: 100, content: 'Old' }))
    store.addMessage(createMsg({ id: 'new', createdAt: 200, content: 'New' }))

    const latest = store.getLatestMessage('conv-1')
    expect(latest?.content).toBe('New')
  })

  it('should search messages across conversations', () => {
    const store = useMessagesStore()
    store.addMessage(createMsg({ content: 'Hello world', conversationId: 'conv-1' }))
    store.addMessage(createMsg({ content: 'Goodbye world', conversationId: 'conv-2' }))
    store.addMessage(createMsg({ content: 'Nothing here', conversationId: 'conv-3' }))

    const results = store.searchMessages('world')
    expect(results).toHaveLength(2)
  })

  it('should keep conversations separate', () => {
    const store = useMessagesStore()
    store.addMessage(createMsg({ conversationId: 'conv-1' }))
    store.addMessage(createMsg({ conversationId: 'conv-2' }))

    expect(store.getMessages('conv-1')).toHaveLength(1)
    expect(store.getMessages('conv-2')).toHaveLength(1)
  })
})
