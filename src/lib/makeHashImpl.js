/**
 * Patched makeHashImpl that uses @noble/hashes instead of WebCrypto.
 *
 * The original ts-mls default implementation uses crypto.subtle.digest() and
 * crypto.subtle.sign("HMAC", ...) which can fail in certain browser contexts.
 *
 * This patched version uses @noble/hashes/sha2 and @noble/hashes/hmac which
 * work universally across all browsers.
 *
 * Signature matches the default implementation: makeHashImpl(sc, h)
 * where sc is crypto.subtle (ignored) and h is the hash algorithm name.
 */

import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'

function getHashFn(h) {
  switch (h) {
    case 'SHA-256':
      return sha256
    case 'SHA-384':
      return sha384
    case 'SHA-512':
      return sha512
    default:
      throw new Error(`Unsupported hash algorithm: ${h}`)
  }
}

export function makeHashImpl(sc, h) {
  const hashFn = getHashFn(h)

  return {
    async digest(data) {
      return hashFn(new Uint8Array(data))
    },
    async mac(key, data) {
      return hmac(hashFn, new Uint8Array(key), new Uint8Array(data))
    },
    async verifyMac(key, mac, data) {
      const expected = hmac(hashFn, new Uint8Array(key), new Uint8Array(data))
      return constantTimeEqual(new Uint8Array(mac), expected)
    },
  }
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}
