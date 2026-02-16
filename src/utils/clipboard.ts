/**
 * Clipboard utility with fallback for non-HTTPS environments.
 *
 * navigator.clipboard API requires a secure context (HTTPS or localhost).
 * This module provides a fallback using the legacy execCommand approach.
 */

/**
 * Copy text to clipboard with automatic fallback.
 *
 * @param text - Text to copy
 * @returns true if copy succeeded
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Modern API: requires HTTPS or localhost
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      console.warn('[clipboard] Clipboard API failed, using fallback:', err)
    }
  }

  // Fallback: textarea + execCommand (works on HTTP)
  return copyWithTextarea(text)
}

/**
 * Fallback clipboard copy using a hidden textarea and execCommand.
 */
function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text

  // Position off-screen to avoid layout disruption
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'

  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  try {
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch (err) {
    console.warn('[clipboard] execCommand fallback failed:', err)
    document.body.removeChild(textarea)
    return false
  }
}
