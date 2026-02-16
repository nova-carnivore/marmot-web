/**
 * Patched KDF that replaces @hpke/common's HkdfNative with a pure-JS implementation.
 *
 * The original uses crypto.subtle.importKey("raw", ..., "HMAC", ...) which fails
 * in browsers without proper HTTPS/secure context. This uses @noble/hashes instead.
 *
 * The interface matches HkdfNative from @hpke/common exactly:
 *   init, buildLabeledIkm, buildLabeledInfo, extract, expand,
 *   extractAndExpand, labeledExtract, labeledExpand, hashSize, id
 *
 * Exports: makeKdfImpl(k) and makeKdf(kdfAlg)
 */

import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'

// b"HPKE-v1"
const HPKE_VERSION = new Uint8Array([72, 80, 75, 69, 45, 118, 49])
const EMPTY = new Uint8Array(0)

function getHashFn(name) {
  switch (name) {
    case 'SHA-256': return sha256
    case 'SHA-384': return sha384
    case 'SHA-512': return sha512
    default: throw new Error(`Unsupported hash: ${name}`)
  }
}

/**
 * Pure-JS HKDF implementation matching @hpke/common's HkdfNative interface.
 */
class NobleHkdf {
  constructor(hashName, hashSize, kdfId) {
    this.hashSize = hashSize
    this.id = kdfId
    this._hashFn = getHashFn(hashName)
    this._suiteId = EMPTY
  }

  /** Set the HPKE suite ID (called by HPKE ciphersuite setup) */
  init(suiteId) {
    this._suiteId = new Uint8Array(suiteId)
  }

  _checkInit() {
    if (this._suiteId === EMPTY || this._suiteId.byteLength === 0) {
      throw new Error('Not initialized. Call init()')
    }
  }

  /**
   * Build labeled IKM: "HPKE-v1" || suiteId || label || ikm
   */
  buildLabeledIkm(label, ikm) {
    this._checkInit()
    const labelBytes = new Uint8Array(label)
    const ikmBytes = new Uint8Array(ikm)
    const ret = new Uint8Array(7 + this._suiteId.byteLength + labelBytes.byteLength + ikmBytes.byteLength)
    ret.set(HPKE_VERSION, 0)
    ret.set(this._suiteId, 7)
    ret.set(labelBytes, 7 + this._suiteId.byteLength)
    ret.set(ikmBytes, 7 + this._suiteId.byteLength + labelBytes.byteLength)
    return ret
  }

  /**
   * Build labeled info: I2OSP(len, 2) || "HPKE-v1" || suiteId || label || info
   */
  buildLabeledInfo(label, info, len) {
    this._checkInit()
    const labelBytes = new Uint8Array(label)
    const infoBytes = new Uint8Array(info)
    const ret = new Uint8Array(9 + this._suiteId.byteLength + labelBytes.byteLength + infoBytes.byteLength)
    ret.set(new Uint8Array([0, len]), 0)
    ret.set(HPKE_VERSION, 2)
    ret.set(this._suiteId, 9)
    ret.set(labelBytes, 9 + this._suiteId.byteLength)
    ret.set(infoBytes, 9 + this._suiteId.byteLength + labelBytes.byteLength)
    return ret
  }

  /**
   * HKDF-Extract (RFC 5869 Section 2.2)
   * PRK = HMAC-Hash(salt, IKM)
   */
  async extract(salt, ikm) {
    const saltBytes = new Uint8Array(salt)
    const ikmBytes = new Uint8Array(ikm)

    let effectiveSalt = saltBytes
    if (saltBytes.byteLength === 0) {
      effectiveSalt = new Uint8Array(this.hashSize)
    }

    return hmac(this._hashFn, effectiveSalt, ikmBytes).buffer
  }

  /**
   * HKDF-Expand (RFC 5869 Section 2.3)
   */
  async expand(prk, info, len) {
    const prkBytes = new Uint8Array(prk)
    const infoBytes = new Uint8Array(info)

    if (len > 255 * this.hashSize) {
      throw new Error('Entropy limit reached')
    }

    const okm = new ArrayBuffer(len)
    const p = new Uint8Array(okm)
    let prev = EMPTY
    const mid = infoBytes
    const tail = new Uint8Array(1)

    const tmp = new Uint8Array(this.hashSize + mid.length + 1)
    for (let i = 1, cur = 0; cur < p.length; i++) {
      tail[0] = i
      tmp.set(prev, 0)
      tmp.set(mid, prev.length)
      tmp.set(tail, prev.length + mid.length)
      prev = hmac(this._hashFn, prkBytes, tmp.slice(0, prev.length + mid.length + 1))

      if (p.length - cur >= prev.length) {
        p.set(prev, cur)
        cur += prev.length
      } else {
        p.set(prev.slice(0, p.length - cur), cur)
        cur += p.length - cur
      }
    }

    return okm
  }

  /**
   * Combined extract-and-expand in one call.
   * extractAndExpand(salt, ikm, info, len) = Expand(Extract(salt, ikm), info, len)
   */
  async extractAndExpand(salt, ikm, info, len) {
    const prk = await this.extract(salt, ikm)
    return await this.expand(prk, info, len)
  }

  /**
   * Labeled Extract: extract(salt, buildLabeledIkm(label, ikm))
   */
  async labeledExtract(salt, label, ikm) {
    return await this.extract(salt, this.buildLabeledIkm(label, ikm).buffer)
  }

  /**
   * Labeled Expand: expand(prk, buildLabeledInfo(label, info, len), len)
   */
  async labeledExpand(prk, label, info, len) {
    return await this.expand(prk, this.buildLabeledInfo(label, info, len).buffer, len)
  }
}

/**
 * Wraps a KDF instance into the interface ts-mls expects from makeKdfImpl.
 */
export function makeKdfImpl(k) {
  return {
    async extract(salt, ikm) {
      const result = await k.extract(
        salt instanceof ArrayBuffer ? salt : new Uint8Array(salt).buffer,
        ikm instanceof ArrayBuffer ? ikm : new Uint8Array(ikm).buffer,
      )
      return new Uint8Array(result)
    },
    async expand(prk, info, len) {
      const result = await k.expand(
        prk instanceof ArrayBuffer ? prk : new Uint8Array(prk).buffer,
        info instanceof ArrayBuffer ? info : new Uint8Array(info).buffer,
        len,
      )
      return new Uint8Array(result)
    },
    size: k.hashSize,
  }
}

/**
 * Create a new KDF instance for the given algorithm.
 * Returns a NobleHkdf matching @hpke/common's HkdfNative interface.
 */
export function makeKdf(kdfAlg) {
  // KdfId values from @hpke/common
  const KDF_SHA256 = 0x0001
  const KDF_SHA384 = 0x0002
  const KDF_SHA512 = 0x0003

  switch (kdfAlg) {
    case 'HKDF-SHA256':
      return new NobleHkdf('SHA-256', 32, KDF_SHA256)
    case 'HKDF-SHA384':
      return new NobleHkdf('SHA-384', 48, KDF_SHA384)
    case 'HKDF-SHA512':
      return new NobleHkdf('SHA-512', 64, KDF_SHA512)
    default:
      throw new Error(`Unsupported KDF algorithm: ${kdfAlg}`)
  }
}
