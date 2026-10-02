import {
  escapeCsv,
  filterInvoices,
  exportInvoicesToCsv,
  exportInvoicesToJson,
  exportProductsToCsv,
  exportProductsToJson,
  exportCustomersToCsv,
  exportCustomersToJson,
  executeDataExport,
} from '../src/services/exportService';
import { Invoice, InvoiceItem, Product, Customer, Organization } from '../src/db/types';

describe('exportService - Data Export (CSV & JSON)', () => {
  const dummyCustomer: Customer = {
    id: 'c1',
    name: 'Sharma, Rahul',
    phone: '9876543210',
    email: 'rahul@test.com',
    address: '123 Market "Street", Pune',
  };

  const dummyProduct1: Product = {
    id: 'p1',
    name: 'Basmati Rice',
    description: 'Premium rice',
    price: 150,
    taxRate: 5,
    unit: 'KG',
    stockQuantity: 50,
  };

  const dummyProduct2: Product = {
    id: 'p2',
    name: 'Milk (1L)',
    description: 'Daily milk',
    price: 60,
    taxRate: 0,
    unit: 'Ltr',
    stockQuantity: 20,
  };

  const gstInvoice: Invoice = {
    id: 'inv_gst',
    invoiceNumber: 'INV-2026-0001',
    customerId: 'c1',
    date: '2026-10-02T10:00:00.000Z',
    subtotal: 150,
    taxTotal: 7.5,
    cgstTotal: 3.75,
    sgstTotal: 3.75,
    discount: 0,
    grandTotal: 157.5,
    paymentStatus: 'Paid',
    paymentMethod: 'Cash',
  };

  const nonGstInvoice: Invoice = {
    id: 'inv_nongst',
    invoiceNumber: 'INV-2026-0002',
    customerId: 'c1',
    date: '2026-10-02T11:00:00.000Z',
    subtotal: 120,
    taxTotal: 0,
    cgstTotal: 0,
    sgstTotal: 0,
    discount: 0,
    grandTotal: 120,
    paymentStatus: 'Paid',
    paymentMethod: 'UPI',
  };

  const dummyItems: InvoiceItem[] = [
    {
      id: 'it1',
      invoiceId: 'inv_gst',
      productId: 'p1',
      name: 'Basmati Rice',
      price: 150,
      quantity: 1,
      taxRate: 5,
      total: 150,
      unit: 'KG',
    },
    {
      id: 'it2',
      invoiceId: 'inv_nongst',
      productId: 'p2',
      name: 'Milk (1L)',
      price: 60,
      quantity: 2,
      taxRate: 0,
      total: 120,
      unit: 'Ltr',
    },
  ];

  describe('escapeCsv', () => {
    it('escapes cells containing commas and quotes properly', () => {
      expect(escapeCsv('Sharma, Rahul')).toBe('"Sharma, Rahul"');
      expect(escapeCsv('Market "Street"')).toBe('"Market ""Street"""');
      expect(escapeCsv('NormalText')).toBe('NormalText');
      expect(escapeCsv(123)).toBe('123');
      expect(escapeCsv(null)).toBe('');
    });
  });

  describe('filterInvoices', () => {
    const list = [gstInvoice, nonGstInvoice];

    it('filters all invoices', () => {
      expect(filterInvoices(list, 'all').length).toBe(2);
    });

    it('filters GST invoices only', () => {
      const gst = filterInvoices(list, 'gst');
      expect(gst.length).toBe(1);
      expect(gst[0].id).toBe('inv_gst');
    });

    it('filters non-GST invoices only', () => {
      const nonGst = filterInvoices(list, 'nongst');
      expect(nonGst.length).toBe(1);
      expect(nonGst[0].id).toBe('inv_nongst');
    });
  });

  describe('Invoices Export', () => {
    it('exports invoices to CSV correctly', () => {
      const res = exportInvoicesToCsv([gstInvoice, nonGstInvoice], dummyItems, [dummyCustomer], 'all');
      expect(res.mimeType).toBe('text/csv');
      expect(res.recordCount).toBe(2);
      expect(res.content).toContain('Invoice Number,Date,Customer Name');
      expect(res.content).toContain('INV-2026-0001');
      expect(res.content).toContain('"Sharma, Rahul"');
    });

    it('exports GST-only invoices to CSV', () => {
      const res = exportInvoicesToCsv([gstInvoice, nonGstInvoice], dummyItems, [dummyCustomer], 'gst');
      expect(res.recordCount).toBe(1);
      expect(res.content).toContain('INV-2026-0001');
      expect(res.content).not.toContain('INV-2026-0002');
    });

    it('exports non-GST invoices to CSV', () => {
      const res = exportInvoicesToCsv([gstInvoice, nonGstInvoice], dummyItems, [dummyCustomer], 'nongst');
      expect(res.recordCount).toBe(1);
      expect(res.content).toContain('INV-2026-0002');
      expect(res.content).not.toContain('INV-2026-0001');
    });

    it('exports invoices to JSON correctly', () => {
      const res = exportInvoicesToJson([gstInvoice, nonGstInvoice], dummyItems, [dummyCustomer], 'gst');
      expect(res.mimeType).toBe('application/json');
      const parsed = JSON.parse(res.content);
      expect(parsed.exportType).toBe('invoices');
      expect(parsed.gstFilter).toBe('gst');
      expect(parsed.recordCount).toBe(1);
      expect(parsed.invoices[0].invoiceNumber).toBe('INV-2026-0001');
      expect(parsed.invoices[0].items.length).toBe(1);
    });
  });

  describe('Products Export', () => {
    it('exports products to CSV', () => {
      const res = exportProductsToCsv([dummyProduct1, dummyProduct2]);
      expect(res.mimeType).toBe('text/csv');
      expect(res.recordCount).toBe(2);
      expect(res.content).toContain('Product ID,Product Name,Price (Rs.),Unit');
      expect(res.content).toContain('Basmati Rice');
      expect(res.content).toContain('Milk (1L)');
    });

    it('exports products to JSON', () => {
      const res = exportProductsToJson([dummyProduct1, dummyProduct2]);
      expect(res.mimeType).toBe('application/json');
      const parsed = JSON.parse(res.content);
      expect(parsed.exportType).toBe('products');
      expect(parsed.recordCount).toBe(2);
      expect(parsed.products[0].name).toBe('Basmati Rice');
    });
  });

  describe('Customers Export', () => {
    it('exports customers to CSV', () => {
      const res = exportCustomersToCsv([dummyCustomer]);
      expect(res.mimeType).toBe('text/csv');
      expect(res.recordCount).toBe(1);
      expect(res.content).toContain('Customer ID,Customer Name,Phone Number');
      expect(res.content).toContain('"Sharma, Rahul"');
    });

    it('exports customers to JSON', () => {
      const res = exportCustomersToJson([dummyCustomer]);
      expect(res.mimeType).toBe('application/json');
      const parsed = JSON.parse(res.content);
      expect(parsed.exportType).toBe('customers');
      expect(parsed.recordCount).toBe(1);
      expect(parsed.customers[0].phone).toBe('9876543210');
    });
  });

  describe('executeDataExport dispatcher', () => {
    const data = {
      invoices: [gstInvoice, nonGstInvoice],
      invoiceItems: dummyItems,
      products: [dummyProduct1, dummyProduct2],
      customers: [dummyCustomer],
      organization: null,
    };

    it('dispatches invoices csv', () => {
      const res = executeDataExport({ target: 'invoices', gstFilter: 'all', format: 'csv' }, data);
      expect(res.mimeType).toBe('text/csv');
      expect(res.recordCount).toBe(2);
    });

    it('dispatches products json', () => {
      const res = executeDataExport({ target: 'products', format: 'json' }, data);
      expect(res.mimeType).toBe('application/json');
      expect(res.recordCount).toBe(2);
    });

    it('dispatches full database backup json', () => {
      const res = executeDataExport({ target: 'full', format: 'json' }, data);
      expect(res.mimeType).toBe('application/json');
      expect(res.filename).toContain('parchiwala_backup_');
    });
  });
});
