/**
 * Noble curves-based X25519 DH primitive for @hpke/core.
 *
 * Drop-in replacement for @hpke/core's native X25519 that uses WebCrypto.
 * This version uses @noble/curves/ed25519.js which works universally,
 * including in headless Chrome where WebCrypto X25519 is unavailable.
 *
 * Only X25519 is patched — Ed25519, SHA-256, HKDF, AES-GCM stay native.
 */

import { x25519 } from '@noble/curves/ed25519.js'

// Inlined constants from @hpke/common
const EMPTY = new Uint8Array(0)
const LABEL_DKP_PRK = new Uint8Array([0x64, 0x6b, 0x70, 0x5f, 0x70, 0x72, 0x6b]) // "dkp_prk"
const LABEL_SK = new Uint8Array([0x73, 0x6b]) // "sk"

// Inlined error classes from @hpke/common
class DeriveKeyPairError extends Error {
  constructor(e) {
    super(e instanceof Error ? e.message : String(e))
    this.name = 'DeriveKeyPairError'
  }
}
class DeserializeError extends Error {
  constructor(e) {
    super(e instanceof Error ? e.message : String(e))
    this.name = 'DeserializeError'
  }
}
class NotSupportedError extends Error {
  constructor(e) {
    super(e instanceof Error ? e.message : String(e))
    this.name = 'NotSupportedError'
  }
}
class SerializeError extends Error {
  constructor(e) {
    super(e instanceof Error ? e.message : String(e))
    this.name = 'SerializeError'
  }
}

function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const binary = atob(b64 + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function toCleanArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

/**
 * X25519 DH primitive using @noble/curves.
 *
 * Keys are raw Uint8Array (32 bytes) instead of CryptoKey objects.
 * Compatible with @hpke/core's Dhkem base class.
 */
export class X25519 {
  constructor(hkdf) {
    this._hkdf = hkdf
    this._nPk = 32
    this._nSk = 32
    this._nDh = 32
  }

  async serializePublicKey(key) {
    try {
      return toCleanArrayBuffer(new Uint8Array(key))
    } catch (e) {
      throw new SerializeError(e)
    }
  }

  async deserializePublicKey(key) {
    try {
      const bytes = new Uint8Array(key)
      if (bytes.byteLength !== this._nPk) {
        throw new Error('Invalid public key for the ciphersuite')
      }
      return bytes
    } catch (e) {
      throw new DeserializeError(e)
    }
  }

  async serializePrivateKey(key) {
    try {
      return toCleanArrayBuffer(new Uint8Array(key))
    } catch (e) {
      throw new SerializeError(e)
    }
  }

  async deserializePrivateKey(key) {
    try {
      const bytes = new Uint8Array(key)
      if (bytes.byteLength !== this._nSk) {
        throw new Error('Invalid private key for the ciphersuite')
      }
      return bytes
    } catch (e) {
      throw new DeserializeError(e)
    }
  }

  async importKey(format, key, isPublic) {
    try {
      if (format === 'raw') {
        const bytes = new Uint8Array(key)
        if (isPublic && bytes.byteLength !== this._nPk) {
          throw new Error('Invalid public key for the ciphersuite')
        }
        if (!isPublic && bytes.byteLength !== this._nSk) {
          throw new Error('Invalid private key for the ciphersuite')
        }
        return bytes
      }
      // jwk format
      if (key instanceof ArrayBuffer) {
        throw new Error('Invalid jwk key format')
      }
      if (isPublic) {
        if (!key.x) throw new Error('Missing x in JWK')
        return base64UrlToBytes(key.x)
      } else {
        if (!key.d) throw new Error('Missing d in JWK')
        return base64UrlToBytes(key.d)
      }
    } catch (e) {
      throw new DeserializeError(e)
    }
  }

  async generateKeyPair() {
    try {
      const { secretKey, publicKey } = x25519.keygen()
      return { privateKey: secretKey, publicKey }
    } catch (e) {
      throw new NotSupportedError(e)
    }
  }

  async deriveKeyPair(ikm) {
    try {
      const dkpPrk = await this._hkdf.labeledExtract(EMPTY.buffer, LABEL_DKP_PRK, new Uint8Array(ikm))
      const rawSk = await this._hkdf.labeledExpand(dkpPrk, LABEL_SK, EMPTY, this._nSk)
      const sk = new Uint8Array(rawSk)
      const pk = x25519.getPublicKey(sk)
      return { privateKey: sk, publicKey: pk }
    } catch (e) {
      throw new DeriveKeyPairError(e)
    }
  }

  async derivePublicKey(key) {
    try {
      return x25519.getPublicKey(new Uint8Array(key))
    } catch (e) {
      throw new DeserializeError(e)
    }
  }

  async dh(sk, pk) {
    try {
      const shared = x25519.getSharedSecret(new Uint8Array(sk), new Uint8Array(pk))
      return toCleanArrayBuffer(shared)
    } catch (e) {
      throw new SerializeError(e)
    }
  }
}
