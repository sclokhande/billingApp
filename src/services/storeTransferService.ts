import AsyncStorage from '@react-native-async-storage/async-storage';
import { Invoice, InvoiceItem, Product, Customer, Organization } from '../db/types';
import { getFileTimestamp } from './exportService';
import { encryptSensitiveField, decryptSensitiveField, isEncryptedField } from '../utils/cryptoSecurity';

export const getDevicePlatformString = (): string => {
  try {
    const { Platform } = require('react-native');
    if (Platform && Platform.OS) {
      return `${Platform.OS.toUpperCase()}${Platform.Version ? ` (${Platform.Version})` : ''}`;
    }
  } catch {
    // Fallback in node or non-RN environments
  }
  return 'Mobile Device';
};

export const ROLLBACK_STORAGE_KEY = '@parchiwala_pre_transfer_rollback';

export interface StoreTransferSummary {
  storeName: string;
  storeGstNumber?: string;
  storePhone?: string;
  totalProducts: number;
  totalCustomers: number;
  totalInvoices: number;
  totalInvoiceItems: number;
  lastInvoiceNumber: string;
  nextSuggestedInvoiceNumber: string;
  transferredAt: string;
  sourceDevice: string;
  hasPinProtection: boolean;
}

export interface StoreTransferPackage {
  version: string;
  exportType: 'store_transfer_package';
  exportedAt: string;
  sourceDevice: string;
  summary: StoreTransferSummary;
  data: {
    organization: Organization | null;
    products: Product[];
    customers: Customer[];
    invoices: Invoice[];
    invoiceItems: InvoiceItem[];
  };
  verificationHash: string;
}

export interface ValidationResult {
  isValid: boolean;
  summary?: StoreTransferSummary;
  packageData?: {
    organization: Organization | null;
    products: Product[];
    customers: Customer[];
    invoices: Invoice[];
    invoiceItems: InvoiceItem[];
  };
  data?: {
    organization: Organization | null;
    products: Product[];
    customers: Customer[];
    invoices: Invoice[];
    invoiceItems: InvoiceItem[];
  };
  error?: string;
}

/**
 * Determine the last invoice number and next suggested invoice number
 */
export const calculateInvoiceSequences = (
  invoices: Invoice[]
): { lastInvoiceNumber: string; nextSuggestedInvoiceNumber: string } => {
  const safeList = Array.isArray(invoices) ? invoices : [];
  if (safeList.length === 0) {
    const currentYear = new Date().getFullYear();
    return {
      lastInvoiceNumber: 'None (Fresh Store)',
      nextSuggestedInvoiceNumber: `INV-${currentYear}-0001`,
    };
  }

  // Find the invoice with highest sequence number if possible
  let maxSeq = safeList.length;
  let lastInvNum = safeList[safeList.length - 1]?.invoiceNumber || `INV-${safeList.length}`;

  const currentYear = new Date().getFullYear();
  for (const inv of safeList) {
    if (inv?.invoiceNumber) {
      const match = inv.invoiceNumber.match(/(\d+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
          lastInvNum = inv.invoiceNumber;
        }
      }
    }
  }

  const nextNum = maxSeq + 1;
  const nextSuggested = `INV-${currentYear}-${String(nextNum).padStart(4, '0')}`;

  return {
    lastInvoiceNumber: lastInvNum,
    nextSuggestedInvoiceNumber: nextSuggested,
  };
};

/**
 * Simple verification hash to detect file corruption during WhatsApp/Drive sharing
 */
export const computePackageHash = (
  orgName: string,
  prodCount: number,
  custCount: number,
  invCount: number,
  timestamp: string
): string => {
  const payload = `${orgName}::${prodCount}::${custCount}::${invCount}::${timestamp}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `PKG-${Math.abs(hash).toString(16).toUpperCase()}`;
};

/**
 * Generate a complete Device Switch & Store Transfer package
 */
export const generateStoreTransferPackage = (data: {
  organization: Organization | null;
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
}): {
  content: string;
  filename: string;
  mimeType: string;
  summary: StoreTransferSummary;
} => {
  const safeOrg = data.organization || null;
  const safeProducts = Array.isArray(data.products) ? data.products : [];
  const safeCustomers = Array.isArray(data.customers) ? data.customers : [];
  const safeInvoices = Array.isArray(data.invoices) ? data.invoices : [];
  const safeItems = Array.isArray(data.invoiceItems) ? data.invoiceItems : [];

  const storeName = safeOrg?.name || 'My Store';
  const timestamp = new Date().toISOString();
  const device = getDevicePlatformString();
  const sequences = calculateInvoiceSequences(safeInvoices);

  const hash = computePackageHash(
    storeName,
    safeProducts.length,
    safeCustomers.length,
    safeInvoices.length,
    timestamp
  );

  const summary: StoreTransferSummary = {
    storeName,
    storeGstNumber: safeOrg?.gstNumber,
    storePhone: safeOrg?.phone || safeOrg?.mobile,
    totalProducts: safeProducts.length,
    totalCustomers: safeCustomers.length,
    totalInvoices: safeInvoices.length,
    totalInvoiceItems: safeItems.length,
    lastInvoiceNumber: sequences.lastInvoiceNumber,
    nextSuggestedInvoiceNumber: sequences.nextSuggestedInvoiceNumber,
    transferredAt: timestamp,
    sourceDevice: device,
    hasPinProtection: !!safeOrg?.securityPin,
  };

  const pkg: StoreTransferPackage = {
    version: '1.0',
    exportType: 'store_transfer_package',
    exportedAt: timestamp,
    sourceDevice: device,
    summary,
    data: {
      organization: safeOrg,
      products: safeProducts,
      customers: safeCustomers,
      invoices: safeInvoices,
      invoiceItems: safeItems,
    },
    verificationHash: hash,
  };

  const sanitizedStore = storeName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
  const filename = `StoreTransfer_${sanitizedStore}_${getFileTimestamp()}.json`;

  return {
    content: JSON.stringify(pkg, null, 2),
    filename,
    mimeType: 'application/json',
    summary,
  };
};

/**
 * Generate an encrypted store transfer package for high-security environments
 */
export const generateEncryptedStoreTransferPackage = (data: {
  organization: Organization | null;
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
}): {
  content: string;
  filename: string;
  mimeType: string;
  summary: StoreTransferSummary;
} => {
  const plainPkg = generateStoreTransferPackage(data);
  const encryptedPayload = encryptSensitiveField(plainPkg.content, 'PARCHIWALA_STORE_TRANSFER');
  const filename = plainPkg.filename.replace(/\.json$/, '.enc.json');
  return {
    ...plainPkg,
    content: encryptedPayload,
    filename,
  };
};

/**
 * Validate and parse a transfer package (supports both dedicated store_transfer_package,
 * encrypted packages, and legacy full database backups for maximum compatibility)
 */
export const validateAndParseTransferPackage = (rawJson: string): ValidationResult => {
  if (!rawJson || typeof rawJson !== 'string' || !rawJson.trim()) {
    return { isValid: false, error: 'Empty or invalid file content.' };
  }

  // Remove potential UTF-8 BOM and trim whitespace
  let cleanJson = rawJson.replace(/^\uFEFF/, '').trim();

  // If payload is encrypted at rest, decrypt it transparently
  if (cleanJson.startsWith('ENC:v1:')) {
    cleanJson = decryptSensitiveField(cleanJson, 'PARCHIWALA_STORE_TRANSFER');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJson);
  } catch {
    return { isValid: false, error: 'File is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { isValid: false, error: 'Invalid file format.' };
  }

  // Handle envelope wrapper if present (e.g. { content: string | object, filename, mimeType, summary })
  if (parsed.content) {
    if (typeof parsed.content === 'string') {
      try {
        const unwrapped = JSON.parse(parsed.content.replace(/^\uFEFF/, '').trim());
        if (unwrapped && typeof unwrapped === 'object') {
          parsed = unwrapped;
        }
      } catch {
        // Keep parsed as is if inner JSON string fails to parse
      }
    } else if (typeof parsed.content === 'object') {
      parsed = parsed.content;
    }
  }

  // Fallback organization if not present in raw file
  const defaultOrg: Organization = {
    id: 'org_default',
    name: 'My Store',
    currency: '₹',
    address: '',
    phone: '',
    mobile: '',
    email: '',
    slogan: '',
    gstNumber: '',
    showGstOnBill: false,
  };

  // Format 1: Dedicated StoreTransferPackage
  if (parsed.exportType === 'store_transfer_package' && parsed.data) {
    const org = parsed.data.organization || defaultOrg;
    const prods = Array.isArray(parsed.data.products) ? parsed.data.products : [];
    const custs = Array.isArray(parsed.data.customers) ? parsed.data.customers : [];
    const invs = Array.isArray(parsed.data.invoices) ? parsed.data.invoices : [];
    const items = Array.isArray(parsed.data.invoiceItems) ? parsed.data.invoiceItems : [];
    const seq = calculateInvoiceSequences(invs);

    const summary: StoreTransferSummary = {
      storeName: parsed.summary?.storeName || org?.name || 'Transferred Store',
      storeGstNumber: parsed.summary?.storeGstNumber || org?.gstNumber || (org as any)?.gstin,
      storePhone: parsed.summary?.storePhone || org?.phone || org?.mobile,
      totalProducts: parsed.summary?.totalProducts ?? prods.length,
      totalCustomers: parsed.summary?.totalCustomers ?? custs.length,
      totalInvoices: parsed.summary?.totalInvoices ?? invs.length,
      totalInvoiceItems: parsed.summary?.totalInvoiceItems ?? items.length,
      lastInvoiceNumber: parsed.summary?.lastInvoiceNumber || seq.lastInvoiceNumber,
      nextSuggestedInvoiceNumber:
        parsed.summary?.nextSuggestedInvoiceNumber || seq.nextSuggestedInvoiceNumber,
      transferredAt: parsed.exportedAt || parsed.summary?.transferredAt || new Date().toISOString(),
      sourceDevice: parsed.sourceDevice || parsed.summary?.sourceDevice || 'Unknown Device',
      hasPinProtection: !!org?.securityPin,
    };

    const packageData = {
      organization: org,
      products: prods,
      customers: custs,
      invoices: invs,
      invoiceItems: items,
    };

    return {
      isValid: true,
      summary,
      packageData,
      data: packageData,
    };
  }

  // Format 2: Standard DatabaseBackup / full_database_backup
  if (
    parsed.organization &&
    (Array.isArray(parsed.products) || Array.isArray(parsed.invoices))
  ) {
    const org = parsed.organization || defaultOrg;
    const prods = Array.isArray(parsed.products) ? parsed.products : [];
    const custs = Array.isArray(parsed.customers) ? parsed.customers : [];
    const invs = Array.isArray(parsed.invoices) ? parsed.invoices : [];
    const items = Array.isArray(parsed.invoiceItems) ? parsed.invoiceItems : [];

    const seq = calculateInvoiceSequences(invs);
    const summary: StoreTransferSummary = {
      storeName: org?.name || 'Transferred Store',
      storeGstNumber: org?.gstNumber || (org as any)?.gstin,
      storePhone: org?.phone || org?.mobile,
      totalProducts: prods.length,
      totalCustomers: custs.length,
      totalInvoices: invs.length,
      totalInvoiceItems: items.length,
      lastInvoiceNumber: seq.lastInvoiceNumber,
      nextSuggestedInvoiceNumber: seq.nextSuggestedInvoiceNumber,
      transferredAt: parsed.exportedAt || new Date().toISOString(),
      sourceDevice: 'Parchiwala Backup File',
      hasPinProtection: !!org?.securityPin,
    };

    const packageData = {
      organization: org,
      products: prods,
      customers: custs,
      invoices: invs,
      invoiceItems: items,
    };

    return {
      isValid: true,
      summary,
      packageData,
      data: packageData,
    };
  }

  // Format 3: Top-level data object with organization or records
  if (
    parsed.data &&
    typeof parsed.data === 'object' &&
    (parsed.data.organization || Array.isArray(parsed.data.products) || Array.isArray(parsed.data.invoices))
  ) {
    const org = parsed.data.organization || defaultOrg;
    const prods = Array.isArray(parsed.data.products) ? parsed.data.products : [];
    const custs = Array.isArray(parsed.data.customers) ? parsed.data.customers : [];
    const invs = Array.isArray(parsed.data.invoices) ? parsed.data.invoices : [];
    const items = Array.isArray(parsed.data.invoiceItems) ? parsed.data.invoiceItems : [];

    const seq = calculateInvoiceSequences(invs);
    const summary: StoreTransferSummary = {
      storeName: parsed.summary?.storeName || org?.name || 'Transferred Store',
      storeGstNumber: parsed.summary?.storeGstNumber || org?.gstNumber || (org as any)?.gstin,
      storePhone: parsed.summary?.storePhone || org?.phone || org?.mobile,
      totalProducts: parsed.summary?.totalProducts ?? prods.length,
      totalCustomers: parsed.summary?.totalCustomers ?? custs.length,
      totalInvoices: parsed.summary?.totalInvoices ?? invs.length,
      totalInvoiceItems: parsed.summary?.totalInvoiceItems ?? items.length,
      lastInvoiceNumber: parsed.summary?.lastInvoiceNumber || seq.lastInvoiceNumber,
      nextSuggestedInvoiceNumber:
        parsed.summary?.nextSuggestedInvoiceNumber || seq.nextSuggestedInvoiceNumber,
      transferredAt: parsed.exportedAt || parsed.summary?.transferredAt || new Date().toISOString(),
      sourceDevice: parsed.sourceDevice || parsed.summary?.sourceDevice || 'Store Transfer',
      hasPinProtection: !!org?.securityPin,
    };

    const packageData = {
      organization: org,
      products: prods,
      customers: custs,
      invoices: invs,
      invoiceItems: items,
    };

    return {
      isValid: true,
      summary,
      packageData,
      data: packageData,
    };
  }

  // Format 4: Organization object at top level (e.g. minimal export)
  if (parsed.organization && typeof parsed.organization === 'object') {
    const org = parsed.organization;
    const prods = Array.isArray(parsed.products) ? parsed.products : [];
    const custs = Array.isArray(parsed.customers) ? parsed.customers : [];
    const invs = Array.isArray(parsed.invoices) ? parsed.invoices : [];
    const items = Array.isArray(parsed.invoiceItems) ? parsed.invoiceItems : [];

    const seq = calculateInvoiceSequences(invs);
    const summary: StoreTransferSummary = {
      storeName: org?.name || 'Transferred Store',
      storeGstNumber: org?.gstNumber || (org as any)?.gstin,
      storePhone: org?.phone || org?.mobile,
      totalProducts: prods.length,
      totalCustomers: custs.length,
      totalInvoices: invs.length,
      totalInvoiceItems: items.length,
      lastInvoiceNumber: seq.lastInvoiceNumber,
      nextSuggestedInvoiceNumber: seq.nextSuggestedInvoiceNumber,
      transferredAt: parsed.exportedAt || new Date().toISOString(),
      sourceDevice: 'Parchiwala Store File',
      hasPinProtection: !!org?.securityPin,
    };

    const packageData = {
      organization: org,
      products: prods,
      customers: custs,
      invoices: invs,
      invoiceItems: items,
    };

    return {
      isValid: true,
      summary,
      packageData,
      data: packageData,
    };
  }

  return {
    isValid: false,
    error:
      'The selected file is not a valid Parchiwala Store Transfer package or database backup.',
  };
};

/**
 * Save an emergency rollback snapshot to AsyncStorage before applying a store transfer
 */
export const saveRollbackSnapshot = async (currentData: {
  organization: Organization | null;
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
}): Promise<void> => {
  try {
    const snapshot = {
      savedAt: new Date().toISOString(),
      data: currentData,
      summary: {
        storeName: currentData.organization?.name || 'Local Store',
        totalProducts: (currentData.products || []).length,
        totalCustomers: (currentData.customers || []).length,
        totalInvoices: (currentData.invoices || []).length,
      },
    };
    await AsyncStorage.setItem(ROLLBACK_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('[StoreTransfer] Failed to save rollback snapshot:', err);
  }
};

/**
 * Check if a pre-transfer rollback snapshot exists on this device
 */
export const getRollbackSnapshot = async (): Promise<{
  exists: boolean;
  savedAt?: string;
  summary?: any;
  data?: any;
}> => {
  try {
    const raw = await AsyncStorage.getItem(ROLLBACK_STORAGE_KEY);
    if (!raw) return { exists: false };
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data) {
      return {
        exists: true,
        savedAt: parsed.savedAt,
        summary: parsed.summary,
        data: parsed.data,
      };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
};

/**
 * Clear the rollback snapshot
 */
export const clearRollbackSnapshot = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(ROLLBACK_STORAGE_KEY);
  } catch (err) {
    console.warn('[StoreTransfer] Error removing rollback snapshot:', err);
  }
};
