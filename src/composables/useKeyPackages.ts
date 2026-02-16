/**
 * useKeyPackages composable
 *
 * KeyPackage management: create, publish, delete, export, import, check availability.
 * Uses marmot-ts/mls for real MLS KeyPackage generation (RFC 9420).
 */

import { computed } from 'vue'
import { useKeyPackagesStore } from '@/stores/keyPackages'
import { useAuthStore } from '@/stores/auth'
import { useNostr } from './useNostr'
import { createKeyPackageEvent, createKeyPackageDeletionEvent } from 'marmot-ts'
import { DEFAULT_RELAYS } from '@/types'
import type { KeyPackageInfo } from '@/types'
import {
  encryptKeyPackageExport,
  decryptKeyPackageExport,
  isValidEncryptedExport,
  downloadFile,
} from '@/utils/crypto'
import type { KeyPackageExportPayload } from '@/utils/crypto'
import {
  generateMlsKeyPackage,
  DEFAULT_CIPHERSUITE,
  ciphersuiteNameToId,
  type CiphersuiteName,
} from 'marmot-ts/mls'
import { saveKeyPackageData, removeKeyPackageData } from '@/services/mlsStorage'

/** Default ciphersuite hex for Nostr event tags */
const DEFAULT_CIPHERSUITE_HEX =
  '0x' + ciphersuiteNameToId(DEFAULT_CIPHERSUITE).toString(16).padStart(4, '0')

/**
 * Convert a CiphersuiteName to the hex string format used in marmot-ts (e.g. '0x0001').
 */
function ciphersuiteNameToHex(name: CiphersuiteName): string {
  const id = ciphersuiteNameToId(name)
  return '0x' + id.toString(16).padStart(4, '0')
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function useKeyPackages() {
  const keyPackagesStore = useKeyPackagesStore()
  const authStore = useAuthStore()
  const { publishEvent, fetchKeyPackages } = useNostr()

  const myKeyPackages = computed(() => keyPackagesStore.myKeyPackages)

  /**
   * Fetch KeyPackages for the current user from relays and merge
   * with any locally-created KeyPackages that relays may not have yet.
   */
  async function fetchMyKeyPackages(): Promise<void> {
    if (!authStore.pubkey) return
    await fetchKeyPackages([authStore.pubkey])

    // Merge: start with what relays returned
    const fromRelays = keyPackagesStore.keyPackages[authStore.pubkey] ?? []
    const relayEventIds = new Set(fromRelays.map((kp) => kp.eventId))

    // Keep any locally-created KeyPackages that aren't in the relay result yet
    const localOnly = keyPackagesStore.myKeyPackages.filter((kp) => !relayEventIds.has(kp.eventId))

    const merged = [...fromRelays, ...localOnly]
    keyPackagesStore.setMyKeyPackages(merged)
    console.log(
      `[KeyPackage] Synced: ${fromRelays.length} from relays, ${localOnly.length} local-only, ${merged.length} total`,
    )
  }

  /**
   * Create a new KeyPackage using real MLS (ts-mls), sign it, and publish to relays.
   *
   * @param ciphersuiteName - Optional ciphersuite (defaults to DEFAULT_CIPHERSUITE)
   * Returns the signed event and private keys for optional export.
   */
  async function createNewKeyPackage(ciphersuiteName?: CiphersuiteName): Promise<{
    eventId: string
    credentialKey: string
    signatureKey: string
  }> {
    if (!authStore.pubkey || !authStore.signer) {
      throw new Error('Not authenticated — connect a signer first')
    }

    const suiteName = ciphersuiteName ?? DEFAULT_CIPHERSUITE
    const suiteHex = ciphersuiteNameToHex(suiteName) as import('marmot-ts').MLSCiphersuite

    console.log(`[KeyPackage] Starting creation with ciphersuite ${suiteName}...`)

    // Generate real MLS KeyPackage via marmot-ts/mls
    const { keyPackageBytes: publicPackageBytes, privateKeyPackage: privatePackage } =
      await generateMlsKeyPackage(authStore.pubkey, suiteName)
    console.log('[KeyPackage] Generated real MLS KeyPackage')

    // Private key hex strings for backward-compatible storage
    const credentialKey = bytesToHex(privatePackage.signaturePrivateKey)
    const signatureKey = bytesToHex(privatePackage.hpkePrivateKey)

    // Create the unsigned Nostr event with the real MLS KeyPackage bytes
    const event = createKeyPackageEvent(authStore.pubkey, {
      keyPackageData: publicPackageBytes,
      ciphersuite: suiteHex,
      relays: DEFAULT_RELAYS,
      clientName: 'marmot-web',
      protected: false,
    })
    console.log('[KeyPackage] Event created (unsigned)')

    // Sign the event
    const signed = await authStore.signer.signEvent(event)
    const eventId = signed.id
    console.log('[KeyPackage] Event signed:', eventId)

    // Store MLS private key data in IndexedDB for Welcome processing
    await saveKeyPackageData(eventId, publicPackageBytes, privatePackage)

    // Store private keys in the KeyPackages store (for export compatibility)
    keyPackagesStore.storePrivateKeys(eventId, { credentialKey, signatureKey })

    // Store the signed event for export
    keyPackagesStore.storeSignedEvent(eventId, {
      id: signed.id,
      pubkey: signed.pubkey,
      created_at: signed.created_at,
      kind: signed.kind,
      tags: signed.tags,
      content: signed.content,
      sig: signed.sig,
    })

    // Build KeyPackageInfo and add to store BEFORE publishing
    const kpInfo: KeyPackageInfo = {
      pubkey: authStore.pubkey,
      eventId,
      ciphersuite: suiteHex,
      relays: DEFAULT_RELAYS,
      createdAt: signed.created_at,
      hasRequiredExtensions: true,
      clientName: 'marmot-web',
    }

    keyPackagesStore.addKeyPackage(authStore.pubkey, kpInfo)
    keyPackagesStore.setMyKeyPackages([...keyPackagesStore.myKeyPackages, kpInfo])
    console.log('[KeyPackage] Added to store, count:', keyPackagesStore.myKeyPackages.length)

    // Publish to relays
    try {
      await publishEvent(signed as unknown as import('nostr-tools').Event)
      console.log('[KeyPackage] Published to relays')
    } catch (err) {
      console.error('[KeyPackage] Publish failed (KeyPackage saved locally):', err)
    }

    // Background sync
    fetchMyKeyPackages().catch((err) => {
      console.warn('[KeyPackage] Background fetch failed:', err)
    })

    return { eventId, credentialKey, signatureKey }
  }

  /**
   * Publish a new KeyPackage with custom data.
   */
  async function publishKeyPackage(
    keyPackageData: Uint8Array,
    ciphersuiteName?: CiphersuiteName,
  ): Promise<void> {
    if (!authStore.pubkey || !authStore.signer) {
      throw new Error('Not authenticated')
    }

    const suiteHex = ciphersuiteNameToHex(
      ciphersuiteName ?? DEFAULT_CIPHERSUITE,
    ) as import('marmot-ts').MLSCiphersuite

    const event = createKeyPackageEvent(authStore.pubkey, {
      keyPackageData,
      ciphersuite: suiteHex,
      relays: DEFAULT_RELAYS,
      clientName: 'marmot-web',
      protected: false,
    })

    const signed = await authStore.signer.signEvent(event)
    await publishEvent(signed as unknown as import('nostr-tools').Event)
    await fetchMyKeyPackages()
  }

  /**
   * Delete a KeyPackage by event ID (publishes kind:5 deletion event).
   */
  async function deleteKeyPackage(eventId: string): Promise<void> {
    if (!authStore.pubkey || !authStore.signer) {
      throw new Error('Not authenticated')
    }

    const deletionEvent = createKeyPackageDeletionEvent(authStore.pubkey, [eventId])
    const signed = await authStore.signer.signEvent(deletionEvent)
    await publishEvent(signed as unknown as import('nostr-tools').Event)

    keyPackagesStore.removeKeyPackage(authStore.pubkey, eventId)
    keyPackagesStore.removePrivateKeys(eventId)
    keyPackagesStore.removeSignedEvent(eventId)
    keyPackagesStore.setMyKeyPackages(
      keyPackagesStore.myKeyPackages.filter((kp) => kp.eventId !== eventId),
    )

    // Also remove MLS key data from IndexedDB
    await removeKeyPackageData(eventId)
  }

  /**
   * Export a KeyPackage as a password-encrypted file.
   */
  async function exportKeyPackage(eventId: string, password: string): Promise<void> {
    const keys = keyPackagesStore.getPrivateKeys(eventId)
    if (!keys) {
      throw new Error(
        'Private keys not found for this KeyPackage. Only KeyPackages created in this session can be exported.',
      )
    }

    const signedEvent = keyPackagesStore.getSignedEvent(eventId)
    if (!signedEvent) {
      throw new Error('Signed event not found for this KeyPackage.')
    }

    const kpInfo = keyPackagesStore.myKeyPackages.find((kp) => kp.eventId === eventId)

    const payload: KeyPackageExportPayload = {
      event: signedEvent,
      privateKeys: {
        credentialKey: keys.credentialKey,
        signatureKey: keys.signatureKey,
      },
      metadata: {
        client: 'marmot-web',
        relays: kpInfo?.relays ?? DEFAULT_RELAYS,
        ciphersuite: kpInfo?.ciphersuite ?? DEFAULT_CIPHERSUITE_HEX,
        exportedAt: Math.floor(Date.now() / 1000),
      },
    }

    const encrypted = await encryptKeyPackageExport(payload, password)
    const filename = `marmot-keypackage-${Date.now()}.json.enc`
    downloadFile(JSON.stringify(encrypted, null, 2), filename)
  }

  /**
   * Check whether a KeyPackage has exportable private keys.
   */
  function canExport(eventId: string): boolean {
    return keyPackagesStore.getPrivateKeys(eventId) !== null
  }

  /**
   * Import a KeyPackage from an encrypted export file.
   */
  async function importKeyPackage(fileContent: string, password: string): Promise<KeyPackageInfo> {
    let encrypted: unknown
    try {
      encrypted = JSON.parse(fileContent)
    } catch {
      throw new Error('Invalid file — not valid JSON')
    }

    if (!isValidEncryptedExport(encrypted)) {
      throw new Error('Invalid file format — not a Marmot KeyPackage export')
    }

    const payload = await decryptKeyPackageExport(encrypted, password)

    if (authStore.pubkey && payload.event.pubkey !== authStore.pubkey) {
      throw new Error(
        `This KeyPackage belongs to a different identity (${payload.event.pubkey.substring(0, 12)}...). ` +
          'You can only import KeyPackages for your own pubkey.',
      )
    }

    if (payload.event.kind !== 443) {
      throw new Error(`Invalid event kind: ${payload.event.kind} (expected 443)`)
    }

    const eventId = payload.event.id

    keyPackagesStore.storePrivateKeys(eventId, {
      credentialKey: payload.privateKeys.credentialKey,
      signatureKey: payload.privateKeys.signatureKey,
    })

    keyPackagesStore.storeSignedEvent(eventId, payload.event)

    const kpInfo: KeyPackageInfo = {
      pubkey: payload.event.pubkey,
      eventId,
      ciphersuite: payload.metadata.ciphersuite,
      relays: payload.metadata.relays,
      createdAt: payload.event.created_at,
      hasRequiredExtensions: true,
    }

    keyPackagesStore.addKeyPackage(payload.event.pubkey, kpInfo)
    if (authStore.pubkey === payload.event.pubkey) {
      keyPackagesStore.setMyKeyPackages([...keyPackagesStore.myKeyPackages, kpInfo])
    }

    return kpInfo
  }

  /**
   * Check KeyPackage availability for a list of contacts.
   */
  async function checkKeyPackages(pubkeys: string[]): Promise<void> {
    await fetchKeyPackages(pubkeys)
  }

  return {
    myKeyPackages,
    fetchMyKeyPackages,
    createNewKeyPackage,
    publishKeyPackage,
    deleteKeyPackage,
    exportKeyPackage,
    canExport,
    importKeyPackage,
    checkKeyPackages,
  }
}
