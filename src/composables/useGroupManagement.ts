/**
 * useGroupManagement composable
 *
 * Group management operations: leave group, add members.
 * Since marmot-ts doesn't expose an MLS self-remove/leave operation yet,
 * "Leave Group" performs a local-only cleanup (removes conversation + MLS state).
 */

import { useAuthStore } from '@/stores/auth'
import { useConversationsStore } from '@/stores/conversations'
import { useNostr } from './useNostr'
import {
  addMlsGroupMembers,
  encodeWelcome,
  parseKeyPackageBytes,
} from 'marmot-ts/mls'
import {
  createWelcomeRumor,
  giftWrapWelcome,
  hexToBytes,
} from 'marmot-ts'
import type { Event as NostrEvent } from 'nostr-tools'

export function useGroupManagement() {
  const authStore = useAuthStore()
  const conversationsStore = useConversationsStore()
  const { publishEvent, fetchKeyPackageEvents } = useNostr()

  /**
   * Leave a group conversation.
   *
   * Since marmot-ts/mls doesn't have a self-remove operation yet,
   * this performs a local-only cleanup:
   * 1. Removes the conversation from the store
   * 2. Clears MLS state from IndexedDB
   * 3. Active conversation is reset
   *
   * TODO: When marmot-ts adds MLS self-remove, publish a remove commit
   * so other members are notified of the departure.
   */
  async function leaveGroup(conversationId: string): Promise<void> {
    const pubkey = authStore.pubkey
    if (!pubkey) throw new Error('Not authenticated')

    const conversation = conversationsStore.conversations[conversationId]
    if (!conversation) throw new Error('Conversation not found')

    console.log(`[GroupMgmt] Leaving group ${conversationId.slice(0, 12)}...`)

    // Remove conversation (also clears MLS state and active conversation)
    conversationsStore.removeConversation(conversationId)

    console.log(`[GroupMgmt] Left group ${conversationId.slice(0, 12)}... (local cleanup done)`)
  }

  /**
   * Add members to an existing group conversation.
   *
   * 1. Fetches KeyPackages for new members
   * 2. Creates MLS Add commit
   * 3. Sends Welcome events via NIP-59 gift wrap
   * 4. Updates conversation members list
   *
   * @param conversationId - The conversation to add members to
   * @param memberPubkeys - Array of pubkeys to add
   */
  async function addMembers(
    conversationId: string,
    memberPubkeys: string[],
  ): Promise<{ added: string[]; failed: string[] }> {
    const pubkey = authStore.pubkey
    if (!pubkey) throw new Error('Not authenticated')

    const conversation = conversationsStore.conversations[conversationId]
    if (!conversation) throw new Error('Conversation not found')

    const mlsState = await conversationsStore.getMlsState(conversationId)
    if (!mlsState) throw new Error('No MLS state for this conversation')

    console.log(
      `[GroupMgmt] Adding ${memberPubkeys.length} members to ${conversationId.slice(0, 12)}...`,
    )

    const added: string[] = []
    const failed: string[] = []

    // Fetch KeyPackage events for all new members
    const kpEvents = await fetchKeyPackageEvents(memberPubkeys)
    console.log(`[GroupMgmt] Fetched ${kpEvents.length} KeyPackage events`)

    // Parse KeyPackages per member
    const memberKeyPackages: Array<{
      pubkey: string
      eventId: string
      mlsKeyPackage: import('marmot-ts/mls').KeyPackage
    }> = []

    for (const memberPubkey of memberPubkeys) {
      const memberEvents = kpEvents.filter((e: NostrEvent) => e.pubkey === memberPubkey)
      if (memberEvents.length === 0) {
        console.warn(`[GroupMgmt] No KeyPackage found for ${memberPubkey.slice(0, 8)}...`)
        failed.push(memberPubkey)
        continue
      }

      // Use the most recent valid KeyPackage
      const sorted = memberEvents.sort((a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at)
      let parsed = false
      for (const evt of sorted) {
        try {
          const hasBase64Tag = evt.tags.some(
            (t: string[]) => t[0] === 'encoding' && t[1] === 'base64',
          )
          const hasHexTag = evt.tags.some(
            (t: string[]) => t[0] === 'encoding' && t[1] === 'hex',
          )
          let kpBytes: Uint8Array

          if (hasBase64Tag || !hasHexTag) {
            const binary = atob(evt.content)
            kpBytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) kpBytes[i] = binary.charCodeAt(i)
          } else {
            kpBytes = hexToBytes(evt.content)
          }

          const mlsKp = parseKeyPackageBytes(kpBytes)
          memberKeyPackages.push({
            pubkey: memberPubkey,
            eventId: evt.id,
            mlsKeyPackage: mlsKp,
          })
          parsed = true
          break
        } catch (err) {
          console.warn(`[GroupMgmt] Failed to parse KeyPackage ${evt.id.slice(0, 8)}...:`, err)
        }
      }

      if (!parsed) {
        failed.push(memberPubkey)
      }
    }

    if (memberKeyPackages.length === 0) {
      return { added, failed }
    }

    // Add all parsed KeyPackages to the MLS group
    try {
      const addResult = await addMlsGroupMembers(
        mlsState,
        memberKeyPackages.map((m) => m.mlsKeyPackage),
        conversation.ciphersuiteName as import('marmot-ts/mls').CiphersuiteName | undefined,
      )

      // Update MLS state
      await conversationsStore.setMlsState(
        conversationId,
        addResult.newState,
        addResult.encodedState,
        addResult.exporterSecret,
      )

      // Encode Welcome
      const welcomeBytes = encodeWelcome(addResult.welcome)
      console.log(
        `[GroupMgmt] MLS Add commit created, Welcome: ${welcomeBytes.length} bytes`,
      )

      // Send Welcome events to each new member
      const signer = authStore.signer
      for (const mkp of memberKeyPackages) {
        try {
          const welcomeRumor = createWelcomeRumor(pubkey, {
            welcomeData: welcomeBytes,
            keyPackageEventId: mkp.eventId,
            relays: conversation.relays,
          })

          if (signer) {
            const giftWrap = await giftWrapWelcome(signer, mkp.pubkey, welcomeRumor)
            await publishEvent(giftWrap as unknown as NostrEvent)
            console.log(
              `[GroupMgmt] Welcome sent to ${mkp.pubkey.slice(0, 8)}...`,
            )
            added.push(mkp.pubkey)
          } else {
            console.error('[GroupMgmt] No signer available for gift wrapping')
            failed.push(mkp.pubkey)
          }
        } catch (err) {
          console.error(`[GroupMgmt] Failed to send Welcome to ${mkp.pubkey.slice(0, 8)}...:`, err)
          failed.push(mkp.pubkey)
        }
      }

      // Update conversation members
      const newMembers = [...conversation.members, ...added]
      conversationsStore.updateMembers(conversationId, newMembers)
    } catch (err) {
      console.error('[GroupMgmt] Failed to add members to MLS group:', err)
      for (const mkp of memberKeyPackages) {
        failed.push(mkp.pubkey)
      }
    }

    return { added, failed }
  }

  return {
    leaveGroup,
    addMembers,
  }
}
