import { Invoice, Customer, Product, Organization } from '../src/db/types';
import { parseInvoiceDate, isToday, sortInvoicesLatestFirst } from '../src/utils/dateUtils';

describe('Invoice Builder & History Optimization Logic', () => {
  describe('Dual-Mode Discount Calculations (% vs Flat ₹)', () => {
    const subtotal = 500;
    const totalTax = 50;

    it('calculates percentage discount accurately', () => {
      const discountPercentage = 10; // 10%
      const discountVal = subtotal * (Math.min(100, Math.max(0, discountPercentage)) / 100);
      expect(discountVal).toBe(50);

      const netTotal = subtotal + totalTax - discountVal;
      expect(netTotal).toBe(500);
    });

    it('caps percentage discount at 100%', () => {
      const discountPercentage = 150; // entered over 100
      const discountVal = subtotal * (Math.min(100, Math.max(0, discountPercentage)) / 100);
      expect(discountVal).toBe(500);
    });

    it('calculates flat amount discount accurately', () => {
      const flatDiscount = 75; // ₹75 flat
      const discountVal = Math.min(subtotal + totalTax, Math.max(0, flatDiscount));
      expect(discountVal).toBe(75);

      const netTotal = subtotal + totalTax - discountVal;
      expect(netTotal).toBe(475);
    });

    it('caps flat discount to subtotal + tax to prevent negative bills', () => {
      const flatDiscount = 800; // entered more than bill total
      const discountVal = Math.min(subtotal + totalTax, Math.max(0, flatDiscount));
      expect(discountVal).toBe(550);

      const netTotal = subtotal + totalTax - discountVal;
      expect(netTotal).toBe(0);
    });
  });

  describe('Auto Cash Round-Off Calculations', () => {
    it('rounds up fraction >= 0.50 to nearest whole rupee', () => {
      const netTotal = 143.60;
      const rounded = Math.round(netTotal);
      const diff = rounded - netTotal;

      expect(rounded).toBe(144);
      expect(Number(diff.toFixed(2))).toBe(0.40);
    });

    it('rounds down fraction < 0.50 to nearest whole rupee', () => {
      const netTotal = 249.25;
      const rounded = Math.round(netTotal);
      const diff = rounded - netTotal;

      expect(rounded).toBe(249);
      expect(Number(diff.toFixed(2))).toBe(-0.25);
    });

    it('keeps exact amounts unchanged with zero round-off difference', () => {
      const netTotal = 350.00;
      const rounded = Math.round(netTotal);
      const diff = rounded - netTotal;

      expect(rounded).toBe(350);
      expect(diff).toBe(0);
    });
  });

  describe('Invoice History Filtering & Sorting', () => {
    const mockInvoices: any[] = [
      {
        id: 'inv_1',
        invoiceNumber: 'INV-2026-0001',
        customerName: 'Ramesh Sharma',
        customerId: 'cust_1',
        date: new Date().toISOString(),
        grandTotal: 350,
        paymentStatus: 'Paid',
        paymentMethod: 'UPI',
        taxTotal: 35,
      },
      {
        id: 'inv_2',
        invoiceNumber: 'INV-2026-0002',
        customerName: 'Priya Patel',
        customerId: 'cust_2',
        date: new Date(Date.now() - 3600000 * 24 * 3).toISOString(), // 3 days ago
        grandTotal: 120,
        paymentStatus: 'Unpaid',
        paymentMethod: 'Cash',
        taxTotal: 0,
      },
      {
        id: 'inv_3',
        invoiceNumber: 'INV-2026-0003',
        customerName: 'Suresh Kumar',
        customerId: 'cust_3',
        date: new Date(Date.now() - 3600000 * 24 * 15).toISOString(), // 15 days ago
        grandTotal: 840,
        paymentStatus: 'Paid',
        paymentMethod: 'Card',
        taxTotal: 90,
      },
    ];

    it('sorts invoices latest first', () => {
      const sorted = sortInvoicesLatestFirst(mockInvoices);
      expect(sorted[0].invoiceNumber).toBe('INV-2026-0001');
      expect(sorted[sorted.length - 1].invoiceNumber).toBe('INV-2026-0003');
    });

    it('filters invoices by search query (invoice number or customer name)', () => {
      const q = 'priya';
      const results = mockInvoices.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customerName.toLowerCase().includes(q)
      );
      expect(results.length).toBe(1);
      expect(results[0].invoiceNumber).toBe('INV-2026-0002');
    });

    it('filters invoices by payment status', () => {
      const unpaid = mockInvoices.filter((inv) => inv.paymentStatus === 'Unpaid');
      expect(unpaid.length).toBe(1);
      expect(unpaid[0].id).toBe('inv_2');

      const paid = mockInvoices.filter((inv) => inv.paymentStatus === 'Paid');
      expect(paid.length).toBe(2);
    });

    it('filters invoices by GST bill type', () => {
      const gstOnly = mockInvoices.filter((inv) => (inv.taxTotal || 0) > 0);
      expect(gstOnly.length).toBe(2);

      const nonGstOnly = mockInvoices.filter((inv) => (inv.taxTotal || 0) === 0);
      expect(nonGstOnly.length).toBe(1);
      expect(nonGstOnly[0].id).toBe('inv_2');
    });
  });

  describe('Inline Customer Quick-Add Format Validation', () => {
    it('detects 10-digit mobile number input and formats customer record correctly', () => {
      const query = '9876543210';
      const isAllDigits = /^\d{10}$/.test(query);

      expect(isAllDigits).toBe(true);

      const customer: Customer = {
        id: 'cust_new',
        name: isAllDigits ? `Customer ${query.slice(-4)}` : query,
        phone: isAllDigits ? query : '',
        email: '',
        address: '',
      };

      expect(customer.name).toBe('Customer 3210');
      expect(customer.phone).toBe('9876543210');
    });

    it('handles customer name input correctly', () => {
      const query = 'Amit Verma';
      const isAllDigits = /^\d{10}$/.test(query);

      expect(isAllDigits).toBe(false);

      const customer: Customer = {
        id: 'cust_new',
        name: isAllDigits ? `Customer ${query.slice(-4)}` : query,
        phone: isAllDigits ? query : '',
        email: '',
        address: '',
      };

      expect(customer.name).toBe('Amit Verma');
      expect(customer.phone).toBe('');
    });
  });
});
