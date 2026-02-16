/**
 * MLS State Persistence (IndexedDB)
 *
 * Handles ONLY IndexedDB storage for MLS state and KeyPackage private keys.
 * All MLS protocol logic is in marmot-ts/mls.
 */

import localforage from 'localforage'
import {
  decodeMlsState,
  parseKeyPackageBytes,
  groupStateToClientState,
  type ClientState,
  type KeyPackage,
  type PrivateKeyPackage,
} from 'marmot-ts/mls'

// ─── IndexedDB Stores ───────────────────────────────────────────────────────

const mlsStateStore = localforage.createInstance({
  driver: localforage.INDEXEDDB,
  name: 'marmot-web',
  storeName: 'mls_state',
  description: 'MLS group state persistence',
})

const mlsKeyPackageStore = localforage.createInstance({
  driver: localforage.INDEXEDDB,
  name: 'marmot-web',
  storeName: 'mls_key_packages',
  description: 'MLS private key package storage',
})

// ─── MLS State Persistence ──────────────────────────────────────────────────

/**
 * Save MLS group state to IndexedDB.
 *
 * @param conversationId - The Nostr group ID (hex)
 * @param encodedState - The TLS-encoded GroupState bytes
 */
export async function saveMlsState(
  conversationId: string,
  encodedState: Uint8Array,
): Promise<void> {
  await mlsStateStore.setItem(conversationId, Array.from(encodedState))
}

/**
 * Load MLS group state from IndexedDB.
 *
 * @param conversationId - The Nostr group ID (hex)
 * @returns The decoded ClientState, or null if not found
 */
export async function loadMlsState(conversationId: string): Promise<ClientState | null> {
  const stored = await mlsStateStore.getItem<number[]>(conversationId)
  if (!stored) return null

  try {
    const encoded = new Uint8Array(stored)
    const groupState = decodeMlsState(encoded)
    // Wrap GroupState into ClientState with default config
    return groupStateToClientState(groupState)
  } catch (err) {
    console.error(`[MLS] Failed to decode state for ${conversationId}:`, err)
    return null
  }
}

/**
 * Remove MLS state for a conversation.
 */
export async function removeMlsState(conversationId: string): Promise<void> {
  await mlsStateStore.removeItem(conversationId)
}

/**
 * Clear all MLS state (call on logout).
 */
export async function clearAllMlsState(): Promise<void> {
  await mlsStateStore.clear()
  await mlsKeyPackageStore.clear()
}

// ─── KeyPackage Private Key Persistence ─────────────────────────────────────

interface StoredKeyPackageData {
  publicPackageBytes: number[] // Uint8Array → JSON-safe
  privatePackage: {
    initPrivateKey: number[]
    hpkePrivateKey: number[]
    signaturePrivateKey: number[]
  }
}

/**
 * Save a KeyPackage's private data to IndexedDB.
 * Indexed by the Nostr event ID of the KeyPackage.
 */
export async function saveKeyPackageData(
  eventId: string,
  publicPackageBytes: Uint8Array,
  privatePackage: PrivateKeyPackage,
): Promise<void> {
  const data: StoredKeyPackageData = {
    publicPackageBytes: Array.from(publicPackageBytes),
    privatePackage: {
      initPrivateKey: Array.from(privatePackage.initPrivateKey),
      hpkePrivateKey: Array.from(privatePackage.hpkePrivateKey),
      signaturePrivateKey: Array.from(privatePackage.signaturePrivateKey),
    },
  }
  await mlsKeyPackageStore.setItem(eventId, data)
}

/**
 * Load a KeyPackage's private data from IndexedDB.
 */
export async function loadKeyPackageData(eventId: string): Promise<{
  publicPackageBytes: Uint8Array
  publicPackage: KeyPackage
  privatePackage: PrivateKeyPackage
} | null> {
  const data = await mlsKeyPackageStore.getItem<StoredKeyPackageData>(eventId)
  if (!data) return null

  try {
    const publicPackageBytes = new Uint8Array(data.publicPackageBytes)
    // Parse the raw KeyPackage bytes (handles both raw and MLSMessage-wrapped)
    const publicPackage = parseKeyPackageBytes(publicPackageBytes)

    const privatePackage: PrivateKeyPackage = {
      initPrivateKey: new Uint8Array(data.privatePackage.initPrivateKey),
      hpkePrivateKey: new Uint8Array(data.privatePackage.hpkePrivateKey),
      signaturePrivateKey: new Uint8Array(data.privatePackage.signaturePrivateKey),
    }
    return { publicPackageBytes, publicPackage, privatePackage }
  } catch (err) {
    console.error(`[MLS] Failed to decode KeyPackage ${eventId}:`, err)
    return null
  }
}

/**
 * Remove a KeyPackage from IndexedDB.
 */
export async function removeKeyPackageData(eventId: string): Promise<void> {
  await mlsKeyPackageStore.removeItem(eventId)
}
