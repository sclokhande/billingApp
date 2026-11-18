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

import { runDatabaseMigrations } from './migrations';

// Initialize Schemas
export const initDB = async (): Promise<string> => {
  if (isSQLiteAvailable) {
    try {
      dbInstance = await openSQLiteDB();
      if (dbInstance) {
        // Run automated versioned migrations (schema creation, indexes, column updates)
        const migrationResult = await runDatabaseMigrations(async (sql: string, params: any[] = []) => {
          return await dbInstance.executeSql(sql, params);
        });
        console.log(`[DB] SQLite database initialized at schema version v${migrationResult.currentVersion} (${migrationResult.applied} migrations applied).`);
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
      const res = await dbInstance.executeSql(sql, params);
      const results = Array.isArray(res) ? res[0] : res;
      const rows: any[] = [];
      if (results && results.rows && typeof results.rows.length === 'number') {
        const len = results.rows.length;
        for (let i = 0; i < len; i++) {
          rows.push(results.rows.item(i));
        }
      }
      return {
        rows,
        insertId: results?.insertId,
        rowsAffected: results?.rowsAffected || 0,
      };
    } catch (error) {
      console.error('[DB] SQL execution error for:', sql, error);
      throw error;
    }
  } else {
    // Simulated query executor for AsyncStorage fallback (minimal mock for simple CRUD calls)
    throw new Error('AsyncStorage running; use specialized operations instead of raw query.');
  }
};

export const executeTransaction = async (callback: (tx: any) => Promise<void>): Promise<void> => {
  if (isSQLiteAvailable && dbInstance) {
    try {
      await executeQuery('BEGIN TRANSACTION;');
      await callback(dbInstance);
      await executeQuery('COMMIT;');
    } catch (error) {
      try {
        await executeQuery('ROLLBACK;');
      } catch (rollbackError) {
        console.error('[DB] Rollback error:', rollbackError);
      }
      console.error('[DB] Transaction execution error:', error);
      throw error;
    }
  } else {
    throw new Error('SQLite not available or not initialized');
  }
};

export const executeSqlInTransaction = async (tx: any, sql: string, params: any[] = []): Promise<any> => {
  return await executeQuery(sql, params);
};

export const getDBMode = () => (isSQLiteAvailable ? 'SQLITE' : 'ASYNC_STORAGE');
export { memoryDb, ASYNC_KEYS };
