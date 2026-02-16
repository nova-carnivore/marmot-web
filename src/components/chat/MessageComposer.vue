<script setup lang="ts">
/**
 * MessageComposer component
 *
 * Text input with media attachment and send button.
 */
import { ref } from 'vue'

const emit = defineEmits<{
  send: [content: string]
  attachFile: [file: File]
}>()

const message = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function handleSend(): void {
  const text = message.value.trim()
  if (!text) return
  emit('send', text)
  message.value = ''
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

function openFilePicker(): void {
  fileInput.value?.click()
}

function handleFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    emit('attachFile', file)
    target.value = '' // Reset input
  }
}
</script>

<template>
  <div class="border-t border-base-200 bg-base-100 p-3">
    <div class="flex items-end gap-2">
      <!-- File attachment button -->
      <button
        class="btn btn-ghost btn-sm btn-circle shrink-0"
        title="Attach file"
        aria-label="Attach file"
        @click="openFilePicker"
      >
        <svg
          class="w-5 h-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
          />
        </svg>
      </button>

      <!-- Hidden file input -->
      <input
        ref="fileInput"
        type="file"
        class="hidden"
        accept="image/*,video/*,audio/*,.pdf"
        @change="handleFileChange"
      />

      <!-- Text input -->
      <textarea
        v-model="message"
        class="textarea textarea-bordered flex-1 min-h-[2.5rem] max-h-32 resize-none leading-snug"
        placeholder="Type a message..."
        rows="1"
        aria-label="Message input"
        @keydown="handleKeyDown"
      />

      <!-- Send button -->
      <button
        class="btn btn-primary btn-sm btn-circle shrink-0"
        :disabled="!message.trim()"
        title="Send message"
        aria-label="Send message"
        @click="handleSend"
      >
        <svg
          class="w-5 h-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
          />
        </svg>
      </button>
    </div>
  </div>
</template>
