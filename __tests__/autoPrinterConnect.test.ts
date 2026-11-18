const listeners: Record<string, ((...args: any[]) => void)[]> = {};

const mockScannerEventEmitter = {
  addListener: jest.fn((event: string, callback: (...args: any[]) => void) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
    return {
      remove: jest.fn(() => {
        listeners[event] = (listeners[event] || []).filter((cb) => cb !== callback);
      }),
    };
  }),
  emit: (event: string, ...args: any[]) => {
    (listeners[event] || []).forEach((cb) => cb(...args));
  },
};

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    BluetoothScanner: {
      startScan: jest.fn().mockImplementation(() => {
        setTimeout(() => {
          mockScannerEventEmitter.emit('onDeviceFound', {
            name: 'Parchiwala 58mm Thermal Printer',
            address: '00:1B:10:73:05:19',
          });
        }, 10);
        return Promise.resolve(true);
      }),
      stopScan: jest.fn().mockResolvedValue(true),
      isBluetoothEnabled: jest.fn().mockResolvedValue(true),
      enableBluetooth: jest.fn().mockResolvedValue(true),
      isDeviceBonded: jest.fn().mockImplementation(async (addr: string) => {
        const allowedList = require('../src/config/authorized_printers.json').allowedAddresses || [];
        return addr === allowedList[1];
      }),
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => mockScannerEventEmitter),
  PermissionsAndroid: {
    PERMISSIONS: {
      BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
      BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    },
    RESULTS: {
      GRANTED: 'granted',
    },
    requestMultiple: jest.fn().mockResolvedValue({
      'android.permission.BLUETOOTH_SCAN': 'granted',
      'android.permission.BLUETOOTH_CONNECT': 'granted',
    }),
  },
}));

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
  isParchiwalaPrinterAddress,
  findNearbyAuthorizedPrinter,
  autoDetectAndConnectAuthorizedPrinter,
  LAST_ACTIVE_PRINTER_KEY,
} from '../src/services/bluetoothPrinterService';
import authorizedPrintersConfig from '../src/config/authorized_printers.json';

import { APP_CONFIG } from '../src/config/app_config';

describe('Smart 3-Stage Auto-Connect Bluetooth Printer', () => {
  const allowed = authorizedPrintersConfig.allowedAddresses || [];
  const primaryAddr = allowed[0] || '00:1B:10:73:05:19';
  const secondaryAddr = allowed[1] || '00:1B:10:73:05:18';

  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(APP_CONFIG.ACTIVATION_STORAGE_KEY, 'true');
  });

  describe('isParchiwalaPrinterAddress', () => {
    it('approves all MAC addresses in authorized_printers.json (case-insensitive and format-agnostic)', () => {
      expect(isParchiwalaPrinterAddress(primaryAddr).isAllowed).toBe(true);
      expect(isParchiwalaPrinterAddress(primaryAddr.toLowerCase()).isAllowed).toBe(true);
      expect(isParchiwalaPrinterAddress(primaryAddr.replace(/:/g, '')).isAllowed).toBe(true);
      if (secondaryAddr) {
        expect(isParchiwalaPrinterAddress(secondaryAddr).isAllowed).toBe(true);
      }
    });

    it('rejects unauthorized printer addresses with custom support message', () => {
      const res = isParchiwalaPrinterAddress('AA:BB:CC:DD:EE:FF');
      expect(res.isAllowed).toBe(false);
      expect(res.message).toContain('parchiwala brand');
    });
  });

  describe('findNearbyAuthorizedPrinter (Stage 1 & 2)', () => {
    it('detects and returns an authorized printer candidate matching allowedAddresses', async () => {
      const candidate = await findNearbyAuthorizedPrinter();
      expect(candidate).not.toBeNull();
      if (candidate) {
        expect(isParchiwalaPrinterAddress(candidate.address).isAllowed).toBe(true);
      }
    });

    it('prefers cached last active printer address when present in storage', async () => {
      if (secondaryAddr) {
        await AsyncStorage.setItem(LAST_ACTIVE_PRINTER_KEY, secondaryAddr);
        const candidate = await findNearbyAuthorizedPrinter();
        expect(candidate?.address).toBe(secondaryAddr);
      }
    });
  });

  describe('autoDetectAndConnectAuthorizedPrinter (Stage 3)', () => {
    it('successfully connects and caches the active address in AsyncStorage', async () => {
      const statusUpdates: string[] = [];
      const result = await autoDetectAndConnectAuthorizedPrinter((msg) => statusUpdates.push(msg));

      expect(result.success).toBe(true);
      expect(result.device).toBeDefined();
      expect(isParchiwalaPrinterAddress(result.device!.address).isAllowed).toBe(true);

      const cachedAddr = await AsyncStorage.getItem(LAST_ACTIVE_PRINTER_KEY);
      expect(cachedAddr).toBe(result.device!.address);
      expect(statusUpdates.length).toBeGreaterThan(0);
    });

    it('strictly does NOT scan or connect when app is on the First-Time Activation page', async () => {
      await AsyncStorage.setItem(APP_CONFIG.ACTIVATION_STORAGE_KEY, 'false');
      const result = await autoDetectAndConnectAuthorizedPrinter();

      expect(result.success).toBe(false);
      expect(result.error).toContain('App activation required');
    });
  });
});
