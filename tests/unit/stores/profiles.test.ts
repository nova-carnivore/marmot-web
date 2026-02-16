/**
 * Profiles store unit tests
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProfilesStore } from '@/stores/profiles'

describe('useProfilesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should start empty', () => {
    const store = useProfilesStore()
    expect(store.getProfile('a'.repeat(64))).toBeUndefined()
  })

  it('should set a profile', () => {
    const store = useProfilesStore()
    const pk = 'a'.repeat(64)
    store.setProfile(pk, {
      name: 'Alice',
      display_name: 'Alice Wonderland',
      picture: 'https://example.com/alice.jpg',
      about: 'Down the rabbit hole',
    })

    const profile = store.getProfile(pk)
    expect(profile).toBeDefined()
    expect(profile!.name).toBe('Alice')
    expect(profile!.displayName).toBe('Alice Wonderland')
    expect(profile!.picture).toBe('https://example.com/alice.jpg')
    expect(profile!.about).toBe('Down the rabbit hole')
  })

  it('should handle displayName as displayName or display_name', () => {
    const store = useProfilesStore()
    const pk1 = 'b'.repeat(64)
    const pk2 = 'c'.repeat(64)

    store.setProfile(pk1, { displayName: 'Bob via displayName' })
    store.setProfile(pk2, { display_name: 'Charlie via display_name' })

    expect(store.getProfile(pk1)!.displayName).toBe('Bob via displayName')
    expect(store.getProfile(pk2)!.displayName).toBe('Charlie via display_name')
  })

  it('should bulk set profiles', () => {
    const store = useProfilesStore()
    store.setProfiles([
      { pubkey: 'a'.repeat(64), metadata: { name: 'Alice' } },
      { pubkey: 'b'.repeat(64), metadata: { name: 'Bob' } },
    ])

    expect(store.getProfile('a'.repeat(64))!.name).toBe('Alice')
    expect(store.getProfile('b'.repeat(64))!.name).toBe('Bob')
  })

  it('should track stale profiles', () => {
    const store = useProfilesStore()
    const pk = 'd'.repeat(64)

    expect(store.isProfileStale(pk)).toBe(true)

    store.setProfile(pk, { name: 'Dave' })
    expect(store.isProfileStale(pk)).toBe(false)
  })

  it('should track loading state', () => {
    const store = useProfilesStore()
    const pk = 'e'.repeat(64)

    expect(store.isLoading(pk)).toBe(false)
    store.setLoading(pk, true)
    expect(store.isLoading(pk)).toBe(true)
    store.setLoading(pk, false)
    expect(store.isLoading(pk)).toBe(false)
  })
})
