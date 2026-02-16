<script setup lang="ts">
/**
 * Avatar component
 *
 * Displays a user avatar with fallback to initials.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    src?: string
    name?: string
    size?: 'xs' | 'sm' | 'md' | 'lg'
    online?: boolean
  }>(),
  {
    src: undefined,
    name: undefined,
    size: 'md',
    online: false,
  },
)

const sizeClasses = computed(() => {
  const sizes = {
    xs: 'w-8 h-8',
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  }
  return sizes[props.size]
})

const initials = computed(() => {
  if (!props.name) return '?'
  const parts = props.name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return props.name.substring(0, 2).toUpperCase()
})

const bgColor = computed(() => {
  if (!props.name) return 'bg-neutral'
  // Generate consistent color from name
  let hash = 0
  for (let i = 0; i < props.name.length; i++) {
    hash = props.name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = ['bg-primary', 'bg-secondary', 'bg-accent', 'bg-info', 'bg-success', 'bg-warning']
  return colors[Math.abs(hash) % colors.length]
})
</script>

<template>
  <div class="avatar" :class="{ 'avatar-online': online }">
    <div class="rounded-full" :class="sizeClasses">
      <img v-if="src" :src="src" :alt="name ?? 'Avatar'" class="object-cover" />
      <div
        v-else
        class="flex items-center justify-center text-white font-semibold rounded-full"
        :class="[sizeClasses, bgColor]"
      >
        <span
          :class="{
            'text-xs': size === 'xs',
            'text-sm': size === 'sm',
            'text-base': size === 'md',
            'text-lg': size === 'lg',
          }"
        >
          {{ initials }}
        </span>
      </div>
    </div>
  </div>
</template>
