/**
 * useTheme composable
 *
 * Manages Light / Dark / Auto (system) theme with DaisyUI data-theme attribute.
 * Persists preference in localStorage. Auto mode tracks OS prefers-color-scheme.
 */

import { ref, computed, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'marmot-theme-mode'

/** Shared reactive state (module-level so all consumers share it) */
const themeMode = ref<ThemeMode>('auto')
const systemPrefersDark = ref(false)
let initialized = false

/**
 * The resolved theme: what's actually applied to the document.
 */
const resolvedTheme = computed<'light' | 'dark'>(() => {
  if (themeMode.value === 'auto') {
    return systemPrefersDark.value ? 'dark' : 'light'
  }
  return themeMode.value
})

function applyTheme(): void {
  document.documentElement.setAttribute('data-theme', resolvedTheme.value)
}

function init(): void {
  if (initialized) return
  initialized = true

  // Load saved preference
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
  if (saved && ['light', 'dark', 'auto'].includes(saved)) {
    themeMode.value = saved
  } else {
    // Migrate from old 'marmot-theme' key if present
    const legacy = localStorage.getItem('marmot-theme')
    if (legacy === 'light' || legacy === 'dark') {
      themeMode.value = legacy
      localStorage.removeItem('marmot-theme')
    }
  }

  // Detect system preference
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    systemPrefersDark.value = mediaQuery.matches

    mediaQuery.addEventListener('change', (e: MediaQueryListEvent) => {
      systemPrefersDark.value = e.matches
      applyTheme()
    })
  }

  // Persist and apply on any change
  watch(themeMode, (mode) => {
    localStorage.setItem(STORAGE_KEY, mode)
    applyTheme()
  })

  // Initial apply
  applyTheme()
}

export function useTheme() {
  init()

  function setTheme(mode: ThemeMode): void {
    themeMode.value = mode
  }

  return {
    /** Current user preference: 'light' | 'dark' | 'auto' */
    themeMode,
    /** Whether the OS currently prefers dark */
    systemPrefersDark,
    /** The actual theme applied to the document */
    resolvedTheme,
    /** Set the theme mode */
    setTheme,
  }
}
