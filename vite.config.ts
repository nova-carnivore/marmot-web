import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

/**
 * Vite plugin to patch ts-mls and @hpke/core crypto primitives.
 *
 * Problem: Both ts-mls (Ed25519 signatures) and @hpke/core (X25519 DHKEM)
 * prefer WebCrypto when crypto.subtle exists. Many browsers don't support
 * Ed25519/X25519 via WebCrypto, causing "Cannot read properties of undefined
 * (reading 'generateKey')".
 *
 * Fix: Redirect both modules to our patched versions that always use
 * @noble/curves, which works universally across all browsers.
 */
function patchCryptoForBrowser(): Plugin {
  const patchedEd25519 = resolve(__dirname, 'src/lib/makeNobleSignatureImpl.js')
  const patchedX25519 = resolve(__dirname, 'src/lib/x25519-noble.js')
  const patchedHash = resolve(__dirname, 'src/lib/makeHashImpl.js')
  const patchedKdf = resolve(__dirname, 'src/lib/makeKdfImpl.js')

  return {
    name: 'patch-crypto-for-browser',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null

      // Patch 1: ts-mls Ed25519 signature implementation
      if (importer.includes('ts-mls') && source.endsWith('makeNobleSignatureImpl.js')) {
        return patchedEd25519
      }

      // Patch 2: @hpke/core X25519 DHKEM primitive
      if (
        (importer.includes('@hpke/core') || importer.includes('@hpke/common')) &&
        source.endsWith('x25519.js') &&
        (importer.includes('dhkemX25519') || importer.includes('dhkemPrimitives'))
      ) {
        return patchedX25519
      }

      // Patch 3: ts-mls SHA-256/384/512 hash implementation
      // The default provider uses crypto.subtle.digest() which can fail.
      // Redirect to our @noble/hashes-based implementation.
      if (importer.includes('ts-mls') && source.endsWith('makeHashImpl.js')) {
        return patchedHash
      }

      // Patch 4: ts-mls HKDF implementation
      // The default provider uses @hpke/core's HkdfSha256/384/512 which
      // internally calls crypto.subtle.importKey() for HMAC operations.
      // Redirect to our @noble/hashes-based HKDF implementation.
      if (importer.includes('ts-mls') && source.endsWith('makeKdfImpl.js')) {
        return patchedKdf
      }

      return null
    },
  }
}

export default defineConfig({
  plugins: [patchCryptoForBrowser(), vue(), tailwindcss()],
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
