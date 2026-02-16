/**
 * Password-based encryption utilities for KeyPackage export/import.
 *
 * Uses Web Crypto API:
 * - PBKDF2 for key derivation (100k iterations, SHA-256)
 * - AES-GCM (256-bit) for symmetric encryption
 */

/** Encrypted export file format */
export interface EncryptedKeyPackageExport {
  version: 1
  /** PBKDF2 salt, base64-encoded */
  salt: string
  /** AES-GCM IV/nonce, base64-encoded */
  iv: string
  /** AES-GCM ciphertext, base64-encoded */
  ciphertext: string
}

/** Plaintext payload inside the encrypted envelope */
export interface KeyPackageExportPayload {
  /** The signed Nostr event (kind:443) */
  event: {
    id: string
    pubkey: string
    created_at: number
    kind: number
    tags: string[][]
    content: string
    sig: string
  }
  /** MLS private key material (hex-encoded) */
  privateKeys: {
    /** Credential private key (identity binding) */
    credentialKey: string
    /** Signature private key (leaf node signing) */
    signatureKey: string
  }
  /** Export metadata */
  metadata: {
    client: string
    relays: string[]
    ciphersuite: string
    exportedAt: number
  }
}

const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const IV_BYTES = 12 // AES-GCM standard

// ─── Helpers ────────────────────────────────────────────────────────────────

function toBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) {
    binary += String.fromCharCode(b)
  }
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Derive an AES-256-GCM key from a password using PBKDF2.
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Encrypt a KeyPackage export payload with a password.
 *
 * @returns The encrypted envelope ready for JSON serialization + download.
 */
export async function encryptKeyPackageExport(
  payload: KeyPackageExportPayload,
  password: string,
): Promise<EncryptedKeyPackageExport> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt)

  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    plaintext as BufferSource,
  )

  return {
    version: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  }
}

/**
 * Decrypt an encrypted KeyPackage export file.
 *
 * @throws Error if the password is wrong or the file is corrupted.
 */
export async function decryptKeyPackageExport(
  encrypted: EncryptedKeyPackageExport,
  password: string,
): Promise<KeyPackageExportPayload> {
  if (encrypted.version !== 1) {
    throw new Error(`Unsupported export format version: ${encrypted.version}`)
  }

  const salt = fromBase64(encrypted.salt)
  const iv = fromBase64(encrypted.iv)
  const ciphertext = fromBase64(encrypted.ciphertext)
  const key = await deriveKey(password, salt)

  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext as BufferSource,
    )
  } catch {
    throw new Error('Decryption failed — wrong password or corrupted file')
  }

  const json = new TextDecoder().decode(plaintext)
  let payload: KeyPackageExportPayload
  try {
    payload = JSON.parse(json) as KeyPackageExportPayload
  } catch {
    throw new Error('Decrypted data is not valid JSON — file may be corrupted')
  }

  // Basic structural validation
  if (!payload.event || !payload.privateKeys || !payload.metadata) {
    throw new Error('Invalid export payload — missing required fields')
  }
  if (!payload.event.id || !payload.event.pubkey || !payload.event.sig) {
    throw new Error('Invalid export payload — malformed event data')
  }
  if (!payload.privateKeys.credentialKey || !payload.privateKeys.signatureKey) {
    throw new Error('Invalid export payload — missing private keys')
  }

  return payload
}

/**
 * Validate that a parsed JSON object looks like an EncryptedKeyPackageExport.
 */
export function isValidEncryptedExport(obj: unknown): obj is EncryptedKeyPackageExport {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    o.version === 1 &&
    typeof o.salt === 'string' &&
    typeof o.iv === 'string' &&
    typeof o.ciphertext === 'string'
  )
}

/**
 * Trigger a browser file download.
 */
export function downloadFile(content: string, filename: string, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
