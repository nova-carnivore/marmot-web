/**
 * KeyPackages store unit tests
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useKeyPackagesStore } from '@/stores/keyPackages'
import type { KeyPackageInfo } from '@/types'

function createKP(overrides: Partial<KeyPackageInfo> = {}): KeyPackageInfo {
  return {
    pubkey: 'a'.repeat(64),
    eventId: 'evt-' + Math.random().toString(36).substring(2),
    ciphersuite: '0x0001',
    relays: ['wss://relay.example.com'],
    createdAt: Math.floor(Date.now() / 1000),
    hasRequiredExtensions: true,
    ...overrides,
  }
}

describe('useKeyPackagesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should start empty', () => {
    const store = useKeyPackagesStore()
    expect(store.hasKeyPackage('a'.repeat(64))).toBe(false)
    expect(store.getBestKeyPackage('a'.repeat(64))).toBeUndefined()
  })

  it('should set KeyPackages for a pubkey', () => {
    const store = useKeyPackagesStore()
    const pk = 'a'.repeat(64)
    const kps = [createKP({ pubkey: pk }), createKP({ pubkey: pk })]
    store.setKeyPackages(pk, kps)

    expect(store.hasKeyPackage(pk)).toBe(true)
    expect(store.keyPackages[pk]).toHaveLength(2)
  })

  it('should get the best (most recent) KeyPackage', () => {
    const store = useKeyPackagesStore()
    const pk = 'b'.repeat(64)
    store.setKeyPackages(pk, [
      createKP({ pubkey: pk, createdAt: 100 }),
      createKP({ pubkey: pk, createdAt: 300 }),
      createKP({ pubkey: pk, createdAt: 200 }),
    ])

    const best = store.getBestKeyPackage(pk)
    expect(best?.createdAt).toBe(300)
  })

  it('should filter by hasRequiredExtensions', () => {
    const store = useKeyPackagesStore()
    const pk = 'c'.repeat(64)
    store.setKeyPackages(pk, [
      createKP({ pubkey: pk, hasRequiredExtensions: false }),
    ])

    expect(store.hasKeyPackage(pk)).toBe(false)
    expect(store.getBestKeyPackage(pk)).toBeUndefined()
  })

  it('should add a KeyPackage without duplicates', () => {
    const store = useKeyPackagesStore()
    const pk = 'd'.repeat(64)
    const kp = createKP({ pubkey: pk, eventId: 'unique' })

    store.addKeyPackage(pk, kp)
    store.addKeyPackage(pk, kp)
    expect(store.keyPackages[pk]).toHaveLength(1)
  })

  it('should remove a KeyPackage by event ID', () => {
    const store = useKeyPackagesStore()
    const pk = 'e'.repeat(64)
    store.setKeyPackages(pk, [
      createKP({ pubkey: pk, eventId: 'keep' }),
      createKP({ pubkey: pk, eventId: 'remove' }),
    ])

    store.removeKeyPackage(pk, 'remove')
    expect(store.keyPackages[pk]).toHaveLength(1)
    expect(store.keyPackages[pk][0].eventId).toBe('keep')
  })

  it('should manage my KeyPackages', () => {
    const store = useKeyPackagesStore()
    const kps = [createKP(), createKP()]
    store.setMyKeyPackages(kps)

    expect(store.myKeyPackages).toHaveLength(2)
  })
})
