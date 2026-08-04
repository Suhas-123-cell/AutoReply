//! AES-256-GCM token encryption, ported from `lib/meta/oauth.ts`'s
//! `encryptToken`/`decryptToken`.
//!
//! Compatibility-critical detail: the Node implementation uses a
//! **16-byte GCM nonce**, not the standard 12-byte one (`IV_LENGTH = 16` in
//! the Node source). This module must match that exactly, or every already
//! -encrypted `InstagramAccount.accessToken` in the production database
//! becomes permanently undecryptable. Wire format (matching Node):
//! base64( nonce[16] || auth_tag[16] || ciphertext[..] ).

use aes_gcm::aead::generic_array::GenericArray;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::AesGcm;
use aes_gcm::aes::Aes256;
use base64::Engine;
use rand::RngCore;
use thiserror::Error;

// Node's AUTH_TAG_LENGTH is 16, which is GCM's standard/only tag length —
// no custom type needed for that part, only the nonce size is non-standard.
type Aes256Gcm16 = AesGcm<Aes256, aes_gcm::aead::consts::U16>;

const NONCE_LEN: usize = 16;
const TAG_LEN: usize = 16;

#[derive(Debug, Error)]
pub enum EncryptionError {
    #[error("ENCRYPTION_KEY must decode to exactly 32 bytes")]
    BadKeyLength,
    #[error("ciphertext too short to contain a nonce + auth tag")]
    CiphertextTooShort,
    #[error("invalid base64 ciphertext: {0}")]
    BadBase64(#[from] base64::DecodeError),
    #[error("decryption failed (bad key, corrupted ciphertext, or wrong nonce size)")]
    DecryptFailed,
}

fn key_from_hex(key_hex: &str) -> Result<[u8; 32], EncryptionError> {
    let bytes = hex::decode(key_hex).map_err(|_| EncryptionError::BadKeyLength)?;
    bytes.try_into().map_err(|_| EncryptionError::BadKeyLength)
}

/// Encrypts `plaintext` (e.g. an Instagram access token) for storage,
/// producing base64(nonce[16] || tag[16] || ciphertext) — byte-for-byte
/// compatible with `lib/meta/oauth.ts`'s `encryptToken`.
pub fn encrypt_token(plaintext: &str, key_hex: &str) -> Result<String, EncryptionError> {
    let key_bytes = key_from_hex(key_hex)?;
    let cipher = Aes256Gcm16::new(GenericArray::from_slice(&key_bytes));

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = GenericArray::from_slice(&nonce_bytes);

    // aes-gcm's `encrypt` returns ciphertext with the tag appended at the
    // end; Node's `getAuthTag()` keeps it separate and places it *before*
    // the ciphertext in the combined buffer — split and reorder to match.
    let mut combined = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|_| EncryptionError::DecryptFailed)?;
    let ciphertext_len = combined.len() - TAG_LEN;
    let tag: Vec<u8> = combined.split_off(ciphertext_len);
    let ciphertext = combined;

    let mut out = Vec::with_capacity(NONCE_LEN + TAG_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&tag);
    out.extend_from_slice(&ciphertext);

    Ok(base64::engine::general_purpose::STANDARD.encode(out))
}

/// Decrypts a value produced by `encrypt_token` (or by the Node
/// `encryptToken` it's compatible with).
pub fn decrypt_token(encrypted_base64: &str, key_hex: &str) -> Result<String, EncryptionError> {
    let key_bytes = key_from_hex(key_hex)?;
    let cipher = Aes256Gcm16::new(GenericArray::from_slice(&key_bytes));

    let combined = base64::engine::general_purpose::STANDARD.decode(encrypted_base64)?;
    if combined.len() < NONCE_LEN + TAG_LEN {
        return Err(EncryptionError::CiphertextTooShort);
    }

    let nonce = GenericArray::from_slice(&combined[..NONCE_LEN]);
    let tag = &combined[NONCE_LEN..NONCE_LEN + TAG_LEN];
    let ciphertext = &combined[NONCE_LEN + TAG_LEN..];

    // Re-append the tag to match aes-gcm's expected `ciphertext || tag` input.
    let mut ciphertext_with_tag = Vec::with_capacity(ciphertext.len() + TAG_LEN);
    ciphertext_with_tag.extend_from_slice(ciphertext);
    ciphertext_with_tag.extend_from_slice(tag);

    let plaintext_bytes = cipher
        .decrypt(nonce, ciphertext_with_tag.as_slice())
        .map_err(|_| EncryptionError::DecryptFailed)?;

    String::from_utf8(plaintext_bytes).map_err(|_| EncryptionError::DecryptFailed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_rust() {
        let key_hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let plaintext = "IGAAsome-instagram-access-token";
        let encrypted = encrypt_token(plaintext, key_hex).unwrap();
        let decrypted = decrypt_token(&encrypted, key_hex).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    /// Cross-language compatibility test: this exact key/plaintext/ciphertext
    /// triple was generated with Node's `crypto` module using the identical
    /// algorithm, key, and nonce that `lib/meta/oauth.ts` uses in production
    /// (aes-256-gcm, 16-byte nonce, iv||tag||ciphertext wire format). If this
    /// test fails, the Rust port is NOT compatible with already-encrypted
    /// production data.
    #[test]
    fn decrypts_a_value_produced_by_the_node_implementation() {
        let key_hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let ciphertext_b64 =
            "ABEiM0RVZneImaq7zN3u/1XZk/ZG6CWvqW8mCvFcLpwKXvkHf5h+VJfz5Qwbg+yH8VVAa11fgXhSVjne/TBXFkOhFS2M1vxj+/8=";
        let expected_plaintext = "IGAAtest-instagram-access-token-1234567890";

        let decrypted = decrypt_token(ciphertext_b64, key_hex).unwrap();
        assert_eq!(decrypted, expected_plaintext);
    }

    #[test]
    fn rejects_tampered_ciphertext() {
        let key_hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let mut encrypted = encrypt_token("secret", key_hex).unwrap();
        // Flip a char to corrupt it — must fail closed, not decrypt garbage.
        encrypted.replace_range(40..41, if &encrypted[40..41] == "A" { "B" } else { "A" });
        assert!(decrypt_token(&encrypted, key_hex).is_err());
    }
}
