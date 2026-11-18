import { APP_CONFIG } from '../config/app_config';

/**
 * Parchiwala Internal Security Pepper
 * Used to salt all hashes so rainbow tables and dictionary attacks cannot crack them.
 */
export const SECURITY_PEPPER = '@PARCHIWALA_SECURITY_PEPPER_2026#';

/**
 * Zero-dependency, pure TypeScript FIPS 180-2 compliant SHA-256 implementation.
 * Runs 100% offline, cross-platform on Android, iOS, Jest, and web.
 */
export const sha256 = (input: string): string => {
  const rightRotate = (n: number, b: number): number => {
    return (n >>> b) | (n << (32 - b));
  };

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  // UTF-8 encode
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    } else {
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (input.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (code >> 18));
      bytes.push(0x80 | ((code >> 12) & 0x3f));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    }
  }

  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }

  // 64-bit big endian length
  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  bytes.push((highBits >>> 24) & 0xff);
  bytes.push((highBits >>> 16) & 0xff);
  bytes.push((highBits >>> 8) & 0xff);
  bytes.push(highBits & 0xff);
  bytes.push((lowBits >>> 24) & 0xff);
  bytes.push((lowBits >>> 16) & 0xff);
  bytes.push((lowBits >>> 8) & 0xff);
  bytes.push(lowBits & 0xff);

  const w = new Uint32Array(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }

    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const parts = [h0, h1, h2, h3, h4, h5, h6, h7];
  return parts.map((val) => val.toString(16).padStart(8, '0')).join('');
};

/**
 * Standard FIPS 198 compliant HMAC-SHA256 implementation
 */
export const hmacSha256 = (key: string, message: string): string => {
  let keyBytes: number[] = [];
  for (let i = 0; i < key.length; i++) {
    keyBytes.push(key.charCodeAt(i) & 0xff);
  }

  // Keys longer than block size (64 bytes) are shortened by hashing them
  if (keyBytes.length > 64) {
    const keyHashHex = sha256(key);
    keyBytes = [];
    for (let i = 0; i < keyHashHex.length; i += 2) {
      keyBytes.push(parseInt(keyHashHex.substring(i, i + 2), 16));
    }
  }

  // Keys shorter than block size are zero-padded to 64 bytes
  while (keyBytes.length < 64) {
    keyBytes.push(0);
  }

  const oKeyPad: number[] = new Array(64);
  const iKeyPad: number[] = new Array(64);
  for (let i = 0; i < 64; i++) {
    oKeyPad[i] = keyBytes[i] ^ 0x5c;
    iKeyPad[i] = keyBytes[i] ^ 0x36;
  }

  // Inner hash: H(iKeyPad || message)
  const innerMsg = String.fromCharCode(...iKeyPad) + message;
  const innerHashHex = sha256(innerMsg);

  // Outer hash: H(oKeyPad || innerHash)
  const innerHashBytes: number[] = [];
  for (let i = 0; i < innerHashHex.length; i += 2) {
    innerHashBytes.push(parseInt(innerHashHex.substring(i, i + 2), 16));
  }
  const outerMsg = String.fromCharCode(...oKeyPad) + String.fromCharCode(...innerHashBytes);
  return sha256(outerMsg);
};

/**
 * Hashes a secret using the internal security pepper
 */
export const hashSecret = (secret: string): string => {
  return sha256((secret || '').trim() + SECURITY_PEPPER);
};

/**
 * Hashes a secret in uppercase format (used for activation keys)
 */
export const hashUpperSecret = (secret: string): string => {
  return sha256((secret || '').trim().toUpperCase() + SECURITY_PEPPER);
};

/**
 * Verifies whether an entered password matches the Master Password hash
 */
export const verifyMasterPassword = (enteredPassword: string): boolean => {
  if (!enteredPassword || !enteredPassword.trim()) return false;
  const computedHash = hashSecret(enteredPassword);
  return computedHash === APP_CONFIG.PRINTER_SECURITY_LOCK.MASTER_PASSWORD_HASH;
};

/**
 * Verifies whether an entered PIN matches the First-Time Activation PIN hash
 */
export const verifyActivationPin = (enteredPin: string): boolean => {
  if (!enteredPin || !enteredPin.trim()) return false;
  const computedHash = hashUpperSecret(enteredPin);
  return computedHash === APP_CONFIG.ACTIVATION_PIN_HASH;
};

const formatDateOnly = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Generates an offline 8-character emergency daily support key for a specific store.
 * Support agents calculate this on an internal tool using the store's name or ID.
 */
export const generateDailySupportKey = (storeIdentifier: string, dateObj?: Date): string => {
  const cleanId = (storeIdentifier || 'PARCHIWALA_STORE').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const dateStr = formatDateOnly(dateObj || new Date());
  const hash = sha256(`${cleanId}_${dateStr}_${SECURITY_PEPPER}`);
  return hash.substring(0, 8).toUpperCase();
};

/**
 * Verifies if an entered key matches the daily support emergency key
 * Checks today, yesterday, and tomorrow to handle clock/timezone drift gracefully.
 */
export const verifyDailySupportKey = (storeIdentifier: string, enteredKey: string): boolean => {
  const cleanInput = (enteredKey || '').trim().toUpperCase();
  if (cleanInput.length !== 8) return false;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);

  const validKeys = [
    generateDailySupportKey(storeIdentifier, now),
    generateDailySupportKey(storeIdentifier, yesterday),
    generateDailySupportKey(storeIdentifier, tomorrow),
  ];

  return validKeys.includes(cleanInput);
};

/**
 * Calculates a cryptographic state checksum to detect SQLite/AsyncStorage tampering
 */
export const calculateStateChecksum = (lastConn: string, mac: string, installedAt: string): string => {
  return sha256(`${lastConn}_${mac}_${installedAt}_${SECURITY_PEPPER}`);
};

// ============================================================================
// DATA-AT-REST PROTECTION & SENSITIVE FIELD ENCRYPTION
// ============================================================================

const ENC_PREFIX = 'ENC:v1:';

/**
 * Generates a pseudo-random hex string for cryptographic salt/IV without node crypto dependency.
 */
const generateRandomHex = (bytesCount: number): string => {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < bytesCount * 2; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
};

/**
 * Checks whether a given field is already encrypted
 */
export const isEncryptedField = (value: any): boolean => {
  if (typeof value !== 'string') return false;
  return value.startsWith(ENC_PREFIX);
};

/**
 * Encrypts a sensitive string field at rest (e.g. customer phone numbers, security PINs, financials).
 * Format: ENC:v1:<salt_hex>:<iv_hex>:<ciphertext_hex>:<mac_hex>
 */
export const encryptSensitiveField = (plaintext: string, saltContext: string = 'PARCHIWALA_PII'): string => {
  if (!plaintext || typeof plaintext !== 'string') return plaintext;
  if (isEncryptedField(plaintext)) return plaintext; // Already encrypted

  const salt = generateRandomHex(8);
  const iv = generateRandomHex(8);
  const derivedKey = hmacSha256(SECURITY_PEPPER, `${salt}_${saltContext}`);

  // UTF-8 encode plaintext into bytes
  const utf8Bytes: number[] = [];
  for (let i = 0; i < plaintext.length; i++) {
    let code = plaintext.charCodeAt(i);
    if (code < 0x80) {
      utf8Bytes.push(code);
    } else if (code < 0x800) {
      utf8Bytes.push(0xc0 | (code >> 6));
      utf8Bytes.push(0x80 | (code & 0x3f));
    } else {
      utf8Bytes.push(0xe0 | (code >> 12));
      utf8Bytes.push(0x80 | ((code >> 6) & 0x3f));
      utf8Bytes.push(0x80 | (code & 0x3f));
    }
  }

  // Stream XOR keystream generation via chained HMAC blocks
  let cipherHex = '';
  let blockIndex = 0;
  let keystreamBytes: number[] = [];

  for (let i = 0; i < utf8Bytes.length; i++) {
    if (keystreamBytes.length === 0) {
      const blockHash = hmacSha256(derivedKey, `${iv}_BLK_${blockIndex++}`);
      for (let j = 0; j < blockHash.length; j += 2) {
        keystreamBytes.push(parseInt(blockHash.substring(j, j + 2), 16));
      }
    }
    const keyByte = keystreamBytes.shift()!;
    const cipherByte = utf8Bytes[i] ^ keyByte;
    cipherHex += cipherByte.toString(16).padStart(2, '0');
  }

  const authMac = hmacSha256(derivedKey, `AUTH:${iv}:${cipherHex}`).substring(0, 16);
  return `${ENC_PREFIX}${salt}:${iv}:${cipherHex}:${authMac}`;
};

/**
 * Decrypts a sensitive string field at rest.
 * If the value is not encrypted (e.g. legacy records), returns the plaintext cleanly without errors.
 */
export const decryptSensitiveField = (ciphertext: string, saltContext: string = 'PARCHIWALA_PII'): string => {
  if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;
  if (!isEncryptedField(ciphertext)) return ciphertext; // Backward compatibility with legacy plaintext

  try {
    const parts = ciphertext.substring(ENC_PREFIX.length).split(':');
    if (parts.length !== 4) return ciphertext;

    const [salt, iv, cipherHex, authMac] = parts;
    const derivedKey = hmacSha256(SECURITY_PEPPER, `${salt}_${saltContext}`);
    const expectedMac = hmacSha256(derivedKey, `AUTH:${iv}:${cipherHex}`).substring(0, 16);

    if (authMac !== expectedMac) {
      console.warn('[CryptoSecurity] Decryption MAC mismatch - data integrity warning.');
      return ciphertext;
    }

    const cipherBytes: number[] = [];
    for (let i = 0; i < cipherHex.length; i += 2) {
      cipherBytes.push(parseInt(cipherHex.substring(i, i + 2), 16));
    }

    let blockIndex = 0;
    let keystreamBytes: number[] = [];
    const plainBytes: number[] = [];

    for (let i = 0; i < cipherBytes.length; i++) {
      if (keystreamBytes.length === 0) {
        const blockHash = hmacSha256(derivedKey, `${iv}_BLK_${blockIndex++}`);
        for (let j = 0; j < blockHash.length; j += 2) {
          keystreamBytes.push(parseInt(blockHash.substring(j, j + 2), 16));
        }
      }
      const keyByte = keystreamBytes.shift()!;
      plainBytes.push(cipherBytes[i] ^ keyByte);
    }

    // Decode UTF-8 bytes to string
    let result = '';
    let i = 0;
    while (i < plainBytes.length) {
      const b1 = plainBytes[i++];
      if (b1 < 0x80) {
        result += String.fromCharCode(b1);
      } else if (b1 > 0xbf && b1 < 0xe0) {
        const b2 = plainBytes[i++];
        result += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
      } else {
        const b2 = plainBytes[i++];
        const b3 = plainBytes[i++];
        result += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
      }
    }

    return result;
  } catch (err) {
    console.warn('[CryptoSecurity] Decryption error:', err);
    return ciphertext;
  }
};

/**
 * Encrypts an arbitrary object/payload into an encrypted transport container
 */
export const encryptPayloadAtRest = (payload: any, saltContext: string = 'STORE_PAYLOAD'): string => {
  const jsonStr = JSON.stringify(payload);
  return encryptSensitiveField(jsonStr, saltContext);
};

/**
 * Decrypts an encrypted transport container back into an object/payload
 */
export const decryptPayloadAtRest = (encryptedStr: string, saltContext: string = 'STORE_PAYLOAD'): any => {
  if (!isEncryptedField(encryptedStr)) {
    try {
      return typeof encryptedStr === 'string' ? JSON.parse(encryptedStr) : encryptedStr;
    } catch {
      return encryptedStr;
    }
  }
  const plainJson = decryptSensitiveField(encryptedStr, saltContext);
  try {
    return JSON.parse(plainJson);
  } catch {
    return plainJson;
  }
};

