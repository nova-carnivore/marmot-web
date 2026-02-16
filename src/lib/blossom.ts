/**
 * Blossom client for media uploads
 * 
 * Blossom is a media storage protocol built on Nostr.
 * Spec: https://github.com/hzrd149/blossom
 * 
 * Features:
 * - Upload encrypted media to Blossom servers
 * - NIP-98 HTTP authentication
 * - BUD-03 server discovery (user preferences)
 * - SHA-256 content addressing
 */

import type { MarmotSigner } from 'marmot-ts/signer'

/**
 * Blossom server configuration
 */
export interface BlossomServer {
  url: string
  name?: string
}

/**
 * NIP-98 HTTP Authorization Event (kind:27235)
 * https://github.com/nostr-protocol/nips/blob/master/98.md
 */
interface NIP98AuthEvent {
  kind: 27235
  created_at: number
  tags: string[][]
  content: string
  pubkey: string
  id?: string
  sig?: string
}

/**
 * Default Blossom server
 */
export const DEFAULT_BLOSSOM_SERVER: BlossomServer = {
  url: 'https://blossom.primal.net',
  name: 'Primal',
}

/**
 * Calculate SHA-256 hash of data
 */
export async function sha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Create NIP-98 authorization event for HTTP request
 */
async function createAuthEvent(
  method: string,
  url: string,
  payload: Uint8Array,
  signer: MarmotSigner,
): Promise<NIP98AuthEvent> {
  const hash = await sha256(payload)
  const pubkey = await signer.getPublicKey()

  const event: NIP98AuthEvent = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method],
      ['x', hash],
    ],
    content: '',
    pubkey,
  }

  // Sign the event
  const signed = await signer.signEvent(event)
  event.id = signed.id
  event.sig = signed.sig

  return event
}

/**
 * Encode event as base64 for Authorization header
 */
function encodeAuthEvent(event: NIP98AuthEvent): string {
  const json = JSON.stringify(event)
  const bytes = new TextEncoder().encode(json)
  // Use btoa with Uint8Array → binary string conversion
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Upload encrypted file to Blossom server
 * 
 * @param data - Encrypted file data
 * @param server - Blossom server URL
 * @param signer - Nostr signer for NIP-98 auth
 * @returns Blossom URL (https://server/<sha256>)
 */
export async function uploadToBlossom(
  data: Uint8Array,
  server: BlossomServer,
  signer: MarmotSigner,
): Promise<string> {
  const hash = await sha256(data)
  const uploadUrl = `${server.url.replace(/\/$/, '')}/upload`

  // Create NIP-98 auth event
  const authEvent = await createAuthEvent('PUT', uploadUrl, data, signer)
  const authHeader = `Nostr ${encodeAuthEvent(authEvent)}`

  console.log(`[Blossom] Uploading ${data.byteLength} bytes to ${server.url}`)
  console.log(`[Blossom] SHA-256: ${hash}`)

  // Upload with NIP-98 authorization
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      Authorization: authHeader,
    },
    body: data as BodyInit,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(
      `Blossom upload failed: ${response.status} ${response.statusText} - ${errorText}`,
    )
  }

  const result = (await response.json()) as { url?: string; sha256?: string }

  // Verify server returned correct hash
  if (result.sha256 && result.sha256 !== hash) {
    throw new Error(`SHA-256 mismatch: expected ${hash}, got ${result.sha256}`)
  }

  const blossomUrl = result.url || `${server.url.replace(/\/$/, '')}/${hash}`
  console.log(`[Blossom] Upload complete: ${blossomUrl}`)

  return blossomUrl
}

/**
 * Fetch user's preferred Blossom servers from BUD-03 (kind:10063)
 * https://github.com/hzrd149/blossom/blob/master/buds/03.md
 * 
 * @param pubkey - User's public key
 * @param relays - Relays to query
 * @returns Array of Blossom servers
 */
export async function fetchUserServers(
  pubkey: string,
  _relays: string[],
): Promise<BlossomServer[]> {
  // This would use nostr-tools SimplePool to fetch kind:10063 event
  // For now, return empty array (fallback to default server)
  console.log(`[Blossom] BUD-03 fetch for ${pubkey} not yet implemented`)
  return []
}

/**
 * Publish user's preferred Blossom servers (BUD-03, kind:10063)
 * 
 * @param servers - Array of server URLs
 * @param signer - Nostr signer
 * @param relays - Relays to publish to
 */
export async function publishUserServers(
  servers: BlossomServer[],
  signer: MarmotSigner,
  _relays: string[],
): Promise<void> {
  const pubkey = await signer.getPublicKey()

  const event = {
    kind: 10063,
    created_at: Math.floor(Date.now() / 1000),
    tags: servers.map((s) => ['server', s.url]),
    content: '',
    pubkey,
  }

  const signed = await signer.signEvent(event)
  console.log(`[Blossom] Publishing BUD-03 preferences:`, servers)

  // Would use SimplePool.publish here
  // For now just log
  console.log(`[Blossom] Event:`, signed)
}
