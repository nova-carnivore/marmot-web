<script setup lang="ts">
/**
 * Settings page
 *
 * KeyPackage management (create, delete, export, import, refresh),
 * relay configuration, theme settings.
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useKeyPackagesStore } from '@/stores/keyPackages'
import { useRelaysStore } from '@/stores/relays'
import { useKeyPackages } from '@/composables/useKeyPackages'
import { useNostr } from '@/composables/useNostr'
import { useTheme } from '@/composables/useTheme'
import { pubkeyToNpub, shortenNpub } from '@/utils/nostr'
import { formatTimestamp } from '@/utils/nostr'
import { copyToClipboard } from '@/utils/clipboard'

const router = useRouter()
const authStore = useAuthStore()
const keyPackagesStore = useKeyPackagesStore()
const relaysStore = useRelaysStore()
const {
  fetchMyKeyPackages,
  createNewKeyPackage,
  deleteKeyPackage,
  exportKeyPackage,
  canExport,
  importKeyPackage,
} = useKeyPackages()
const { syncRelayStatus, ensureRelayConnections } = useNostr()
const { themeMode, systemPrefersDark, setTheme } = useTheme()

// ─── General state ─────────────────────────────────────────────────────────

const loading = ref(false)
const creating = ref(false)
const createError = ref<string | null>(null)
const createSuccess = ref(false)

// ─── Export modal state ────────────────────────────────────────────────────

const exportModalOpen = ref(false)
const exportEventId = ref<string | null>(null)
const exportPassword = ref('')
const exportPasswordConfirm = ref('')
const exportBusy = ref(false)
const exportError = ref<string | null>(null)
const exportPasswordInputRef = ref<HTMLInputElement | null>(null)

const exportPasswordsMatch = computed(
  () => exportPassword.value === exportPasswordConfirm.value && exportPassword.value.length > 0,
)
const exportPasswordStrong = computed(() => exportPassword.value.length >= 12)
const canStartExport = computed(() => exportPasswordsMatch.value && exportPasswordStrong.value)

// ─── Import state ──────────────────────────────────────────────────────────

const importFile = ref<File | null>(null)
const importFileContent = ref<string | null>(null)
const importPassword = ref('')
const importBusy = ref(false)
const importError = ref<string | null>(null)
const importSuccess = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const canStartImport = computed(() => importFileContent.value !== null && importPassword.value.length > 0)

// ─── Computed ──────────────────────────────────────────────────────────────

const npub = computed(() => {
  if (!authStore.pubkey) return ''
  return pubkeyToNpub(authStore.pubkey)
})

const shortenedNpub = computed(() => shortenNpub(npub.value, 12))

const myKeyPackages = computed(() => keyPackagesStore.myKeyPackages)

// ─── Lifecycle ─────────────────────────────────────────────────────────────

let relayStatusInterval: number | undefined

onMounted(async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  loading.value = true
  try {
    await fetchMyKeyPackages()
  } finally {
    loading.value = false
  }

  // Eagerly connect to all relays and sync status to UI
  await ensureRelayConnections()

  // Keep relay status in sync while on settings page (every 5 seconds)
  relayStatusInterval = window.setInterval(() => {
    syncRelayStatus()
  }, 5000)
})

onUnmounted(() => {
  if (relayStatusInterval) {
    clearInterval(relayStatusInterval)
  }
})

// ─── KeyPackage CRUD ───────────────────────────────────────────────────────

async function handleCreateKeyPackage(): Promise<void> {
  creating.value = true
  createError.value = null
  createSuccess.value = false

  try {
    await createNewKeyPackage()
    createSuccess.value = true
    setTimeout(() => {
      createSuccess.value = false
    }, 3000)
  } catch (err) {
    createError.value = err instanceof Error ? err.message : 'Failed to create KeyPackage'
    console.error('Failed to create KeyPackage:', err)
  } finally {
    creating.value = false
  }
}

async function handleDeleteKeyPackage(eventId: string): Promise<void> {
  if (!confirm('Delete this KeyPackage? It will no longer be available for group invitations.')) {
    return
  }
  try {
    await deleteKeyPackage(eventId)
  } catch (err) {
    console.error('Failed to delete KeyPackage:', err)
  }
}

async function handleRefresh(): Promise<void> {
  loading.value = true
  try {
    await fetchMyKeyPackages()
  } finally {
    loading.value = false
  }
}

// ─── Export ────────────────────────────────────────────────────────────────

function openExportModal(eventId: string): void {
  exportEventId.value = eventId
  exportPassword.value = ''
  exportPasswordConfirm.value = ''
  exportError.value = null
  exportModalOpen.value = true
  nextTick(() => {
    exportPasswordInputRef.value?.focus()
  })
}

function closeExportModal(): void {
  exportModalOpen.value = false
  exportEventId.value = null
  exportPassword.value = ''
  exportPasswordConfirm.value = ''
  exportError.value = null
}

async function handleExport(): Promise<void> {
  if (!exportEventId.value || !canStartExport.value) return

  exportBusy.value = true
  exportError.value = null

  try {
    await exportKeyPackage(exportEventId.value, exportPassword.value)
    closeExportModal()
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : 'Export failed'
  } finally {
    exportBusy.value = false
  }
}

// ─── Import ────────────────────────────────────────────────────────────────

function handleFileSelect(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  importFile.value = file
  importError.value = null
  importSuccess.value = false

  const reader = new FileReader()
  reader.onload = () => {
    importFileContent.value = reader.result as string
  }
  reader.onerror = () => {
    importError.value = 'Failed to read file'
    importFileContent.value = null
  }
  reader.readAsText(file)
}

async function handleImport(): Promise<void> {
  if (!canStartImport.value || !importFileContent.value) return

  importBusy.value = true
  importError.value = null
  importSuccess.value = false

  try {
    await importKeyPackage(importFileContent.value, importPassword.value)
    importSuccess.value = true
    // Reset form
    importFile.value = null
    importFileContent.value = null
    importPassword.value = ''
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
    setTimeout(() => {
      importSuccess.value = false
    }, 5000)
  } catch (err) {
    importError.value = err instanceof Error ? err.message : 'Import failed'
  } finally {
    importBusy.value = false
  }
}

// ─── Navigation / Auth ─────────────────────────────────────────────────────

function goBack(): void {
  router.push('/chat')
}

const copySuccess = ref(false)

async function copyNpub(): Promise<void> {
  const ok = await copyToClipboard(npub.value)
  if (ok) {
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2000)
  }
}

async function handleLogout(): Promise<void> {
  await authStore.disconnect()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-base-200">
    <!-- Header -->
    <div class="navbar bg-base-100 shadow-sm">
      <div class="flex-none">
        <button class="btn btn-ghost btn-circle" @click="goBack">←</button>
      </div>
      <div class="flex-1">
        <h1 class="text-xl font-semibold">Settings</h1>
      </div>
    </div>

    <div class="max-w-2xl mx-auto p-4 space-y-6">
      <!-- Profile Section -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">👤 Profile</h2>
          <div class="flex items-center gap-4">
            <div>
              <p class="text-sm text-base-content/60">Public Key</p>
              <div class="flex items-center gap-2">
                <code class="text-sm bg-base-200 px-2 py-1 rounded font-mono">
                  {{ shortenedNpub }}
                </code>
                <button class="btn btn-ghost btn-xs" title="Copy npub" @click="copyNpub">
                  {{ copySuccess ? '✅' : '📋' }}
                </button>
              </div>
            </div>
          </div>
          <div class="mt-2">
            <p class="text-sm text-base-content/60">
              Auth Method: <span class="badge badge-sm">{{ authStore.method?.toUpperCase() }}</span>
            </p>
          </div>
        </div>
      </div>

      <!-- KeyPackages Section -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <h2 class="card-title">🔐 KeyPackages</h2>
            <div class="flex gap-2">
              <button
                class="btn btn-primary btn-sm"
                :disabled="creating"
                @click="handleCreateKeyPackage"
              >
                <span v-if="creating" class="loading loading-spinner loading-xs" />
                <span v-else>+ Create New</span>
              </button>
              <button class="btn btn-ghost btn-sm" :disabled="loading" @click="handleRefresh">
                <span v-if="loading" class="loading loading-spinner loading-xs" />
                <span v-else>🔄</span>
              </button>
            </div>
          </div>

          <p class="text-sm text-base-content/60">
            KeyPackages allow others to invite you to Marmot groups. Create and publish at least one
            to be discoverable.
          </p>

          <!-- Create success -->
          <div v-if="createSuccess" class="alert alert-success text-sm">
            ✅ KeyPackage created and published to relays.
          </div>

          <!-- Create error -->
          <div v-if="createError" class="alert alert-error text-sm">
            <span>❌ {{ createError }}</span>
            <button class="btn btn-ghost btn-xs" @click="createError = null">✕</button>
          </div>

          <div v-if="loading && myKeyPackages.length === 0" class="flex justify-center p-4">
            <span class="loading loading-spinner loading-md" />
          </div>

          <div v-else-if="myKeyPackages.length === 0" class="text-center p-4 text-base-content/50">
            <p class="text-lg mb-2">📦 No KeyPackages published</p>
            <p class="text-xs">
              Click "Create New" to generate and publish a KeyPackage so others can invite you to
              groups.
            </p>
          </div>

          <div v-else class="space-y-2 mt-2">
            <div class="text-sm text-base-content/60 mb-1">
              {{ myKeyPackages.length }} KeyPackage{{ myKeyPackages.length !== 1 ? 's' : '' }}
              published
            </div>
            <div
              v-for="kp in myKeyPackages"
              :key="kp.eventId"
              class="flex items-center justify-between p-3 bg-base-200 rounded-lg"
            >
              <div class="min-w-0 flex-1">
                <p class="text-sm font-mono truncate">{{ kp.eventId.substring(0, 16) }}...</p>
                <div class="flex flex-wrap items-center gap-2 mt-1">
                  <span class="badge badge-sm">{{ kp.ciphersuite }}</span>
                  <span
                    class="badge badge-sm"
                    :class="kp.hasRequiredExtensions ? 'badge-success' : 'badge-warning'"
                  >
                    {{ kp.hasRequiredExtensions ? '✅ Valid' : '⚠️ Missing Extensions' }}
                  </span>
                  <span class="text-xs text-base-content/50">
                    {{ formatTimestamp(kp.createdAt) }}
                  </span>
                </div>
                <p class="text-xs text-base-content/50 mt-1 truncate">
                  Relays: {{ kp.relays.join(', ') }}
                </p>
              </div>
              <div class="flex gap-1 ml-2 shrink-0">
                <button
                  v-if="canExport(kp.eventId)"
                  class="btn btn-ghost btn-sm"
                  title="Export KeyPackage (encrypted backup)"
                  @click="openExportModal(kp.eventId)"
                >
                  📤
                </button>
                <button
                  class="btn btn-error btn-sm btn-ghost"
                  title="Delete KeyPackage"
                  @click="handleDeleteKeyPackage(kp.eventId)"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Import KeyPackage Section -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">📥 Import KeyPackage</h2>
          <p class="text-sm text-base-content/60">
            Import a KeyPackage backup file exported from another device or browser.
          </p>

          <!-- Security warnings -->
          <div class="alert alert-warning text-xs mt-2">
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
              <p class="font-semibold">Security notice</p>
              <p>
                KeyPackage exports contain private keys. Only import files you created yourself. Anyone with
                the file + password can impersonate you in groups.
              </p>
            </div>
          </div>

          <!-- File input -->
          <div class="form-control w-full mt-3">
            <label class="label">
              <span class="label-text">Select export file</span>
            </label>
            <input
              ref="fileInputRef"
              type="file"
              accept=".json,.enc,.json.enc"
              class="file-input file-input-bordered w-full"
              @change="handleFileSelect"
            />
          </div>

          <!-- File info -->
          <div v-if="importFile" class="text-xs text-base-content/60 mt-1">
            📄 {{ importFile.name }} ({{ (importFile.size / 1024).toFixed(1) }} KB)
          </div>

          <!-- Password input (shown when file selected) -->
          <div v-if="importFileContent" class="form-control w-full mt-2">
            <label class="label">
              <span class="label-text">Decryption password</span>
            </label>
            <input
              v-model="importPassword"
              type="password"
              placeholder="Enter the password used during export"
              class="input input-bordered w-full"
              @keyup.enter="handleImport"
            />
          </div>

          <!-- Import button -->
          <button
            class="btn btn-primary btn-sm mt-3"
            :disabled="!canStartImport || importBusy"
            @click="handleImport"
          >
            <span v-if="importBusy" class="loading loading-spinner loading-xs" />
            <span v-else>Import KeyPackage</span>
          </button>

          <!-- Import success -->
          <div v-if="importSuccess" class="alert alert-success text-sm mt-2">
            ✅ KeyPackage imported successfully and stored locally.
          </div>

          <!-- Import error -->
          <div v-if="importError" class="alert alert-error text-sm mt-2">
            <span>❌ {{ importError }}</span>
            <button class="btn btn-ghost btn-xs" @click="importError = null">✕</button>
          </div>
        </div>
      </div>

      <!-- Relays Section -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">📡 Relays</h2>
          <div class="space-y-2">
            <div
              v-for="url in relaysStore.allRelayUrls"
              :key="url"
              class="flex items-center justify-between p-2 bg-base-200 rounded-lg"
            >
              <code class="text-sm font-mono truncate">{{ url }}</code>
              <span
                class="badge badge-sm"
                :class="relaysStore.relays[url]?.connected ? 'badge-success' : 'badge-error'"
              >
                {{ relaysStore.relays[url]?.connected ? 'Connected' : 'Disconnected' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Blossom Media Storage -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">🌸 Media Storage (Blossom)</h2>
          <p class="text-sm opacity-70 mb-3">
            Blossom servers store encrypted media. Configure your preferred server or use the default.
          </p>

          <div class="form-control">
            <label class="label">
              <span class="label-text">Default server</span>
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                class="input input-bordered flex-1"
                value="https://blossom.primal.net"
                disabled
              />
              <button class="btn btn-sm btn-success" disabled>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Active
              </button>
            </div>
            <label class="label">
              <span class="label-text-alt opacity-70">
                NIP-98 authenticated uploads • SHA-256 content addressing
              </span>
            </label>
          </div>

          <div class="alert alert-info text-xs mt-2">
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              Future: Add custom servers, BUD-03 preferences, and multi-server selection
            </span>
          </div>
        </div>
      </div>

      <!-- Theme Section -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">🎨 Appearance</h2>
          <div class="form-control">
            <label class="label">
              <span class="label-text">Theme</span>
            </label>
            <div class="join w-full">
              <button
                class="btn join-item flex-1"
                :class="themeMode === 'light' ? 'btn-primary' : 'btn-ghost'"
                @click="setTheme('light')"
              >
                ☀️ Light
              </button>
              <button
                class="btn join-item flex-1"
                :class="themeMode === 'dark' ? 'btn-primary' : 'btn-ghost'"
                @click="setTheme('dark')"
              >
                🌙 Dark
              </button>
              <button
                class="btn join-item flex-1"
                :class="themeMode === 'auto' ? 'btn-primary' : 'btn-ghost'"
                @click="setTheme('auto')"
              >
                ⚙️ Auto
              </button>
            </div>
            <label v-if="themeMode === 'auto'" class="label">
              <span class="label-text-alt text-base-content/60">
                Currently: {{ systemPrefersDark ? '🌙 Dark' : '☀️ Light' }} (system)
              </span>
            </label>
          </div>
        </div>
      </div>

      <!-- Logout Section -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">🚪 Session</h2>
          <p class="text-sm text-base-content/60 mb-2">
            Disconnect and clear all local data including persisted state and private keys.
          </p>
          <button class="btn btn-error btn-sm" @click="handleLogout">Disconnect &amp; Logout</button>
        </div>
      </div>

      <!-- About Section -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">ℹ️ About</h2>
          <p class="text-sm text-base-content/60">
            Marmot Web v0.1.0 — Reference implementation of the Marmot Protocol.
          </p>
          <div class="flex gap-2 mt-2">
            <a
              href="https://github.com/nova-carnivore/marmot-web"
              target="_blank"
              rel="noopener"
              class="link text-sm"
            >
              GitHub
            </a>
            <a
              href="https://github.com/marmot-protocol/marmot"
              target="_blank"
              rel="noopener"
              class="link text-sm"
            >
              Protocol Spec
            </a>
            <a
              href="https://github.com/nova-carnivore/marmot-ts"
              target="_blank"
              rel="noopener"
              class="link text-sm"
            >
              marmot-ts
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- Export Password Modal -->
    <dialog class="modal" :class="{ 'modal-open': exportModalOpen }">
      <div class="modal-box">
        <h3 class="text-lg font-bold">🔒 Export KeyPackage</h3>

        <div class="alert alert-warning text-xs mt-3 mb-4">
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
            <p class="font-semibold">This file contains your private keys</p>
            <ul class="list-disc list-inside mt-1 space-y-0.5">
              <li>Use a strong password (12+ characters)</li>
              <li>Store the backup in a secure location (password manager, encrypted drive)</li>
              <li>Don't share via unencrypted channels (email, plain chat)</li>
            </ul>
          </div>
        </div>

        <div class="form-control w-full">
          <label class="label">
            <span class="label-text">Encryption password</span>
          </label>
          <input
            ref="exportPasswordInputRef"
            v-model="exportPassword"
            type="password"
            placeholder="Minimum 12 characters"
            class="input input-bordered w-full"
            :class="{
              'input-error': exportPassword.length > 0 && !exportPasswordStrong,
              'input-success': exportPasswordStrong,
            }"
          />
          <div class="label">
            <span
              class="label-text-alt"
              :class="exportPasswordStrong ? 'text-success' : 'text-base-content/50'"
            >
              {{ exportPassword.length }}/12 characters
              {{ exportPasswordStrong ? '✓' : '(minimum 12)' }}
            </span>
          </div>
        </div>

        <div class="form-control w-full">
          <label class="label">
            <span class="label-text">Confirm password</span>
          </label>
          <input
            v-model="exportPasswordConfirm"
            type="password"
            placeholder="Re-enter password"
            class="input input-bordered w-full"
            :class="{
              'input-error':
                exportPasswordConfirm.length > 0 && !exportPasswordsMatch,
              'input-success':
                exportPasswordConfirm.length > 0 && exportPasswordsMatch,
            }"
            @keyup.enter="handleExport"
          />
          <div v-if="exportPasswordConfirm.length > 0 && !exportPasswordsMatch" class="label">
            <span class="label-text-alt text-error">Passwords don't match</span>
          </div>
        </div>

        <!-- Export error -->
        <div v-if="exportError" class="alert alert-error text-sm mt-3">
          <span>❌ {{ exportError }}</span>
        </div>

        <div class="modal-action">
          <button class="btn btn-ghost" @click="closeExportModal">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="!canStartExport || exportBusy"
            @click="handleExport"
          >
            <span v-if="exportBusy" class="loading loading-spinner loading-xs" />
            <span v-else>📤 Download Encrypted Backup</span>
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop" @click="closeExportModal">
        <button>close</button>
      </form>
    </dialog>
  </div>
</template>
