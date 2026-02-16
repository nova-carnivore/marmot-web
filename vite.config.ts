import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { readFileSync } from 'fs'

/**
 * Vite plugin to replace @hpke/core's native X25519 primitive with a
 * @noble/curves-based implementation.
 *
 * Headless Chrome doesn't support X25519 in WebCrypto, causing KeyPackage
 * creation to fail. This plugin intercepts the X25519 module at the file
 * level and replaces it with our Noble-based implementation.
 *
 * Only X25519 is patched — Ed25519, SHA-256, HKDF, AES-GCM stay native.
 */
function patchX25519ForHeadless(): Plugin {
  const NOBLE_REPLACEMENT = resolve(__dirname, 'src/lib/x25519-noble-patch.js')

  return {
    name: 'patch-x25519-for-headless',
    enforce: 'pre',
    load(id) {
      // Intercept the native X25519 primitive from @hpke/core
      if (id.includes('@hpke/core') && id.endsWith('/kems/dhkemPrimitives/x25519.js')) {
        return readFileSync(NOBLE_REPLACEMENT, 'utf-8')
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [patchX25519ForHeadless(), vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  define: {
    // Polyfill for nostr-tools / noble-hashes in browser
    'process.env': {},
  },
})
