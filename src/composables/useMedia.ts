/**
 * useMedia composable
 *
 * MIP-04 encrypted media handling: encrypt, upload, download, decrypt.
 */

import { ref } from 'vue'
import { encryptMedia, decryptMedia, buildImetaTag, parseImetaTag } from 'marmot-ts'
import type { EncryptedMediaMeta } from 'marmot-ts'
import type { MediaAttachment } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { uploadToBlossom, DEFAULT_BLOSSOM_SERVER } from '@/lib/blossom'

/** Supported file types for upload */
const SUPPORTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/ogg',
  'application/pdf',
])

/** Max file size: 50MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024

export function useMedia() {
  const uploading = ref(false)
  const uploadProgress = ref(0)
  const error = ref<string | null>(null)

  /**
   * Validate a file for upload.
   */
  function validateFile(file: File): string | null {
    if (!SUPPORTED_TYPES.has(file.type)) {
      return `Unsupported file type: ${file.type}`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is 50MB.`
    }
    return null
  }

  /**
   * Encrypt a file for sharing in a Marmot group.
   */
  async function encryptFile(
    file: File,
    exporterSecret: Uint8Array,
  ): Promise<{ encryptedData: Uint8Array; meta: EncryptedMediaMeta; tag: string[] }> {
    const data = new Uint8Array(await file.arrayBuffer())

    const result = encryptMedia({
      data,
      mimeType: file.type,
      filename: file.name,
      exporterSecret,
    })

    const tag = buildImetaTag(result.meta)

    return {
      encryptedData: result.encryptedData,
      meta: result.meta,
      tag,
    }
  }

  /**
   * Upload encrypted file to Blossom server.
   *
   * Uses NIP-98 HTTP authentication with SHA-256 content addressing.
   * Falls back to blob URL if Blossom upload fails (development mode).
   */
  async function uploadEncryptedFile(encryptedData: Uint8Array, _hash: string): Promise<string> {
    uploading.value = true
    uploadProgress.value = 0
    error.value = null

    try {
      const authStore = useAuthStore()

      if (!authStore.signer) {
        throw new Error('No signer available for upload authentication')
      }

      // Try Blossom upload
      try {
        uploadProgress.value = 50
        const url = await uploadToBlossom(encryptedData, DEFAULT_BLOSSOM_SERVER, authStore.signer)
        uploadProgress.value = 100
        return url
      } catch (blossomError) {
        console.error('[Media] Blossom upload failed:', blossomError)

        // Fallback to blob URL for development
        if (import.meta.env.DEV) {
          console.warn('[Media] Falling back to blob URL (development mode)')
          const blob = new Blob([new Uint8Array(encryptedData)])
          const url = URL.createObjectURL(blob)
          uploadProgress.value = 100
          return url
        }

        throw blossomError
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Upload failed'
      throw err
    } finally {
      uploading.value = false
    }
  }

  /**
   * Download and decrypt a media file.
   */
  async function downloadAndDecrypt(
    url: string,
    meta: EncryptedMediaMeta,
    exporterSecret: Uint8Array,
  ): Promise<Uint8Array> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.statusText}`)
    }

    const encryptedData = new Uint8Array(await response.arrayBuffer())
    return decryptMedia({ encryptedData, meta, exporterSecret })
  }

  /**
   * Create a blob URL from decrypted data.
   */
  function createBlobUrl(data: Uint8Array, mimeType: string): string {
    const blob = new Blob([new Uint8Array(data)], { type: mimeType })
    return URL.createObjectURL(blob)
  }

  /**
   * Parse media attachments from message tags.
   */
  function parseMediaFromTags(tags: string[][]): MediaAttachment[] {
    const attachments: MediaAttachment[] = []

    for (const tag of tags) {
      if (tag[0] !== 'imeta') continue

      try {
        const meta = parseImetaTag(tag)
        attachments.push({
          url: meta.url,
          mimeType: meta.mimeType,
          filename: meta.filename,
          dimensions: meta.dimensions,
          blurhash: meta.blurhash,
          encrypted: true,
          nonce: meta.nonce,
          fileHash: meta.fileHash,
        })
      } catch {
        // Invalid imeta tag
      }
    }

    return attachments
  }

  return {
    uploading,
    uploadProgress,
    error,
    validateFile,
    encryptFile,
    uploadEncryptedFile,
    downloadAndDecrypt,
    createBlobUrl,
    parseMediaFromTags,
  }
}
