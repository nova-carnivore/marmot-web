# Marmot Web — Critical Bug Fixes (2026-02-16)

## Bug 1: KeyPackage Publishing Fails ✅ FIXED

**Was:** `[Nostr] Publish result: 0 confirmed, 3 failed out of 3`

**Root causes:**
1. NIP-70 protected tag `["-"]` added to kind:443 events — most relays reject unknown tags
2. Vue reactive proxies not stripped before passing to nostr-tools SimplePool

**Files changed:**
- `src/composables/useKeyPackages.ts` — Added `protected: false` to both `createKeyPackageEvent()` calls
- `src/composables/useNostr.ts` — Deep-clone events via `JSON.parse(JSON.stringify())` before publish; added per-relay rejection reason logging

**Result:** `[Nostr] Publish result: 3 confirmed, 0 failed out of 3`

---

## Bug 2: Clipboard writeText Undefined ✅ FIXED

**Was:** `TypeError: Cannot read properties of undefined (reading 'writeText')`

**Root cause:** `navigator.clipboard` API requires HTTPS or localhost. Direct call without feature detection.

**Files changed:**
- `src/utils/clipboard.ts` — NEW: `copyToClipboard()` with Clipboard API → textarea+execCommand fallback
- `src/pages/Settings.vue` — Uses new clipboard util, shows ✅ feedback on success

---

## Bug 3: Immer Proxy Errors ✅ FIXED

**Was:** `TypeError: 'get' on proxy: property 'X' is a read-only and non-configurable data property on the proxy target`

**Root cause:** Immer `produce()` creates Proxy objects that conflict with Vue 3's reactive proxy system — double-proxying causes runtime crashes on click/create.

**Files changed (Immer → direct spread):**
- `src/stores/conversations.ts`
- `src/stores/messages.ts`
- `src/stores/keyPackages.ts`
- `src/stores/profiles.ts`
- `src/stores/relays.ts`
- `src/stores/contacts.ts`

All mutations now use `{ ...state, [key]: { ...updated } }` instead of `produce()`.

---

## Bug 4: Nsec Signer (Private Key Login) ✅ ADDED

**Files changed:**
- `src/types/index.ts` — `AuthMethod` now includes `'nsec'`
- `src/stores/auth.ts` — `connectNsec()`: decodes nsec1 bech32 or hex, creates `PrivateKeySigner`
- `src/pages/Login.vue` — New "⚠️ Private Key (Insecure)" section with security warning, acknowledgement checkbox

**Security:** Private key held in memory only. NOT persisted to localStorage. Session requires re-login on reload.

---

## Test Results

| Test | Status |
|------|--------|
| Nsec login → navigates to /chat | ✅ |
| KeyPackage creation (3/3 relays confirmed) | ✅ |
| Clipboard copy (no errors, fallback works) | ✅ |
| Settings/Chat page (no Immer proxy errors) | ✅ |
| New Group flow renders without crash | ✅ |
| Unit tests: 71/71 passing | ✅ |
| TypeScript: 0 type errors | ✅ |
| Production build: successful | ✅ |
| Served on 0.0.0.0:8080 | ✅ |

## Test also fixed
- `tests/unit/stores/auth.test.ts` — Updated error message assertion for invalid bunker URL (string changed, behavior unchanged)
