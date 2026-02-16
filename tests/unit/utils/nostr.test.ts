/**
 * Nostr utility unit tests
 */
import { describe, it, expect } from 'vitest'
import {
  pubkeyToNpub,
  shortenNpub,
  getDisplayName,
  formatTimestamp,
  isValidHexPubkey,
} from '@/utils/nostr'

describe('pubkeyToNpub', () => {
  it('should convert a valid hex pubkey to npub', () => {
    const pubkey = 'a'.repeat(64)
    const npub = pubkeyToNpub(pubkey)
    expect(npub).toMatch(/^npub1/)
  })

  it('should handle invalid pubkey gracefully', () => {
    const result = pubkeyToNpub('invalid')
    expect(result).toBe('invalid...')
  })
})

describe('shortenNpub', () => {
  it('should shorten a long npub', () => {
    const npub = 'npub1aaaaaaaaabbbbbbbbbbccccccccccddddddddddeeeeeeeee'
    const short = shortenNpub(npub, 8)
    expect(short).toMatch(/^npub1aaa.*eeeee$/)
    expect(short.length).toBeLessThan(npub.length)
  })

  it('should not shorten a short string', () => {
    const short = shortenNpub('short', 8)
    expect(short).toBe('short')
  })
})

describe('getDisplayName', () => {
  it('should prefer displayName', () => {
    expect(
      getDisplayName({ displayName: 'Alice', name: 'alice' }, 'a'.repeat(64)),
    ).toBe('Alice')
  })

  it('should fall back to name', () => {
    expect(getDisplayName({ name: 'bob' }, 'b'.repeat(64))).toBe('bob')
  })

  it('should fall back to npub', () => {
    const result = getDisplayName(undefined, 'c'.repeat(64))
    expect(result).toMatch(/^npub1/)
  })

  it('should return Unknown with no data', () => {
    expect(getDisplayName()).toBe('Unknown')
  })
})

describe('formatTimestamp', () => {
  it('should show "now" for recent timestamps', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatTimestamp(now)).toBe('now')
  })

  it('should show minutes for recent past', () => {
    const fiveMinAgo = Math.floor(Date.now() / 1000) - 300
    expect(formatTimestamp(fiveMinAgo)).toBe('5m')
  })
})

describe('isValidHexPubkey', () => {
  it('should validate correct hex pubkeys', () => {
    expect(isValidHexPubkey('a'.repeat(64))).toBe(true)
    expect(isValidHexPubkey('0123456789abcdef'.repeat(4))).toBe(true)
  })

  it('should reject invalid pubkeys', () => {
    expect(isValidHexPubkey('')).toBe(false)
    expect(isValidHexPubkey('a'.repeat(63))).toBe(false)
    expect(isValidHexPubkey('g'.repeat(64))).toBe(false)
    expect(isValidHexPubkey('A'.repeat(64))).toBe(false) // Uppercase
  })
})
