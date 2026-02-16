/**
 * useMarmot composable
 *
 * Core Marmot protocol logic: group creation, messaging, encryption.
 * Uses marmot-ts/mls for real RFC 9420 MLS group management.
 * Message encryption uses NIP-44 + exporter secret (MIP-03).
 */

import { useAuthStore } from '@/stores/auth'
import { useConversationsStore } from '@/stores/conversations'
import { useMessagesStore } from '@/stores/messages'
import { useKeyPackagesStore } from '@/stores/keyPackages'
import { useNostr } from './useNostr'
import {
  createGroupData,
  getNostrGroupIdHex,
  createGroupEvent,
  createApplicationMessage,
  serializeApplicationMessage,
  deserializeApplicationMessage,
  parseGroupEvent,
  encryptGroupContent,
  decryptGroupContent,
  deriveEncryptionKeypair,
  createWelcomeRumor,
  giftWrapWelcome,
  isAdmin,
  hexToBytes,
} from 'marmot-ts'
import { PrivateKeySigner } from 'marmot-ts/signer'
import type { MarmotGroupData } from 'marmot-ts'
import type { Conversation, ChatMessage } from '@/types'
import { randomHex } from '@/utils'
import {
  createMlsGroup,
  addMlsGroupMembers,
  joinMlsGroupFromWelcome,
  parseKeyPackageBytes,
  encodeWelcome,
  decodeWelcome,
  makeCustomExtension,
  type CiphersuiteName,
} from 'marmot-ts/mls'
import { serializeMarmotGroupData } from 'marmot-ts/mip01'
import { loadKeyPackageData } from '@/services/mlsStorage'

export function useMarmot() {
  const authStore = useAuthStore()
  const conversationsStore = useConversationsStore()
  const messagesStore = useMessagesStore()
  const keyPackagesStore = useKeyPackagesStore()
  const { publishEvent, subscribeToGroup, fetchKeyPackageEvents } = useNostr()

  /**
   * Create a new Marmot group with real MLS session.
   */
  async function createGroup(options: {
    name: string
    description?: string
    memberPubkeys: string[]
    relays: string[]
    ciphersuiteName?: CiphersuiteName
  }): Promise<Conversation> {
    const pubkey = authStore.pubkey
    if (!pubkey) throw new Error('Not authenticated')

    // Create MLS group data
    const groupData = createGroupData({
      name: options.name,
      description: options.description,
      adminPubkeys: [pubkey],
      relays: options.relays,
    })

    const nostrGroupId = getNostrGroupIdHex(groupData)
    const groupIdBytes = hexToBytes(nostrGroupId)

    // Serialize Marmot Group Data as a custom MLS extension (0xf2ee)
    const groupDataBytes = serializeMarmotGroupData(groupData)
    const marmotExtension = makeCustomExtension({
      extensionType: 0xf2ee,
      extensionData: groupDataBytes,
    })

    // Create real MLS group using ts-mls, with Marmot group data extension
    const mlsResult = await createMlsGroup(
      groupIdBytes,
      pubkey,
      options.ciphersuiteName,
      [marmotExtension],
    )

    console.log('[Marmot] MLS group created with real RFC 9420 state + 0xf2ee extension')

    // Add members: fetch their KeyPackages, parse, and add to MLS group
    let finalState = mlsResult.state
    let finalEncodedState = mlsResult.encodedState
    let finalExporterSecret = mlsResult.exporterSecret
    const welcomesByMember: Map<string, { welcomeData: Uint8Array; keyPackageEventId: string }[]> =
      new Map()

    if (options.memberPubkeys.length > 0) {
      // Fetch raw kind:443 events for all members
      const kpEvents = await fetchKeyPackageEvents(options.memberPubkeys)
      console.log(
        `[Marmot] Fetched ${kpEvents.length} KeyPackage events for ${options.memberPubkeys.length} members`,
      )

      // Parse KeyPackages and group by member
      const memberKeyPackages: Array<{
        pubkey: string
        eventId: string
        mlsKeyPackage: import('marmot-ts/mls').KeyPackage
      }> = []

      for (const memberPubkey of options.memberPubkeys) {
        const memberEvents = kpEvents.filter((e) => e.pubkey === memberPubkey)
        if (memberEvents.length === 0) {
          console.warn(`[Marmot] No KeyPackage found for member ${memberPubkey.slice(0, 8)}...`)
          continue
        }

        // Use the most recent valid KeyPackage
        const sorted = memberEvents.sort((a, b) => b.created_at - a.created_at)
        for (const evt of sorted) {
          try {
            // Decode content (base64 or hex)
            const hasHexTag = evt.tags.some((t: string[]) => t[0] === 'encoding' && t[1] === 'hex')
            const hasBase64Tag = evt.tags.some(
              (t: string[]) => t[0] === 'encoding' && t[1] === 'base64',
            )
            let kpBytes: Uint8Array

            if (hasBase64Tag || !hasHexTag) {
              // Default to base64
              const binary = atob(evt.content)
              kpBytes = new Uint8Array(binary.length)
              for (let i = 0; i < binary.length; i++) kpBytes[i] = binary.charCodeAt(i)
            } else {
              // Hex encoding
              kpBytes = hexToBytes(evt.content)
            }

            const mlsKp = parseKeyPackageBytes(kpBytes)
            memberKeyPackages.push({
              pubkey: memberPubkey,
              eventId: evt.id,
              mlsKeyPackage: mlsKp,
            })
            console.log(
              `[Marmot] Parsed KeyPackage for ${memberPubkey.slice(0, 8)}... (${evt.id.slice(0, 8)}...)`,
            )
            break // Use first valid one
          } catch (err) {
            console.warn(`[Marmot] Failed to parse KeyPackage ${evt.id.slice(0, 8)}...:`, err)
          }
        }
      }

      // Add all parsed KeyPackages to the MLS group
      if (memberKeyPackages.length > 0) {
        try {
          const addResult = await addMlsGroupMembers(
            finalState,
            memberKeyPackages.map((m) => m.mlsKeyPackage),
            options.ciphersuiteName,
          )

          finalState = addResult.newState
          finalEncodedState = addResult.encodedState
          finalExporterSecret = addResult.exporterSecret

          // Encode Welcome message
          const welcomeBytes = encodeWelcome(addResult.welcome)
          console.log(
            `[Marmot] MLS Add commit created, Welcome: ${welcomeBytes.length} bytes, epoch: ${addResult.newState.groupContext.epoch}`,
          )

          // Create Welcome entries for each member
          for (const mkp of memberKeyPackages) {
            const existing = welcomesByMember.get(mkp.pubkey) ?? []
            existing.push({ welcomeData: welcomeBytes, keyPackageEventId: mkp.eventId })
            welcomesByMember.set(mkp.pubkey, existing)
          }
        } catch (err) {
          console.error('[Marmot] Failed to add members to MLS group:', err)
          // Continue with the group creation even if member addition fails
        }
      }
    }

    // Create conversation object
    const conversation: Conversation = {
      id: nostrGroupId,
      name: options.name,
      description: options.description ?? '',
      members: [pubkey, ...options.memberPubkeys],
      admins: [pubkey],
      relays: options.relays,
      groupData,
      exporterSecret: finalExporterSecret,
      hasMlsSession: true,
      mlsGroupId: finalState.groupContext?.groupId ?? mlsResult.groupId,
      unreadCount: 0,
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
      isAdmin: true,
    }

    conversationsStore.upsertConversation(conversation)

    // Store MLS state in IndexedDB
    await conversationsStore.setMlsState(
      nostrGroupId,
      finalState,
      finalEncodedState,
      finalExporterSecret,
    )

    // Send Welcome events to all members via NIP-59 gift-wrapped kind:444
    for (const [memberPubkey, welcomes] of welcomesByMember) {
      for (const { welcomeData, keyPackageEventId } of welcomes) {
        try {
          const welcomeRumor = createWelcomeRumor(pubkey, {
            welcomeData,
            keyPackageEventId,
            relays: groupData.relays,
          })

          // Gift wrap the Welcome event (MIP-02 requires NIP-59 wrapping)
          const signer = authStore.signer
          if (signer) {
            // giftWrapWelcome creates an unsigned rumor, encrypts it with NIP-44,
            // wraps it in a kind:1059 gift wrap with ephemeral key
            const giftWrap = await giftWrapWelcome(signer, memberPubkey, welcomeRumor)
            await publishEvent(giftWrap as unknown as import('nostr-tools').Event)
            console.log(
              `[Marmot] Welcome gift-wrapped and sent to ${memberPubkey.slice(0, 8)}... (kp: ${keyPackageEventId.slice(0, 8)}...)`,
            )
          } else {
            console.error(
              `[Marmot] ⚠️ No signer available — cannot gift-wrap Welcome for ${memberPubkey.slice(0, 8)}...! ` +
              `NIP-46 users need a proper signer implementation.`,
            )
          }
        } catch (err) {
          console.error(`[Marmot] Failed to send Welcome to ${memberPubkey.slice(0, 8)}...:`, err)
        }
      }
    }

    // Subscribe to group events
    subscribeToGroup(nostrGroupId, (event) => {
      handleGroupEvent(nostrGroupId, event)
    })

    return conversation
  }

  /**
   * Send a text message to a conversation.
   */
  async function sendMessage(conversationId: string, content: string): Promise<void> {
    const pubkey = authStore.pubkey
    if (!pubkey) throw new Error('Not authenticated')

    const conversation = conversationsStore.conversations[conversationId]
    if (!conversation) throw new Error('Conversation not found')

    // Create the application message (unsigned inner event)
    const appMsg = createApplicationMessage(pubkey, content)
    const msgJson = serializeApplicationMessage(appMsg)

    // Create a pending message for optimistic UI
    const pendingId = randomHex(32)
    const chatMessage: ChatMessage = {
      id: pendingId,
      conversationId,
      senderPubkey: pubkey,
      content,
      kind: 9,
      createdAt: Math.floor(Date.now() / 1000),
      status: 'sending',
    }
    messagesStore.addMessage(chatMessage)

    try {
      if (!conversation.exporterSecret) {
        throw new Error(
          'Cannot send message: no MLS exporter secret. ' +
            'Group encryption key is missing — MLS session may not be established.',
        )
      }

      // Encrypt the application message with NIP-44 using the MLS-derived exporter secret
      const { privateKeyHex } = deriveEncryptionKeypair(conversation.exporterSecret)
      const encryptionSigner = new PrivateKeySigner(privateKeyHex)
      const encryptedContent = await encryptGroupContent(
        encryptionSigner,
        msgJson,
        conversation.exporterSecret,
      )
      console.log('[Marmot] Message encrypted with NIP-44 + MLS exporter secret')

      // Create kind:445 event with ephemeral keypair
      const { event } = await createGroupEvent({
        encryptedContent,
        nostrGroupId: conversationId,
      })

      await publishEvent(event as unknown as import('nostr-tools').Event)

      // Update message status
      messagesStore.updateMessage(conversationId, pendingId, {
        id: event.id,
        status: 'sent',
      })

      // Update conversation last message
      conversationsStore.updateLastMessage(conversationId, {
        content,
        senderPubkey: pubkey,
        timestamp: chatMessage.createdAt,
      })
    } catch (err) {
      messagesStore.updateMessage(conversationId, pendingId, { status: 'failed' })
      throw err
    }
  }

  /**
   * Handle incoming group events.
   *
   * NO cleartext fallback — encrypted or nothing.
   */
  async function handleGroupEvent(
    conversationId: string,
    event: import('nostr-tools').Event,
  ): Promise<void> {
    try {
      const parsed = parseGroupEvent(event as unknown as import('marmot-ts').SignedEvent)
      const conversation = conversationsStore.conversations[conversationId]

      let content: string
      let senderPubkey: string

      if (!conversation?.exporterSecret) {
        // No exporter secret — cannot decrypt
        console.warn('[Marmot] No MLS exporter secret for conversation, cannot decrypt')
        content = '[Encrypted message — cannot decrypt]'
        senderPubkey = parsed.ephemeralPubkey
      } else {
        // Decrypt NIP-44 layer using the MLS-derived exporter secret
        try {
          const { privateKeyHex } = deriveEncryptionKeypair(conversation.exporterSecret)
          const decryptionSigner = new PrivateKeySigner(privateKeyHex)
          const decrypted = await decryptGroupContent(
            decryptionSigner,
            parsed.encryptedContent,
            conversation.exporterSecret,
          )

          // Parse the decrypted application message
          const inner = deserializeApplicationMessage(decrypted)
          content = inner.content
          senderPubkey = inner.pubkey
          console.log('[Marmot] Message decrypted successfully')
        } catch (decryptErr) {
          // Decryption failed — show encrypted indicator, NEVER fall back to cleartext
          console.warn('[Marmot] Decryption failed:', decryptErr)
          content = '[Encrypted message — cannot decrypt]'
          senderPubkey = parsed.ephemeralPubkey
        }
      }

      const chatMessage: ChatMessage = {
        id: parsed.eventId,
        conversationId,
        senderPubkey,
        content,
        kind: 9,
        createdAt: parsed.createdAt,
        status: 'sent',
      }

      messagesStore.addMessage(chatMessage)

      conversationsStore.updateLastMessage(conversationId, {
        content,
        senderPubkey,
        timestamp: parsed.createdAt,
      })
    } catch {
      // Failed to process group event
    }
  }

  /**
   * Create Welcome events for new group members.
   *
   * When adding members, this creates an MLS commit with Add proposals,
   * generates Welcome messages, and sends them via Nostr.
   */
  async function sendWelcomes(
    groupData: MarmotGroupData,
    memberPubkeys: string[],
    welcomeData: Uint8Array,
    selectedKeyPackages?: Record<string, string[]>,
  ): Promise<void> {
    const pubkey = authStore.pubkey
    if (!pubkey) throw new Error('Not authenticated')

    for (const memberPubkey of memberPubkeys) {
      // Determine which KeyPackage event IDs to send Welcomes to
      let keyPackageEventIds: string[] = []

      if (selectedKeyPackages && selectedKeyPackages[memberPubkey]?.length > 0) {
        keyPackageEventIds = selectedKeyPackages[memberPubkey]
      } else {
        // Fallback: use the best KeyPackage
        const kp = keyPackagesStore.getBestKeyPackage(memberPubkey)
        if (kp) keyPackageEventIds = [kp.eventId]
      }

      for (const keyPackageEventId of keyPackageEventIds) {
        const welcomeRumor = createWelcomeRumor(pubkey, {
          welcomeData,
          keyPackageEventId,
          relays: groupData.relays,
        })

        // Gift wrap the Welcome event per MIP-02 (NIP-59 required)
        const signer = authStore.signer
        if (signer) {
          const giftWrap = await giftWrapWelcome(signer, memberPubkey, welcomeRumor)
          await publishEvent(giftWrap as unknown as import('nostr-tools').Event)
          console.log(
            `[Marmot] Welcome gift-wrapped and sent to ${memberPubkey.slice(0, 8)}... (kp: ${keyPackageEventId.slice(0, 8)}...)`,
          )
        }
      }
    }
  }

  /**
   * Handle an incoming Welcome message to join an MLS group.
   */
  async function handleWelcome(
    welcomeBytes: Uint8Array,
    keyPackageEventId: string,
    relays: string[],
  ): Promise<Conversation | null> {
    const pubkey = authStore.pubkey
    if (!pubkey) throw new Error('Not authenticated')

    try {
      const welcome = decodeWelcome(welcomeBytes)

      // Load the KeyPackage that was used
      const kpData = await loadKeyPackageData(keyPackageEventId)
      if (!kpData) {
        console.error('[Marmot] KeyPackage not found for Welcome processing:', keyPackageEventId)
        return null
      }

      // Join the MLS group
      const joinResult = await joinMlsGroupFromWelcome(
        welcome,
        kpData.publicPackage,
        kpData.privatePackage,
      )

      console.log('[Marmot] Joined MLS group via Welcome')

      // Extract Marmot Group Data extension (0xf2ee) from group context
      const extensions = joinResult.state.groupContext.extensions ?? []
      let groupData: MarmotGroupData | null = null

      for (const ext of extensions) {
        const extType = ext.extensionType
        // In ts-mls v2, extensionData can be Uint8Array | RequiredCapabilities | ExternalSender
        // Custom extensions (like 0xf2ee) have Uint8Array extensionData
        const extData = ext.extensionData
        const extLen = extData instanceof Uint8Array ? extData.length : 0
        console.log(
          `[Marmot] Extension 0x${(typeof extType === 'number' ? extType : 0).toString(16)}: ${extLen} bytes`,
        )
        if (extType === 0xf2ee && extData instanceof Uint8Array) {
          try {
            const { deserializeMarmotGroupData } = await import('marmot-ts/mip01')
            groupData = deserializeMarmotGroupData(extData)
            console.log('[Marmot] Extracted group data (v' + groupData.version + '):', {
              name: groupData.name,
              admins: groupData.adminPubkeys.length,
              relays: groupData.relays.length,
            })
            break
          } catch (err) {
            console.error('[Marmot] Failed to deserialize group data:', err)
          }
        }
      }

      if (!groupData) {
        console.error('[Marmot] No Marmot Group Data extension found in Welcome')
        return null
      }

      // Get Nostr group ID from group data
      const nostrGroupId = getNostrGroupIdHex(groupData)

      // Extract members from MLS ratchet tree (all leaf nodes)
      // In ts-mls v2, nodeType and credentialType are numeric:
      // nodeTypes.leaf = 1, defaultCredentialTypes.basic = 1
      const members: string[] = []
      if (joinResult.state.ratchetTree) {
        for (const node of joinResult.state.ratchetTree) {
          if (
            node &&
            node.nodeType === 1 && // nodeTypes.leaf
            node.leaf?.credential &&
            node.leaf.credential.credentialType === 1 // defaultCredentialTypes.basic
          ) {
            try {
              // Extract pubkey from credential identity (32 bytes)
              // In ts-mls v2, basic credentials have 'identity', custom have 'data'
              const cred = node.leaf.credential as { identity?: Uint8Array }
              const identity = cred.identity
              if (identity && identity.length === 32) {
                const { bytesToHex } = await import('marmot-ts')
                const memberPubkey = bytesToHex(identity)
                members.push(memberPubkey)
              }
            } catch (err) {
              console.warn('[Marmot] Failed to extract member pubkey from leaf node:', err)
            }
          }
        }
      }

      console.log('[Marmot] Extracted members from ratchet tree:', members.length)

      // Create conversation object
      const conversation: Conversation = {
        id: nostrGroupId,
        name: groupData.name,
        description: groupData.description,
        members: members.length > 0 ? members : groupData.adminPubkeys, // Fallback to admins
        admins: groupData.adminPubkeys,
        relays: relays.length > 0 ? relays : groupData.relays,
        groupData,
        exporterSecret: joinResult.exporterSecret,
        hasMlsSession: true,
        mlsGroupId: joinResult.groupId,
        unreadCount: 0,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
        isAdmin: groupData.adminPubkeys.includes(pubkey),
      }

      // Save to store
      conversationsStore.upsertConversation(conversation)

      // Store MLS state in IndexedDB
      await conversationsStore.setMlsState(
        nostrGroupId,
        joinResult.state,
        joinResult.encodedState,
        joinResult.exporterSecret,
      )

      console.log('[Marmot] Conversation created and MLS state saved:', nostrGroupId)

      // Subscribe to group events
      subscribeToGroup(nostrGroupId, (event) => {
        handleGroupEvent(nostrGroupId, event)
      })

      console.log('[Marmot] Subscribed to group events for:', nostrGroupId)

      return conversation
    } catch (err) {
      console.error('[Marmot] Failed to process Welcome:', err)
      return null
    }
  }

  /**
   * Restore MLS states on app load.
   */
  async function restoreMlsStates(): Promise<void> {
    await conversationsStore.restoreAllMlsStates()
    console.log('[Marmot] MLS states restored from IndexedDB')
  }

  /**
   * Check if the current user is admin of a conversation.
   */
  function isCurrentUserAdmin(conversationId: string): boolean {
    const conversation = conversationsStore.conversations[conversationId]
    if (!conversation || !authStore.pubkey) return false
    return isAdmin(conversation.groupData, authStore.pubkey)
  }

  return {
    createGroup,
    sendMessage,
    handleGroupEvent,
    sendWelcomes,
    handleWelcome,
    restoreMlsStates,
    isCurrentUserAdmin,
  }
}
