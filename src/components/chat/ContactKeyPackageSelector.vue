<script setup lang="ts">
/**
 * ContactKeyPackageSelector component
 *
 * Shows available KeyPackages (devices) for a contact during group creation.
 * Allows multi-device selection when a contact has multiple KeyPackages.
 */
import { computed, ref, watch } from 'vue'
import { useKeyPackagesStore } from '@/stores/keyPackages'
import { useProfilesStore } from '@/stores/profiles'
import { getDisplayName } from '@/utils/nostr'

const props = defineProps<{
  contactPubkey: string
}>()

const emit = defineEmits<{
  (e: 'update:selected', keyPackageIds: string[]): void
}>()

const keyPackagesStore = useKeyPackagesStore()
const profilesStore = useProfilesStore()

const profile = computed(() => profilesStore.getProfile(props.contactPubkey))
const displayName = computed(() => getDisplayName(profile.value, props.contactPubkey))

const keyPackages = computed(() =>
  keyPackagesStore.getKeyPackagesForPubkey(props.contactPubkey)
)

const selectedIds = ref<string[]>([])

// Auto-select all KeyPackages when there's only one
// When multiple, pre-select all by default
watch(
  keyPackages,
  (kps) => {
    if (kps.length === 1) {
      selectedIds.value = [kps[0].eventId]
    } else if (kps.length > 1 && selectedIds.value.length === 0) {
      // Pre-select all devices by default
      selectedIds.value = kps.map((kp) => kp.eventId)
    }
  },
  { immediate: true },
)

watch(selectedIds, (ids) => {
  emit('update:selected', ids)
}, { immediate: true })

function toggleKeyPackage(eventId: string): void {
  const idx = selectedIds.value.indexOf(eventId)
  if (idx >= 0) {
    selectedIds.value = selectedIds.value.filter((id) => id !== eventId)
  } else {
    selectedIds.value = [...selectedIds.value, eventId]
  }
}

function getDeviceLabel(kp: { clientName?: string; eventId: string }): string {
  return kp.clientName || `device-${kp.eventId.substring(0, 8)}`
}
</script>

<template>
  <div class="py-1">
    <!-- No KeyPackages available -->
    <div v-if="keyPackages.length === 0" class="flex items-center gap-2 text-warning text-sm py-1">
      <span>⚠️</span>
      <span>No KeyPackages — cannot invite {{ displayName }}</span>
    </div>

    <!-- Single KeyPackage: auto-selected, show info only -->
    <div v-else-if="keyPackages.length === 1" class="flex items-center gap-2 text-sm py-1 text-base-content/70">
      <span class="text-success">✓</span>
      <span>{{ displayName }} ({{ getDeviceLabel(keyPackages[0]) }})</span>
    </div>

    <!-- Multiple KeyPackages: show multi-select -->
    <div v-else class="space-y-1">
      <p class="text-xs text-base-content/50 mb-1">
        {{ displayName }} — {{ keyPackages.length }} devices:
      </p>
      <label
        v-for="kp in keyPackages"
        :key="kp.eventId"
        class="flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-base-200 text-sm"
      >
        <input
          type="checkbox"
          class="checkbox checkbox-primary checkbox-xs"
          :checked="selectedIds.includes(kp.eventId)"
          @change="toggleKeyPackage(kp.eventId)"
        />
        <span class="flex-1">{{ displayName }} ({{ getDeviceLabel(kp) }})</span>
        <span class="text-xs text-base-content/40 font-mono">{{ kp.eventId.substring(0, 8) }}</span>
      </label>
    </div>
  </div>
</template>
