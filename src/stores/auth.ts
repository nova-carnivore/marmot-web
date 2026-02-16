/**
 * Auth Store
 *
 * Manages NIP-07, NIP-46, and nsec/hex private key authentication state.
 * Supports bunker://, nostrconnect://, and direct private key login.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Nip07Signer, PrivateKeySigner } from 'marmot-ts'
import { nip19 } from 'nostr-tools'
import type { MarmotSigner } from 'marmot-ts/signer'
import type { AuthMethod } from '@/types'
import { clearPersistedState } from '@/plugins/persistedState'

/**
 * Parse a nostrconnect:// URI (NIP-46).
 *
 * Format: nostrconnect://<pubkey>?relay=<relay>&secret=<secret>
 * The pubkey can be in hostname or pathname position depending on parser.
 */
function parseNostrConnectUri(uri: string): {
  pubkey: string
  relays: string[]
  secret?: string
} {
  // nostrconnect:// is not a standard URL scheme browsers know,
  // so we swap protocol to parse with URL API
  const httpUri = uri.replace('nostrconnect://', 'http://')
  const url = new URL(httpUri)

  // Pubkey is in the "host" position
  const pubkey = url.hostname || url.pathname.replace(/^\/\//, '').replace(/\/.*$/, '')
  const relays = url.searchParams.getAll('relay')
  const secret = url.searchParams.get('secret') || undefined

  if (!pubkey || !/^[0-9a-f]{64}$/.test(pubkey)) {
    throw new Error('Invalid nostrconnect:// URI: missing or invalid pubkey')
  }

  if (relays.length === 0) {
    throw new Error('nostrconnect:// URI must include at least one relay parameter')
  }

  return { pubkey, relays, secret }
}

/**
 * Detect URI type from connection string.
 */
function detectUriType(uri: string): 'bunker' | 'nostrconnect' | 'unknown' {
  if (uri.startsWith('bunker://')) return 'bunker'
  if (uri.startsWith('nostrconnect://')) return 'nostrconnect'
  return 'unknown'
}

export const useAuthStore = defineStore('auth', () => {
  // State
  const pubkey = ref<string | null>(null)
  const method = ref<AuthMethod | null>(null)
  const connected = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const signer = ref<MarmotSigner | null>(null)

  // Getters
  const isAuthenticated = computed(() => connected.value && pubkey.value !== null)

  /**
   * Connect via NIP-07 browser extension.
   */
  async function connectNip07(): Promise<void> {
    loading.value = true
    error.value = null

    try {
      if (!window.nostr) {
        throw new Error(
          'No NIP-07 extension found. Please install a Nostr signer extension (e.g., Alby, nos2x).',
        )
      }

      const nip07Signer = new Nip07Signer()
      const pk = await nip07Signer.getPublicKey()

      if (!pk || !/^[0-9a-f]{64}$/.test(pk)) {
        throw new Error('Invalid public key received from NIP-07 extension.')
      }

      signer.value = nip07Signer
      pubkey.value = pk
      method.value = 'nip07'
      connected.value = true

      // Persist auth state
      localStorage.setItem('marmot-auth', JSON.stringify({ method: 'nip07', pubkey: pk }))
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to connect NIP-07'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Connect via NIP-46 connection string.
   * Supports both bunker:// and nostrconnect:// URI formats.
   */
  async function connectNip46(connectionUri: string): Promise<void> {
    loading.value = true
    error.value = null

    try {
      const uriType = detectUriType(connectionUri)
      let remotePubkey: string
      let relayUrl: string
      let secret: string | undefined

      if (uriType === 'nostrconnect') {
        // Parse nostrconnect:// URI (NIP-46 standard format)
        const parsed = parseNostrConnectUri(connectionUri)
        remotePubkey = parsed.pubkey
        relayUrl = parsed.relays[0] // Use first relay for connection
        secret = parsed.secret
      } else if (uriType === 'bunker') {
        // Parse bunker:// URI (legacy format)
        const httpUri = connectionUri.replace('bunker://', 'http://')
        const url = new URL(httpUri)
        remotePubkey = url.hostname || url.pathname.replace(/^\/\//, '')
        relayUrl = url.searchParams.get('relay') ?? ''
        secret = url.searchParams.get('secret') ?? undefined

        if (!remotePubkey || !relayUrl) {
          throw new Error('Bunker URL must include remote pubkey and relay parameter')
        }
      } else {
        throw new Error(
          'Invalid connection URI. Expected bunker://... or nostrconnect://... format.',
        )
      }

      // NIP-46 is a skeleton in marmot-ts, so we store connection info
      // In production, this would use a full NIP-46 implementation
      // TODO: Create a proper Nip46Signer when marmot-ts adds NIP-46 support.
      // Without a signer, Welcome events and gift wrapping will silently fail.
      pubkey.value = remotePubkey
      method.value = 'nip46'
      connected.value = true

      localStorage.setItem(
        'marmot-auth',
        JSON.stringify({
          method: 'nip46',
          pubkey: remotePubkey,
          connectionUri,
          relayUrl,
          secret,
        }),
      )
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to connect NIP-46'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Connect via nsec or hex private key.
   *
   * ⚠️ INSECURE: Private key is held in memory. Use only for testing.
   */
  async function connectNsec(nsecOrHex: string): Promise<void> {
    loading.value = true
    error.value = null

    try {
      let hex: string

      const trimmed = nsecOrHex.trim()
      if (trimmed.startsWith('nsec1')) {
        // Decode bech32 nsec
        const decoded = nip19.decode(trimmed)
        if (decoded.type !== 'nsec') {
          throw new Error('Invalid nsec: unexpected decoded type')
        }
        // decoded.data is Uint8Array for nsec
        const bytes = decoded.data as Uint8Array
        hex = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        hex = trimmed.toLowerCase()
      } else {
        throw new Error('Invalid key format. Expected nsec1... or 64-character hex string.')
      }

      const privateKeySigner = new PrivateKeySigner(hex)
      const pk = await privateKeySigner.getPublicKey()

      if (!pk || !/^[0-9a-f]{64}$/.test(pk)) {
        throw new Error('Failed to derive public key from private key.')
      }

      signer.value = privateKeySigner
      pubkey.value = pk
      method.value = 'nsec'
      connected.value = true

      // Persist auth state
      localStorage.setItem('marmot-auth', JSON.stringify({ method: 'nsec', pubkey: pk }))

      // Persist private key in sessionStorage (survives refresh, cleared on tab close)
      // ⚠️ sessionStorage is used instead of localStorage for security:
      // the key is automatically cleared when the browser tab is closed.
      sessionStorage.setItem('marmot-nsec-hex', hex)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to connect with private key'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Try to restore auth session from localStorage.
   */
  async function restoreSession(): Promise<boolean> {
    const stored = localStorage.getItem('marmot-auth')
    if (!stored) return false

    try {
      const data = JSON.parse(stored) as {
        method: AuthMethod
        pubkey: string
        bunkerUrl?: string
        connectionUri?: string
      }

      if (data.method === 'nip07') {
        if (!window.nostr) return false
        await connectNip07()
        return true
      }

      if (data.method === 'nip46') {
        const uri = data.connectionUri || data.bunkerUrl
        if (uri) {
          await connectNip46(uri)
          return true
        }
      }

      // nsec sessions: restore from sessionStorage if available
      if (data.method === 'nsec') {
        const hexKey = sessionStorage.getItem('marmot-nsec-hex')
        if (hexKey) {
          await connectNsec(hexKey)
          return true
        }
        // No key in sessionStorage — clear stale auth marker
        localStorage.removeItem('marmot-auth')
        return false
      }
    } catch {
      localStorage.removeItem('marmot-auth')
    }

    return false
  }

  /**
   * Disconnect and clear auth state.
   */
  async function disconnect(): Promise<void> {
    pubkey.value = null
    method.value = null
    connected.value = false
    signer.value = null
    error.value = null
    localStorage.removeItem('marmot-auth')
    sessionStorage.removeItem('marmot-nsec-hex')

    // Clear all persisted IndexedDB state
    await clearPersistedState()
  }

  return {
    // State
    pubkey,
    method,
    connected,
    loading,
    error,
    signer,
    // Getters
    isAuthenticated,
    // Actions
    connectNip07,
    connectNip46,
    connectNsec,
    restoreSession,
    disconnect,
  }
})
