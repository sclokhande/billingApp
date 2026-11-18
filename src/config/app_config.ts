export const APP_CONFIG = {
  // When isMock is true, the app assigns and loads realistic mock data for testing/demo
  isMock: false,
  IS_MOCK: false,

  // Toggle IS_DEMO_MODE to true for Demo Version build, or false for Full Version build
  IS_DEMO_MODE: true,

  // Restrictions applicable when IS_DEMO_MODE is true
  DEMO_LIMITS: {
    MAX_INVOICES: 10,
    MAX_CUSTOMERS: 5,
    MAX_PRODUCTS: 10,
  },

  DEMO_MESSAGES: {
    INVOICE_LIMIT: 'Demo Version Limit: You can create a maximum of 3 invoices in the Demo build.',
    CUSTOMER_LIMIT: 'Demo Version Limit: You can add a maximum of 1 customer in the Demo build.',
    PRODUCT_LIMIT: 'Demo Version Limit: You can add a maximum of 3 inventory products in the Demo build.',
    ORG_LOCKED: 'Demo Version: Organization profile details are locked and cannot be edited.',
    EXPORT_IMPORT_DISABLED: 'Demo Version: Backup Export & Import features are disabled in the Demo build.',
    PRINTING_DISABLED: 'Demo Version: Thermal Receipt Printing is disabled in the Demo build.',
  },

  // First-Time Device Activation Configuration (Cryptographically Hashed)
  REQUIRE_ACTIVATION_PIN: true,
  ACTIVATION_PIN_HASH: '9ba591067a890218f1aa1ec232ccbd75e2702b8a554394ba9bdafa099b318026',
  ACTIVATION_STORAGE_KEY: '@parchiwala_app_activated_v1',

  // 720-Hour (30-Day) Printer Security Lock Configuration
  PRINTER_SECURITY_LOCK: {
    ENABLED: true,
    LOCK_THRESHOLD_HOURS: 720,//720,
    MASTER_UNLOCK_GRACE_HOURS: 48,//48,
    FIRST_INSTALL_GRACE_HOURS: 24,//24,
    MASTER_PASSWORD_HASH: 'b94e393a80da30c7fcce8316bda59661d962e1c8986c2bc3090b42eca4c4be0d',
    STORAGE_KEYS: {
      LAST_CONNECTED_TIMESTAMP: '@parchiwala_printer_last_connected_time',
      REGISTERED_PRINTER_MAC: '@parchiwala_registered_printer_mac',
      REGISTERED_PRINTER_NAME: '@parchiwala_registered_printer_name',
      IS_LOCKED_FLAG: '@parchiwala_printer_is_locked',
      MASTER_UNLOCKED_TIMESTAMP: '@parchiwala_printer_master_unlocked_time',
      FEATURE_ENABLED_OVERRIDE: '@parchiwala_printer_lock_feature_enabled',
      APP_INSTALLED_AT: '@parchiwala_app_installed_at',
      CLOCK_HIGH_WATERMARK: '@parchiwala_clock_high_watermark',
      LOCK_STATE_CHECKSUM: '@parchiwala_printer_lock_checksum',
    },
  },
};

export const isDemoMode = () => APP_CONFIG.IS_DEMO_MODE;
export const isMockEnabled = () => Boolean(APP_CONFIG.isMock || APP_CONFIG.IS_MOCK);
