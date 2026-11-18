jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

jest.mock('react-native-sqlite-storage', () => null);

import {
  getPaginatedInvoices,
  getDashboardMetrics,
  getTodayInvoicesOptimized,
  memoryDb,
} from '../src/db/operations';

describe('Paginated Invoice Virtualization & High-Volume Operations', () => {
  const todayStr = new Date().toISOString();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString();

  beforeEach(() => {
    // Populate realistic test dataset in memoryDb
    memoryDb.customers = [
      { id: 'c1', name: 'Ramesh Sharma', phone: '9820011223', email: 'ramesh@example.com', address: 'Pune' },
      { id: 'c2', name: 'Suresh Patil', phone: '9830022334', email: 'suresh@example.com', address: 'Mumbai' },
    ];

    memoryDb.invoices = [
      {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-0001',
        customerId: 'c1',
        date: todayStr,
        subtotal: 100,
        taxTotal: 18,
        cgstTotal: 9,
        sgstTotal: 9,
        discount: 0,
        grandTotal: 118,
        paymentStatus: 'Paid',
        paymentMethod: 'Cash',
      },
      {
        id: 'inv-2',
        invoiceNumber: 'INV-2026-0002',
        customerId: 'c2',
        date: todayStr,
        subtotal: 200,
        taxTotal: 36,
        cgstTotal: 18,
        sgstTotal: 18,
        discount: 10,
        grandTotal: 226,
        paymentStatus: 'Unpaid',
        paymentMethod: 'Credit',
      },
      {
        id: 'inv-3',
        invoiceNumber: 'INV-2026-0003',
        customerId: 'c1',
        date: yesterdayStr,
        subtotal: 300,
        taxTotal: 54,
        cgstTotal: 27,
        sgstTotal: 27,
        discount: 0,
        grandTotal: 354,
        paymentStatus: 'Paid',
        paymentMethod: 'UPI',
      },
      {
        id: 'inv-4',
        invoiceNumber: 'INV-2026-0004',
        customerId: '',
        date: yesterdayStr,
        subtotal: 50,
        taxTotal: 0,
        cgstTotal: 0,
        sgstTotal: 0,
        discount: 0,
        grandTotal: 50,
        paymentStatus: 'Paid',
        paymentMethod: 'Cash',
      },
    ];
  });

  it('paginates invoices correctly with page and pageSize limits', async () => {
    const page1 = await getPaginatedInvoices({ page: 1, pageSize: 2 });
    expect(page1.totalCount).toBe(4);
    expect(page1.totalPages).toBe(2);
    expect(page1.items.length).toBe(2);
    expect(page1.hasMore).toBe(true);

    const page2 = await getPaginatedInvoices({ page: 2, pageSize: 2 });
    expect(page2.items.length).toBe(2);
    expect(page2.hasMore).toBe(false);
  });

  it('filters invoices by search query matching invoice number, customer name, or phone', async () => {
    // Search by customer name
    const resName = await getPaginatedInvoices({ search: 'Suresh' });
    expect(resName.totalCount).toBe(1);
    expect(resName.items[0].invoiceNumber).toBe('INV-2026-0002');
    expect(resName.items[0].customerName).toBe('Suresh Patil');

    // Search by phone
    const resPhone = await getPaginatedInvoices({ search: '98200' });
    expect(resPhone.totalCount).toBe(2);

    // Search by bill number
    const resBill = await getPaginatedInvoices({ search: '0003' });
    expect(resBill.totalCount).toBe(1);
    expect(resBill.items[0].invoiceNumber).toBe('INV-2026-0003');
  });

  it('filters invoices by paymentStatus', async () => {
    const paidOnly = await getPaginatedInvoices({ status: 'Paid' });
    expect(paidOnly.totalCount).toBe(3);
    for (const item of paidOnly.items) {
      expect(item.paymentStatus).toBe('Paid');
    }

    const unpaidOnly = await getPaginatedInvoices({ status: 'Unpaid' });
    expect(unpaidOnly.totalCount).toBe(1);
    expect(unpaidOnly.items[0].paymentStatus).toBe('Unpaid');
  });

  it('computes accurate native dashboard metrics in single call', async () => {
    const metrics = await getDashboardMetrics();

    expect(metrics.totalInvoices).toBe(4);
    // Total sales = 118 + 226 + 354 + 50 = 748
    expect(metrics.totalSales).toBe(748);
    // Total collected (Paid) = 118 + 354 + 50 = 522
    expect(metrics.totalCollected).toBe(522);
    // Total pending (Unpaid) = 226
    expect(metrics.totalPending).toBe(226);

    // Today's metrics (inv-1 and inv-2)
    expect(metrics.todayInvoicesCount).toBe(2);
    // Today's sales = 118 + 226 = 344
    expect(metrics.todaySales).toBe(344);
    // Today's collected = 118
    expect(metrics.todayCollected).toBe(118);
    // Today's pending = 226
    expect(metrics.todayPending).toBe(226);
  });

  it('fetches today invoices only sorted latest first', async () => {
    const todayList = await getTodayInvoicesOptimized();

    expect(todayList.length).toBe(2);
    expect(todayList.some((i) => i.id === 'inv-1')).toBe(true);
    expect(todayList.some((i) => i.id === 'inv-2')).toBe(true);
    expect(todayList.some((i) => i.id === 'inv-3')).toBe(false);
  });
});
