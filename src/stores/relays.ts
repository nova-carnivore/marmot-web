/**
 * Relays Store
 *
 * Manages Nostr relay connections and subscriptions.
 *
 * Uses direct Vue reactivity instead of Immer to avoid proxy conflicts.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RelayState } from '@/types'
import { DEFAULT_RELAYS } from '@/types'

export const useRelaysStore = defineStore('relays', () => {
  // State
  const relays = ref<Record<string, RelayState>>({})
  const userRelays = ref<string[]>([])

  // Getters
  /** Get all active relay URLs */
  const activeRelays = computed(() => {
    return Object.values(relays.value)
      .filter((r) => r.connected)
      .map((r) => r.url)
  })

  /** Get all configured relay URLs (user relays + defaults) */
  const allRelayUrls = computed(() => {
    const urls = new Set<string>([...userRelays.value, ...DEFAULT_RELAYS])
    return [...urls]
  })

  /** Count of connected relays */
  const connectedCount = computed(() => {
    return Object.values(relays.value).filter((r) => r.connected).length
  })

  /**
   * Set relay connection state.
   */
  function setRelayState(url: string, connected: boolean, error?: string): void {
    relays.value = {
      ...relays.value,
      [url]: { url, connected, error },
    }
  }

  /**
   * Set user's relay list from kind:10002 event.
   */
  function setUserRelays(urls: string[]): void {
    userRelays.value = [...urls]
  }

  /**
   * Remove a relay.
   */
  function removeRelay(url: string): void {
    const { [url]: _removed, ...rest } = relays.value
    relays.value = rest
  }

  return {
    relays,
    userRelays,
    activeRelays,
    allRelayUrls,
    connectedCount,
    setRelayState,
    setUserRelays,
    removeRelay,
  }
})
