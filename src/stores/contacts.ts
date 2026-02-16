/**
 * Contacts Store
 *
 * Manages the user's following list (kind:3 contacts).
 *
 * Uses direct Vue reactivity instead of Immer to avoid proxy conflicts.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useContactsStore = defineStore('contacts', () => {
  // State
  const following = ref<string[]>([])
  const loading = ref(false)
  const searchQuery = ref('')

  // Getters
  const filteredContacts = computed(() => {
    if (!searchQuery.value) return following.value
    const q = searchQuery.value.toLowerCase()
    return following.value.filter((pubkey) => pubkey.toLowerCase().includes(q))
  })

  const contactCount = computed(() => following.value.length)

  /**
   * Set following list from kind:3 event.
   */
  function setFollowing(pubkeys: string[]): void {
    // Deduplicate
    const seen = new Set<string>()
    following.value = pubkeys.filter((pk) => {
      if (seen.has(pk)) return false
      seen.add(pk)
      return true
    })
  }

  /**
   * Add a contact to following list.
   */
  function addContact(pubkey: string): void {
    if (!following.value.includes(pubkey)) {
      following.value = [...following.value, pubkey]
    }
  }

  /**
   * Remove a contact from following list.
   */
  function removeContact(pubkey: string): void {
    following.value = following.value.filter((pk) => pk !== pubkey)
  }

  /**
   * Set search query for filtering.
   */
  function setSearchQuery(query: string): void {
    searchQuery.value = query
  }

  return {
    following,
    loading,
    searchQuery,
    filteredContacts,
    contactCount,
    setFollowing,
    addContact,
    removeContact,
    setSearchQuery,
  }
})
