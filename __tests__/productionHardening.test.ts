import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isAutoBackupEnabled,
  setAutoBackupEnabled,
  createEncryptedLocalBackup,
  checkAndRunDailyAutoBackup,
  restoreFromLocalBackupFile,
  AUTO_BACKUP_STORAGE_KEYS,
} from '../src/services/autoBackupService';
import {
  queryPrinterTelemetry,
  isBatteryOptimizationIgnored,
  requestDisableBatteryOptimization,
  printReceiptRaw,
  setConnectedPrinterState,
} from '../src/services/bluetoothPrinterService';
import { Organization, Product, Customer, Invoice, InvoiceItem } from '../src/db/types';

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

// Mock react-native
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    Version: 33,
  },
  NativeModules: {
    BluetoothScanner: {
      isIgnoringBatteryOptimizations: jest.fn(async () => true),
      requestIgnoreBatteryOptimizations: jest.fn(async () => true),
      checkPrinterTelemetry: jest.fn(async (address: string) => ({
        online: true,
        hasPaper: true,
        paperNearEnd: false,
        status: 'OK',
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

describe('Production Hardening Recommendations Implementation', () => {
  const sampleOrg: Organization = {
    id: 'org_1',
    name: 'Kirana Supermart',
    address: 'Main Market, Pune',
    phone: '9876543210',
    mobile: '9876543210',
    email: 'store@kirana.com',
    gstNumber: '27ABCDE1234F1Z5',
    showGstOnBill: true,
    currency: '₹',
    slogan: 'Visit Again',
  };

  const sampleProducts: Product[] = [
    { id: 'p1', name: 'Wheat Flour', description: 'Atta', price: 45, taxRate: 0, unit: 'kg', stockQuantity: 100 },
    { id: 'p2', name: 'Mustard Oil', description: 'Oil', price: 160, taxRate: 5, unit: 'ltr', stockQuantity: 50 },
  ];

  const sampleCustomers: Customer[] = [
    { id: 'c1', name: 'Ramesh Kumar', phone: '9811122233', email: 'ramesh@example.com', address: 'Pune' },
  ];

  const sampleInvoices: Invoice[] = [
    {
      id: 'inv_1',
      invoiceNumber: 'INV-2026-0001',
      customerId: 'c1',
      date: new Date().toISOString(),
      subtotal: 205,
      taxTotal: 8,
      cgstTotal: 4,
      sgstTotal: 4,
      discount: 0,
      grandTotal: 213,
      paymentStatus: 'Paid',
      paymentMethod: 'Cash',
    },
  ];

  const sampleItems: InvoiceItem[] = [
    { id: 'it_1', invoiceId: 'inv_1', productId: 'p1', name: 'Wheat Flour', price: 45, quantity: 1, taxRate: 0, total: 45, unit: 'kg' },
  ];

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe('1. Persistent Database File Backup Outside App-Private Sandbox', () => {
    test('enables and disables automated daily backup preference correctly', async () => {
      // Default should be true
      expect(await isAutoBackupEnabled()).toBe(true);

      await setAutoBackupEnabled(false);
      expect(await isAutoBackupEnabled()).toBe(false);

      await setAutoBackupEnabled(true);
      expect(await isAutoBackupEnabled()).toBe(true);
    });

    test('generates encrypted/verified local backup snapshot with valid summary', async () => {
      const backup = await createEncryptedLocalBackup(
        {
          organization: sampleOrg,
          products: sampleProducts,
          customers: sampleCustomers,
          invoices: sampleInvoices,
          invoiceItems: sampleItems,
        },
        true // manual
      );

      expect(backup.success).toBe(true);
      expect(backup.filename).toContain('ManualBackup');
      expect(backup.filename).toContain('kirana_superm');
      expect(backup.filename).toContain('.parchiwala');
      expect(backup.recordCount).toBe(1);
      expect(backup.summary?.storeName).toBe('Kirana Supermart');
      expect(backup.summary?.totalProducts).toBe(2);
      expect(backup.summary?.totalCustomers).toBe(1);
    });

    test('daily auto-backup triggers once per day and ignores duplicate calls on same day', async () => {
      const run1 = await checkAndRunDailyAutoBackup({
        organization: sampleOrg,
        products: sampleProducts,
        customers: sampleCustomers,
        invoices: sampleInvoices,
        invoiceItems: sampleItems,
      });
      expect(run1).toBe(true);

      // Same day second attempt should be skipped
      const run2 = await checkAndRunDailyAutoBackup({
        organization: sampleOrg,
        products: sampleProducts,
        customers: sampleCustomers,
        invoices: sampleInvoices,
        invoiceItems: sampleItems,
      });
      expect(run2).toBe(false);
    });
  });

  describe('2. Android Battery Optimization (Doze Mode) & Background Scan Limits', () => {
    test('queries battery optimization status via native bridge', async () => {
      const isIgnored = await isBatteryOptimizationIgnored();
      expect(isIgnored).toBe(true);
    });

    test('requests battery optimization disable without errors', async () => {
      const result = await requestDisableBatteryOptimization();
      expect(result).toBe(true);
    });
  });

  describe('3. Thermal Paper-Out & Buffer Underflow Telemetry', () => {
    const authMac = '00:1B:10:73:D2:28';

    test('queries real-time telemetry from printer socket and detects paper loaded', async () => {
      const telemetry = await queryPrinterTelemetry({
        name: 'Parchiwala Printer',
        address: authMac,
      });

      expect(telemetry.online).toBe(true);
      expect(telemetry.hasPaper).toBe(true);
      expect(telemetry.status).toBe('OK');
    });

    test('detects paper out condition when hardware reports paper end sensor', async () => {
      const { NativeModules } = require('react-native');
      NativeModules.BluetoothScanner.checkPrinterTelemetry.mockResolvedValueOnce({
        online: true,
        hasPaper: false,
        paperNearEnd: false,
        status: 'PAPER_OUT',
      });

      const telemetry = await queryPrinterTelemetry({
        name: 'Parchiwala Printer',
        address: authMac,
      });

      expect(telemetry.online).toBe(true);
      expect(telemetry.hasPaper).toBe(false);
      expect(telemetry.status).toBe('PAPER_OUT');
    });

    test('aborts printReceiptRaw with clear PRINTER_PAPER_OUT error when paper end sensor triggers', async () => {
      const { NativeModules } = require('react-native');
      const { connectBluetoothPrinter } = require('../src/services/bluetoothPrinterService');

      await connectBluetoothPrinter({
        name: 'Parchiwala Thermal Printer',
        address: authMac,
      });

      NativeModules.BluetoothScanner.checkPrinterTelemetry.mockResolvedValueOnce({
        online: true,
        hasPaper: false,
        paperNearEnd: false,
        status: 'PAPER_OUT',
      });

      await expect(printReceiptRaw('RECEIPT TEXT')).rejects.toThrow('PRINTER_PAPER_OUT');
    });

    test('extracts battery level and charging status from native printer telemetry', async () => {
      const { NativeModules } = require('react-native');
      NativeModules.BluetoothScanner.checkPrinterTelemetry.mockResolvedValueOnce({
        online: true,
        hasPaper: true,
        paperNearEnd: false,
        status: 'OK',
        batteryLevel: 18,
        isCharging: false,
      });

      const telemetry = await queryPrinterTelemetry({
        name: 'Parchiwala Printer',
        address: authMac,
      });

      expect(telemetry.online).toBe(true);
      expect(telemetry.batteryLevel).toBe(18);
      expect(telemetry.isCharging).toBe(false);
    });

    test('detects active charging state when printer is connected to power adapter', async () => {
      const { NativeModules } = require('react-native');
      NativeModules.BluetoothScanner.checkPrinterTelemetry.mockResolvedValueOnce({
        online: true,
        hasPaper: true,
        paperNearEnd: false,
        status: 'OK',
        batteryLevel: 95,
        isCharging: true,
      });

      const telemetry = await queryPrinterTelemetry({
        name: 'Parchiwala Printer',
        address: authMac,
      });

      expect(telemetry.online).toBe(true);
      expect(telemetry.batteryLevel).toBe(95);
      expect(telemetry.isCharging).toBe(true);
    });
  });
});
