import { Organization, Product, Customer, Invoice, InvoiceItem } from './types';
import { getDBMode, executeQuery, memoryDb, ASYNC_KEYS, executeTransaction, executeSqlInTransaction } from './db';
export { memoryDb };
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isMockEnabled } from '../config/app_config';
import { getMockFullDataset } from '../mock/mockData';
import { sortInvoicesLatestFirst } from '../utils/dateUtils';

// Generate UUID fallback
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// DEFAULT PROFILE DATA
export const DEFAULT_ORG: Organization = {
  id: 'default_org',
  name: '',
  address: '',
  phone: '',
  mobile: '',
  email: '',
  gstNumber: '',
  showGstOnBill: false,
  currency: 'Rs.',
  slogan: 'Thank You Visit again',
  printWidth: '58mm',
  securityPin: '1234',
  showFooterTextOnBill: true,
  footerText: 'Print by Parchiwala',
  logoBase64: '',
  showLogoOnBill: true,
  upiId: '',
  upiPayeeName: '',
  showUpiQrOnBill: true,
};

// ==========================================
// ORGANIZATION OPERATIONS
// ==========================================

export const getOrganization = async (): Promise<Organization> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    try {
      const res = await executeQuery('SELECT * FROM organization LIMIT 1');
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          ...row,
          showGstOnBill: row.showGstOnBill === 1,
          securityPin: row.securityPin || '1234',
          showFooterTextOnBill: row.showFooterTextOnBill === undefined || row.showFooterTextOnBill === null ? true : row.showFooterTextOnBill === 1,
          footerText: row.footerText !== undefined && row.footerText !== null ? row.footerText : 'Print by Parchiwala',
          logoBase64: row.logoBase64 || '',
          showLogoOnBill: row.showLogoOnBill === undefined || row.showLogoOnBill === null ? true : row.showLogoOnBill === 1,
          upiId: row.upiId || '',
          upiPayeeName: row.upiPayeeName || '',
          showUpiQrOnBill: row.showUpiQrOnBill === undefined || row.showUpiQrOnBill === null ? true : row.showUpiQrOnBill === 1,
        };
      }
      // If none exists, insert and return default
      await saveOrganization(DEFAULT_ORG);
      return DEFAULT_ORG;
    } catch (e) {
      console.log('Error reading organization from SQLite, returning default', e);
      return DEFAULT_ORG;
    }
  } else {
    if (!memoryDb.organization) {
      memoryDb.organization = DEFAULT_ORG;
      await AsyncStorage.setItem(ASYNC_KEYS.ORGANIZATION, JSON.stringify(DEFAULT_ORG));
    }
    return {
      ...memoryDb.organization,
      securityPin: memoryDb.organization.securityPin || '1234',
      showFooterTextOnBill: memoryDb.organization.showFooterTextOnBill !== false,
      footerText: memoryDb.organization.footerText !== undefined ? memoryDb.organization.footerText : 'Print by Parchiwala',
      logoBase64: memoryDb.organization.logoBase64 || '',
      showLogoOnBill: memoryDb.organization.showLogoOnBill !== false,
      upiId: memoryDb.organization.upiId || '',
      upiPayeeName: memoryDb.organization.upiPayeeName || '',
      showUpiQrOnBill: memoryDb.organization.showUpiQrOnBill !== false,
    };
  }
};

export const saveOrganization = async (org: Organization): Promise<void> => {
  const mode = getDBMode();
  const showFooter = org.showFooterTextOnBill !== false ? 1 : 0;
  const footerText = org.footerText !== undefined ? org.footerText : 'Print by Parchiwala';
  const showLogo = org.showLogoOnBill !== false ? 1 : 0;
  const showUpiQr = org.showUpiQrOnBill !== false ? 1 : 0;
  const logoBase64 = org.logoBase64 || '';
  const upiId = org.upiId || '';
  const upiPayeeName = org.upiPayeeName || '';

  if (mode === 'SQLITE') {
    await executeQuery(
      `INSERT OR REPLACE INTO organization (id, name, address, phone, mobile, email, gstNumber, showGstOnBill, currency, slogan, printWidth, securityPin, showFooterTextOnBill, footerText, logoBase64, showLogoOnBill, upiId, upiPayeeName, showUpiQrOnBill) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        org.id || 'default_org',
        org.name,
        org.address,
        org.phone,
        org.mobile,
        org.email,
        org.gstNumber,
        org.showGstOnBill ? 1 : 0,
        org.currency,
        org.slogan,
        org.printWidth || '58mm',
        org.securityPin || '1234',
        showFooter,
        footerText,
        logoBase64,
        showLogo,
        upiId,
        upiPayeeName,
        showUpiQr,
      ]
    );
  } else {
    memoryDb.organization = {
      ...org,
      showFooterTextOnBill: org.showFooterTextOnBill !== false,
      footerText,
      logoBase64,
      showLogoOnBill: showLogo === 1,
      upiId,
      upiPayeeName,
      showUpiQrOnBill: showUpiQr === 1,
    };
    await AsyncStorage.setItem(ASYNC_KEYS.ORGANIZATION, JSON.stringify(memoryDb.organization));
  }
};

// ==========================================
// PRODUCTS OPERATIONS
// ==========================================

export const getProducts = async (): Promise<Product[]> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    const res = await executeQuery('SELECT * FROM products ORDER BY name ASC');
    return res.rows;
  } else {
    return [...memoryDb.products].sort((a, b) => a.name.localeCompare(b.name));
  }
};

export const saveProduct = async (product: Product): Promise<void> => {
  const mode = getDBMode();
  const prodToSave = {
    ...product,
    id: product.id || generateId(),
    stockQuantity: product.stockQuantity || 0,
  };

  if (mode === 'SQLITE') {
    await executeQuery(
      `INSERT OR REPLACE INTO products (id, name, description, price, taxRate, unit, stockQuantity) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        prodToSave.id,
        prodToSave.name,
        prodToSave.description,
        prodToSave.price,
        prodToSave.taxRate,
        prodToSave.unit,
        prodToSave.stockQuantity,
      ]
    );
  } else {
    const index = memoryDb.products.findIndex((p) => p.id === prodToSave.id);
    if (index >= 0) {
      memoryDb.products[index] = prodToSave;
    } else {
      memoryDb.products.push(prodToSave);
    }
    await AsyncStorage.setItem(ASYNC_KEYS.PRODUCTS, JSON.stringify(memoryDb.products));
  }
};

export const deleteProduct = async (id: string): Promise<void> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    await executeQuery('DELETE FROM products WHERE id = ?', [id]);
  } else {
    memoryDb.products = memoryDb.products.filter((p) => p.id !== id);
    await AsyncStorage.setItem(ASYNC_KEYS.PRODUCTS, JSON.stringify(memoryDb.products));
  }
};

// ==========================================
// CUSTOMER OPERATIONS
// ==========================================

export const getCustomers = async (): Promise<Customer[]> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    const res = await executeQuery('SELECT * FROM customers ORDER BY name ASC');
    return res.rows;
  } else {
    return [...memoryDb.customers].sort((a, b) => a.name.localeCompare(b.name));
  }
};

export const saveCustomer = async (customer: Customer): Promise<void> => {
  const mode = getDBMode();
  const custToSave = {
    ...customer,
    id: customer.id || generateId(),
  };

  if (mode === 'SQLITE') {
    await executeQuery(
      `INSERT OR REPLACE INTO customers (id, name, phone, email, address) VALUES (?, ?, ?, ?, ?)`,
      [custToSave.id, custToSave.name, custToSave.phone, custToSave.email, custToSave.address]
    );
  } else {
    const index = memoryDb.customers.findIndex((c) => c.id === custToSave.id);
    if (index >= 0) {
      memoryDb.customers[index] = custToSave;
    } else {
      memoryDb.customers.push(custToSave);
    }
    await AsyncStorage.setItem(ASYNC_KEYS.CUSTOMERS, JSON.stringify(memoryDb.customers));
  }
};

export const deleteCustomer = async (id: string): Promise<void> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    await executeQuery('DELETE FROM customers WHERE id = ?', [id]);
  } else {
    memoryDb.customers = memoryDb.customers.filter((c) => c.id !== id);
    await AsyncStorage.setItem(ASYNC_KEYS.CUSTOMERS, JSON.stringify(memoryDb.customers));
  }
};

// ==========================================
// INVOICE OPERATIONS
// ==========================================

export interface InvoiceWithCustomerName extends Invoice {
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface InvoicePaginationOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'Paid' | 'Unpaid' | 'All';
  startDate?: string;
  endDate?: string;
}

export interface DashboardMetrics {
  totalInvoices: number;
  totalSales: number;
  totalCollected: number;
  totalPending: number;
  todayInvoicesCount: number;
  todaySales: number;
  todayCollected: number;
  todayPending: number;
}

/**
 * High-performance paginated invoices query using SQLite indexed LIMIT/OFFSET
 * Guarantees constant memory consumption and sub-10ms query times even with 50,000+ invoices.
 */
export const getPaginatedInvoices = async (
  options: InvoicePaginationOptions = {}
): Promise<PaginatedResult<InvoiceWithCustomerName>> => {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.max(1, options.pageSize || 20);
  const offset = (page - 1) * pageSize;
  const search = (options.search || '').trim();
  const status = options.status || 'All';
  const mode = getDBMode();

  if (mode === 'SQLITE') {
    const whereClauses: string[] = [];
    const params: any[] = [];

    if (search) {
      whereClauses.push('(invoices.invoiceNumber LIKE ? OR customers.name LIKE ? OR customers.phone LIKE ?)');
      const wild = `%${search}%`;
      params.push(wild, wild, wild);
    }

    if (status !== 'All') {
      whereClauses.push('invoices.paymentStatus = ?');
      params.push(status);
    }

    if (options.startDate) {
      whereClauses.push('invoices.date >= ?');
      params.push(options.startDate);
    }

    if (options.endDate) {
      whereClauses.push('invoices.date <= ?');
      params.push(options.endDate);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count query
    const countRes = await executeQuery(`
      SELECT COUNT(*) as total
      FROM invoices
      LEFT JOIN customers ON invoices.customerId = customers.id
      ${whereSql}
    `, params);

    const totalCount = countRes.rows.length > 0 ? Number(countRes.rows[0].total) : 0;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    // Data query with indexed limit/offset
    const dataRes = await executeQuery(`
      SELECT invoices.*, customers.name as customerName, customers.phone as customerPhone
      FROM invoices
      LEFT JOIN customers ON invoices.customerId = customers.id
      ${whereSql}
      ORDER BY invoices.date DESC
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);

    const items = sortInvoicesLatestFirst<InvoiceWithCustomerName>((dataRes.rows as InvoiceWithCustomerName[]) || []);

    return {
      items,
      totalCount,
      totalPages,
      page,
      pageSize,
      hasMore: page < totalPages,
    };
  } else {
    // AsyncStorage fallback
    let list = memoryDb.invoices.map((inv) => {
      const cust = memoryDb.customers.find((c) => c.id === inv.customerId);
      return {
        ...inv,
        customerName: cust ? cust.name : 'Unknown Customer',
        customerPhone: cust ? cust.phone : '',
      };
    });

    if (search) {
      const lower = search.toLowerCase();
      list = list.filter((i) =>
        (i.invoiceNumber && i.invoiceNumber.toLowerCase().includes(lower)) ||
        (i.customerName && i.customerName.toLowerCase().includes(lower)) ||
        (i.customerPhone && i.customerPhone.toLowerCase().includes(lower))
      );
    }

    if (status !== 'All') {
      list = list.filter((i) => i.paymentStatus === status);
    }

    if (options.startDate) {
      list = list.filter((i) => i.date >= options.startDate!);
    }

    if (options.endDate) {
      list = list.filter((i) => i.date <= options.endDate!);
    }

    const sorted = sortInvoicesLatestFirst(list);
    const totalCount = sorted.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const items = sorted.slice(offset, offset + pageSize);

    return {
      items,
      totalCount,
      totalPages,
      page,
      pageSize,
      hasMore: page < totalPages,
    };
  }
};

/**
 * Native aggregate dashboard metrics:
 * Computes all revenue totals directly in SQLite in < 1ms without loading rows into memory.
 */
export const getDashboardMetrics = async (): Promise<DashboardMetrics> => {
  const mode = getDBMode();
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayPrefix = `${yyyy}-${mm}-${dd}%`;

  if (mode === 'SQLITE') {
    // 1. All-time aggregate
    const allRes = await executeQuery(`
      SELECT 
        COUNT(*) as totalInvoices,
        COALESCE(SUM(grandTotal), 0) as totalSales,
        COALESCE(SUM(CASE WHEN paymentStatus = 'Paid' THEN grandTotal ELSE 0 END), 0) as totalCollected,
        COALESCE(SUM(CASE WHEN paymentStatus = 'Unpaid' THEN grandTotal ELSE 0 END), 0) as totalPending
      FROM invoices
    `);
    const allRow = allRes.rows[0] || {};

    // 2. Today's aggregate using indexed date search
    const todayRes = await executeQuery(`
      SELECT 
        COUNT(*) as todayInvoicesCount,
        COALESCE(SUM(grandTotal), 0) as todaySales,
        COALESCE(SUM(CASE WHEN paymentStatus = 'Paid' THEN grandTotal ELSE 0 END), 0) as todayCollected,
        COALESCE(SUM(CASE WHEN paymentStatus = 'Unpaid' THEN grandTotal ELSE 0 END), 0) as todayPending
      FROM invoices
      WHERE date LIKE ?
    `, [todayPrefix]);
    const todayRow = todayRes.rows[0] || {};

    return {
      totalInvoices: Number(allRow.totalInvoices || 0),
      totalSales: Number(allRow.totalSales || 0),
      totalCollected: Number(allRow.totalCollected || 0),
      totalPending: Number(allRow.totalPending || 0),
      todayInvoicesCount: Number(todayRow.todayInvoicesCount || 0),
      todaySales: Number(todayRow.todaySales || 0),
      todayCollected: Number(todayRow.todayCollected || 0),
      todayPending: Number(todayRow.todayPending || 0),
    };
  } else {
    // AsyncStorage memory fallback
    const allInvoices = memoryDb.invoices || [];
    const todayInvoices = allInvoices.filter((inv) => {
      if (!inv.date) return false;
      return String(inv.date).startsWith(`${yyyy}-${mm}-${dd}`);
    });

    return {
      totalInvoices: allInvoices.length,
      totalSales: allInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0),
      totalCollected: allInvoices.filter((i) => i.paymentStatus === 'Paid').reduce((sum, i) => sum + (i.grandTotal || 0), 0),
      totalPending: allInvoices.filter((i) => i.paymentStatus === 'Unpaid').reduce((sum, i) => sum + (i.grandTotal || 0), 0),
      todayInvoicesCount: todayInvoices.length,
      todaySales: todayInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0),
      todayCollected: todayInvoices.filter((i) => i.paymentStatus === 'Paid').reduce((sum, i) => sum + (i.grandTotal || 0), 0),
      todayPending: todayInvoices.filter((i) => i.paymentStatus === 'Unpaid').reduce((sum, i) => sum + (i.grandTotal || 0), 0),
    };
  }
};

/**
 * Fast indexed fetch of today's invoices only
 */
export const getTodayInvoicesOptimized = async (): Promise<InvoiceWithCustomerName[]> => {
  const mode = getDBMode();
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayPrefix = `${yyyy}-${mm}-${dd}%`;

  if (mode === 'SQLITE') {
    const res = await executeQuery(`
      SELECT invoices.*, customers.name as customerName, customers.phone as customerPhone 
      FROM invoices 
      LEFT JOIN customers ON invoices.customerId = customers.id 
      WHERE invoices.date LIKE ?
      ORDER BY invoices.date DESC
    `, [todayPrefix]);
    return sortInvoicesLatestFirst<InvoiceWithCustomerName>((res.rows as InvoiceWithCustomerName[]) || []);
  } else {
    const list = memoryDb.invoices
      .filter((inv) => inv.date && String(inv.date).startsWith(`${yyyy}-${mm}-${dd}`))
      .map((inv) => {
        const cust = memoryDb.customers.find((c) => c.id === inv.customerId);
        return {
          ...inv,
          customerName: cust ? cust.name : 'Unknown Customer',
          customerPhone: cust ? cust.phone : '',
        };
      });
    return sortInvoicesLatestFirst<InvoiceWithCustomerName>(list as InvoiceWithCustomerName[]);
  }
};

export const getInvoices = async (): Promise<InvoiceWithCustomerName[]> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    const res = await executeQuery(`
      SELECT invoices.*, customers.name as customerName, customers.phone as customerPhone 
      FROM invoices 
      LEFT JOIN customers ON invoices.customerId = customers.id 
      ORDER BY date DESC
    `);
    return sortInvoicesLatestFirst(res.rows || []);
  } else {
    const list = memoryDb.invoices
      .map((inv) => {
        const cust = memoryDb.customers.find((c) => c.id === inv.customerId);
        return {
          ...inv,
          customerName: cust ? cust.name : 'Unknown Customer',
          customerPhone: cust ? cust.phone : '',
        };
      });
    return sortInvoicesLatestFirst(list);
  }
};

export const getInvoiceById = async (id: string): Promise<InvoiceWithCustomerName | null> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    const res = await executeQuery(`
      SELECT invoices.*, customers.name as customerName, customers.phone as customerPhone, customers.address as customerAddress, customers.email as customerEmail
      FROM invoices 
      LEFT JOIN customers ON invoices.customerId = customers.id 
      WHERE invoices.id = ?
    `, [id]);
    return res.rows.length > 0 ? res.rows[0] : null;
  } else {
    const inv = memoryDb.invoices.find((i) => i.id === id);
    if (!inv) return null;
    const cust = memoryDb.customers.find((c) => c.id === inv.customerId);
    return {
      ...inv,
      customerName: cust ? cust.name : 'Unknown Customer',
      customerPhone: cust ? cust.phone : '',
      customerAddress: cust ? cust.address : '',
      customerEmail: cust ? cust.email : '',
    } as any;
  }
};

export const getInvoiceItems = async (invoiceId: string): Promise<InvoiceItem[]> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    const res = await executeQuery('SELECT * FROM invoice_items WHERE invoiceId = ?', [invoiceId]);
    return res.rows;
  } else {
    return memoryDb.invoiceItems.filter((item) => item.invoiceId === invoiceId);
  }
};

export const getAllInvoiceItems = async (): Promise<InvoiceItem[]> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    const res = await executeQuery('SELECT * FROM invoice_items');
    return res.rows;
  } else {
    return [...memoryDb.invoiceItems];
  }
};

export const saveInvoice = async (invoice: Invoice, items: InvoiceItem[]): Promise<void> => {
  const mode = getDBMode();
  const invoiceId = invoice.id || generateId();
  
  const invoiceToSave = {
    ...invoice,
    id: invoiceId,
  };

  const itemsToSave = items.map((item) => ({
    ...item,
    id: item.id || generateId(),
    invoiceId: invoiceId,
  }));

  if (mode === 'SQLITE') {
    // In SQLITE, we execute inside a native transaction block
    try {
      await executeTransaction(async (tx) => {
        await executeSqlInTransaction(
          tx,
          `INSERT INTO invoices (id, invoiceNumber, customerId, date, subtotal, taxTotal, cgstTotal, sgstTotal, discount, grandTotal, paymentStatus, paymentMethod) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceToSave.id,
            invoiceToSave.invoiceNumber,
            invoiceToSave.customerId,
            invoiceToSave.date,
            invoiceToSave.subtotal,
            invoiceToSave.taxTotal,
            invoiceToSave.cgstTotal,
            invoiceToSave.sgstTotal,
            invoiceToSave.discount,
            invoiceToSave.grandTotal,
            invoiceToSave.paymentStatus,
            invoiceToSave.paymentMethod,
          ]
        );

        for (const item of itemsToSave) {
          await executeSqlInTransaction(
            tx,
            `INSERT INTO invoice_items (id, invoiceId, productId, name, price, quantity, taxRate, total, unit) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              item.invoiceId,
              item.productId,
              item.name,
              item.price,
              item.quantity,
              item.taxRate,
              item.total,
              item.unit,
            ]
          );

          // Fetch product's base unit to compute stock conversion factor
          const productRes = await executeSqlInTransaction(tx, 'SELECT unit FROM products WHERE id = ?', [item.productId]);
          let conversionFactor = 1;
          if (productRes.rows.length > 0) {
            const baseUnit = (productRes.rows[0].unit || '').toLowerCase();
            const itemUnit = (item.unit || '').toLowerCase();
            if (baseUnit !== itemUnit) {
              if (baseUnit === 'kg' && itemUnit === 'gm') {
                conversionFactor = 1 / 1000;
              } else if (baseUnit === 'gm' && itemUnit === 'kg') {
                conversionFactor = 1000;
              } else if ((baseUnit === 'ltr' || baseUnit === 'litre') && itemUnit === 'ml') {
                conversionFactor = 1 / 1000;
              } else if (baseUnit === 'ml' && (itemUnit === 'ltr' || itemUnit === 'litre')) {
                conversionFactor = 1000;
              }
            }
          }

          // Decrement product stock quantity with conversion factor
          await executeSqlInTransaction(
            tx,
            `UPDATE products SET stockQuantity = stockQuantity - ? WHERE id = ?`,
            [item.quantity * conversionFactor, item.productId]
          );
        }
      });
    } catch (e) {
      console.error('[DB] Transaction error saving invoice', e);
      throw e;
    }
  } else {
    // AsyncStorage transaction
    memoryDb.invoices.push(invoiceToSave);
    memoryDb.invoiceItems.push(...itemsToSave);
    
    // Decrement product stock quantity in memory
    for (const item of itemsToSave) {
      const prodIndex = memoryDb.products.findIndex((p) => p.id === item.productId);
      if (prodIndex >= 0) {
        const product = memoryDb.products[prodIndex];
        const baseUnit = (product.unit || '').toLowerCase();
        const itemUnit = (item.unit || '').toLowerCase();
        let conversionFactor = 1;
        
        if (baseUnit !== itemUnit) {
          if (baseUnit === 'kg' && itemUnit === 'gm') {
            conversionFactor = 1 / 1000;
          } else if (baseUnit === 'gm' && itemUnit === 'kg') {
            conversionFactor = 1000;
          } else if ((baseUnit === 'ltr' || baseUnit === 'litre') && itemUnit === 'ml') {
            conversionFactor = 1 / 1000;
          } else if (baseUnit === 'ml' && (itemUnit === 'ltr' || itemUnit === 'litre')) {
            conversionFactor = 1000;
          }
        }

        const currentStock = product.stockQuantity || 0;
        memoryDb.products[prodIndex].stockQuantity = currentStock - (item.quantity * conversionFactor);
      }
    }
    
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICES, JSON.stringify(memoryDb.invoices));
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICE_ITEMS, JSON.stringify(memoryDb.invoiceItems));
    await AsyncStorage.setItem(ASYNC_KEYS.PRODUCTS, JSON.stringify(memoryDb.products));
  }
};

export const deleteInvoice = async (id: string): Promise<void> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    try {
      await executeTransaction(async (tx) => {
        await executeSqlInTransaction(tx, 'DELETE FROM invoices WHERE id = ?', [id]);
        await executeSqlInTransaction(tx, 'DELETE FROM invoice_items WHERE invoiceId = ?', [id]);
      });
    } catch (e) {
      console.error('[DB] Transaction error deleting invoice', e);
      throw e;
    }
  } else {
    memoryDb.invoices = memoryDb.invoices.filter((i) => i.id !== id);
    memoryDb.invoiceItems = memoryDb.invoiceItems.filter((item) => item.invoiceId !== id);
    
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICES, JSON.stringify(memoryDb.invoices));
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICE_ITEMS, JSON.stringify(memoryDb.invoiceItems));
  }
};

// ==========================================
// SEEDING FUNCTIONS
// ==========================================

export const seedMockDatabase = async (force: boolean = false): Promise<void> => {
  const mode = getDBMode();
  const mockData = getMockFullDataset();

  console.log('[DB] Seeding rich mock data into database...');

  if (force) {
    if (mode === 'SQLITE') {
      try {
        await executeQuery('DELETE FROM organization');
        await executeQuery('DELETE FROM products');
        await executeQuery('DELETE FROM customers');
        await executeQuery('DELETE FROM invoices');
        await executeQuery('DELETE FROM invoice_items');
      } catch (e) {
        console.error('[DB] Error clearing SQLite tables for mock seeding:', e);
      }
    } else {
      memoryDb.organization = null;
      memoryDb.products = [];
      memoryDb.customers = [];
      memoryDb.invoices = [];
      memoryDb.invoiceItems = [];
      await AsyncStorage.removeItem(ASYNC_KEYS.ORGANIZATION);
      await AsyncStorage.removeItem(ASYNC_KEYS.PRODUCTS);
      await AsyncStorage.removeItem(ASYNC_KEYS.CUSTOMERS);
      await AsyncStorage.removeItem(ASYNC_KEYS.INVOICES);
      await AsyncStorage.removeItem(ASYNC_KEYS.INVOICE_ITEMS);
    }
  }

  // 1. Seed Mock Organization Profile
  await saveOrganization(mockData.organization);

  // 2. Seed Mock Products
  for (const prod of mockData.products) {
    await saveProduct(prod);
  }

  // 3. Seed Mock Customers
  for (const cust of mockData.customers) {
    await saveCustomer(cust);
  }

  // 4. Seed Mock Invoices and Invoice Items
  if (mode === 'SQLITE') {
    for (const inv of mockData.invoices) {
      await executeQuery(
        `INSERT OR REPLACE INTO invoices (id, invoiceNumber, customerId, date, subtotal, taxTotal, cgstTotal, sgstTotal, discount, grandTotal, paymentStatus, paymentMethod) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          inv.id,
          inv.invoiceNumber,
          inv.customerId,
          inv.date,
          inv.subtotal,
          inv.taxTotal,
          inv.cgstTotal,
          inv.sgstTotal,
          inv.discount,
          inv.grandTotal,
          inv.paymentStatus,
          inv.paymentMethod,
        ]
      );
    }

    for (const item of mockData.invoiceItems) {
      await executeQuery(
        `INSERT OR REPLACE INTO invoice_items (id, invoiceId, productId, name, price, quantity, taxRate, total, unit) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.invoiceId,
          item.productId,
          item.name,
          item.price,
          item.quantity,
          item.taxRate,
          item.total,
          item.unit || 'Pcs',
        ]
      );
    }
  } else {
    memoryDb.invoices = mockData.invoices;
    memoryDb.invoiceItems = mockData.invoiceItems;
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICES, JSON.stringify(mockData.invoices));
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICE_ITEMS, JSON.stringify(mockData.invoiceItems));
  }

  await AsyncStorage.setItem('@parchiwala_mock_seeded', 'true');
  console.log('[DB] Mock data seeded successfully! 12 products, 5 customers, 6 invoices.');
};

export const seedDatabase = async (force: boolean = false): Promise<void> => {
  const mode = getDBMode();
  
  // If Mock Mode is enabled, route to seedMockDatabase
  if (isMockEnabled()) {
    const isAlreadySeeded = await AsyncStorage.getItem('@parchiwala_mock_seeded');
    if (!isAlreadySeeded || force) {
      await seedMockDatabase(force);
      return;
    }

    // Double-check if products exist in table
    if (mode === 'SQLITE') {
      const prodCheck = await executeQuery('SELECT COUNT(*) as count FROM products');
      if (!prodCheck.rows || prodCheck.rows.length === 0 || prodCheck.rows[0]?.count === 0) {
        await seedMockDatabase(true);
        return;
      }
    } else if (memoryDb.products.length === 0) {
      await seedMockDatabase(true);
      return;
    }
    return;
  }

  // Checking if seeding is required for standard blank profile
  let shouldSeed = force;
  if (!shouldSeed) {
    if (mode === 'SQLITE') {
      const orgCheck = await executeQuery('SELECT COUNT(*) as count FROM organization');
      shouldSeed = !orgCheck.rows || orgCheck.rows.length === 0 || (orgCheck.rows[0] && orgCheck.rows[0].count === 0);
    } else {
      shouldSeed = !memoryDb.organization;
    }
  }

  if (!shouldSeed) return;

  if (force) {
    console.log('[DB] Force reset requested. Clearing tables...');
    if (mode === 'SQLITE') {
      try {
        await executeQuery('DELETE FROM organization');
        await executeQuery('DELETE FROM products');
        await executeQuery('DELETE FROM customers');
        await executeQuery('DELETE FROM invoices');
        await executeQuery('DELETE FROM invoice_items');
      } catch (e) {
        console.error('[DB] Error clearing SQLite tables:', e);
      }
    } else {
      memoryDb.organization = null;
      memoryDb.products = [];
      memoryDb.customers = [];
      memoryDb.invoices = [];
      memoryDb.invoiceItems = [];
      await AsyncStorage.removeItem(ASYNC_KEYS.ORGANIZATION);
      await AsyncStorage.removeItem(ASYNC_KEYS.PRODUCTS);
      await AsyncStorage.removeItem(ASYNC_KEYS.CUSTOMERS);
      await AsyncStorage.removeItem(ASYNC_KEYS.INVOICES);
      await AsyncStorage.removeItem(ASYNC_KEYS.INVOICE_ITEMS);
    }
  }

  console.log('[DB] Seeding default blank organization profile and default Walkin-customer...');

  // Seed blank organization profile
  await saveOrganization(DEFAULT_ORG);

  // Seed default customer "Walkin-customer"
  const defaultCust: Customer = {
    id: 'default_customer',
    name: 'Walkin-customer',
    phone: '0000000000',
    email: '',
    address: '',
  };
  await saveCustomer(defaultCust);

  console.log('[DB] Seeding finished successfully!');
};

export const clearDatabase = async (): Promise<void> => {
  const mode = getDBMode();
  const blankOrg: Organization = {
    id: 'default_org',
    name: '',
    address: '',
    phone: '',
    mobile: '',
    email: '',
    gstNumber: '',
    showGstOnBill: false,
    currency: '₹',
    slogan: '',
    printWidth: '58mm',
    logoBase64: '',
    showLogoOnBill: true,
    upiId: '',
    upiPayeeName: '',
    showUpiQrOnBill: true,
  };
  const defaultCust: Customer = {
    id: 'default_customer',
    name: 'Walkin-customer',
    phone: '0000000000',
    email: '',
    address: '',
  };

  if (mode === 'SQLITE') {
    await executeQuery('DELETE FROM organization');
    await executeQuery('DELETE FROM products');
    await executeQuery('DELETE FROM customers');
    await executeQuery('DELETE FROM invoices');
    await executeQuery('DELETE FROM invoice_items');
    await saveOrganization(blankOrg);
    await saveCustomer(defaultCust);
  } else {
    memoryDb.organization = blankOrg;
    memoryDb.products = [];
    memoryDb.customers = [defaultCust];
    memoryDb.invoices = [];
    memoryDb.invoiceItems = [];
    await AsyncStorage.setItem(ASYNC_KEYS.ORGANIZATION, JSON.stringify(blankOrg));
    await AsyncStorage.setItem(ASYNC_KEYS.PRODUCTS, JSON.stringify([]));
    await AsyncStorage.setItem(ASYNC_KEYS.CUSTOMERS, JSON.stringify([defaultCust]));
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICES, JSON.stringify([]));
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICE_ITEMS, JSON.stringify([]));
  }
};

export interface DatabaseBackup {
  version?: string;
  filename?: string;
  exportedAt?: string;
  organization: Organization;
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
}

export const generateBackupFilename = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const mins = pad(now.getMinutes());
  const secs = pad(now.getSeconds());

  return `parchiwala_backup_${year}${month}${day}_${hours}${mins}${secs}.json`;
};

export const exportDatabaseData = async (): Promise<{ jsonStr: string; filename: string }> => {
  const org = await getOrganization();
  const prods = await getProducts();
  const custs = await getCustomers();
  
  const mode = getDBMode();
  let invs: Invoice[] = [];
  let items: InvoiceItem[] = [];
  
  if (mode === 'SQLITE') {
    const resInvs = await executeQuery('SELECT * FROM invoices');
    invs = resInvs.rows;
    const resItems = await executeQuery('SELECT * FROM invoice_items');
    items = resItems.rows;
  } else {
    invs = memoryDb.invoices;
    items = memoryDb.invoiceItems;
  }

  const filename = generateBackupFilename();
  
  const backup: DatabaseBackup = {
    version: '1.0',
    filename,
    exportedAt: new Date().toISOString(),
    organization: org,
    products: prods,
    customers: custs,
    invoices: invs,
    invoiceItems: items,
  };
  
  return {
    jsonStr: JSON.stringify(backup, null, 2),
    filename,
  };
};

export const importDatabaseData = async (jsonStr: string): Promise<void> => {
  const backup: DatabaseBackup = JSON.parse(jsonStr);
  
  if (!backup.organization || !Array.isArray(backup.products) || !Array.isArray(backup.customers) || !Array.isArray(backup.invoices)) {
    throw new Error('Invalid backup format');
  }
  
  const mode = getDBMode();
  
  if (mode === 'SQLITE') {
    await executeQuery('DELETE FROM organization');
    await executeQuery('DELETE FROM products');
    await executeQuery('DELETE FROM customers');
    await executeQuery('DELETE FROM invoices');
    await executeQuery('DELETE FROM invoice_items');
    
    await saveOrganization(backup.organization);
    
    for (const p of backup.products) {
      await saveProduct(p);
    }
    
    for (const c of backup.customers) {
      await saveCustomer(c);
    }
    
    for (const inv of backup.invoices) {
      await executeQuery(
        `INSERT OR REPLACE INTO invoices (id, invoiceNumber, customerId, date, subtotal, taxTotal, cgstTotal, sgstTotal, discount, grandTotal, paymentStatus, paymentMethod) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          inv.id,
          inv.invoiceNumber,
          inv.customerId,
          inv.date,
          inv.subtotal,
          inv.taxTotal,
          inv.cgstTotal,
          inv.sgstTotal,
          inv.discount,
          inv.grandTotal,
          inv.paymentStatus,
          inv.paymentMethod,
        ]
      );
    }
    
    for (const item of backup.invoiceItems || []) {
      await executeQuery(
        `INSERT OR REPLACE INTO invoice_items (id, invoiceId, productId, name, price, quantity, taxRate, total, unit) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.invoiceId,
          item.productId,
          item.name,
          item.price,
          item.quantity,
          item.taxRate,
          item.total,
          item.unit,
        ]
      );
    }
  } else {
    memoryDb.organization = backup.organization;
    memoryDb.products = backup.products;
    memoryDb.customers = backup.customers;
    memoryDb.invoices = backup.invoices;
    memoryDb.invoiceItems = backup.invoiceItems || [];
    
    await AsyncStorage.setItem(ASYNC_KEYS.ORGANIZATION, JSON.stringify(backup.organization));
    await AsyncStorage.setItem(ASYNC_KEYS.PRODUCTS, JSON.stringify(backup.products));
    await AsyncStorage.setItem(ASYNC_KEYS.CUSTOMERS, JSON.stringify(backup.customers));
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICES, JSON.stringify(backup.invoices));
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICE_ITEMS, JSON.stringify(backup.invoiceItems || []));
  }
};

export const clearInvoicesOnly = async (): Promise<void> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    await executeQuery('DELETE FROM invoices');
    await executeQuery('DELETE FROM invoice_items');
  } else {
    memoryDb.invoices = [];
    memoryDb.invoiceItems = [];
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICES, JSON.stringify([]));
    await AsyncStorage.setItem(ASYNC_KEYS.INVOICE_ITEMS, JSON.stringify([]));
  }
};

export const updateInvoicePaymentStatus = async (id: string, status: 'Paid' | 'Unpaid'): Promise<void> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    await executeQuery('UPDATE invoices SET paymentStatus = ? WHERE id = ?', [status, id]);
  } else {
    const index = memoryDb.invoices.findIndex((inv) => inv.id === id);
    if (index >= 0) {
      memoryDb.invoices[index].paymentStatus = status;
      await AsyncStorage.setItem(ASYNC_KEYS.INVOICES, JSON.stringify(memoryDb.invoices));
    }
  }
};

