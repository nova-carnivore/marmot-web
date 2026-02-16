/**
 * Pinia Persisted State Plugin
 *
 * Uses localforage (IndexedDB) to persist store state across reloads.
 * Sensitive data is cleared on logout via the clearAll() export.
 */

import localforage from 'localforage'
import type { PiniaPluginContext } from 'pinia'
import { toRaw, watch } from 'vue'

// Configure localforage to use IndexedDB with a Marmot namespace
localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'marmot-web',
  storeName: 'pinia_state',
  description: 'Marmot Web persistent state',
})

/** Stores that should be persisted */
const PERSISTED_STORES = new Set([
  'auth',
  'contacts',
  'conversations',
  'messages',
  'profiles',
  'keyPackages',
  // 'relays' is intentionally excluded — relay state is rebuilt each session
  // from NIP-65 (kind:10002) and defaults. Persisting it caused DataCloneError
  // because Vue reactive proxies / immer drafts can't be cloned by IndexedDB.
])

/** Keys to exclude from persistence (sensitive / runtime-only) */
const EXCLUDED_KEYS: Record<string, Set<string>> = {
  auth: new Set(['signer', 'loading', 'error']),
  profiles: new Set(['loading']),
  keyPackages: new Set(['loading']),
  contacts: new Set(['loading']),
  conversations: new Set(['loading']),
  messages: new Set(['loading']),
}

/**
 * Deep-clone state, stripping excluded keys and non-serializable values.
 *
 * Uses JSON round-trip to ensure the result is fully serializable
 * (no Vue Proxy wrappers, no immer drafts, no functions/symbols).
 * This prevents IndexedDB DataCloneError on structured-clone.
 */
function serializeState(storeId: string, state: Record<string, unknown>): Record<string, unknown> {
  const excluded = EXCLUDED_KEYS[storeId] ?? new Set()
  const serializable: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(state)) {
    if (excluded.has(key)) continue
    // Skip functions — they can't be serialized
    const raw = toRaw(value)
    if (typeof raw === 'function') continue
    if (raw instanceof Set) {
      serializable[key] = [...raw]
      continue
    }
    serializable[key] = raw
  }

  // JSON round-trip ensures deep serialization: strips Vue Proxy wrappers,
  // immer internal properties, symbols, undefined values, and circular refs.
  // This is the safest way to produce a value IndexedDB can structuredClone.
  //
  // Custom replacer strips sensitive fields that must NOT be persisted:
  // - exporterSecret: MLS group encryption key (runtime-only, Uint8Array)
  const SENSITIVE_KEYS = new Set(['exporterSecret', 'mlsGroupState'])

  try {
    return JSON.parse(
      JSON.stringify(serializable, (key, value) => {
        if (SENSITIVE_KEYS.has(key)) return undefined
        return value
      }),
    )
  } catch (err) {
    console.warn(`[persist] Failed to serialize ${storeId}, skipping save:`, err)
    return {}
  }
}

/**
 * Pinia plugin that persists state to IndexedDB.
 */
export function createPersistedState() {
  return ({ store }: PiniaPluginContext) => {
    const storeId = store.$id

    if (!PERSISTED_STORES.has(storeId)) return

    // Flag to prevent saving while restoring
    let isRestoring = true

    // Restore state from IndexedDB on init
    localforage
      .getItem<Record<string, unknown>>(storeId)
      .then((saved) => {
        if (saved && typeof saved === 'object') {
          // For Sets stored as arrays, convert back
          const restored = { ...saved }

          // Special handling for loading states stored as arrays → Sets
          if (restored.loading && Array.isArray(restored.loading)) {
            restored.loading = new Set(restored.loading)
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          store.$patch(restored as any)
        }
      })
      .catch((err) => {
        console.warn(`[persist] Failed to restore ${storeId}:`, err)
      })
      .finally(() => {
        isRestoring = false
      })

    // Debounce saves to avoid excessive writes
    let saveTimeout: ReturnType<typeof setTimeout> | null = null

    // Watch for state changes and persist
    watch(
      () => store.$state,
      () => {
        if (isRestoring) return

        if (saveTimeout) clearTimeout(saveTimeout)
        saveTimeout = setTimeout(() => {
          const data = serializeState(storeId, store.$state)
          localforage.setItem(storeId, data).catch((err) => {
            console.warn(`[persist] Failed to save ${storeId}:`, err)
          })
        }, 300)
      },
      { deep: true },
    )
  }
}

/**
 * Clear all persisted state (call on logout).
 */
export async function clearPersistedState(): Promise<void> {
  const keys = await localforage.keys()
  await Promise.all(keys.map((key) => localforage.removeItem(key)))
}
