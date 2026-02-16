/**
 * Patched makeNobleSignatureImpl that always uses @noble/curves for Ed25519.
 *
 * The original ts-mls implementation prefers WebCrypto's Ed25519 support when
 * crypto.subtle exists. However, many browsers/environments don't support the
 * Ed25519 algorithm via WebCrypto, causing:
 *   "Cannot read properties of undefined (reading 'generateKey')"
 *
 * This patched version always uses @noble/curves for Ed25519, which works
 * universally. Other algorithms already use @noble/curves in the original.
 */

// Inline DependencyError to avoid importing ts-mls internals
class DependencyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DependencyError';
  }
}

export async function makeNobleSignatureImpl(alg) {
  switch (alg) {
    case 'Ed25519': {
      // Always use @noble/curves for Ed25519 — skip WebCrypto detection
      try {
        const { ed25519 } = await import('@noble/curves/ed25519.js');
        return {
          async sign(signKey, message) {
            return ed25519.sign(message, signKey);
          },
          async verify(publicKey, message, signature) {
            return ed25519.verify(signature, message, publicKey);
          },
          async keygen() {
            const signKey = ed25519.utils.randomSecretKey();
            return { signKey, publicKey: ed25519.getPublicKey(signKey) };
          },
        };
      } catch (err) {
        throw new DependencyError(
          "Optional dependency '@noble/curves' is not installed. Please install it to use this feature."
        );
      }
    }
    case 'Ed448':
      try {
        const { ed448 } = await import('@noble/curves/ed448.js');
        return {
          async sign(signKey, message) {
            return ed448.sign(message, signKey);
          },
          async verify(publicKey, message, signature) {
            return ed448.verify(signature, message, publicKey);
          },
          async keygen() {
            const signKey = ed448.utils.randomSecretKey();
            return { signKey, publicKey: ed448.getPublicKey(signKey) };
          },
        };
      } catch (err) {
        throw new DependencyError(
          "Optional dependency '@noble/curves' is not installed. Please install it to use this feature."
        );
      }
    case 'P256':
      try {
        const { p256 } = await import('@noble/curves/nist.js');
        return {
          async sign(signKey, message) {
            return p256.sign(message, signKey, { prehash: true, format: 'der', lowS: false });
          },
          async verify(publicKey, message, signature) {
            return p256.verify(signature, message, publicKey, {
              prehash: true,
              format: 'der',
              lowS: false,
            });
          },
          async keygen() {
            const signKey = p256.utils.randomSecretKey();
            return { signKey, publicKey: p256.getPublicKey(signKey) };
          },
        };
      } catch (err) {
        throw new DependencyError(
          "Optional dependency '@noble/curves' is not installed. Please install it to use this feature."
        );
      }
    case 'P384':
      try {
        const { p384 } = await import('@noble/curves/nist.js');
        return {
          async sign(signKey, message) {
            return p384.sign(message, signKey, { prehash: true, format: 'der', lowS: false });
          },
          async verify(publicKey, message, signature) {
            return p384.verify(signature, message, publicKey, {
              prehash: true,
              format: 'der',
              lowS: false,
            });
          },
          async keygen() {
            const signKey = p384.utils.randomSecretKey();
            return { signKey, publicKey: p384.getPublicKey(signKey) };
          },
        };
      } catch (err) {
        throw new DependencyError(
          "Optional dependency '@noble/curves' is not installed. Please install it to use this feature."
        );
      }
    case 'P521':
      try {
        const { p521 } = await import('@noble/curves/nist.js');
        return {
          async sign(signKey, message) {
            return p521.sign(message, signKey, { prehash: true, format: 'der', lowS: false });
          },
          async verify(publicKey, message, signature) {
            return p521.verify(signature, message, publicKey, {
              prehash: true,
              format: 'der',
              lowS: false,
            });
          },
          async keygen() {
            const signKey = p521.utils.randomSecretKey();
            return { signKey, publicKey: p521.getPublicKey(signKey) };
          },
        };
      } catch (err) {
        throw new DependencyError(
          "Optional dependency '@noble/curves' is not installed. Please install it to use this feature."
        );
      }
    case 'ML-DSA-87':
      throw new DependencyError(
        "ML-DSA-87 is not supported in the browser build. Install '@noble/post-quantum' if needed."
      );
  }
}
