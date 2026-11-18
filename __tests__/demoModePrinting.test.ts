jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    Version: 33,
  },
  NativeModules: {
    BluetoothScanner: {
      isIgnoringBatteryOptimizations: jest.fn(async () => true),
      requestIgnoreBatteryOptimizations: jest.fn(async () => true),
      checkPrinterTelemetry: jest.fn(async () => ({
        online: true,
        hasPaper: true,
        paperNearEnd: false,
        status: 'OK',
        batteryLevel: 90,
        isCharging: false,
      })),
      isBluetoothEnabled: jest.fn(async () => true),
      startScan: jest.fn(async () => true),
      stopScan: jest.fn(async () => true),
    },
    RNBLEPrinter: {
      printRawData: jest.fn((bytes, cb) => cb && cb(null)),
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  })),
  PermissionsAndroid: {
    PERMISSIONS: {},
    RESULTS: { GRANTED: 'granted' },
    requestMultiple: jest.fn(async () => ({})),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] || null),
    setItem: jest.fn(async (key: string, val: string) => {
      store[key] = String(val);
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

import { APP_CONFIG } from '../src/config/app_config';
import {
  connectBluetoothPrinter,
  printReceiptRaw,
  printReceiptAsImageRaw,
} from '../src/services/bluetoothPrinterService';

describe('Demo Mode Printing & Preview Accessibility', () => {
  const mockDevice = {
    name: 'Parchiwala 58mm Thermal Printer',
    address: '00:1B:10:73:D2:28',
    connected: true,
  };

  beforeEach(async () => {
    APP_CONFIG.IS_DEMO_MODE = true;
    await connectBluetoothPrinter(mockDevice);
  });

  it('confirms IS_DEMO_MODE is true in configuration', () => {
    expect(APP_CONFIG.IS_DEMO_MODE).toBe(true);
  });

  it('allows thermal receipt printing when IS_DEMO_MODE is true', async () => {
    const testReceipt = '--- DEMO MODE TEST RECEIPT ---';
    const result = await printReceiptRaw(testReceipt);

    expect(result).toBe(true);
  });

  it('allows print as image when IS_DEMO_MODE is true', async () => {
    const testReceipt = '--- DEMO MODE IMAGE PRINT ---';
    const result = await printReceiptAsImageRaw(testReceipt);

    expect(result).toBe(true);
  });
});
