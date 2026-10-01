import {
  parseInvoiceDate,
  isToday,
  formatInvoiceTime,
  formatInvoiceDate,
  formatInvoiceDateTime,
  isMockInvoice,
  sortInvoicesLatestFirst,
} from '../src/utils/dateUtils';

describe('Date Utilities', () => {
  it('should parse ISO strings, SQLite strings, and numeric timestamps accurately', () => {
    const isoDate = parseInvoiceDate('2026-10-01T11:17:00.000Z');
    expect(isoDate).toBeInstanceOf(Date);
    expect(isNaN(isoDate.getTime())).toBe(false);

    const sqliteDate = parseInvoiceDate('2026-10-01 11:17:00');
    expect(sqliteDate).toBeInstanceOf(Date);
    expect(isNaN(sqliteDate.getTime())).toBe(false);

    const numericDate = parseInvoiceDate(1727781420000);
    expect(numericDate).toBeInstanceOf(Date);
    expect(numericDate.getTime()).toBe(1727781420000);

    const strNumDate = parseInvoiceDate('1727781420000');
    expect(strNumDate.getTime()).toBe(1727781420000);
  });

  it('should accurately detect today regardless of formatting', () => {
    const today = new Date();
    expect(isToday(today.toISOString())).toBe(true);
    expect(isToday(today)).toBe(true);

    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    expect(isToday(yesterday.toISOString())).toBe(false);
  });

  it('should format date and time reliably', () => {
    const testDate = new Date(2026, 9, 1, 14, 5, 0); // Oct 1, 2026, 02:05 PM
    expect(formatInvoiceTime(testDate)).toBe('02:05 PM');
    expect(formatInvoiceDate(testDate)).toBe('Oct 1, 2026');
    expect(formatInvoiceDateTime(testDate)).toBe('02:05 PM • Oct 1, 2026');
  });

  it('should correctly identify mock invoices vs real user-created invoices', () => {
    expect(isMockInvoice({ id: 'inv_1001', invoiceNumber: 'INV-1001' })).toBe(true);
    expect(isMockInvoice({ id: 'inv_1005', invoiceNumber: 'INV-1005' })).toBe(true);
    expect(isMockInvoice('inv_1002')).toBe(true);

    // User created invoices have random id and formatted INV-YYYY-XXXX
    expect(isMockInvoice({ id: 'abc12345', invoiceNumber: 'INV-2026-0007' })).toBe(false);
    expect(isMockInvoice('xyz98765')).toBe(false);
  });

  it('should place newly created real invoice at the very top of the list above mock invoices', () => {
    const mockInvoices = [
      { id: 'inv_1001', invoiceNumber: 'INV-1001', date: new Date(Date.now() - 4 * 3600000).toISOString() },
      { id: 'inv_1005', invoiceNumber: 'INV-1005', date: new Date(Date.now() - 30 * 60000).toISOString() },
      // Even if a legacy mock invoice had a future timestamp (e.g. 20:10 tonight):
      { id: 'inv_1004', invoiceNumber: 'INV-1004', date: new Date(Date.now() + 5 * 3600000).toISOString() },
    ];

    // Real invoice created right now
    const realInvoice = {
      id: 'usr_real_001',
      invoiceNumber: 'INV-2026-0001',
      date: new Date().toISOString(),
    };

    const sorted = sortInvoicesLatestFirst([...mockInvoices, realInvoice]);

    // The real invoice MUST be at index 0 (top of the list)
    expect(sorted[0].id).toBe('usr_real_001');
    expect(sorted[0].invoiceNumber).toBe('INV-2026-0001');
  });

  it('should sort multiple real invoices in descending chronological order', () => {
    const billOlder = {
      id: 'real_001',
      invoiceNumber: 'INV-2026-0001',
      date: new Date(Date.now() - 10 * 60000).toISOString(), // 10 mins ago
    };
    const billNewer = {
      id: 'real_002',
      invoiceNumber: 'INV-2026-0002',
      date: new Date().toISOString(), // Just now
    };

    const sorted = sortInvoicesLatestFirst([billOlder, billNewer]);
    expect(sorted[0].id).toBe('real_002');
    expect(sorted[1].id).toBe('real_001');
  });
});
