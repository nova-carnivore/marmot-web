<script setup lang="ts">
/**
 * Root application component
 */
import { useTheme } from '@/composables/useTheme'

// Initialize theme on app load (applies saved preference or auto-detects)
useTheme()
</script>

<template>
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
