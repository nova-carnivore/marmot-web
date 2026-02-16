/**
 * E2E: Login flow
 */
import { test, expect } from '@playwright/test'

test.describe('Login Page', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByText('Marmot')).toBeVisible()
    await expect(page.getByText('Connect Browser Extension')).toBeVisible()
    await expect(page.getByText('Remote Signer (NIP-46)')).toBeVisible()
  })

  test('should show NIP-07 warning when no extension', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByText('No NIP-07 extension detected')).toBeVisible()
  })

  test('should show bunker input on click', async ({ page }) => {
    await page.goto('/login')

    await page.getByText('Remote Signer (NIP-46)').click()
    await expect(page.getByPlaceholder('bunker://')).toBeVisible()
  })

  test('should login with mocked NIP-07', async ({ page }) => {
    // Mock window.nostr
    await page.addInitScript(() => {
      const mockPubkey = 'a'.repeat(64)
      ;(window as unknown as Record<string, unknown>).nostr = {
        getPublicKey: () => Promise.resolve(mockPubkey),
        signEvent: (event: Record<string, unknown>) =>
          Promise.resolve({
            ...event,
            id: 'b'.repeat(64),
            sig: 'c'.repeat(128),
            pubkey: mockPubkey,
          }),
        nip44: {
          encrypt: (_pk: string, plaintext: string) => Promise.resolve(plaintext),
          decrypt: (_pk: string, ciphertext: string) => Promise.resolve(ciphertext),
        },
      }
    })

    await page.goto('/login')

    // NIP-07 button should be enabled
    const connectBtn = page.getByText('Connect Browser Extension')
    await expect(connectBtn).toBeEnabled()

    // Click connect
    await connectBtn.click()

    // Should navigate to /chat
    await page.waitForURL('/chat')
    await expect(page.getByText('Marmot Web')).toBeVisible()
  })

  test('should redirect to login if not authenticated', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForURL('/login')
  })
})
