/**
 * useProfile composable
 *
 * Helper for loading and displaying profiles.
 */

import { computed, watch } from 'vue'
import { useProfilesStore } from '@/stores/profiles'
import { useNostr } from './useNostr'
import { getDisplayName, pubkeyToNpub } from '@/utils/nostr'
import type { NostrProfile } from '@/types'

export function useProfile(pubkeyRef: () => string | undefined) {
  const profilesStore = useProfilesStore()
  const { fetchProfiles } = useNostr()

  const profile = computed((): NostrProfile | undefined => {
    const pk = pubkeyRef()
    if (!pk) return undefined
    return profilesStore.getProfile(pk)
  })

  const displayName = computed(() => {
    const pk = pubkeyRef()
    return getDisplayName(profile.value, pk)
  })

  const npub = computed(() => {
    const pk = pubkeyRef()
    if (!pk) return ''
    return pubkeyToNpub(pk)
  })

  const picture = computed(() => profile.value?.picture)
  const about = computed(() => profile.value?.about)

  // Auto-fetch profile when pubkey changes
  watch(
    () => pubkeyRef(),
    async (pk) => {
      if (pk && profilesStore.isProfileStale(pk)) {
        await fetchProfiles([pk])
      }
    },
    { immediate: true },
  )

  return {
    profile,
    displayName,
    npub,
    picture,
    about,
  }
}
