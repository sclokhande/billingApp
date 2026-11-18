import {
  encryptSensitiveField,
  decryptSensitiveField,
  isEncryptedField,
  encryptPayloadAtRest,
  decryptPayloadAtRest,
} from '../src/utils/cryptoSecurity';

describe('Data-at-Rest Protection & Cryptographic Security', () => {
  it('encrypts sensitive text into authenticated ciphertext with ENC:v1: prefix', () => {
    const rawSecret = 'Customer Phone: 9876543210';
    const encrypted = encryptSensitiveField(rawSecret);

    expect(isEncryptedField(encrypted)).toBe(true);
    expect(encrypted.startsWith('ENC:v1:')).toBe(true);
    expect(encrypted).not.toContain('9876543210');

    // Structure has 4 parts: salt:iv:ciphertext:mac
    const parts = encrypted.substring('ENC:v1:'.length).split(':');
    expect(parts.length).toBe(4);
  });

  it('correctly decrypts encrypted text back to original plaintext', () => {
    const plaintexts = [
      '9851010291',
      'PIN_1234',
      'Special Marathi Unicode: साखर आणि दूध ₹500.50',
      'Long text: ' + 'A'.repeat(500),
    ];

    for (const text of plaintexts) {
      const encrypted = encryptSensitiveField(text);
      const decrypted = decryptSensitiveField(encrypted);
      expect(decrypted).toBe(text);
    }
  });

  it('handles already-encrypted fields without double-encryption', () => {
    const text = '9851010291';
    const encrypted = encryptSensitiveField(text);
    const doubleEncrypted = encryptSensitiveField(encrypted);

    expect(doubleEncrypted).toBe(encrypted);
  });

  it('gracefully returns legacy plaintext if field is not encrypted (backward compatibility)', () => {
    const legacyPlainPhone = '+919876543210';
    expect(isEncryptedField(legacyPlainPhone)).toBe(false);
    expect(decryptSensitiveField(legacyPlainPhone)).toBe(legacyPlainPhone);
  });

  it('detects tampering and rejects decryption on MAC mismatch', () => {
    const text = 'Confidential Store PIN';
    const encrypted = encryptSensitiveField(text);
    const parts = encrypted.substring('ENC:v1:'.length).split(':');

    // Tamper with ciphertext by altering characters
    const tamperedCipher = 'ff' + parts[2].substring(2);
    const tamperedEncrypted = `ENC:v1:${parts[0]}:${parts[1]}:${tamperedCipher}:${parts[3]}`;

    // Should detect tampering and return tampered string rather than corrupt data
    const result = decryptSensitiveField(tamperedEncrypted);
    expect(result).toBe(tamperedEncrypted);
  });

  it('encrypts and decrypts complex JSON payloads for store transfer', () => {
    const payload = {
      storeName: 'Parchiwala Kirana',
      totalRevenue: 45000.75,
      items: ['Sugar', 'Milk', 'Rice'],
      settings: { pin: '9988' },
    };

    const encrypted = encryptPayloadAtRest(payload);
    expect(isEncryptedField(encrypted)).toBe(true);

    const decrypted = decryptPayloadAtRest(encrypted);
    expect(decrypted).toEqual(payload);
  });
});
