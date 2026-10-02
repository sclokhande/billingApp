jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'android' },
  NativeModules: {},
}));

jest.mock('react-native-html-to-pdf', () => ({
  generatePDF: jest.fn().mockImplementation((options) => Promise.resolve({ filePath: '/mock/path/' + options.fileName + '.pdf' })),
}));

jest.mock('react-native-share', () => ({
  default: {
    open: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/db/operations', () => ({
  getInvoiceItems: jest.fn().mockResolvedValue([
    {
      id: 'it1',
      invoiceId: 'inv_1',
      productId: 'p1',
      name: 'Paneer',
      price: 200,
      quantity: 1,
      taxRate: 5,
      total: 200,
      unit: 'KG',
    },
  ]),
}));

import { generateInvoicesPdfReport } from '../src/services/pdfReportService';
import { Organization } from '../src/db/types';
import { InvoiceWithCustomerName } from '../src/db/operations';

describe('pdfReportService - GST and Non-GST Sales Reports', () => {
  const dummyOrg: Organization = {
    id: 'org1',
    name: 'Super Kirana',
    address: 'Main Bazaar, Pune',
    phone: '9876543210',
    mobile: '9876543210',
    email: 'info@superkirana.com',
    gstNumber: '27AAAAA0000A1Z5',
    showGstOnBill: true,
    currency: '₹',
    slogan: 'Best Quality',
  };

  const gstInvoice: InvoiceWithCustomerName = {
    id: 'inv_gst',
    invoiceNumber: 'INV-2026-0001',
    customerId: 'c1',
    customerName: 'Rahul Sharma',
    date: '2026-10-02T10:00:00.000Z',
    subtotal: 200,
    taxTotal: 10,
    cgstTotal: 5,
    sgstTotal: 5,
    discount: 0,
    grandTotal: 210,
    paymentStatus: 'Paid',
    paymentMethod: 'UPI',
  };

  const nonGstInvoice: InvoiceWithCustomerName = {
    id: 'inv_nongst',
    invoiceNumber: 'INV-2026-0002',
    customerId: 'c2',
    customerName: 'Suresh Patil',
    date: '2026-10-02T11:00:00.000Z',
    subtotal: 100,
    taxTotal: 0,
    cgstTotal: 0,
    sgstTotal: 0,
    discount: 0,
    grandTotal: 100,
    paymentStatus: 'Paid',
    paymentMethod: 'Cash',
  };

  it('generates summary sales report with GST boxes and GST Tax column when GST invoices are present', async () => {
    const { generatePDF } = require('react-native-html-to-pdf');
    const path = await generateInvoicesPdfReport(dummyOrg, [gstInvoice], 'Sales Report (GST Bills • ALL DATES • ALL STATUS)', 'summary');

    expect(path).toContain('.pdf');
    const lastCall = generatePDF.mock.calls[generatePDF.mock.calls.length - 1][0];
    const html = lastCall.html;

    expect(html).toContain('Total GST');
    expect(html).toContain('GST Tax');
    expect(html).toContain('Sales Report (GST Bills');
    expect(html).toContain('210.00');
  });

  it('generates summary sales report without GST tax column when only Non-GST invoices are filtered', async () => {
    const { generatePDF } = require('react-native-html-to-pdf');
    const path = await generateInvoicesPdfReport(dummyOrg, [nonGstInvoice], 'Sales Report (Non-GST Bills • ALL DATES • ALL STATUS)', 'summary');

    expect(path).toContain('.pdf');
    const lastCall = generatePDF.mock.calls[generatePDF.mock.calls.length - 1][0];
    const html = lastCall.html;

    expect(html).not.toContain('<th class="right">GST Tax</th>');
    expect(html).toContain('Sales Report (Non-GST Bills');
    expect(html).toContain('100.00');
  });

  it('generates detailed sales report with itemized product breakdown', async () => {
    const { generatePDF } = require('react-native-html-to-pdf');
    const path = await generateInvoicesPdfReport(dummyOrg, [gstInvoice], 'Sales Report (GST Bills)', 'detailed');

    expect(path).toContain('.pdf');
    const lastCall = generatePDF.mock.calls[generatePDF.mock.calls.length - 1][0];
    const html = lastCall.html;

    expect(html).toContain('Paneer');
    expect(html).toContain('Detailed Products Breakdown');
  });
});
