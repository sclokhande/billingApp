import AsyncStorage from '@react-native-async-storage/async-storage';

let SQLite: any;
let isSQLiteAvailable = false;
let dbInstance: any = null;

try {
  SQLite = require('react-native-sqlite-storage');
  if (SQLite && typeof SQLite.enablePromise === 'function') {
    SQLite.enablePromise(true);
    isSQLiteAvailable = true;
    console.log('[DB] SQLite module successfully loaded.');
  }
} catch (e) {
  console.log('[DB] SQLite native module not found/linked. Using AsyncStorage fallback.', e);
  isSQLiteAvailable = false;
}

// In-memory caching for faster reads and fallback mode execution
let memoryDb = {
  organization: null as any,
  products: [] as any[],
  customers: [] as any[],
  invoices: [] as any[],
  invoiceItems: [] as any[],
};

// Keys for AsyncStorage fallback
const ASYNC_KEYS = {
  ORGANIZATION: 'billing_org_data',
  PRODUCTS: 'billing_products_list',
  CUSTOMERS: 'billing_customers_list',
  INVOICES: 'billing_invoices_list',
  INVOICE_ITEMS: 'billing_invoice_items_list',
};

// Open SQLite DB
const openSQLiteDB = async () => {
  if (!isSQLiteAvailable) return null;
  try {
    const db = await SQLite.openDatabase({
      name: 'BillingDatabase.db',
      location: 'default',
    });
    console.log('[DB] SQLite database opened successfully.');
    return db;
  } catch (error) {
    console.log('[DB] Failed to open SQLite database. Falling back to AsyncStorage.', error);
    isSQLiteAvailable = false;
    return null;
  }
};

// Initialize Schemas
export const initDB = async (): Promise<string> => {
  if (isSQLiteAvailable) {
    try {
      dbInstance = await openSQLiteDB();
      if (dbInstance) {
        // Create tables
        await dbInstance.executeSql(`
          CREATE TABLE IF NOT EXISTS organization (
            id TEXT PRIMARY KEY,
            name TEXT,
            address TEXT,
            phone TEXT,
            mobile TEXT,
            email TEXT,
            gstNumber TEXT,
            showGstOnBill INTEGER,
            currency TEXT,
            slogan TEXT,
            printWidth TEXT
          );
        `);
        await dbInstance.executeSql(`
          CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT,
            description TEXT,
            price REAL,
            taxRate REAL,
            unit TEXT
          );
        `);
        await dbInstance.executeSql(`
          CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            name TEXT,
            phone TEXT,
            email TEXT,
            address TEXT
          );
        `);
        await dbInstance.executeSql(`
          CREATE TABLE IF NOT EXISTS invoices (
            id TEXT PRIMARY KEY,
            invoiceNumber TEXT,
            customerId TEXT,
            date TEXT,
            subtotal REAL,
            taxTotal REAL,
            cgstTotal REAL,
            sgstTotal REAL,
            discount REAL,
            grandTotal REAL,
            paymentStatus TEXT,
            paymentMethod TEXT
          );
        `);
        await dbInstance.executeSql(`
          CREATE TABLE IF NOT EXISTS invoice_items (
            id TEXT PRIMARY KEY,
            invoiceId TEXT,
            productId TEXT,
            name TEXT,
            price REAL,
            quantity REAL,
            taxRate REAL,
            total REAL,
            unit TEXT
          );
        `);
        // Migrations (Alter tables if columns are missing from existing DB)
        try {
          await dbInstance.executeSql('ALTER TABLE products ADD COLUMN unit TEXT;');
        } catch (_) {}
        try {
          await dbInstance.executeSql('ALTER TABLE invoice_items ADD COLUMN unit TEXT;');
        } catch (_) {}
        try {
          await dbInstance.executeSql('ALTER TABLE organization ADD COLUMN printWidth TEXT;');
        } catch (_) {}

        console.log('[DB] SQLite database tables initialized.');
        return 'SQLITE';
      }
    } catch (e) {
      console.log('[DB] SQLite schema initialization failed. Switching to AsyncStorage fallback.', e);
      isSQLiteAvailable = false;
    }
  }

  // AsyncStorage fallback initialization
  console.log('[DB] Initializing database in AsyncStorage fallback mode.');
  try {
    const org = await AsyncStorage.getItem(ASYNC_KEYS.ORGANIZATION);
    const prods = await AsyncStorage.getItem(ASYNC_KEYS.PRODUCTS);
    const custs = await AsyncStorage.getItem(ASYNC_KEYS.CUSTOMERS);
    const invs = await AsyncStorage.getItem(ASYNC_KEYS.INVOICES);
    const items = await AsyncStorage.getItem(ASYNC_KEYS.INVOICE_ITEMS);

    memoryDb.organization = org ? JSON.parse(org) : null;
    memoryDb.products = prods ? JSON.parse(prods) : [];
    memoryDb.customers = custs ? JSON.parse(custs) : [];
    memoryDb.invoices = invs ? JSON.parse(invs) : [];
    memoryDb.invoiceItems = items ? JSON.parse(items) : [];

    console.log('[DB] AsyncStorage tables loaded in memory.');
    return 'ASYNC_STORAGE';
  } catch (error) {
    console.error('[DB] AsyncStorage initialization failed', error);
    return 'ERROR';
  }
};

// General Execution helper that abstracts the SQL / AsyncStorage difference
export const executeQuery = async (sql: string, params: any[] = []): Promise<any> => {
  if (isSQLiteAvailable && dbInstance) {
    try {
      const [results] = await dbInstance.executeSql(sql, params);
      const rows = [];
      for (let i = 0; i < results.rows.length; i++) {
        rows.push(results.rows.item(i));
      }
      return { rows, insertId: results.insertId, rowsAffected: results.rowsAffected };
    } catch (error) {
      console.error('[DB] SQL execution error for:', sql, error);
      throw error;
    }
  } else {
    // Simulated query executor for AsyncStorage fallback (minimal mock for simple CRUD calls)
    throw new Error('AsyncStorage running; use specialized operations instead of raw query.');
  }
};

export const getDBMode = () => (isSQLiteAvailable ? 'SQLITE' : 'ASYNC_STORAGE');
export { memoryDb, ASYNC_KEYS };
