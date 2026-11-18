import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Organization, Product, Customer, Invoice, InvoiceItem } from '../db/types';
import {
  generateStoreTransferPackage,
  validateAndParseTransferPackage,
  StoreTransferSummary,
} from './storeTransferService';
import { getFileTimestamp } from './exportService';

export const AUTO_BACKUP_STORAGE_KEYS = {
  ENABLED: '@parchiwala_auto_backup_enabled',
  LAST_DAILY_DATE: '@parchiwala_last_daily_backup_date',
  LAST_BACKUP_META: '@parchiwala_last_backup_meta',
};

export interface LocalBackupItem {
  filename: string;
  filePath: string;
  size: number;
  mtime: Date;
  summary?: StoreTransferSummary;
  isValid: boolean;
  isDailyAuto: boolean;
}

/**
 * Returns RNFS instance safely across Android, iOS, and Jest test runner
 */
export const getRNFS = () => {
  try {
    return require('react-native-fs');
  } catch {
    return null;
  }
};

/**
 * Resolves persistent device backup directory outside of volatile cache.
 * On Android, uses Public/App Download directory; on iOS, uses Documents directory.
 */
export const getBackupDirectoryPath = async (): Promise<string> => {
  const RNFS = getRNFS();
  if (!RNFS) {
    return '/simulated/ParchiwalaBackups';
  }

  let basePath = RNFS.DocumentDirectoryPath;
  if (Platform.OS === 'android' && RNFS.DownloadDirectoryPath) {
    basePath = RNFS.DownloadDirectoryPath;
  }

  const backupDir = `${basePath}/ParchiwalaBackups`;
  try {
    const exists = await RNFS.exists(backupDir);
    if (!exists) {
      await RNFS.mkdir(backupDir);
    }
  } catch (err) {
    console.warn('[AutoBackup] Error ensuring backup directory:', err);
    // Fallback to Document directory if Download directory has restricted permissions
    if (RNFS.DocumentDirectoryPath && backupDir !== `${RNFS.DocumentDirectoryPath}/ParchiwalaBackups`) {
      const fallbackDir = `${RNFS.DocumentDirectoryPath}/ParchiwalaBackups`;
      try {
        const fbExists = await RNFS.exists(fallbackDir);
        if (!fbExists) await RNFS.mkdir(fallbackDir);
        return fallbackDir;
      } catch {}
    }
  }

  return backupDir;
};

/**
 * Checks if automated daily backups are enabled in user settings (default: true)
 */
export const isAutoBackupEnabled = async (): Promise<boolean> => {
  try {
    const val = await AsyncStorage.getItem(AUTO_BACKUP_STORAGE_KEYS.ENABLED);
    return val !== 'false';
  } catch {
    return true;
  }
};

export const setAutoBackupEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(AUTO_BACKUP_STORAGE_KEYS.ENABLED, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[AutoBackup] Error saving auto backup preference:', err);
  }
};

/**
 * Prunes historical backups to retain up to maxToKeep snapshots, preventing storage bloat
 */
export const pruneOldBackups = async (maxToKeep: number = 7): Promise<number> => {
  const RNFS = getRNFS();
  if (!RNFS) return 0;

  try {
    const dir = await getBackupDirectoryPath();
    const items = await RNFS.readDir(dir);
    const backupFiles = items
      .filter((it: any) => it.isFile() && (it.name.endsWith('.parchiwala') || it.name.endsWith('.json')))
      .sort((a: any, b: any) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

    if (backupFiles.length <= maxToKeep) {
      return 0;
    }

    const toDelete = backupFiles.slice(maxToKeep);
    let deletedCount = 0;
    for (const f of toDelete) {
      try {
        await RNFS.unlink(f.path);
        deletedCount++;
      } catch {}
    }
    return deletedCount;
  } catch (err) {
    console.warn('[AutoBackup] Error pruning old backups:', err);
    return 0;
  }
};

/**
 * Generates an encrypted/verified local backup file in device storage
 */
export const createEncryptedLocalBackup = async (
  data: {
    organization: Organization | null;
    products: Product[];
    customers: Customer[];
    invoices: Invoice[];
    invoiceItems: InvoiceItem[];
  },
  isManual: boolean = false
): Promise<{
  success: boolean;
  filePath?: string;
  filename?: string;
  recordCount: number;
  summary?: StoreTransferSummary;
  error?: string;
}> => {
  const RNFS = getRNFS();
  const pkg = generateStoreTransferPackage(data);
  const timestamp = getFileTimestamp();
  const orgNameClean = (data.organization?.name || 'store')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 14);

  const prefix = isManual ? 'ManualBackup' : 'AutoBackup';
  const filename = `Parchiwala_${prefix}_${orgNameClean}_${timestamp}.parchiwala`;

  if (!RNFS) {
    // Simulator / Jest environment
    await AsyncStorage.setItem(
      AUTO_BACKUP_STORAGE_KEYS.LAST_BACKUP_META,
      JSON.stringify({ filename, timestamp, isManual, recordCount: pkg.summary.totalInvoices })
    );
    return {
      success: true,
      filePath: `/simulated/${filename}`,
      filename,
      recordCount: pkg.summary.totalInvoices,
      summary: pkg.summary,
    };
  }

  try {
    const dir = await getBackupDirectoryPath();
    const filePath = `${dir}/${filename}`;

    await RNFS.writeFile(filePath, pkg.content, 'utf8');

    // Save metadata
    await AsyncStorage.setItem(
      AUTO_BACKUP_STORAGE_KEYS.LAST_BACKUP_META,
      JSON.stringify({
        filename,
        filePath,
        timestamp,
        isManual,
        summary: pkg.summary,
      })
    );

    // Prune older files if this is an automated backup
    if (!isManual) {
      await pruneOldBackups(7);
    }

    return {
      success: true,
      filePath,
      filename,
      recordCount: pkg.summary.totalInvoices,
      summary: pkg.summary,
    };
  } catch (err: any) {
    console.warn('[AutoBackup] Failed to write local backup file:', err);
    return {
      success: false,
      recordCount: 0,
      error: err?.message || 'Failed to save local backup file.',
    };
  }
};

/**
 * Checks if daily auto-backup is due today, and executes it transparently in the background
 */
export const checkAndRunDailyAutoBackup = async (data: {
  organization: Organization | null;
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
}): Promise<boolean> => {
  const enabled = await isAutoBackupEnabled();
  if (!enabled) return false;

  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const lastDate = await AsyncStorage.getItem(AUTO_BACKUP_STORAGE_KEYS.LAST_DAILY_DATE);

  if (lastDate === todayStr) {
    // Already backed up today
    return false;
  }

  console.log('[AutoBackup] Triggering automated daily backup for:', todayStr);
  const result = await createEncryptedLocalBackup(data, false);
  if (result.success) {
    await AsyncStorage.setItem(AUTO_BACKUP_STORAGE_KEYS.LAST_DAILY_DATE, todayStr);
    return true;
  }
  return false;
};

/**
 * Lists all existing local backups in the persistent storage folder
 */
export const listLocalBackups = async (): Promise<LocalBackupItem[]> => {
  const RNFS = getRNFS();
  if (!RNFS) return [];

  try {
    const dir = await getBackupDirectoryPath();
    const items = await RNFS.readDir(dir);
    const backupFiles = items.filter(
      (it: any) => it.isFile() && (it.name.endsWith('.parchiwala') || it.name.endsWith('.json'))
    );

    const results: LocalBackupItem[] = [];
    for (const f of backupFiles) {
      let summary: StoreTransferSummary | undefined;
      let isValid = false;

      try {
        const content = await RNFS.readFile(f.path, 'utf8');
        const validation = validateAndParseTransferPackage(content);
        if (validation.isValid) {
          isValid = true;
          summary = validation.summary;
        }
      } catch {}

      results.push({
        filename: f.name,
        filePath: f.path,
        size: f.size,
        mtime: new Date(f.mtime),
        summary,
        isValid,
        isDailyAuto: f.name.includes('AutoBackup'),
      });
    }

    return results.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch (err) {
    console.warn('[AutoBackup] Failed to list local backups:', err);
    return [];
  }
};

/**
 * Restores store data from a selected local backup file
 */
export const restoreFromLocalBackupFile = async (
  filePath: string,
  importDataFn: (data: any) => Promise<void>
): Promise<{ success: boolean; message: string; summary?: StoreTransferSummary }> => {
  const RNFS = getRNFS();
  if (!RNFS) {
    return { success: false, message: 'File system not available.' };
  }

  try {
    const content = await RNFS.readFile(filePath, 'utf8');
    const validation = validateAndParseTransferPackage(content);

    if (!validation.isValid || !validation.data) {
      return {
        success: false,
        message: validation.error || 'The backup file is invalid or corrupted.',
      };
    }

    await importDataFn(validation.data);

    return {
      success: true,
      message: `Store restored successfully from ${validation.summary?.storeName || 'backup'}!`,
      summary: validation.summary,
    };
  } catch (err: any) {
    console.warn('[AutoBackup] Error restoring local backup file:', err);
    return {
      success: false,
      message: err?.message || 'Failed to read and restore backup file.',
    };
  }
};
