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
  calculateInvoiceSequences,
  computePackageHash,
  generateStoreTransferPackage,
  validateAndParseTransferPackage,
  saveRollbackSnapshot,
  getRollbackSnapshot,
  clearRollbackSnapshot,
  ROLLBACK_STORAGE_KEY,
} from '../src/services/storeTransferService';
import { Invoice, InvoiceItem, Product, Customer, Organization } from '../src/db/types';

describe('storeTransferService - Device Switch & Store Transfer', () => {
  const dummyOrg: Organization = {
    id: 'org1',
    name: 'Ambika Traders',
    phone: '9876543210',
    mobile: '9876543210',
    email: 'ambika@traders.com',
    address: 'Main Market, Pune',
    gstNumber: '27AAAAA0000A1Z5',
    showGstOnBill: true,
    currency: '₹',
    slogan: 'Best Quality Groceries',
    securityPin: '1234',
  };

  const dummyProducts: Product[] = [
    {
      id: 'p1',
      name: 'Toor Dal 1kg',
      description: 'Pulse',
      unit: 'KG',
      price: 160,
      taxRate: 5,
      stockQuantity: 40,
    },
    {
      id: 'p2',
      name: 'Sugar 1kg',
      description: 'Sweetener',
      unit: 'KG',
      price: 45,
      taxRate: 0,
      stockQuantity: 100,
    },
  ];

  const dummyCustomers: Customer[] = [
    {
      id: 'c1',
      name: 'Ramesh Patel',
      phone: '9988776655',
      email: 'ramesh@patel.com',
      address: 'Shop 4, Market Yard',
    },
  ];

  const dummyInvoices: Invoice[] = [
    {
      id: 'inv_1',
      invoiceNumber: 'INV-2026-0045',
      customerId: 'c1',
      date: '2026-10-20T10:00:00.000Z',
      subtotal: 160,
      taxTotal: 8,
      cgstTotal: 4,
      sgstTotal: 4,
      discount: 0,
      grandTotal: 168,
      paymentStatus: 'Paid',
      paymentMethod: 'Cash',
    },
    {
      id: 'inv_2',
      invoiceNumber: 'INV-2026-0046',
      customerId: 'c1',
      date: '2026-10-22T12:00:00.000Z',
      subtotal: 90,
      taxTotal: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      discount: 0,
      grandTotal: 90,
      paymentStatus: 'Unpaid',
      paymentMethod: 'Cash',
    },
  ];

  const dummyItems: InvoiceItem[] = [
    {
      id: 'item_1',
      invoiceId: 'inv_1',
      productId: 'p1',
      name: 'Toor Dal 1kg',
      price: 160,
      quantity: 1,
      taxRate: 5,
      total: 168,
      unit: 'KG',
    },
  ];

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  describe('calculateInvoiceSequences', () => {
    it('returns default INV-YEAR-0001 for empty invoice list', () => {
      const year = new Date().getFullYear();
      const res = calculateInvoiceSequences([]);
      expect(res.lastInvoiceNumber).toBe('None (Fresh Store)');
      expect(res.nextSuggestedInvoiceNumber).toBe(`INV-${year}-0001`);
    });

    it('calculates the next sequential number based on max invoice sequence', () => {
      const year = new Date().getFullYear();
      const res = calculateInvoiceSequences(dummyInvoices);
      expect(res.lastInvoiceNumber).toBe('INV-2026-0046');
      expect(res.nextSuggestedInvoiceNumber).toBe(`INV-${year}-0047`);
    });
  });

  describe('computePackageHash', () => {
    it('produces a reproducible deterministic string hash', () => {
      const hash1 = computePackageHash('Test Store', 10, 5, 20, '2026-10-25T12:00:00.000Z');
      const hash2 = computePackageHash('Test Store', 10, 5, 20, '2026-10-25T12:00:00.000Z');
      expect(hash1).toBe(hash2);
      expect(hash1.startsWith('PKG-')).toBe(true);
    });
  });

  describe('generateStoreTransferPackage', () => {
    it('generates a valid transfer package with summary and formatted filename', () => {
      const pkg = generateStoreTransferPackage({
        organization: dummyOrg,
        products: dummyProducts,
        customers: dummyCustomers,
        invoices: dummyInvoices,
        invoiceItems: dummyItems,
      });

      expect(pkg.filename).toContain('StoreTransfer_Ambika_Traders_');
      expect(pkg.mimeType).toBe('application/json');
      expect(pkg.summary.storeName).toBe('Ambika Traders');
      expect(pkg.summary.totalProducts).toBe(2);
      expect(pkg.summary.totalCustomers).toBe(1);
      expect(pkg.summary.totalInvoices).toBe(2);
      expect(pkg.summary.hasPinProtection).toBe(true);

      const parsed = JSON.parse(pkg.content);
      expect(parsed.exportType).toBe('store_transfer_package');
      expect(parsed.data.products.length).toBe(2);
      expect(parsed.data.invoices.length).toBe(2);
      expect(parsed.verificationHash).toBeDefined();
    });
  });

  describe('validateAndParseTransferPackage', () => {
    it('returns error for empty or invalid JSON strings', () => {
      expect(validateAndParseTransferPackage('').isValid).toBe(false);
      expect(validateAndParseTransferPackage('{invalid}').isValid).toBe(false);
    });

    it('successfully parses dedicated store_transfer_package format', () => {
      const pkg = generateStoreTransferPackage({
        organization: dummyOrg,
        products: dummyProducts,
        customers: dummyCustomers,
        invoices: dummyInvoices,
        invoiceItems: dummyItems,
      });

      const res = validateAndParseTransferPackage(pkg.content);
      expect(res.isValid).toBe(true);
      expect(res.summary?.storeName).toBe('Ambika Traders');
      expect(res.summary?.totalProducts).toBe(2);
      expect(res.summary?.nextSuggestedInvoiceNumber).toContain('0047');
      expect(res.packageData?.products.length).toBe(2);
    });

    it('successfully parses legacy/standard database backup format for backward compatibility', () => {
      const legacyBackup = {
        version: '1.0',
        exportType: 'full_database_backup',
        exportedAt: '2026-10-25T10:00:00.000Z',
        organization: dummyOrg,
        products: dummyProducts,
        customers: dummyCustomers,
        invoices: dummyInvoices,
        invoiceItems: dummyItems,
      };

      const res = validateAndParseTransferPackage(JSON.stringify(legacyBackup));
      expect(res.isValid).toBe(true);
      expect(res.summary?.storeName).toBe('Ambika Traders');
      expect(res.summary?.totalInvoices).toBe(2);
      expect(res.packageData?.invoices.length).toBe(2);
    });

    it('successfully parses envelope wrapped transfer package format', () => {
      const pkg = generateStoreTransferPackage({
        organization: dummyOrg,
        products: dummyProducts,
        customers: dummyCustomers,
        invoices: dummyInvoices,
        invoiceItems: dummyItems,
      });

      // Simulates when the envelope object itself was serialized to JSON
      const envelopeStr = JSON.stringify(pkg);
      const res = validateAndParseTransferPackage(envelopeStr);
      expect(res.isValid).toBe(true);
      expect(res.summary?.storeName).toBe('Ambika Traders');
      expect(res.packageData?.products.length).toBe(2);
      expect(res.data?.products.length).toBe(2);
    });

    it('successfully handles UTF-8 BOM characters and whitespace', () => {
      const pkg = generateStoreTransferPackage({
        organization: dummyOrg,
        products: dummyProducts,
        customers: dummyCustomers,
        invoices: dummyInvoices,
        invoiceItems: dummyItems,
      });

      const bomStr = `\uFEFF   ${pkg.content}   \n`;
      const res = validateAndParseTransferPackage(bomStr);
      expect(res.isValid).toBe(true);
      expect(res.summary?.storeName).toBe('Ambika Traders');
      expect(res.packageData?.invoices.length).toBe(2);
      expect(res.data?.invoices.length).toBe(2);
    });

    it('rejects unsupported JSON objects', () => {
      const randomJson = JSON.stringify({ hello: 'world', foo: 123 });
      const res = validateAndParseTransferPackage(randomJson);
      expect(res.isValid).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('Rollback Snapshot Management', () => {
    it('saves, retrieves, and clears rollback snapshots', async () => {
      const initial = await getRollbackSnapshot();
      expect(initial.exists).toBe(false);

      await saveRollbackSnapshot({
        organization: dummyOrg,
        products: dummyProducts,
        customers: dummyCustomers,
        invoices: dummyInvoices,
        invoiceItems: dummyItems,
      });

      const check = await getRollbackSnapshot();
      expect(check.exists).toBe(true);
      expect(check.summary.storeName).toBe('Ambika Traders');
      expect(check.summary.totalProducts).toBe(2);

      await clearRollbackSnapshot();
      const afterClear = await getRollbackSnapshot();
      expect(afterClear.exists).toBe(false);
    });
  });
});
