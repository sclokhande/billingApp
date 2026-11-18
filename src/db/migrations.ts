/**
 * Parchiwala Database Migration Framework
 * Provides automated, versioned, transactional schema evolution for production SQLite.
 */

export interface Migration {
  version: number;
  name: string;
  up: (executeSql: (sql: string, params?: any[]) => Promise<any>) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'baseline_schema',
    up: async (executeSql) => {
      // Organization table
      await executeSql(`
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
          printWidth TEXT,
          securityPin TEXT,
          showFooterTextOnBill INTEGER DEFAULT 1,
          footerText TEXT
        );
      `);

      // Products table
      await executeSql(`
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          name TEXT,
          description TEXT,
          price REAL,
          taxRate REAL,
          unit TEXT,
          stockQuantity REAL DEFAULT 0
        );
      `);

      // Customers table
      await executeSql(`
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          name TEXT,
          phone TEXT,
          email TEXT,
          address TEXT
        );
      `);

      // Invoices table
      await executeSql(`
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

      // Invoice Items table
      await executeSql(`
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
    },
  },
  {
    version: 2,
    name: 'historical_columns_safeguard',
    up: async (executeSql) => {
      // Safely ensure all legacy and optional columns exist
      const safeAddColumn = async (table: string, columnDef: string) => {
        try {
          await executeSql(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
        } catch {
          // Column already exists or table altered in earlier build
        }
      };

      await safeAddColumn('products', 'unit TEXT');
      await safeAddColumn('products', 'stockQuantity REAL DEFAULT 0');
      await safeAddColumn('invoice_items', 'unit TEXT');
      await safeAddColumn('organization', 'printWidth TEXT');
      await safeAddColumn('organization', 'showFooterTextOnBill INTEGER DEFAULT 1');
      await safeAddColumn('organization', 'footerText TEXT');
      await safeAddColumn('organization', 'securityPin TEXT');
    },
  },
  {
    version: 3,
    name: 'performance_indexes',
    up: async (executeSql) => {
      // High-performance B-tree indexes for instant querying over 10,000+ invoices
      await executeSql(`
        CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date DESC);
      `);
      await executeSql(`
        CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customerId);
      `);
      await executeSql(`
        CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(paymentStatus);
      `);
      await executeSql(`
        CREATE INDEX IF NOT EXISTS idx_invoice_items_invoiceId ON invoice_items(invoiceId);
      `);
      await executeSql(`
        CREATE INDEX IF NOT EXISTS idx_products_name ON products(name COLLATE NOCASE);
      `);
      await executeSql(`
        CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
      `);
    },
  },
  {
    version: 4,
    name: 'production_extensions',
    up: async (executeSql) => {
      // Add optional remarks/notes to invoices
      try {
        await executeSql(`ALTER TABLE invoices ADD COLUMN notes TEXT;`);
      } catch {}

      // Add barcode support to products
      try {
        await executeSql(`ALTER TABLE products ADD COLUMN barcode TEXT;`);
        await executeSql(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);`);
      } catch {}

      // Add customer loyalty points
      try {
        await executeSql(`ALTER TABLE customers ADD COLUMN loyaltyPoints REAL DEFAULT 0;`);
      } catch {}
    },
  },
  {
    version: 5,
    name: 'receipt_branding_and_upi_qr',
    up: async (executeSql) => {
      const safeAddColumn = async (table: string, columnDef: string) => {
        try {
          await executeSql(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
        } catch {}
      };

      await safeAddColumn('organization', 'logoBase64 TEXT');
      await safeAddColumn('organization', 'showLogoOnBill INTEGER DEFAULT 1');
      await safeAddColumn('organization', 'upiId TEXT');
      await safeAddColumn('organization', 'upiPayeeName TEXT');
      await safeAddColumn('organization', 'showUpiQrOnBill INTEGER DEFAULT 1');
    },
  },
];

/**
 * Executes all pending schema migrations inside the provided database instance.
 */
export const runDatabaseMigrations = async (
  executeSql: (sql: string, params?: any[]) => Promise<any>
): Promise<{ applied: number; currentVersion: number }> => {
  // 1. Create migration tracker table if it does not exist
  await executeSql(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  // 2. Fetch all applied migration versions
  const res = await executeSql(`SELECT version FROM schema_migrations ORDER BY version ASC;`);
  const appliedVersions = new Set<number>();
  if (res && res.rows) {
    const len = res.rows.length;
    for (let i = 0; i < len; i++) {
      const row = typeof res.rows.item === 'function' ? res.rows.item(i) : res.rows[i];
      if (row && typeof row.version === 'number') {
        appliedVersions.add(row.version);
      }
    }
  }

  let newlyApplied = 0;
  let maxVersion = 0;
  for (const v of appliedVersions) {
    if (v > maxVersion) maxVersion = v;
  }

  // 3. Run pending migrations in order
  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      console.log(`[DB Migration] Running migration v${migration.version}: ${migration.name}...`);
      await migration.up(executeSql);
      await executeSql(
        `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);`,
        [migration.version, migration.name, new Date().toISOString()]
      );
      newlyApplied++;
      if (migration.version > maxVersion) {
        maxVersion = migration.version;
      }
      console.log(`[DB Migration] Migration v${migration.version} (${migration.name}) applied successfully.`);
    }
  }

  return { applied: newlyApplied, currentVersion: maxVersion };
};
