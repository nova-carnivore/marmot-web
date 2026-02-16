/**
 * Profiles Store
 *
 * Caches Nostr profile metadata (kind:0 events).
 *
 * Uses direct Vue reactivity instead of Immer to avoid proxy conflicts.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NostrProfile } from '@/types'

/** Max age for profile cache (5 minutes) */
const PROFILE_CACHE_TTL = 5 * 60 * 1000

export const useProfilesStore = defineStore('profiles', () => {
  // State
  const profiles = ref<Record<string, NostrProfile>>({})
  const loading = ref<Set<string>>(new Set())

  // Getters
  const getProfile = computed(() => {
    return (pubkey: string): NostrProfile | undefined => profiles.value[pubkey]
  })

  const isProfileStale = computed(() => {
    return (pubkey: string): boolean => {
      const profile = profiles.value[pubkey]
      if (!profile) return true
      return Date.now() - profile.fetchedAt > PROFILE_CACHE_TTL
    }
  })

  /**
   * Set a profile from a kind:0 event.
   */
  function setProfile(pubkey: string, metadata: Record<string, unknown>): void {
    profiles.value = {
      ...profiles.value,
      [pubkey]: {
        pubkey,
        name: metadata.name as string | undefined,
        displayName: (metadata.display_name ?? metadata.displayName) as string | undefined,
        picture: metadata.picture as string | undefined,
        about: metadata.about as string | undefined,
        nip05: metadata.nip05 as string | undefined,
        banner: metadata.banner as string | undefined,
        lud16: metadata.lud16 as string | undefined,
        fetchedAt: Date.now(),
      },
    }
  }

  /**
   * Mark a pubkey as currently being loaded.
   */
  function setLoading(pubkey: string, isLoading: boolean): void {
    if (isLoading) {
      loading.value = new Set([...loading.value, pubkey])
    } else {
      const next = new Set(loading.value)
      next.delete(pubkey)
      loading.value = next
    }
  }

  /**
   * Check if a pubkey is currently loading.
   */
  function isLoading(pubkey: string): boolean {
    return loading.value.has(pubkey)
  }

  /**
   * Bulk set profiles.
   */
  function setProfiles(items: Array<{ pubkey: string; metadata: Record<string, unknown> }>): void {
    const updated = { ...profiles.value }
    for (const item of items) {
      updated[item.pubkey] = {
        pubkey: item.pubkey,
        name: item.metadata.name as string | undefined,
        displayName: (item.metadata.display_name ?? item.metadata.displayName) as
          | string
          | undefined,
        picture: item.metadata.picture as string | undefined,
        about: item.metadata.about as string | undefined,
        nip05: item.metadata.nip05 as string | undefined,
        banner: item.metadata.banner as string | undefined,
        lud16: item.metadata.lud16 as string | undefined,
        fetchedAt: Date.now(),
      }
    }
    profiles.value = updated
  }

  return {
    profiles,
    loading,
    getProfile,
    isProfileStale,
    setProfile,
    setProfiles,
    setLoading,
    isLoading,
  }
})
