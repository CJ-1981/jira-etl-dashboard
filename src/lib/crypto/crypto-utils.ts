// @MX:NOTE: Web Crypto API wrapper for AES-256-GCM encryption of sensitive localStorage fields.
// Purpose: Replace plaintext credential storage with envelope encryption.
// Each encrypted value stores iv + salt + ciphertext as a serialized JSON envelope.
// Not perfect (client-side secret is extractable), but blocks casual inspection and
// automated localStorage scraping — substantially better than plaintext.

const ENCRYPTION_SECRET = new TextEncoder().encode(
  'jira-etl-dashboard-v2.1-crypto-seed-8a4f2e'
) as Uint8Array<ArrayBuffer>;

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 256;
const ALGORITHM = 'AES-GCM';

interface EncryptedEnvelope {
  iv: number[];       // AES-GCM initialization vector (12 bytes)
  salt: number[];     // PBKDF2 salt (16 bytes)
  ciphertext: number[]; // encrypted data
}

async function deriveKey(salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    ENCRYPTION_SECRET,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

function toBase64(arr: Uint8Array<ArrayBuffer>): string {
  return btoa(String.fromCharCode(...arr));
}

function fromBase64(str: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

function generateSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>;
}

function generateIv(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
}

/**
 * Encrypts a plaintext string. Returns a base64-encoded JSON envelope
 * containing the IV, salt, and ciphertext.
 */
export async function encrypt(plaintext: string): Promise<string> {
  const salt = generateSalt();
  const iv = generateIv();
  const key = await deriveKey(salt);

  const encoded = new TextEncoder().encode(plaintext) as Uint8Array<ArrayBuffer>;
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );

  const envelope: EncryptedEnvelope = {
    iv: Array.from(iv),
    salt: Array.from(salt),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
  };

  return toBase64(new TextEncoder().encode(JSON.stringify(envelope)) as Uint8Array<ArrayBuffer>);
}

/**
 * Decrypts a base64-encoded JSON envelope produced by encrypt().
 * Returns the original plaintext, or null if decryption fails.
 */
export async function decrypt(envelopeB64: string): Promise<string | null> {
  try {
    const jsonBytes = fromBase64(envelopeB64);
    const envelope: EncryptedEnvelope = JSON.parse(
      new TextDecoder().decode(jsonBytes)
    );

    const iv = new Uint8Array(envelope.iv) as Uint8Array<ArrayBuffer>;
    const salt = new Uint8Array(envelope.salt) as Uint8Array<ArrayBuffer>;
    const ciphertext = new Uint8Array(envelope.ciphertext) as Uint8Array<ArrayBuffer>;
    const key = await deriveKey(salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

/**
 * Detects whether a string looks like an encrypted envelope (base64 JSON
 * containing iv, salt, and ciphertext keys). Used to distinguish legacy
 * plaintext values from encrypted ones during migration.
 */
export function isEncrypted(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const jsonBytes = fromBase64(value);
    const obj = JSON.parse(new TextDecoder().decode(jsonBytes));
    return (
      Array.isArray(obj.iv) &&
      Array.isArray(obj.salt) &&
      Array.isArray(obj.ciphertext)
    );
  } catch {
    return false;
  }
}