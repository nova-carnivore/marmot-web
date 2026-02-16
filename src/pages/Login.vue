<script setup lang="ts">
/**
 * Login page
 *
 * NIP-07, NIP-46, and nsec/hex private key authentication.
 * Supports bunker://, nostrconnect://, and direct private key login.
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const connectionUri = ref('')
const showRemoteSigner = ref(false)
const showNsecLogin = ref(false)
const nsecInput = ref('')
const nsecConfirmWarning = ref(false)
const hasNip07 = ref(false)

const canConnectRemote = computed(() => {
  const uri = connectionUri.value.trim()
  return uri.startsWith('bunker://') || uri.startsWith('nostrconnect://')
})

const connectionUriType = computed(() => {
  const uri = connectionUri.value.trim()
  if (uri.startsWith('bunker://')) return 'bunker'
  if (uri.startsWith('nostrconnect://')) return 'nostrconnect'
  return null
})

const canConnectNsec = computed(() => {
  const input = nsecInput.value.trim()
  return (input.startsWith('nsec1') || /^[0-9a-f]{64}$/i.test(input)) && nsecConfirmWarning.value
})

onMounted(() => {
  hasNip07.value = !!window.nostr
})

async function connectNip07(): Promise<void> {
  try {
    await authStore.connectNip07()
    router.push('/chat')
  } catch {
    // Error is stored in authStore.error
  }
}

async function connectRemoteSigner(): Promise<void> {
  try {
    await authStore.connectNip46(connectionUri.value.trim())
    router.push('/chat')
  } catch {
    // Error is stored in authStore.error
  }
}

async function connectNsec(): Promise<void> {
  try {
    await authStore.connectNsec(nsecInput.value.trim())
    // Clear the input immediately for security
    nsecInput.value = ''
    router.push('/chat')
  } catch {
    // Error is stored in authStore.error
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-base-200 p-4">
    <div class="card bg-base-100 shadow-xl w-full max-w-md">
      <div class="card-body">
        <!-- Logo & Title -->
        <div class="text-center mb-6">
          <h1 class="text-4xl font-bold mb-2">🦫 Marmot</h1>
          <p class="text-base-content/60">Secure group messaging with MLS + Nostr</p>
        </div>

        <!-- Error alert -->
        <div v-if="authStore.error" role="alert" class="alert alert-error mb-4">
          <svg
            class="w-5 h-5 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <span>{{ authStore.error }}</span>
        </div>

        <!-- NIP-07 Button -->
        <button
          class="btn btn-primary btn-lg w-full mb-3"
          :disabled="authStore.loading || !hasNip07"
          @click="connectNip07"
        >
          <span
            v-if="authStore.loading && authStore.method === 'nip07'"
            class="loading loading-spinner"
          />
          <svg
            v-else
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
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          Connect Browser Extension
        </button>

        <p v-if="!hasNip07" class="text-xs text-warning text-center mb-3">
          No NIP-07 extension detected. Install
          <a href="https://getalby.com" target="_blank" rel="noopener" class="link">Alby</a> or
          <a href="https://github.com/niceprivacy/nos2x" target="_blank" rel="noopener" class="link"
            >nos2x</a
          >.
        </p>

        <div class="divider text-sm text-base-content/40">or</div>

        <!-- NIP-46 Section -->
        <button
          v-if="!showRemoteSigner"
          class="btn btn-outline btn-lg w-full"
          @click="showRemoteSigner = true"
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
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          Remote Signer (NIP-46)
        </button>

        <div v-if="showRemoteSigner" class="space-y-3">
          <label class="form-control w-full">
            <div class="label">
              <span class="label-text">Connection String</span>
            </div>
            <input
              v-model="connectionUri"
              type="text"
              placeholder="bunker://... or nostrconnect://..."
              class="input input-bordered w-full font-mono text-sm"
            />
            <div class="label">
              <span class="label-text-alt text-base-content/50">
                Supports both
                <code class="bg-base-200 px-1 rounded">bunker://</code> and
                <code class="bg-base-200 px-1 rounded">nostrconnect://</code> URIs
              </span>
            </div>
          </label>

          <!-- URI type indicator -->
          <div v-if="connectionUriType" class="flex items-center gap-2">
            <span
              class="badge badge-sm"
              :class="connectionUriType === 'nostrconnect' ? 'badge-primary' : 'badge-secondary'"
            >
              {{ connectionUriType === 'nostrconnect' ? 'NIP-46 nostrconnect' : 'Bunker' }}
            </span>
            <span class="text-xs text-base-content/50">Format detected</span>
          </div>

          <button
            class="btn btn-primary btn-lg w-full"
            :disabled="authStore.loading || !canConnectRemote"
            @click="connectRemoteSigner"
          >
            <span
              v-if="authStore.loading && authStore.method === 'nip46'"
              class="loading loading-spinner"
            />
            Connect Remote Signer
          </button>
        </div>

        <div class="divider text-sm text-base-content/40">or</div>

        <!-- Nsec / Private Key Section -->
        <button
          v-if="!showNsecLogin"
          class="btn btn-outline btn-warning btn-lg w-full"
          @click="showNsecLogin = true"
        >
          ⚠️ Private Key (Insecure)
        </button>

        <div v-if="showNsecLogin" class="space-y-3">
          <!-- Security Warning -->
          <div class="alert alert-warning text-xs">
            <svg
              class="w-4 h-4 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div>
              <p class="font-semibold">⚠️ Not recommended for production use</p>
              <ul class="list-disc list-inside mt-1 space-y-0.5">
                <li>Your private key is held in browser memory</li>
                <li>Use only for testing or development</li>
                <li>Key is NOT persisted — you must re-enter on reload</li>
                <li>Prefer NIP-07 extension or NIP-46 remote signer</li>
              </ul>
            </div>
          </div>

          <label class="form-control w-full">
            <div class="label">
              <span class="label-text">Private Key</span>
            </div>
            <input
              v-model="nsecInput"
              type="password"
              placeholder="nsec1... or 64-char hex"
              class="input input-bordered w-full font-mono text-sm"
              autocomplete="off"
              data-testid="nsec-input"
            />
          </label>

          <!-- Acknowledgement checkbox -->
          <label class="flex items-start gap-2 cursor-pointer">
            <input
              v-model="nsecConfirmWarning"
              type="checkbox"
              class="checkbox checkbox-warning checkbox-sm mt-0.5"
              data-testid="nsec-warning-checkbox"
            />
            <span class="text-xs text-base-content/70">
              I understand this is insecure and for testing only.
            </span>
          </label>

          <button
            class="btn btn-warning btn-lg w-full"
            :disabled="authStore.loading || !canConnectNsec"
            data-testid="nsec-login-btn"
            @click="connectNsec"
          >
            <span
              v-if="authStore.loading && authStore.method === 'nsec'"
              class="loading loading-spinner"
            />
            ⚠️ Login with Private Key
          </button>
        </div>

        <!-- Footer -->
        <div class="text-center mt-6 text-xs text-base-content/40">
          <p>
            Powered by
            <a
              href="https://github.com/marmot-protocol/marmot"
              target="_blank"
              rel="noopener"
              class="link"
              >Marmot Protocol</a
            >
          </p>
          <p class="mt-1">End-to-end encrypted with MLS (RFC 9420)</p>
        </div>
      </div>
    </div>
  </div>
</template>
