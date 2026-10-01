const mockStorageMap = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async (key: string, val: string) => {
    mockStorageMap.set(key, val);
  }),
  getItem: jest.fn(async (key: string) => mockStorageMap.get(key) || null),
  removeItem: jest.fn(async (key: string) => {
    mockStorageMap.delete(key);
  }),
  clear: jest.fn(async () => {
    mockStorageMap.clear();
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  evaluatePrinterLockStatus,
  recordPrinterConnection,
  unlockWithMasterPassword,
  isSameRegisteredPrinter,
  formatTimeRemaining,
  setPrinterLockFeatureEnabled,
} from '../src/utils/printerLockManager';
import { APP_CONFIG } from '../src/config/app_config';

describe('Printer Security Lock Manager', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await setPrinterLockFeatureEnabled(true);
  });

  it('should format time remaining correctly', () => {
    expect(formatTimeRemaining(48 * 3600 * 1000)).toBe('48 hrs 0 mins');
    expect(formatTimeRemaining(90 * 60 * 1000)).toBe('1 hr 30 mins');
    expect(formatTimeRemaining(25 * 60 * 1000)).toBe('25 mins');
    expect(formatTimeRemaining(0)).toBe('0 mins');
  });

  it('should not lock if printer was recently connected within threshold', async () => {
    const mockDevice = { name: 'Parchiwala POS-58', address: '66:32:B1:A4:5E:20' };
    await recordPrinterConnection(mockDevice);

    const status = await evaluatePrinterLockStatus();
    expect(status.isLocked).toBe(false);
    expect(status.timeRemainingHours).toBeGreaterThanOrEqual(
      APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS - 1
    );
    expect(status.registeredDevice?.address).toBe(mockDevice.address);
  });

  it('should trigger lock when printer has not been connected for more than configured threshold', async () => {
    const mockDevice = { name: 'Parchiwala POS-58', address: '66:32:B1:A4:5E:20' };
    await recordPrinterConnection(mockDevice);

    // Simulate elapsed beyond threshold (threshold + 1 hour)
    const thresholdPast =
      Date.now() - (APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS + 1) * 3600 * 1000;
    await AsyncStorage.setItem(
      APP_CONFIG.PRINTER_SECURITY_LOCK.STORAGE_KEYS.LAST_CONNECTED_TIMESTAMP,
      thresholdPast.toString()
    );

    const status = await evaluatePrinterLockStatus();
    expect(status.isLocked).toBe(true);
    expect(status.timeRemainingHours).toBe(0);
    expect(status.registeredDevice?.name).toBe('Parchiwala POS-58');
  });

  it('should automatically unlock when the same registered printer connects again', async () => {
    const mockDevice = { name: 'Parchiwala POS-58', address: '66:32:B1:A4:5E:20' };
    await recordPrinterConnection(mockDevice);

    // Simulate expired lock
    const expiredTime =
      Date.now() - (APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS + 5) * 3600 * 1000;
    await AsyncStorage.setItem(
      APP_CONFIG.PRINTER_SECURITY_LOCK.STORAGE_KEYS.LAST_CONNECTED_TIMESTAMP,
      expiredTime.toString()
    );
    await AsyncStorage.setItem(
      APP_CONFIG.PRINTER_SECURITY_LOCK.STORAGE_KEYS.IS_LOCKED_FLAG,
      'true'
    );

    let status = await evaluatePrinterLockStatus();
    expect(status.isLocked).toBe(true);

    // Reconnect same printer
    const isSame = await isSameRegisteredPrinter('66:32:B1:A4:5E:20');
    expect(isSame).toBe(true);

    await recordPrinterConnection(mockDevice);

    status = await evaluatePrinterLockStatus();
    expect(status.isLocked).toBe(false);
    expect(status.timeRemainingHours).toBeGreaterThanOrEqual(
      APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS - 1
    );
  });

  it('should unlock when correct Master Password is provided', async () => {
    const mockDevice = { name: 'Parchiwala POS-58', address: '66:32:B1:A4:5E:20' };
    await recordPrinterConnection(mockDevice);

    // Simulate elapsed beyond threshold
    const expiredTime =
      Date.now() - (APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS + 2) * 3600 * 1000;
    await AsyncStorage.setItem(
      APP_CONFIG.PRINTER_SECURITY_LOCK.STORAGE_KEYS.LAST_CONNECTED_TIMESTAMP,
      expiredTime.toString()
    );

    // Failed attempt
    const failRes = await unlockWithMasterPassword('WRONG_PASS');
    expect(failRes.success).toBe(false);

    // Valid master password
    const successRes = await unlockWithMasterPassword(
      APP_CONFIG.PRINTER_SECURITY_LOCK.MASTER_PASSWORD
    );
    expect(successRes.success).toBe(true);

    const status = await evaluatePrinterLockStatus();
    expect(status.isLocked).toBe(false);
    expect(status.unlockedViaMaster).toBe(true);
  });

  it('should respect feature flag when disabled', async () => {
    await setPrinterLockFeatureEnabled(false);

    const status = await evaluatePrinterLockStatus();
    expect(status.isLocked).toBe(false);
    expect(status.featureEnabled).toBe(false);
  });
});
