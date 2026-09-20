export const APP_CONFIG = {
  // Toggle IS_DEMO_MODE to true for Demo Version build, or false for Full Version build
  IS_DEMO_MODE: false,

  // Restrictions applicable when IS_DEMO_MODE is true
  DEMO_LIMITS: {
    MAX_INVOICES: 3,
    MAX_CUSTOMERS: 1,
    MAX_PRODUCTS: 3,
  },

  DEMO_MESSAGES: {
    INVOICE_LIMIT: 'Demo Version Limit: You can create a maximum of 3 invoices in the Demo build.',
    CUSTOMER_LIMIT: 'Demo Version Limit: You can add a maximum of 1 customer in the Demo build.',
    PRODUCT_LIMIT: 'Demo Version Limit: You can add a maximum of 3 inventory products in the Demo build.',
    ORG_LOCKED: 'Demo Version: Organization profile details are locked and cannot be edited.',
    EXPORT_IMPORT_DISABLED: 'Demo Version: Backup Export & Import features are disabled in the Demo build.',
    PRINTING_DISABLED: 'Demo Version: Thermal Receipt Printing is disabled in the Demo build.',
  },

  // First-Time Device Activation Configuration
  REQUIRE_ACTIVATION_PIN: true,
  ACTIVATION_PIN: 'S5M26080688',
  ACTIVATION_STORAGE_KEY: '@parchiwala_app_activated_v1',
};

export const isDemoMode = () => APP_CONFIG.IS_DEMO_MODE;
