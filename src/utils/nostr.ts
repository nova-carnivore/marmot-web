/**
 * Nostr utility functions
 */

import { nip19 } from 'nostr-tools'

/**
 * Convert a hex pubkey to npub format.
 */
export function pubkeyToNpub(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey)
  } catch {
    return pubkey.substring(0, 12) + '...'
  }
}

/**
 * Shorten an npub for display.
 */
export function shortenNpub(npub: string, chars = 8): string {
  if (npub.length <= chars * 2 + 3) return npub
  return `${npub.substring(0, chars)}...${npub.substring(npub.length - chars)}`
}

/**
 * Get a display name from profile or fallback to npub.
 */
export function getDisplayName(
  profile?: { name?: string; displayName?: string },
  pubkey?: string,
): string {
  if (profile?.displayName) return profile.displayName
  if (profile?.name) return profile.name
  if (pubkey) return shortenNpub(pubkeyToNpub(pubkey))
  return 'Unknown'
}

/**
 * Format a timestamp for display.
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Less than 1 minute
  if (diff < 60_000) return 'now'
  // Less than 1 hour
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  // Same day
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  // Yesterday
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  // Same year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  // Different year
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Format a full timestamp for message display.
 */
export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Check if a string is a valid hex pubkey.
 */
export function isValidHexPubkey(hex: string): boolean {
  return /^[0-9a-f]{64}$/.test(hex)
}
