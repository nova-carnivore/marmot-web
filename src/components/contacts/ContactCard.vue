<script setup lang="ts">
/**
 * ContactCard component
 *
 * Displays a contact with profile info, avatar, and KeyPackage status.
 */
import { computed } from 'vue'
import Avatar from '@/components/common/Avatar.vue'
import { useProfilesStore } from '@/stores/profiles'
import { useKeyPackagesStore } from '@/stores/keyPackages'
import { getDisplayName, shortenNpub, pubkeyToNpub } from '@/utils/nostr'

const props = defineProps<{
  pubkey: string
  selected?: boolean
  selectable?: boolean
}>()

const emit = defineEmits<{
  click: [pubkey: string]
  startChat: [pubkey: string]
}>()

const profilesStore = useProfilesStore()
const keyPackagesStore = useKeyPackagesStore()

const profile = computed(() => profilesStore.getProfile(props.pubkey))
const displayName = computed(() => getDisplayName(profile.value, props.pubkey))
const npub = computed(() => shortenNpub(pubkeyToNpub(props.pubkey)))
const hasKP = computed(() => keyPackagesStore.hasKeyPackage(props.pubkey))
</script>

<template>
  <div
    class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-base-200"
    :class="{ 'bg-base-200': selected }"
    role="button"
    :aria-label="`Contact: ${displayName}`"
    tabindex="0"
    @click="emit('click', pubkey)"
    @keydown.enter="emit('click', pubkey)"
  >
    <Avatar :src="profile?.picture" :name="displayName" size="md" />

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="font-medium truncate">{{ displayName }}</span>
        <!-- KeyPackage indicator -->
        <span
          v-if="hasKP"
          class="badge badge-success badge-xs"
          title="Has KeyPackage — can start Marmot chat"
        >
          🔐
        </span>
        <span v-else class="badge badge-warning badge-xs" title="No KeyPackage available">
          ⚠️
        </span>
      </div>
      <p class="text-sm text-base-content/60 truncate">
        {{ npub }}
      </p>
    </div>

    <!-- Selection checkbox for multi-select -->
    <input
      v-if="selectable"
      type="checkbox"
      class="checkbox checkbox-primary checkbox-sm"
      :checked="selected"
      @click.stop
      @change="emit('click', pubkey)"
    />

    <!-- Start chat button -->
    <button
      v-if="hasKP && !selectable"
      class="btn btn-primary btn-sm btn-ghost"
      title="Start Marmot Chat"
      @click.stop="emit('startChat', pubkey)"
    >
      💬
    </button>
  </div>
</template>
