import { APP_CONFIG, isMockEnabled } from '../src/config/app_config';
import { getMockFullDataset, MOCK_ORGANIZATION, MOCK_PRODUCTS, MOCK_CUSTOMERS } from '../src/mock/mockData';

describe('Mock Data Configuration and Dataset', () => {
  it('should have isMock flag enabled in APP_CONFIG', () => {
    expect(APP_CONFIG.isMock).toBe(true);
    expect(isMockEnabled()).toBe(true);
  });

  it('should generate complete mock organization details', () => {
    expect(MOCK_ORGANIZATION.name).toBe('Parchiwala Kirana & General Store');
    expect(MOCK_ORGANIZATION.currency).toBe('Rs.');
    expect(MOCK_ORGANIZATION.gstNumber).toBe('27AAAAA0000A1Z5');
    expect(MOCK_ORGANIZATION.securityPin).toBe('1234');
  });

  it('should generate realistic mock products with stock quantities and prices', () => {
    expect(MOCK_PRODUCTS.length).toBeGreaterThanOrEqual(10);

    const apple = MOCK_PRODUCTS.find((p) => p.id === 'prod_apple');
    expect(apple).toBeDefined();
    expect(apple?.price).toBe(120);
    expect(apple?.unit).toBe('KG');

    const rice = MOCK_PRODUCTS.find((p) => p.id === 'prod_rice');
    expect(rice).toBeDefined();
    expect(rice?.price).toBe(60);
    expect(rice?.unit).toBe('KG');
  });

  it('should generate mock customers including Walkin-customer', () => {
    expect(MOCK_CUSTOMERS.length).toBeGreaterThanOrEqual(4);
    const walkin = MOCK_CUSTOMERS.find((c) => c.id === 'cust_walkin');
    expect(walkin).toBeDefined();
    expect(walkin?.name).toBe('Walkin-customer');
  });

  it('should generate balanced invoices with both Paid and Unpaid credit status', () => {
    const { invoices, invoiceItems } = getMockFullDataset();
    expect(invoices.length).toBeGreaterThanOrEqual(5);
    expect(invoiceItems.length).toBeGreaterThanOrEqual(5);

    const paidInvoices = invoices.filter((inv) => inv.paymentStatus === 'Paid');
    const unpaidInvoices = invoices.filter((inv) => inv.paymentStatus === 'Unpaid');

    expect(paidInvoices.length).toBeGreaterThan(0);
    expect(unpaidInvoices.length).toBeGreaterThan(0);

    // Verify all invoice items correspond to valid invoices
    for (const item of invoiceItems) {
      const invExists = invoices.some((inv) => inv.id === item.invoiceId);
      expect(invExists).toBe(true);
    }
  });
});
