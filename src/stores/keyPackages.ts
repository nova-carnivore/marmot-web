/**
 * KeyPackages Store
 *
 * Manages KeyPackage state for contacts (kind:443).
 * Also stores private key material and signed events for export/import.
 *
 * Uses direct Vue reactivity instead of Immer to avoid proxy conflicts.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { KeyPackageInfo } from '@/types'

/** Private key pair associated with a KeyPackage */
interface KeyPackagePrivateKeys {
  credentialKey: string
  signatureKey: string
}

/** Signed event stored for export */
interface StoredSignedEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export const useKeyPackagesStore = defineStore('keyPackages', () => {
  // State: pubkey -> KeyPackageInfo[]
  const keyPackages = ref<Record<string, KeyPackageInfo[]>>({})
  const myKeyPackages = ref<KeyPackageInfo[]>([])
  const loading = ref<Set<string>>(new Set())

  // Private keys indexed by event ID (persisted in IndexedDB)
  const privateKeys = ref<Record<string, KeyPackagePrivateKeys>>({})

  // Signed events indexed by event ID (persisted in IndexedDB)
  const signedEvents = ref<Record<string, StoredSignedEvent>>({})

  // Getters
  /** Check if a contact has valid KeyPackages */
  const hasKeyPackage = computed(() => {
    return (pubkey: string): boolean => {
      const kps = keyPackages.value[pubkey]
      return !!kps && kps.some((kp) => kp.hasRequiredExtensions)
    }
  })

  /** Get all valid KeyPackages for a contact (for multi-device selection) */
  const getKeyPackagesForPubkey = computed(() => {
    return (pubkey: string): KeyPackageInfo[] => {
      const kps = keyPackages.value[pubkey]
      if (!kps || kps.length === 0) return []
      return kps.filter((kp) => kp.hasRequiredExtensions).sort((a, b) => b.createdAt - a.createdAt)
    }
  })

  /** Get the best (most recent) KeyPackage for a contact */
  const getBestKeyPackage = computed(() => {
    return (pubkey: string): KeyPackageInfo | undefined => {
      const kps = keyPackages.value[pubkey]
      if (!kps || kps.length === 0) return undefined
      return kps
        .filter((kp) => kp.hasRequiredExtensions)
        .sort((a, b) => b.createdAt - a.createdAt)[0]
    }
  })

  /**
   * Set KeyPackages for a pubkey.
   */
  function setKeyPackages(pubkey: string, kps: KeyPackageInfo[]): void {
    console.log(`[KeyPackagesStore] setKeyPackages(${pubkey.slice(0, 8)}...): ${kps.length} items`)
    keyPackages.value = {
      ...keyPackages.value,
      [pubkey]: kps.map((kp) => ({ ...kp })),
    }
  }

  /**
   * Add a single KeyPackage.
   */
  function addKeyPackage(pubkey: string, kp: KeyPackageInfo): void {
    const existing = keyPackages.value[pubkey] ?? []
    // Don't duplicate
    if (existing.some((k) => k.eventId === kp.eventId)) {
      console.log(
        `[KeyPackagesStore] addKeyPackage: duplicate skipped ${kp.eventId.slice(0, 12)}...`,
      )
      return
    }

    console.log(
      `[KeyPackagesStore] addKeyPackage: added ${kp.eventId.slice(0, 12)}... for ${pubkey.slice(0, 8)}...`,
    )
    keyPackages.value = {
      ...keyPackages.value,
      [pubkey]: [...existing, { ...kp }],
    }
  }

  /**
   * Remove a KeyPackage by event ID.
   */
  function removeKeyPackage(pubkey: string, eventId: string): void {
    const existing = keyPackages.value[pubkey]
    if (!existing) return

    keyPackages.value = {
      ...keyPackages.value,
      [pubkey]: existing.filter((kp) => kp.eventId !== eventId),
    }
  }

  /**
   * Set the current user's KeyPackages.
   */
  function setMyKeyPackages(kps: KeyPackageInfo[]): void {
    console.log(`[KeyPackagesStore] setMyKeyPackages: ${kps.length} items`)
    myKeyPackages.value = kps.map((kp) => ({ ...kp }))
  }

  /**
   * Mark a pubkey as loading.
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

  // ─── Private Key Management ─────────────────────────────────────────────

  /**
   * Store private keys for a KeyPackage (indexed by event ID).
   */
  function storePrivateKeys(eventId: string, keys: KeyPackagePrivateKeys): void {
    privateKeys.value = {
      ...privateKeys.value,
      [eventId]: { ...keys },
    }
  }

  /**
   * Get private keys for a KeyPackage.
   */
  function getPrivateKeys(eventId: string): KeyPackagePrivateKeys | null {
    return privateKeys.value[eventId] ?? null
  }

  /**
   * Remove private keys for a KeyPackage.
   */
  function removePrivateKeys(eventId: string): void {
    const { [eventId]: _removed, ...rest } = privateKeys.value
    privateKeys.value = rest
  }

  // ─── Signed Event Storage ───────────────────────────────────────────────

  /**
   * Store a signed event for export.
   */
  function storeSignedEvent(eventId: string, event: StoredSignedEvent): void {
    signedEvents.value = {
      ...signedEvents.value,
      [eventId]: { ...event },
    }
  }

  /**
   * Get a stored signed event.
   */
  function getSignedEvent(eventId: string): StoredSignedEvent | null {
    return signedEvents.value[eventId] ?? null
  }

  /**
   * Remove a stored signed event.
   */
  function removeSignedEvent(eventId: string): void {
    const { [eventId]: _removed, ...rest } = signedEvents.value
    signedEvents.value = rest
  }

  return {
    keyPackages,
    myKeyPackages,
    loading,
    privateKeys,
    signedEvents,
    hasKeyPackage,
    getKeyPackagesForPubkey,
    getBestKeyPackage,
    setKeyPackages,
    addKeyPackage,
    removeKeyPackage,
    setMyKeyPackages,
    setLoading,
    storePrivateKeys,
    getPrivateKeys,
    removePrivateKeys,
    storeSignedEvent,
    getSignedEvent,
    removeSignedEvent,
  }
})
