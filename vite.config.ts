import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    https: {
      key: fs.readFileSync(resolve(__dirname, 'localhost-key.pem')),
      cert: fs.readFileSync(resolve(__dirname, 'localhost-cert.pem')),
    },
    host: '0.0.0.0',
    port: 8081,
  },
  preview: {
    https: {
      key: fs.readFileSync(resolve(__dirname, 'localhost-key.pem')),
      cert: fs.readFileSync(resolve(__dirname, 'localhost-cert.pem')),
    },
    host: '0.0.0.0',
    port: 8081,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Patch X25519 for browsers without native support
      '@hpke/dhkem-x25519/esm/x25519.js': resolve(__dirname, 'src/lib/x25519-noble-patch.js'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  define: {
    // Polyfill for nostr-tools / noble-hashes in browser
    'process.env': {},
  },
  optimizeDeps: {
    exclude: ['@hpke/dhkem-x25519'],
  },
})
