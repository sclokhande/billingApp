import { formatThermalReceipt } from '../src/services/printService';
import { Organization, Customer, Invoice, InvoiceItem } from '../src/db/types';

describe('formatThermalReceipt - Footer Note & Preferences', () => {
  const baseOrg: Organization = {
    id: 'test_org',
    name: 'Test Kirana',
    address: 'Pune Market',
    phone: '9876543210',
    mobile: '9876543210',
    email: 'test@kirana.com',
    gstNumber: '',
    showGstOnBill: false,
    currency: 'Rs.',
    slogan: 'Thank You Visit again',
    printWidth: '58mm',
    showFooterTextOnBill: true,
    footerText: 'Print by Parchiwala',
  };

  const baseInvoice: Invoice = {
    id: 'inv_1',
    invoiceNumber: 'INV-1001',
    customerId: 'cust_1',
    date: new Date().toISOString(),
    subtotal: 100,
    taxTotal: 0,
    cgstTotal: 0,
    sgstTotal: 0,
    discount: 0,
    grandTotal: 100,
    paymentStatus: 'Paid',
    paymentMethod: 'Cash',
  };

  const baseCustomer: Customer = {
    id: 'cust_1',
    name: 'Ramesh Kumar',
    phone: '9898989898',
    email: '',
    address: '',
  };

  const items: InvoiceItem[] = [
    {
      id: 'item_1',
      invoiceId: 'inv_1',
      productId: 'prod_1',
      name: 'Sugar',
      price: 50,
      quantity: 2,
      taxRate: 0,
      total: 100,
      unit: 'KG',
    },
  ];

  it('prints default footer "Print by Parchiwala" when enabled', () => {
    const receipt = formatThermalReceipt(baseOrg, baseCustomer, baseInvoice, items);
    expect(receipt).toContain('Print by Parchiwala');
  });

  it('prints custom footer text when edited by user in organization preferences', () => {
    const customOrg: Organization = {
      ...baseOrg,
      footerText: 'Powered by MyCustomBrand POS',
    };
    const receipt = formatThermalReceipt(customOrg, baseCustomer, baseInvoice, items);
    expect(receipt).toContain('Powered by MyCustomBrand POS');
    expect(receipt).not.toContain('Print by Parchiwala');
  });

  it('omits footer note completely when showFooterTextOnBill toggle is false', () => {
    const noFooterOrg: Organization = {
      ...baseOrg,
      showFooterTextOnBill: false,
      footerText: 'Print by Parchiwala',
    };
    const receipt = formatThermalReceipt(noFooterOrg, baseCustomer, baseInvoice, items);
    expect(receipt).not.toContain('Print by Parchiwala');
    expect(receipt).toContain('Thank You Visit again');
  });

  it('handles empty footerText fallback cleanly', () => {
    const emptyFooterOrg: Organization = {
      ...baseOrg,
      showFooterTextOnBill: true,
      footerText: '   ',
    };
    const receipt = formatThermalReceipt(emptyFooterOrg, baseCustomer, baseInvoice, items);
    expect(receipt).toContain('Print by Parchiwala');
  });

  it('displays row total as 230 (Rate * Qty) when GST is deselected even if product has 5% taxRate', () => {
    const nonGstOrg: Organization = {
      ...baseOrg,
      showGstOnBill: false,
      gstNumber: '',
    };
    const itemWithTax: InvoiceItem = {
      id: 'item_230',
      invoiceId: 'inv_230',
      productId: 'prod_230',
      name: 'Basmati Rice',
      price: 230,
      quantity: 1,
      taxRate: 5,
      total: 230,
      unit: 'KG',
    };
    const inv: Invoice = {
      ...baseInvoice,
      subtotal: 230,
      taxTotal: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      grandTotal: 230,
    };
    const receipt = formatThermalReceipt(nonGstOrg, baseCustomer, inv, [itemWithTax]);

    // Row total should be 230.00, not 241.50
    expect(receipt).not.toContain('241.50');
    expect(receipt).toContain('Subtotal:');
    expect(receipt).toContain('Rs. 230.00');
    expect(receipt).not.toContain('CGST');
    expect(receipt).not.toContain('SGST');
  });
});
