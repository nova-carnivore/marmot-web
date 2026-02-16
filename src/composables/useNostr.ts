/**
 * useNostr composable
 *
 * Manages Nostr relay connections and subscriptions using nostr-tools SimplePool.
 */

import { ref, onUnmounted } from 'vue'
import { SimplePool } from 'nostr-tools'
import type { Filter, Event } from 'nostr-tools'

type SubCloser = { close(): void }
import { useRelaysStore } from '@/stores/relays'
import { useProfilesStore } from '@/stores/profiles'
import { useContactsStore } from '@/stores/contacts'
import { useKeyPackagesStore } from '@/stores/keyPackages'
import { useAuthStore } from '@/stores/auth'
import { parseKeyPackageEvent, hasRequiredMarmotExtensions } from 'marmot-ts'
import type { SignedEvent } from 'marmot-ts'
import type { KeyPackageInfo } from '@/types'
import { NOSTR_KINDS, DEFAULT_RELAYS } from '@/types'

/**
 * Normalize a relay URL to match what nostr-tools SimplePool uses internally.
 *
 * SimplePool normalizes all relay URLs via its own normalizeURL():
 *   'wss://relay.damus.io' → 'wss://relay.damus.io/'  (adds trailing slash)
 *
 * Our store and DEFAULT_RELAYS use URLs without trailing slashes. This helper
 * creates a bidirectional mapping so we can translate between the two forms.
 */
function normalizeRelayUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol === 'http:') u.protocol = 'ws:'
    else if (u.protocol === 'https:') u.protocol = 'wss:'
    u.pathname = u.pathname.replace(/\/+/g, '/')
    if (u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1)
    if ((u.port === '80' && u.protocol === 'ws:') || (u.port === '443' && u.protocol === 'wss:'))
      u.port = ''
    u.searchParams.sort()
    u.hash = ''
    return u.toString()
  } catch {
    return url
  }
}

/** Shared pool instance */
let pool: SimplePool | null = null

/** Store reference for connection callbacks (set on first useNostr() call) */
let _relaysStoreRef: ReturnType<typeof useRelaysStore> | null = null

function getPool(): SimplePool {
  if (!pool) {
    pool = new SimplePool()

    // Set connection callbacks on the pool instance.
    // These are public properties on AbstractSimplePool.
    // The `url` parameter is the normalized URL (with trailing slash),
    // so we need to find the original store URL to update the right key.
    const p = pool as unknown as {
      onRelayConnectionSuccess?: (url: string) => void
      onRelayConnectionFailure?: (url: string) => void
    }
    p.onRelayConnectionSuccess = (url: string) => {
      const store = _relaysStoreRef
      if (!store) return
      const storeUrl = findStoreUrl(store, url)
      store.setRelayState(storeUrl, true)
    }
    p.onRelayConnectionFailure = (url: string) => {
      const store = _relaysStoreRef
      if (!store) return
      const storeUrl = findStoreUrl(store, url)
      store.setRelayState(storeUrl, false, 'Connection failed')
    }
  }
  return pool
}

/**
 * Find the original store URL that corresponds to a normalized URL.
 * Falls back to the normalized URL if no match found.
 */
function findStoreUrl(store: ReturnType<typeof useRelaysStore>, normalizedUrl: string): string {
  for (const url of store.allRelayUrls) {
    if (normalizeRelayUrl(url) === normalizedUrl) {
      return url
    }
  }
  return normalizedUrl
}

export function useNostr() {
  const relaysStore = useRelaysStore()
  const profilesStore = useProfilesStore()
  const contactsStore = useContactsStore()
  const keyPackagesStore = useKeyPackagesStore()
  const authStore = useAuthStore()

  // Keep a module-level reference so pool callbacks can access the store
  _relaysStoreRef = relaysStore

  const subscriptions = ref<SubCloser[]>([])

  /**
   * Get relay URLs to use.
   */
  function getRelays(): string[] {
    const urls = relaysStore.allRelayUrls
    return urls.length > 0 ? urls : DEFAULT_RELAYS
  }

  /**
   * Fetch user's relay list (kind:10002).
   */
  async function fetchUserRelays(pubkey: string): Promise<void> {
    const p = getPool()
    const relays = getRelays()

    const events = await p.querySync(relays, {
      kinds: [NOSTR_KINDS.RELAY_LIST],
      authors: [pubkey],
      limit: 1,
    })

    if (events.length > 0) {
      const event = events[0]
      const relayUrls = event.tags
        .filter((t: string[]) => t[0] === 'r')
        .map((t: string[]) => t[1])
        .filter((url: string | undefined): url is string => !!url)
      relaysStore.setUserRelays(relayUrls)
    }
  }

  /**
   * Fetch profiles for a list of pubkeys.
   */
  async function fetchProfiles(pubkeys: string[]): Promise<void> {
    // Filter out already-cached and non-stale profiles
    const toFetch = pubkeys.filter(
      (pk) => profilesStore.isProfileStale(pk) && !profilesStore.isLoading(pk),
    )
    if (toFetch.length === 0) return

    for (const pk of toFetch) {
      profilesStore.setLoading(pk, true)
    }

    const p = getPool()
    const relays = getRelays()

    try {
      const events = await p.querySync(relays, {
        kinds: [NOSTR_KINDS.METADATA],
        authors: toFetch,
      })

      // Deduplicate: keep most recent per pubkey
      const latest = new Map<string, Event>()
      for (const event of events) {
        const existing = latest.get(event.pubkey)
        if (!existing || event.created_at > existing.created_at) {
          latest.set(event.pubkey, event)
        }
      }

      const items: Array<{ pubkey: string; metadata: Record<string, unknown> }> = []
      for (const [pubkey, event] of latest) {
        try {
          const metadata = JSON.parse(event.content) as Record<string, unknown>
          items.push({ pubkey, metadata })
        } catch {
          // Invalid JSON in profile metadata — skip
        }
      }

      profilesStore.setProfiles(items)
    } finally {
      for (const pk of toFetch) {
        profilesStore.setLoading(pk, false)
      }
    }
  }

  /**
   * Fetch the user's contact list (kind:3).
   */
  async function fetchContacts(pubkey: string): Promise<void> {
    contactsStore.loading = true

    const p = getPool()
    const relays = getRelays()

    try {
      const events = await p.querySync(relays, {
        kinds: [NOSTR_KINDS.CONTACTS],
        authors: [pubkey],
        limit: 1,
      })

      if (events.length > 0) {
        // Get the most recent contacts event
        const event = events.sort((a: Event, b: Event) => b.created_at - a.created_at)[0]
        const pubkeys = event.tags
          .filter((t: string[]) => t[0] === 'p')
          .map((t: string[]) => t[1])
          .filter((pk: string | undefined): pk is string => !!pk)

        contactsStore.setFollowing(pubkeys)

        // Fetch profiles for contacts
        if (pubkeys.length > 0) {
          await fetchProfiles(pubkeys)
        }
      }
    } finally {
      contactsStore.loading = false
    }
  }

  /**
   * Fetch KeyPackages for a list of pubkeys.
   */
  async function fetchKeyPackages(pubkeys: string[]): Promise<void> {
    const p = getPool()
    const relays = getRelays()

    const events = await p.querySync(relays, {
      kinds: [NOSTR_KINDS.KEY_PACKAGE],
      authors: pubkeys,
    })

    // Group by pubkey
    const byPubkey = new Map<string, Event[]>()
    for (const event of events) {
      const existing = byPubkey.get(event.pubkey) ?? []
      existing.push(event)
      byPubkey.set(event.pubkey, existing)
    }

    for (const [pubkey, evts] of byPubkey) {
      const kpInfos: KeyPackageInfo[] = []
      for (const event of evts) {
        try {
          const parsed = parseKeyPackageEvent(event as unknown as SignedEvent)
          kpInfos.push({
            pubkey: parsed.pubkey,
            eventId: parsed.eventId,
            ciphersuite: parsed.ciphersuite,
            relays: parsed.relays,
            createdAt: parsed.createdAt,
            hasRequiredExtensions: hasRequiredMarmotExtensions(parsed),
            clientName: parsed.clientName,
          })
        } catch {
          // Invalid KeyPackage — skip
        }
      }
      keyPackagesStore.setKeyPackages(pubkey, kpInfos)
    }
  }

  /**
   * Subscribe to real-time events.
   */
  function subscribeToEvents(filters: Filter[], onEvent: (event: Event) => void): SubCloser {
    const p = getPool()
    const relays = getRelays()

    // nostr-tools v2 SimplePool.subscribeMany(relays, filter, params) expects
    // `filter` as a SINGLE Filter object. Internally it wraps it in an array
    // per relay. Passing Filter[] causes double-wrapping → relay "bad req" error.
    //
    // For multiple filters we create separate subscriptions per filter.
    if (filters.length === 0) throw new Error('subscribeToEvents: empty filters')

    if (filters.length === 1) {
      const sub = p.subscribeMany(relays, filters[0] as unknown as Filter, { onevent: onEvent })
      subscriptions.value.push(sub)
      return sub
    }

    // Multiple filters: create one sub per filter, return combined closer
    const subs = filters.map((f) => {
      const sub = p.subscribeMany(relays, f as unknown as Filter, { onevent: onEvent })
      subscriptions.value.push(sub)
      return sub
    })
    return {
      close() {
        subs.forEach((s) => s.close())
      },
    }
  }

  /**
   * Subscribe to profile updates for contacts.
   */
  function subscribeToProfiles(pubkeys: string[]): SubCloser {
    return subscribeToEvents(
      [{ kinds: [NOSTR_KINDS.METADATA], authors: pubkeys }],
      (event: Event) => {
        try {
          const metadata = JSON.parse(event.content) as Record<string, unknown>
          profilesStore.setProfile(event.pubkey, metadata)
        } catch {
          // Invalid profile metadata
        }
      },
    )
  }

  /**
   * Subscribe to KeyPackage events.
   */
  function subscribeToKeyPackages(pubkeys: string[]): SubCloser {
    return subscribeToEvents(
      [{ kinds: [NOSTR_KINDS.KEY_PACKAGE], authors: pubkeys }],
      (event: Event) => {
        try {
          const parsed = parseKeyPackageEvent(event as unknown as SignedEvent)
          keyPackagesStore.addKeyPackage(parsed.pubkey, {
            pubkey: parsed.pubkey,
            eventId: parsed.eventId,
            ciphersuite: parsed.ciphersuite,
            relays: parsed.relays,
            createdAt: parsed.createdAt,
            hasRequiredExtensions: hasRequiredMarmotExtensions(parsed),
            clientName: parsed.clientName,
          })
        } catch {
          // Invalid KeyPackage
        }
      },
    )
  }

  /**
   * Subscribe to group events for a specific group.
   */
  function subscribeToGroup(nostrGroupId: string, onEvent: (event: Event) => void): SubCloser {
    return subscribeToEvents([{ kinds: [NOSTR_KINDS.GROUP_EVENT], '#h': [nostrGroupId] }], onEvent)
  }

  /**
   * Subscribe to Welcome events for the current user.
   * Welcomes are gift-wrapped (kind 1059) with the recipient's pubkey in #p tag.
   * Fetches events from last 24 hours to catch recently sent invitations.
   */
  function subscribeToWelcomes(onEvent: (event: Event) => void): SubCloser {
    const pubkey = authStore.pubkey
    if (!pubkey) throw new Error('Not authenticated')

    const since = Math.floor(Date.now() / 1000) - 172800 // Last 48 hours (NIP-59 randomizes timestamps up to 48h in past)
    return subscribeToEvents([{ kinds: [1059], '#p': [pubkey], since }], onEvent)
  }

  /**
   * Publish an event to relays.
   *
   * Ensures event is a plain object (no Vue/Immer proxies) and has all
   * required NIP-01 fields. Logs per-relay results for debugging.
   * Throws only if ALL relays reject.
   *
   * Note: SimplePool.publish() returns Promise<string>[] where each promise
   * resolves with the relay's OK message on success. However, connection
   * failures resolve (not reject) with a string like "connection failure: ...",
   * so we must check the resolved value to distinguish real confirmations
   * from connection errors.
   */
  async function publishEvent(event: Event): Promise<void> {
    const p = getPool()
    const relays = getRelays()

    // Deep-clone to plain object: strips Vue Proxy wrappers, Immer drafts,
    // and any non-serializable properties that confuse nostr-tools.
    const plainEvent: Event = JSON.parse(
      JSON.stringify({
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        kind: event.kind,
        tags: event.tags,
        content: event.content,
        sig: event.sig,
      }),
    )

    console.log(
      `[Nostr] Publishing event ${plainEvent.id?.slice(0, 12)}... (kind:${plainEvent.kind}) to ${relays.length} relays:`,
      relays,
    )
    console.log('[Nostr] Event detail:', JSON.stringify(plainEvent, null, 2))

    const promises = p.publish(relays, plainEvent)
    const results = await Promise.allSettled(promises)

    let succeeded = 0
    let failed = 0
    const rejectionReasons: string[] = []
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled') {
        const value = result.value
        // SimplePool resolves connection failures with a string starting with
        // "connection failure:" — these are NOT actual relay confirmations
        if (typeof value === 'string' && value.startsWith('connection failure:')) {
          failed++
          rejectionReasons.push(`${relays[i]}: ${value}`)
          console.warn(`[Nostr] Relay ${relays[i]} connection failed:`, value)
        } else {
          succeeded++
          console.log(`[Nostr] Relay ${relays[i]} confirmed:`, value)
        }
      } else {
        failed++
        const reason =
          result.reason instanceof Error ? result.reason.message : String(result.reason)
        rejectionReasons.push(`${relays[i]}: ${reason}`)
        console.warn(`[Nostr] Relay ${relays[i]} rejected event:`, result.reason)
      }
    }

    console.log(
      `[Nostr] Publish result: ${succeeded} confirmed, ${failed} failed out of ${relays.length}`,
    )

    if (succeeded === 0 && relays.length > 0) {
      const details = rejectionReasons.join('; ')
      throw new Error(`Event rejected by all ${relays.length} relays: ${details}`)
    }
  }

  /**
   * Sync relay connection status from the pool's internal state.
   * Call this periodically or after operations to keep the UI in sync.
   *
   * SimplePool normalizes relay URLs internally (e.g. adds trailing slash),
   * so we must map between normalized URLs and our store's original URLs.
   */
  function syncRelayStatus(): void {
    const p = getPool()
    const statusMap = p.listConnectionStatus()

    // Build a lookup: normalized URL → connected boolean
    // statusMap keys are already normalized by SimplePool
    const normalizedStatus = new Map<string, boolean>()
    for (const [url, connected] of statusMap) {
      normalizedStatus.set(url, connected)
    }

    // Update each configured relay using normalized URL lookup
    for (const url of relaysStore.allRelayUrls) {
      const normalized = normalizeRelayUrl(url)
      const connected = normalizedStatus.get(normalized)
      if (connected !== undefined) {
        relaysStore.setRelayState(url, connected)
      } else {
        // Relay not in pool yet (no queries made to it) — mark disconnected
        // only if we don't already have state for it
        if (!relaysStore.relays[url]) {
          relaysStore.setRelayState(url, false)
        }
      }
    }
  }

  /**
   * Proactively connect to all configured relays.
   *
   * SimplePool connects lazily (on first query/publish). Call this to
   * eagerly establish connections so relay status shows "Connected" in the UI.
   * Also syncs relay status after connection attempts complete.
   */
  async function ensureRelayConnections(): Promise<void> {
    const p = getPool()
    const relays = getRelays()
    console.log('[Nostr] Ensuring connections to', relays.length, 'relays')

    const results = await Promise.allSettled(relays.map((url) => p.ensureRelay(url)))

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const url = relays[i]
      if (result.status === 'fulfilled') {
        relaysStore.setRelayState(url, true)
      } else {
        relaysStore.setRelayState(url, false, String(result.reason))
        console.warn(`[Nostr] Failed to connect to ${url}:`, result.reason)
      }
    }
  }

  /**
   * Fetch raw kind:443 KeyPackage events for given pubkeys.
   * Returns the full Nostr events so callers can extract the MLS KeyPackage bytes.
   */
  async function fetchKeyPackageEvents(pubkeys: string[]): Promise<Event[]> {
    const p = getPool()
    const relays = getRelays()

    return p.querySync(relays, {
      kinds: [NOSTR_KINDS.KEY_PACKAGE],
      authors: pubkeys,
    })
  }

  /**
   * Close all subscriptions.
   */
  function closeAll(): void {
    for (const sub of subscriptions.value) {
      sub.close()
    }
    subscriptions.value = []
  }

  // Cleanup on unmount
  onUnmounted(() => {
    closeAll()
  })

  return {
    getPool,
    getRelays,
    fetchUserRelays,
    fetchProfiles,
    fetchContacts,
    fetchKeyPackages,
    fetchKeyPackageEvents,
    subscribeToEvents,
    subscribeToProfiles,
    subscribeToKeyPackages,
    subscribeToGroup,
    subscribeToWelcomes,
    publishEvent,
    syncRelayStatus,
    ensureRelayConnections,
    closeAll,
  }
}
