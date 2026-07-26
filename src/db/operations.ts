import { Organization, Product, Customer, Invoice, InvoiceItem } from './types';
import { getDBMode, executeQuery, memoryDb, ASYNC_KEYS, executeTransaction, executeSqlInTransaction } from './db';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    };
  }
};

export const saveOrganization = async (org: Organization): Promise<void> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    await executeQuery(
      `INSERT OR REPLACE INTO organization (id, name, address, phone, mobile, email, gstNumber, showGstOnBill, currency, slogan, printWidth, securityPin) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ]
    );
  } else {
    memoryDb.organization = org;
    await AsyncStorage.setItem(ASYNC_KEYS.ORGANIZATION, JSON.stringify(org));
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
}

export const getInvoices = async (): Promise<InvoiceWithCustomerName[]> => {
  const mode = getDBMode();
  if (mode === 'SQLITE') {
    const res = await executeQuery(`
      SELECT invoices.*, customers.name as customerName, customers.phone as customerPhone 
      FROM invoices 
      LEFT JOIN customers ON invoices.customerId = customers.id 
      ORDER BY date DESC
    `);
    return res.rows;
  } else {
    return memoryDb.invoices
      .map((inv) => {
        const cust = memoryDb.customers.find((c) => c.id === inv.customerId);
        return {
          ...inv,
          customerName: cust ? cust.name : 'Unknown Customer',
          customerPhone: cust ? cust.phone : '',
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
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
// SEEDING FUNCTION
// ==========================================
export const seedDatabase = async (force: boolean = false): Promise<void> => {
  const mode = getDBMode();
  
  // Checking if seeding is required
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

