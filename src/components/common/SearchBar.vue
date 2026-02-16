<script setup lang="ts">
/**
 * SearchBar component
 *
 * Reusable search input with clear button.
 */

const model = defineModel<string>({ default: '' })

defineProps<{
  placeholder?: string
}>()

function clear(): void {
  model.value = ''
}
</script>

<template>
  <div class="relative">
    <input
      v-model="model"
      type="text"
      :placeholder="placeholder ?? 'Search...'"
      class="input input-sm input-bordered w-full pl-9 pr-8"
      aria-label="Search"
    />
    <!-- Search icon -->
    <svg
      class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/50"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
    <!-- Clear button -->
    <button
      v-if="model"
      class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
      aria-label="Clear search"
      @click="clear"
    >
      <svg
        class="w-3 h-3"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  </div>
</template>
