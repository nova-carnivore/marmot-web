/**
 * Marmot protocol integration tests
 *
 * Tests the interaction between marmot-ts and the web client stores.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  createKeyPackageEvent,
  parseKeyPackageEvent,
  hasRequiredMarmotExtensions,
  createGroupData,
  getNostrGroupIdHex,
  createGroupEvent,
  parseGroupEvent,
  createApplicationMessage,
  serializeApplicationMessage,
  deserializeApplicationMessage,
  validateApplicationMessage,
  verifyApplicationMessageSender,
  encryptMedia,
  decryptMedia,
  buildImetaTag,
  parseImetaTag,
  MLS_CIPHERSUITES,
  bytesToHex,
  generateKeypair,
} from 'marmot-ts'
import { useKeyPackagesStore } from '@/stores/keyPackages'
import { useMessagesStore } from '@/stores/messages'
import { useConversationsStore } from '@/stores/conversations'
import type { KeyPackageInfo } from '@/types'

describe('KeyPackage Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should create, parse, and store KeyPackages', () => {
    const keypair = generateKeypair()
    const store = useKeyPackagesStore()

    // Create a KeyPackage event
    const event = createKeyPackageEvent(keypair.publicKeyHex, {
      keyPackageData: new Uint8Array(64),
      ciphersuite: MLS_CIPHERSUITES.MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519,
      relays: ['wss://relay.example.com'],
      clientName: 'marmot-web-test',
    })

    // Simulate signed event (add id + sig for parsing)
    const mockSigned = {
      ...event,
      id: 'test-event-id',
      sig: 'a'.repeat(128),
    }

    // Parse it
    const parsed = parseKeyPackageEvent(mockSigned)
    expect(parsed.pubkey).toBe(keypair.publicKeyHex)
    expect(parsed.ciphersuite).toBe('0x0001')
    expect(parsed.clientName).toBe('marmot-web-test')
    expect(hasRequiredMarmotExtensions(parsed)).toBe(true)

    // Store in keyPackages store
    const kpInfo: KeyPackageInfo = {
      pubkey: parsed.pubkey,
      eventId: parsed.eventId,
      ciphersuite: parsed.ciphersuite,
      relays: parsed.relays,
      createdAt: parsed.createdAt,
      hasRequiredExtensions: hasRequiredMarmotExtensions(parsed),
    }

    store.addKeyPackage(parsed.pubkey, kpInfo)
    expect(store.hasKeyPackage(parsed.pubkey)).toBe(true)
    expect(store.getBestKeyPackage(parsed.pubkey)).toBeDefined()
  })
})

describe('Group Creation Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should create group and store conversation', () => {
    const keypair = generateKeypair()
    const store = useConversationsStore()

    // Create group data using marmot-ts
    const groupData = createGroupData({
      name: 'Test Marmot Group 🦫',
      description: 'Integration test group',
      adminPubkeys: [keypair.publicKeyHex],
      relays: ['wss://relay.example.com'],
    })

    const groupId = getNostrGroupIdHex(groupData)
    expect(groupId).toMatch(/^[0-9a-f]{64}$/)

    // Store as conversation
    store.upsertConversation({
      id: groupId,
      name: groupData.name,
      description: groupData.description,
      members: [keypair.publicKeyHex],
      admins: groupData.adminPubkeys,
      relays: groupData.relays,
      groupData,
      unreadCount: 0,
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
      isAdmin: true,
    })

    expect(store.conversations[groupId]).toBeDefined()
    expect(store.conversations[groupId].name).toBe('Test Marmot Group 🦫')
  })
})

describe('Application Message Integration', () => {
  it('should create, serialize, and validate application messages', () => {
    const keypair = generateKeypair()

    // Create an application message
    const msg = createApplicationMessage(keypair.publicKeyHex, 'Hello, Marmot! 🦫')
    expect(msg.pubkey).toBe(keypair.publicKeyHex)
    expect(msg.content).toBe('Hello, Marmot! 🦫')
    expect(msg.kind).toBe(9)

    // Validate it
    const validation = validateApplicationMessage(msg)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)

    // It must NOT have a signature
    expect('sig' in msg).toBe(false)

    // Serialize and deserialize
    const json = serializeApplicationMessage(msg)
    const restored = deserializeApplicationMessage(json)
    expect(restored.content).toBe('Hello, Marmot! 🦫')
    expect(restored.pubkey).toBe(keypair.publicKeyHex)

    // Verify sender
    expect(
      verifyApplicationMessageSender(restored.pubkey, keypair.publicKeyHex),
    ).toBe(true)
  })

  it('should reject application messages with h tags', () => {
    const keypair = generateKeypair()
    expect(() =>
      createApplicationMessage(keypair.publicKeyHex, 'test', 9, [
        ['h', 'group-id-leak'],
      ]),
    ).toThrow('MUST NOT include h tags')
  })
})

describe('Group Event Integration', () => {
  it('should create and parse group events', async () => {
    const keypair = generateKeypair()
    const groupId = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))

    // Create a group event with ephemeral keypair
    const { event, ephemeralPrivateKey } = await createGroupEvent({
      encryptedContent: 'test-encrypted-content',
      nostrGroupId: groupId,
    })

    expect(event.kind).toBe(445)
    expect(event.id).toBeDefined()
    expect(event.sig).toBeDefined()
    expect(ephemeralPrivateKey).toMatch(/^[0-9a-f]{64}$/)

    // Parse it
    const parsed = parseGroupEvent(event)
    expect(parsed.nostrGroupId).toBe(groupId)
    expect(parsed.encryptedContent).toBe('test-encrypted-content')
    expect(parsed.ephemeralPubkey).toBe(event.pubkey)
  })
})

describe('MIP-04 Media Integration', () => {
  it('should encrypt and decrypt media', () => {
    const testData = new TextEncoder().encode('Hello, encrypted world!')
    const exporterSecret = crypto.getRandomValues(new Uint8Array(32))

    // Encrypt
    const result = encryptMedia({
      data: testData,
      mimeType: 'text/plain',
      filename: 'test.txt',
      exporterSecret,
    })

    expect(result.encryptedData.length).toBeGreaterThan(testData.length)
    expect(result.meta.mimeType).toBe('text/plain')
    expect(result.meta.filename).toBe('test.txt')
    expect(result.meta.version).toBe('mip04-v2')
    expect(result.meta.nonce).toHaveLength(24) // 12 bytes = 24 hex chars

    // Build and parse imeta tag
    result.meta.url = 'https://example.com/blob'
    const tag = buildImetaTag(result.meta)
    expect(tag[0]).toBe('imeta')

    const parsedMeta = parseImetaTag(tag)
    expect(parsedMeta.url).toBe('https://example.com/blob')
    expect(parsedMeta.mimeType).toBe('text/plain')
    expect(parsedMeta.nonce).toBe(result.meta.nonce)

    // Decrypt
    const decrypted = decryptMedia({
      encryptedData: result.encryptedData,
      meta: result.meta,
      exporterSecret,
    })

    const decryptedText = new TextDecoder().decode(decrypted)
    expect(decryptedText).toBe('Hello, encrypted world!')
  })

  it('should reject wrong exporter secret', () => {
    const testData = new TextEncoder().encode('Secret data')
    const correctSecret = crypto.getRandomValues(new Uint8Array(32))
    const wrongSecret = crypto.getRandomValues(new Uint8Array(32))

    const result = encryptMedia({
      data: testData,
      mimeType: 'text/plain',
      filename: 'secret.txt',
      exporterSecret: correctSecret,
    })
    result.meta.url = 'https://example.com/blob'

    expect(() =>
      decryptMedia({
        encryptedData: result.encryptedData,
        meta: result.meta,
        exporterSecret: wrongSecret,
      }),
    ).toThrow()
  })
})
