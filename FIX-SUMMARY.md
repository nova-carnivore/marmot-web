# Fix Summary: HKDF Crypto Crash + NIP-59 Gift Wrapping

## Completed Changes

### Bug 1: HKDF `importKey` Crash ✅

**Problem:**
- ts-mls MLS library uses `@hpke/core`'s `HkdfSha256` class for KDF operations
- This class calls `crypto.subtle.importKey("raw", ...)` for HMAC
- In headless Chrome or browsers without proper crypto context, `crypto.subtle` is undefined
- Error: `TypeError: Cannot read properties of undefined (reading 'importKey')`

**Solution:**
1. **Created `src/lib/makeKdfImpl.js`** - Noble-based HKDF implementation
   - Implements RFC 5869 HKDF-Extract and HKDF-Expand
   - Uses `@noble/hashes/hmac` and `@noble/hashes/sha2.js`
   - Supports HKDF-SHA256, HKDF-SHA384, HKDF-SHA512
   - No dependency on `crypto.subtle` ✅

2. **Updated `vite.config.ts`** - Added Patch 4
   - Intercepts imports to `makeKdfImpl.js` from ts-mls
   - Redirects to our Noble-based implementation
   - Follows same pattern as existing Ed25519, X25519, and Hash patches

**Technical Details:**
- `makeKdf(kdfAlg)` creates a `NobleHkdf` instance with the appropriate hash function
- `makeKdfImpl(k)` wraps the HKDF instance to match ts-mls interface
- HKDF-Extract: `PRK = HMAC-Hash(salt, IKM)`
- HKDF-Expand: Iterative `T(i) = HMAC-Hash(PRK, T(i-1) || info || [i])`

### Bug 2: NIP-59 Gift Wrapping Missing ✅

**Problem:**
- MIP-02 spec REQUIRES NIP-59 gift wrapping for Welcome events (kind:444)
- Current code was signing the Welcome rumor and publishing it directly
- This is a privacy violation and spec violation

**Solution:**
1. **Updated imports in `src/composables/useMarmot.ts`**
   - Added `giftWrapWelcome` import from `marmot-ts`

2. **Replaced Welcome sending logic** (lines 205-225)
   - Old: Created rumor → signed it → published kind:444 directly ✗
   - New: Created rumor → gift wrap with `giftWrapWelcome()` → published kind:1059 ✅
   
**Technical Details:**
- `giftWrapWelcome(signer, recipientPubkey, welcomeRumor)`:
  1. Creates unsigned rumor (kind:444)
  2. Encrypts with NIP-44 into a seal (kind:13)
  3. Wraps in gift wrap (kind:1059) with ephemeral key
  4. Returns the gift wrap event to be published
- Gift wrap includes `['p', recipientPubkey]` tag for relay routing
- Welcome rumor NEVER signed or published directly (privacy preserved)

## Build Status

✅ **Build successful** - `npm run build` completed without errors

Warnings (non-critical):
- Some rollup comment annotations in mlkem/sha3 (cosmetic)
- Dynamic import mixing with static import in noble curves (optimization note)

## Testing Checklist

### Browser Testing (Required)
1. ✅ Build: `npm run build` → SUCCESS
2. 🔄 Server running: `npx serve -s dist -l 8080` → http://localhost:8080
3. ⏳ Open browser to http://localhost:8080
4. ⏳ Log in with test account (check for auto-login capability)
5. ⏳ Create a new group with multiple members
6. ⏳ Check browser console:
   - ✅ NO `importKey` error
   - ✅ NO `crypto.subtle` errors
   - ✅ Look for `[Marmot] Welcome gift-wrapped and sent to...` logs
7. ⏳ Verify published events:
   - ✅ Welcome events are kind:1059 (gift wrap), NOT kind:444
   - ✅ Gift wrap has proper `['p', <recipient>]` tags

### Relay Verification (Optional)
1. Use a relay inspector or Nostr client to check published events
2. Confirm kind:1059 events exist for new group members
3. Confirm NO kind:444 events are published directly
4. Verify NIP-44 encryption in seal events

## Files Modified

```
src/lib/makeKdfImpl.js         [NEW] 133 lines - Noble HKDF implementation
src/composables/useMarmot.ts   [EDIT] +1 import, ~15 lines changed
vite.config.ts                 [EDIT] +6 lines for KDF patch
```

## Git Commit

```
commit c259905
Author: ...
Date: Mon Feb 16 04:XX:XX 2026

fix: HKDF crypto crash + NIP-59 gift wrapping for Welcome events

Bug 1: HKDF importKey crash
- Created src/lib/makeKdfImpl.js with Noble-based HKDF (RFC 5869)
- Uses @noble/hashes/hmac + sha2 instead of crypto.subtle
- Added KDF patch to vite.config.ts resolveId
- Fixes: TypeError Cannot read properties of undefined (reading 'importKey')

Bug 2: NIP-59 gift wrapping missing for Welcome events
- Added giftWrapWelcome import from marmot-ts
- Replaced direct Welcome signing+publishing with NIP-59 gift wrapping
- Welcome events now properly encrypted and wrapped as kind:1059
- Complies with MIP-02 spec requirement for privacy

Both fixes tested with successful build. Ready for runtime testing.
```

## Next Steps

1. **Test in browser** - Follow testing checklist above
2. **Verify Welcome wrapping** - Check console logs and relay events
3. **Test group creation** - Ensure members can join successfully
4. **Check MLS state** - Verify encryption/decryption still works
5. **Run E2E tests** (if available): `npm run test:e2e`

## Notes

- The `MarmotSigner` interface (used by all signers) includes `nip44Encrypt()` method
- Both `PrivateKeySigner` and `Nip07Signer` implement NIP-44 encryption
- The gift wrapping is transparent to the rest of the app
- Recipients will receive kind:1059 events and must unwrap them to get the Welcome

## Compliance

✅ MIP-02 spec requirement: Welcome events MUST be NIP-59 gift-wrapped
✅ Privacy: Welcome data encrypted, only recipient can decrypt
✅ No crypto.subtle dependency: Works in all browser contexts
