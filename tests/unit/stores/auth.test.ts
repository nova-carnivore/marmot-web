/**
 * Auth store unit tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    // Clean up window.nostr mock
    delete (window as Record<string, unknown>).nostr
  })

  it('should start with default state', () => {
    const store = useAuthStore()
    expect(store.pubkey).toBeNull()
    expect(store.method).toBeNull()
    expect(store.connected).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })

  it('should connect via NIP-07', async () => {
    const mockPubkey = 'a'.repeat(64)
    ;(window as Record<string, unknown>).nostr = {
      getPublicKey: vi.fn().mockResolvedValue(mockPubkey),
      signEvent: vi.fn(),
    }

    const store = useAuthStore()
    await store.connectNip07()

    expect(store.pubkey).toBe(mockPubkey)
    expect(store.method).toBe('nip07')
    expect(store.connected).toBe(true)
    expect(store.isAuthenticated).toBe(true)
  })

  it('should fail if no NIP-07 extension', async () => {
    const store = useAuthStore()
    await expect(store.connectNip07()).rejects.toThrow('No NIP-07 extension found')
    expect(store.isAuthenticated).toBe(false)
  })

  it('should fail with invalid pubkey from NIP-07', async () => {
    ;(window as Record<string, unknown>).nostr = {
      getPublicKey: vi.fn().mockResolvedValue('invalid'),
      signEvent: vi.fn(),
    }

    const store = useAuthStore()
    await expect(store.connectNip07()).rejects.toThrow('Invalid public key')
  })

  it('should parse NIP-46 bunker URL', async () => {
    const store = useAuthStore()
    const bunkerUrl = `bunker://${'b'.repeat(64)}?relay=wss://relay.example.com&secret=test`

    await store.connectNip46(bunkerUrl)

    expect(store.pubkey).toBe('b'.repeat(64))
    expect(store.method).toBe('nip46')
    expect(store.connected).toBe(true)
  })

  it('should reject invalid bunker URL', async () => {
    const store = useAuthStore()
    await expect(store.connectNip46('https://not-a-bunker')).rejects.toThrow(
      'Invalid connection URI',
    )
  })

  it('should disconnect and clear state', async () => {
    const mockPubkey = 'c'.repeat(64)
    ;(window as Record<string, unknown>).nostr = {
      getPublicKey: vi.fn().mockResolvedValue(mockPubkey),
      signEvent: vi.fn(),
    }

    const store = useAuthStore()
    await store.connectNip07()
    expect(store.isAuthenticated).toBe(true)

    store.disconnect()
    expect(store.pubkey).toBeNull()
    expect(store.connected).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.getItem('marmot-auth')).toBeNull()
  })

  it('should persist and restore NIP-07 session', async () => {
    const mockPubkey = 'd'.repeat(64)
    ;(window as Record<string, unknown>).nostr = {
      getPublicKey: vi.fn().mockResolvedValue(mockPubkey),
      signEvent: vi.fn(),
    }

    const store = useAuthStore()
    await store.connectNip07()

    // Verify localStorage was set
    const stored = JSON.parse(localStorage.getItem('marmot-auth')!)
    expect(stored.method).toBe('nip07')
    expect(stored.pubkey).toBe(mockPubkey)

    // Create fresh store
    setActivePinia(createPinia())
    const store2 = useAuthStore()
    const restored = await store2.restoreSession()

    expect(restored).toBe(true)
    expect(store2.isAuthenticated).toBe(true)
  })
})
