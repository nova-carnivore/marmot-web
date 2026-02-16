/**
 * Marmot Web Client Types
 *
 * Core type definitions for the web client.
 */

import type { MarmotGroupData } from 'marmot-ts'

// Re-export CiphersuiteName from marmot-ts/mls for use in components
export type { CiphersuiteName } from 'marmot-ts/mls'

/** Authentication method */
export type AuthMethod = 'nip07' | 'nip46' | 'nsec'

/** Authentication state */
export interface AuthState {
  pubkey: string
  method: AuthMethod
  connected: boolean
}

/** Nostr profile metadata (kind:0) */
export interface NostrProfile {
  pubkey: string
  name?: string
  displayName?: string
  picture?: string
  about?: string
  nip05?: string
  banner?: string
  lud16?: string
  /** Timestamp when profile was last fetched */
  fetchedAt: number
}

/** KeyPackage status for a contact */
export interface KeyPackageInfo {
  pubkey: string
  eventId: string
  ciphersuite: string
  relays: string[]
  createdAt: number
  hasRequiredExtensions: boolean
  /** Client/device name from the ["client", "name"] tag */
  clientName?: string
}

/** Conversation (group or 1:1) */
export interface Conversation {
  /** Nostr group ID hex */
  id: string
  /** Group name */
  name: string
  /** Group description */
  description: string
  /** Member pubkeys */
  members: string[]
  /** Admin pubkeys */
  admins: string[]
  /** Relay URLs */
  relays: string[]
  /** Group image URL (decrypted) */
  imageUrl?: string
  /** MLS group data */
  groupData: MarmotGroupData
  /** Last message preview */
  lastMessage?: MessagePreview
  /** Unread message count */
  unreadCount: number
  /** Created at timestamp */
  createdAt: number
  /** Updated at timestamp */
  updatedAt: number
  /** Whether current user is admin */
  isAdmin: boolean
  /** MLS exporter secret derived from MLS group state (runtime only) */
  exporterSecret?: Uint8Array
  /** Serialized MLS GroupState (for persistence, stored separately in IndexedDB) */
  mlsGroupState?: Uint8Array
  /** MLS internal group ID (may differ from Nostr group ID) */
  mlsGroupId?: Uint8Array
  /** Whether this conversation has an active MLS session */
  hasMlsSession?: boolean
  /** The ciphersuite name used by this group's MLS session */
  ciphersuiteName?: string
}

/** Preview of last message in conversation list */
export interface MessagePreview {
  content: string
  senderPubkey: string
  timestamp: number
}

/** Chat message */
export interface ChatMessage {
  /** Event ID */
  id: string
  /** Conversation ID (nostrGroupId) */
  conversationId: string
  /** Sender pubkey */
  senderPubkey: string
  /** Message content */
  content: string
  /** Event kind */
  kind: number
  /** Timestamp */
  createdAt: number
  /** Media attachments */
  media?: MediaAttachment[]
  /** Reply to message ID */
  replyTo?: string
  /** Reaction target */
  reactionTarget?: {
    eventId: string
    pubkey: string
  }
  /** Status */
  status: 'sending' | 'sent' | 'failed'
}

/** Media attachment in a message */
export interface MediaAttachment {
  url: string
  mimeType: string
  filename: string
  dimensions?: string
  blurhash?: string
  /** Decrypted blob URL (runtime only) */
  decryptedUrl?: string
  /** Is this MIP-04 encrypted? */
  encrypted: boolean
  /** Nonce for decryption */
  nonce?: string
  /** File hash for verification */
  fileHash?: string
}

/** Relay connection state */
export interface RelayState {
  url: string
  connected: boolean
  error?: string
}

/** Default relay URLs */
export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net']

/** Nostr event kinds used by the client */
export const NOSTR_KINDS = {
  METADATA: 0,
  CONTACTS: 3,
  DELETION: 5,
  RELAY_LIST: 10002,
  KEY_PACKAGE: 443,
  WELCOME: 444,
  GROUP_EVENT: 445,
  KEY_PACKAGE_RELAY_LIST: 10051,
} as const
