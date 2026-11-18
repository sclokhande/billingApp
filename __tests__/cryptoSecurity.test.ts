import {
  sha256,
  hashSecret,
  hashUpperSecret,
  verifyMasterPassword,
  verifyActivationPin,
  generateDailySupportKey,
  verifyDailySupportKey,
  calculateStateChecksum,
  SECURITY_PEPPER,
} from '../src/utils/cryptoSecurity';
import { APP_CONFIG } from '../src/config/app_config';

describe('Cryptographic Security & Offline Verification Utilities', () => {
  it('correctly computes NIST/FIPS 180-2 standard SHA-256 test vectors', () => {
    // NIST Standard vector for empty string
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // NIST Standard vector for 'abc'
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('correctly hashes secrets with security pepper', () => {
    const rawSecret = 'testPassword123';
    const computed = hashSecret(rawSecret);
    const expected = sha256(rawSecret + SECURITY_PEPPER);
    expect(computed).toBe(expected);
  });

  it('verifies the Peppered Master Password against configured hash', () => {
    // Valid master password
    expect(verifyMasterPassword('v3LH$N$MwBP6')).toBe(true);
    expect(verifyMasterPassword('  v3LH$N$MwBP6  ')).toBe(true);

    // Invalid passwords
    expect(verifyMasterPassword('wrongPassword')).toBe(false);
    expect(verifyMasterPassword('')).toBe(false);
    expect(verifyMasterPassword('v3lh$n$mwbp6')).toBe(false); // Master password is case-sensitive
  });

  it('verifies the Activation PIN against configured hash with uppercase normalization', () => {
    // Valid activation key (case-insensitive)
    expect(verifyActivationPin('S5M26080688')).toBe(true);
    expect(verifyActivationPin('s5m26080688')).toBe(true);
    expect(verifyActivationPin('  s5m26080688  ')).toBe(true);

    // Invalid activation keys
    expect(verifyActivationPin('12345678')).toBe(false);
    expect(verifyActivationPin('')).toBe(false);
  });

  it('generates deterministic 8-character daily support emergency keys', () => {
    const storeId = 'SHREE_GANESH_SWEETS';
    const key1 = generateDailySupportKey(storeId);
    const key2 = generateDailySupportKey(storeId);

    expect(key1).toHaveLength(8);
    expect(key1).toBe(key2);
    expect(key1).toBe(key1.toUpperCase());
  });

  it('verifies daily support emergency keys with 24h timezone tolerance', () => {
    const storeId = 'SHREE_GANESH_SWEETS';
    const today = new Date();
    const todayKey = generateDailySupportKey(storeId, today);

    // Today's key must verify
    expect(verifyDailySupportKey(storeId, todayKey)).toBe(true);

    // Yesterday's key must verify (timezone/midnight drift protection)
    const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
    const yesterdayKey = generateDailySupportKey(storeId, yesterday);
    expect(verifyDailySupportKey(storeId, yesterdayKey)).toBe(true);

    // Tomorrow's key must verify
    const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000);
    const tomorrowKey = generateDailySupportKey(storeId, tomorrow);
    expect(verifyDailySupportKey(storeId, tomorrowKey)).toBe(true);

    // 3 days ago must be rejected
    const oldDate = new Date(today.getTime() - 72 * 3600 * 1000);
    const oldKey = generateDailySupportKey(storeId, oldDate);
    expect(verifyDailySupportKey(storeId, oldKey)).toBe(false);

    // Wrong store identifier must be rejected
    expect(verifyDailySupportKey('OTHER_STORE_ID', todayKey)).toBe(false);
    expect(verifyDailySupportKey(storeId, 'INVALID1')).toBe(false);
  });

  it('generates consistent anti-tamper state checksums', () => {
    const lastConn = '1700000000000';
    const mac = '00:11:22:33:44:55';
    const installed = '1690000000000';

    const checksum1 = calculateStateChecksum(lastConn, mac, installed);
    const checksum2 = calculateStateChecksum(lastConn, mac, installed);

    expect(checksum1).toBe(checksum2);
    expect(checksum1).toHaveLength(64);

    // Any modification alters checksum
    const tamperedChecksum = calculateStateChecksum('1700000000001', mac, installed);
    expect(checksum1).not.toBe(tamperedChecksum);
  });
});
