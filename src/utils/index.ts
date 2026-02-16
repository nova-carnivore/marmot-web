export * from './nostr'

/**
 * Debounce a function call.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Generate a random hex string.
 */
export function randomHex(bytes: number): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Truncate text to a maximum length.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 1) + '…'
}

/**
 * File size to human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Check if a MIME type is an image.
 */
export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

/**
 * Check if a MIME type is a video.
 */
export function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/')
}

/**
 * Check if a MIME type is audio.
 */
export function isAudioMime(mime: string): boolean {
  return mime.startsWith('audio/')
}
