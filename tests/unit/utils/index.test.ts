/**
 * Utility function unit tests
 */
import { describe, it, expect } from 'vitest'
import {
  truncate,
  formatFileSize,
  isImageMime,
  isVideoMime,
  isAudioMime,
  randomHex,
  debounce,
} from '@/utils'

describe('truncate', () => {
  it('should not truncate short strings', () => {
    expect(truncate('Hello', 10)).toBe('Hello')
  })

  it('should truncate long strings with ellipsis', () => {
    expect(truncate('Hello World', 8)).toBe('Hello W…')
  })
})

describe('formatFileSize', () => {
  it('should format bytes', () => {
    expect(formatFileSize(500)).toBe('500 B')
  })

  it('should format kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('should format megabytes', () => {
    expect(formatFileSize(1_048_576)).toBe('1.0 MB')
  })

  it('should format gigabytes', () => {
    expect(formatFileSize(2_147_483_648)).toBe('2.0 GB')
  })
})

describe('MIME type checks', () => {
  it('should detect image MIME types', () => {
    expect(isImageMime('image/jpeg')).toBe(true)
    expect(isImageMime('image/png')).toBe(true)
    expect(isImageMime('video/mp4')).toBe(false)
  })

  it('should detect video MIME types', () => {
    expect(isVideoMime('video/mp4')).toBe(true)
    expect(isVideoMime('image/jpeg')).toBe(false)
  })

  it('should detect audio MIME types', () => {
    expect(isAudioMime('audio/mpeg')).toBe(true)
    expect(isAudioMime('audio/ogg')).toBe(true)
    expect(isAudioMime('image/png')).toBe(false)
  })
})

describe('randomHex', () => {
  it('should generate hex string of correct length', () => {
    const hex = randomHex(16)
    expect(hex).toHaveLength(32) // 16 bytes = 32 hex chars
    expect(hex).toMatch(/^[0-9a-f]+$/)
  })

  it('should generate unique values', () => {
    const a = randomHex(16)
    const b = randomHex(16)
    expect(a).not.toBe(b)
  })
})

describe('debounce', () => {
  it('should debounce calls', async () => {
    let callCount = 0
    const fn = debounce(() => callCount++, 50)

    fn()
    fn()
    fn()

    expect(callCount).toBe(0)
    await new Promise((r) => setTimeout(r, 100))
    expect(callCount).toBe(1)
  })
})
