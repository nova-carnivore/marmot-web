<script setup lang="ts">
/**
 * MediaPreview component
 *
 * Displays media attachments in messages (images, videos, audio, files).
 */
import { ref } from 'vue'
import { isImageMime, isVideoMime, isAudioMime } from '@/utils'
import type { MediaAttachment } from '@/types'

defineProps<{
  attachments: MediaAttachment[]
}>()

const selectedImage = ref<string | null>(null)

function openModal(url: string): void {
  selectedImage.value = url
}

function closeModal(): void {
  selectedImage.value = null
}
</script>

<template>
  <div class="space-y-2 mb-2">
    <div v-for="(attachment, idx) in attachments" :key="idx">
      <!-- Image -->
      <div
        v-if="isImageMime(attachment.mimeType)"
        class="cursor-pointer rounded-lg overflow-hidden max-w-xs"
        @click="openModal(attachment.decryptedUrl ?? attachment.url)"
      >
        <img
          :src="attachment.decryptedUrl ?? attachment.url"
          :alt="attachment.filename"
          class="max-w-full rounded-lg"
          loading="lazy"
        />
        <div
          v-if="attachment.encrypted && !attachment.decryptedUrl"
          class="absolute inset-0 flex items-center justify-center bg-base-300/80 rounded-lg"
        >
          <span class="text-sm">🔐 Encrypted</span>
        </div>
      </div>

      <!-- Video -->
      <div v-else-if="isVideoMime(attachment.mimeType)" class="max-w-xs">
        <video
          :src="attachment.decryptedUrl ?? attachment.url"
          class="rounded-lg max-w-full"
          controls
          preload="metadata"
        >
          <track kind="captions" />
        </video>
      </div>

      <!-- Audio -->
      <div v-else-if="isAudioMime(attachment.mimeType)" class="max-w-xs">
        <audio :src="attachment.decryptedUrl ?? attachment.url" controls preload="metadata" />
      </div>

      <!-- Generic file -->
      <div v-else class="flex items-center gap-2 p-2 bg-base-200 rounded-lg max-w-xs">
        <svg
          class="w-8 h-8 text-base-content/60 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">
            {{ attachment.filename }}
          </p>
          <p class="text-xs text-base-content/50">
            {{ attachment.mimeType }}
          </p>
        </div>
        <a
          :href="attachment.decryptedUrl ?? attachment.url"
          :download="attachment.filename"
          class="btn btn-ghost btn-xs btn-circle shrink-0"
          title="Download"
        >
          <svg
            class="w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </a>
      </div>
    </div>
  </div>

  <!-- Image modal -->
  <Teleport to="body">
    <div
      v-if="selectedImage"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer"
      role="dialog"
      aria-label="Image preview"
      @click="closeModal"
    >
      <img
        :src="selectedImage"
        class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        alt="Preview"
      />
      <button
        class="absolute top-4 right-4 btn btn-circle btn-ghost text-white"
        aria-label="Close preview"
        @click.stop="closeModal"
      >
        <svg
          class="w-6 h-6"
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
  </Teleport>
</template>
