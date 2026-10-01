import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_CONFIG } from '../config/app_config';

export interface PrinterLockStatus {
  isLocked: boolean;
  timeRemainingMs: number;
  timeRemainingHours: number;
  lastConnectedDate: Date | null;
  registeredDevice: { name: string; address: string } | null;
  unlockedViaMaster: boolean;
  featureEnabled: boolean;
}

const normalizeMac = (address: string): string => {
  return (address || '').replace(/[^A-FA-f0-9]/g, '').toUpperCase();
};

/**
 * Checks whether the Printer Lock feature is enabled.
 * Respects local merchant override if stored, otherwise defaults to APP_CONFIG.
 */
export const isPrinterLockFeatureEnabled = async (): Promise<boolean> => {
  try {
    const override = await AsyncStorage.getItem(
      APP_CONFIG.PRINTER_SECURITY_LOCK.STORAGE_KEYS.FEATURE_ENABLED_OVERRIDE
    );
    if (override !== null) {
      return override === 'true';
    }
    return Boolean(APP_CONFIG.PRINTER_SECURITY_LOCK.ENABLED);
  } catch {
    return Boolean(APP_CONFIG.PRINTER_SECURITY_LOCK.ENABLED);
  }
};

/**
 * Toggles or sets the Printer Lock feature state in persistent storage.
 */
export const setPrinterLockFeatureEnabled = async (enabled: boolean): Promise<void> => {
  await AsyncStorage.setItem(
    APP_CONFIG.PRINTER_SECURITY_LOCK.STORAGE_KEYS.FEATURE_ENABLED_OVERRIDE,
    enabled ? 'true' : 'false'
  );
  if (!enabled) {
    // If disabling, clear any active lock flag
    await AsyncStorage.removeItem(APP_CONFIG.PRINTER_SECURITY_LOCK.STORAGE_KEYS.IS_LOCKED_FLAG);
  }
};

/**
 * Retrieves the currently registered printer info from storage.
 */
export const getRegisteredPrinter = async (): Promise<{ name: string; address: string } | null> => {
  try {
    const address = await AsyncStorage.getItem(
      APP_CONFIG.PRINTER_SECURITY_LOCK.STORAGE_KEYS.REGISTERED_PRINTER_MAC
    );
    const name = await AsyncStorage.getItem(
      APP_CONFIG.PRINTER_SECURITY_LOCK.STORAGE_KEYS.REGISTERED_PRINTER_NAME
    );
    if (address) {
      return { name: name || 'Parchiwala Printer', address };
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Validates if a connected device MAC matches the registered printer MAC.
 */
export const isSameRegisteredPrinter = async (deviceAddress: string): Promise<boolean> => {
  const registered = await getRegisteredPrinter();
  if (!registered || !registered.address) {
    // If no printer was previously registered, any newly authorized printer is accepted
    return true;
  }
  const cleanIncoming = normalizeMac(deviceAddress);
  const cleanRegistered = normalizeMac(registered.address);
  return cleanIncoming.length > 0 && cleanIncoming === cleanRegistered;
};

/**
 * Records a successful printer connection, resetting the 48-hour inactivity timer.
 */
export const recordPrinterConnection = async (device: { name: string; address: string }): Promise<void> => {
  const now = Date.now().toString();
  const keys = APP_CONFIG.PRINTER_SECURITY_LOCK.STORAGE_KEYS;

  await AsyncStorage.setItem(keys.LAST_CONNECTED_TIMESTAMP, now);
  if (device.address) {
    await AsyncStorage.setItem(keys.REGISTERED_PRINTER_MAC, device.address);
  }
  if (device.name) {
    await AsyncStorage.setItem(keys.REGISTERED_PRINTER_NAME, device.name);
  }
  // Clear lock flag and master unlock timestamp since real printer is now active
  await AsyncStorage.removeItem(keys.IS_LOCKED_FLAG);
  await AsyncStorage.removeItem(keys.MASTER_UNLOCKED_TIMESTAMP);
};

/**
 * Unlocks the app using the administrative Master Password, granting a 24-hour grace window.
 */
export const unlockWithMasterPassword = async (
  enteredPassword: string
): Promise<{ success: boolean; message: string }> => {
  const trimmed = (enteredPassword || '').trim();
  const expected = APP_CONFIG.PRINTER_SECURITY_LOCK.MASTER_PASSWORD.trim();

  if (!trimmed) {
    return { success: false, message: 'Please enter the Master Password.' };
  }

  if (trimmed === expected) {
    const now = Date.now().toString();
    const keys = APP_CONFIG.PRINTER_SECURITY_LOCK.STORAGE_KEYS;

    await AsyncStorage.setItem(keys.MASTER_UNLOCKED_TIMESTAMP, now);
    await AsyncStorage.removeItem(keys.IS_LOCKED_FLAG);

    return {
      success: true,
      message: 'Master Password accepted. Temporary 24-hour operational grace period granted.',
    };
  }

  return {
    success: false,
    message: 'Incorrect Master Password. Please verify and try again or contact support.',
  };
};

/**
 * Evaluates the current lock status based on elapsed time, registered printer, and master grace window.
 */
export const evaluatePrinterLockStatus = async (): Promise<PrinterLockStatus> => {
  const enabled = await isPrinterLockFeatureEnabled();
  if (!enabled) {
    return {
      isLocked: false,
      timeRemainingMs: Infinity,
      timeRemainingHours: Infinity,
      lastConnectedDate: null,
      registeredDevice: null,
      unlockedViaMaster: false,
      featureEnabled: false,
    };
  }

  const config = APP_CONFIG.PRINTER_SECURITY_LOCK;
  const keys = config.STORAGE_KEYS;
  const now = Date.now();
  const thresholdMs = config.LOCK_THRESHOLD_HOURS * 3600 * 1000;
  const masterGraceMs = config.MASTER_UNLOCK_GRACE_HOURS * 3600 * 1000;

  // 1. Check if Master Password unlock is currently active within grace window
  const masterUnlockStr = await AsyncStorage.getItem(keys.MASTER_UNLOCKED_TIMESTAMP);
  if (masterUnlockStr) {
    const masterUnlockTime = parseInt(masterUnlockStr, 10);
    const timeSinceMasterUnlock = now - masterUnlockTime;
    if (timeSinceMasterUnlock < masterGraceMs) {
      const remainingMs = masterGraceMs - timeSinceMasterUnlock;
      const registered = await getRegisteredPrinter();
      return {
        isLocked: false,
        timeRemainingMs: remainingMs,
        timeRemainingHours: Math.max(0, Math.round(remainingMs / (3600 * 1000))),
        lastConnectedDate: null,
        registeredDevice: registered,
        unlockedViaMaster: true,
        featureEnabled: true,
      };
    }
  }

  // 2. Fetch last connection timestamp and registered printer
  const lastConnStr = await AsyncStorage.getItem(keys.LAST_CONNECTED_TIMESTAMP);
  const registered = await getRegisteredPrinter();

  if (!lastConnStr || !registered) {
    // Initial install: check first-install grace period
    let installTimeStr = await AsyncStorage.getItem(keys.APP_INSTALLED_AT);
    if (!installTimeStr) {
      installTimeStr = now.toString();
      await AsyncStorage.setItem(keys.APP_INSTALLED_AT, installTimeStr);
    }
    const installTime = parseInt(installTimeStr, 10);
    const timeSinceInstall = now - installTime;
    const installGraceMs = config.FIRST_INSTALL_GRACE_HOURS * 3600 * 1000;

    if (timeSinceInstall >= installGraceMs) {
      await AsyncStorage.setItem(keys.IS_LOCKED_FLAG, 'true');
      return {
        isLocked: true,
        timeRemainingMs: 0,
        timeRemainingHours: 0,
        lastConnectedDate: null,
        registeredDevice: null,
        unlockedViaMaster: false,
        featureEnabled: true,
      };
    }

    const remaining = installGraceMs - timeSinceInstall;
    return {
      isLocked: false,
      timeRemainingMs: remaining,
      timeRemainingHours: Math.max(1, Math.round(remaining / (3600 * 1000))),
      lastConnectedDate: null,
      registeredDevice: null,
      unlockedViaMaster: false,
      featureEnabled: true,
    };
  }

  const lastConnTime = parseInt(lastConnStr, 10);
  const elapsed = now - lastConnTime;

  if (elapsed >= thresholdMs) {
    await AsyncStorage.setItem(keys.IS_LOCKED_FLAG, 'true');
    return {
      isLocked: true,
      timeRemainingMs: 0,
      timeRemainingHours: 0,
      lastConnectedDate: new Date(lastConnTime),
      registeredDevice: registered,
      unlockedViaMaster: false,
      featureEnabled: true,
    };
  }

  const remaining = thresholdMs - elapsed;
  await AsyncStorage.removeItem(keys.IS_LOCKED_FLAG);
  return {
    isLocked: false,
    timeRemainingMs: remaining,
    timeRemainingHours: Math.max(1, Math.round(remaining / (3600 * 1000))),
    lastConnectedDate: new Date(lastConnTime),
    registeredDevice: registered,
    unlockedViaMaster: false,
    featureEnabled: true,
  };
};

/**
 * Formats milliseconds remaining into a readable string (e.g., "47 hrs 30 mins").
 */
export const formatTimeRemaining = (ms: number): string => {
  if (ms <= 0 || !isFinite(ms)) return '0 mins';
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours} hr${hours > 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''}`;
  }
  return `${minutes} min${minutes !== 1 ? 's' : ''}`;
};
