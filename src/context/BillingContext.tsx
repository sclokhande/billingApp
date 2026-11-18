import React, { createContext, useContext, useState, useEffect } from 'react';
import { Organization, Product, Customer, Invoice } from '../db/types';
import { initDB } from '../db/db';
import * as dbOps from '../db/operations';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState } from 'react-native';
import { 
  BluetoothDevice, 
  connectBluetoothPrinter, 
  disconnectBluetoothPrinter, 
  printReceiptRaw, 
  printReceiptAsImageRaw,
  ReceiptImagePrintOptions,
  setConnectedPrinterState, 
  checkSystemServices,
  ensureBluetoothConnected,
  autoDetectAndConnectAuthorizedPrinter,
  isBatteryOptimizationIgnored,
  requestDisableBatteryOptimization as reqDisableBatteryOpt,
  queryPrinterTelemetry,
  PrinterTelemetryResult,
} from '../services/bluetoothPrinterService';
import {
  isAutoBackupEnabled,
  setAutoBackupEnabled,
  createEncryptedLocalBackup,
  listLocalBackups,
  restoreFromLocalBackupFile,
  checkAndRunDailyAutoBackup,
  LocalBackupItem,
} from '../services/autoBackupService';
import { ReceiptBrandingOptions } from '../utils/receiptBrandingService';
import {
  evaluatePrinterLockStatus,
  recordPrinterConnection,
  unlockWithMasterPassword,
  getRegisteredPrinter,
  PrinterLockStatus,
} from '../utils/printerLockManager';

import { APP_CONFIG } from '../config/app_config';

export type PrinterConnectionStatus = 'connected' | 'offline' | 'connecting';

interface BillingContextProps {
  isMock: boolean;
  isDemoMode: boolean;
  dbMode: string;
  organization: Organization;
  products: Product[];
  customers: Customer[];
  invoices: dbOps.InvoiceWithCustomerName[];
  isLoading: boolean;
  loadData: () => Promise<void>;
  resetToMockData: () => Promise<void>;
  updateOrgProfile: (org: Organization) => Promise<void>;
  saveProduct: (prod: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  saveCustomer: (cust: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  createInvoice: (invoice: Invoice, items: any[]) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  clearInvoicesOnly: () => Promise<void>;
  updateInvoicePaymentStatus: (id: string, status: 'Paid' | 'Unpaid') => Promise<void>;
  getAllInvoiceItems: () => Promise<any[]>;
  exportData: () => Promise<{ jsonStr: string; filename: string }>;
  importData: (jsonStrOrObj: string | any) => Promise<void>;
  connectedPrinter: BluetoothDevice | null;
  printerConnectionStatus: PrinterConnectionStatus;
  isPrinterConnecting: boolean;
  verifyAndAutoConnectPrinter: () => Promise<boolean>;
  connectPrinter: (device: BluetoothDevice) => Promise<boolean>;
  disconnectPrinter: () => Promise<void>;
  printReceipt: (text: string, navigation?: any, options?: ReceiptBrandingOptions) => Promise<boolean>;
  printReceiptAsImage: (text: string, navigation?: any, options?: ReceiptImagePrintOptions) => Promise<boolean>;
  verifyPrinterConnectionOrRedirect: (navigation: any) => Promise<boolean>;
  checkServicesStatus: () => Promise<{ bluetoothEnabled: boolean; locationEnabled: boolean }>;
  printerLockStatus: PrinterLockStatus | null;
  isPrinterLocked: boolean;
  checkPrinterLock: () => Promise<PrinterLockStatus>;
  unlockViaMasterPassword: (password: string) => Promise<{ success: boolean; message: string }>;
  reconnectRegisteredPrinter: () => Promise<{ success: boolean; message: string }>;
  getPaginatedInvoices: (options?: dbOps.InvoicePaginationOptions) => Promise<dbOps.PaginatedResult<dbOps.InvoiceWithCustomerName>>;
  getDashboardMetrics: () => Promise<dbOps.DashboardMetrics>;
  getTodayInvoices: () => Promise<dbOps.InvoiceWithCustomerName[]>;
  isBatteryOptimized: boolean;
  checkBatteryOptimizationStatus: () => Promise<boolean>;
  requestDisableBatteryOptimization: () => Promise<boolean>;
  printerTelemetry: PrinterTelemetryResult | null;
  checkPrinterTelemetry: () => Promise<PrinterTelemetryResult>;
  autoBackupEnabled: boolean;
  toggleAutoBackup: (enabled: boolean) => Promise<void>;
  createLocalBackup: (isManual?: boolean) => Promise<{ success: boolean; filePath?: string; filename?: string; recordCount: number; error?: string }>;
  listLocalBackups: () => Promise<LocalBackupItem[]>;
  restoreLocalBackup: (filePath: string) => Promise<{ success: boolean; message: string }>;
}

const BillingContext = createContext<BillingContextProps | undefined>(undefined);

export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbMode, setDbMode] = useState<string>('UNKNOWN');
  const [organization, setOrganization] = useState<Organization>(dbOps.DEFAULT_ORG);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<dbOps.InvoiceWithCustomerName[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [connectedPrinter, setConnectedPrinter] = useState<BluetoothDevice | null>(null);
  const [printerConnectionStatus, setPrinterConnectionStatus] = useState<PrinterConnectionStatus>('connecting');
  const [isPrinterConnecting, setIsPrinterConnecting] = useState<boolean>(false);
  const [printerLockStatus, setPrinterLockStatus] = useState<PrinterLockStatus | null>(null);
  const [isPrinterLocked, setIsPrinterLocked] = useState<boolean>(false);

  // Production hardening states: Battery optimization, hardware telemetry, auto backup
  const [isBatteryOptimized, setIsBatteryOptimized] = useState<boolean>(false);
  const [printerTelemetry, setPrinterTelemetry] = useState<PrinterTelemetryResult | null>(null);
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState<boolean>(true);

  const isConnectingRef = React.useRef(false);
  const lastLowBatteryAlertTimeRef = React.useRef<number>(0);

  /**
   * Evaluates printer battery level from telemetry.
   * If below 20% and not currently charging, displays an alert dialog to the merchant.
   * Includes a 30-minute anti-spam cooldown so normal billing operations are not repeatedly disrupted.
   */
  const checkAndAlertLowBattery = (telemetry: PrinterTelemetryResult | null | undefined) => {
    if (!telemetry || telemetry.batteryLevel === null || telemetry.batteryLevel === undefined) {
      return;
    }
    if (telemetry.batteryLevel < 20 && !telemetry.isCharging) {
      const now = Date.now();
      if (now - lastLowBatteryAlertTimeRef.current > 30 * 60 * 1000) {
        lastLowBatteryAlertTimeRef.current = now;
        Alert.alert(
          '⚠️ Thermal Printer Battery Low',
          `Your thermal printer battery is at ${telemetry.batteryLevel}%. Please connect the charger to your printer for better performance and uninterrupted printing.`,
          [{ text: 'OK' }]
        );
      }
    }
  };

  const isMock = Boolean(APP_CONFIG.isMock || APP_CONFIG.IS_MOCK);

  /**
   * Verifies live physical printer connection status.
   * If disconnected or offline, immediately sets status to 'offline' (displaying on Dashboard)
   * and launches an asynchronous background connection to any authorized nearby Parchiwala printer.
   */
  const verifyAndAutoConnectPrinter = async (): Promise<boolean> => {
    if (isConnectingRef.current) {
      return false;
    }
    isConnectingRef.current = true;
    setIsPrinterConnecting(true);

    try {
      // 0. Guard: On First-Time App Activation page, strictly do not run scan or connect functionality
      if (APP_CONFIG.REQUIRE_ACTIVATION_PIN) {
        try {
          const isActivated = await AsyncStorage.getItem(APP_CONFIG.ACTIVATION_STORAGE_KEY);
          if (isActivated !== 'true') {
            console.log('[BillingContext] App not activated. Bluetooth scan/connect disabled on Activation page.');
            setPrinterConnectionStatus('offline');
            return false;
          }
        } catch (e) {
          console.warn('[BillingContext] Error checking activation state:', e);
        }
      }

      // 1. Verify device Bluetooth service is enabled
      const { bluetoothEnabled } = await checkSystemServices();
      if (!bluetoothEnabled) {
        console.log('[BillingContext] Bluetooth service disabled -> Printer Offline');
        setPrinterConnectionStatus('offline');
        return false;
      }

      // 2. Identify candidate printer (from active state or saved storage)
      let candidate: BluetoothDevice | null = connectedPrinter;
      if (!candidate) {
        const savedPrinterStr = await AsyncStorage.getItem('connected_printer');
        if (savedPrinterStr) {
          try {
            candidate = JSON.parse(savedPrinterStr);
          } catch {}
        }
      }

      // 3. Fast probe physical socket if candidate is available
      if (candidate) {
        const connCheck = await ensureBluetoothConnected(candidate);
        if (connCheck.ok) {
          console.log('[BillingContext] Printer is ONLINE and verified:', candidate.name);
          setConnectedPrinter({ ...candidate, connected: true });
          setConnectedPrinterState({ ...candidate, connected: true });
          setPrinterConnectionStatus('connected');
          await recordPrinterConnection(candidate);
          const lockStatus = await evaluatePrinterLockStatus();
          setPrinterLockStatus(lockStatus);
          setIsPrinterLocked(lockStatus.isLocked);
          queryPrinterTelemetry(candidate).then((telemetry) => {
            setPrinterTelemetry(telemetry);
            checkAndAlertLowBattery(telemetry);
          }).catch(() => {});
          return true;
        }
      }

      // 4. Physical socket probe failed or no candidate -> Mark OFFLINE immediately!
      console.warn('[BillingContext] Printer is offline or unreachable. Displaying OFFLINE on dashboard.');
      setPrinterTelemetry(null);
      setPrinterConnectionStatus('offline');

      // 5. Attempt background auto-connect to nearby authorized printer
      console.log('[BillingContext] Attempting background auto-connect to authorized printer...');
      setPrinterConnectionStatus('connecting');
      const result = await autoDetectAndConnectAuthorizedPrinter();
      if (result.success && result.device) {
        console.log('[BillingContext] Background auto-connect SUCCESS:', result.device.name);
        setConnectedPrinter({ ...result.device, connected: true });
        setConnectedPrinterState({ ...result.device, connected: true });
        await AsyncStorage.setItem('connected_printer', JSON.stringify({ ...result.device, connected: true }));
        setPrinterConnectionStatus('connected');
        await recordPrinterConnection(result.device);
        const lockStatus = await evaluatePrinterLockStatus();
        setPrinterLockStatus(lockStatus);
        setIsPrinterLocked(lockStatus.isLocked);
        queryPrinterTelemetry(result.device).then((telemetry) => {
          setPrinterTelemetry(telemetry);
          checkAndAlertLowBattery(telemetry);
        }).catch(() => {});
        return true;
      } else {
        console.log('[BillingContext] Background auto-connect could not find printer. Remains OFFLINE.');
        setPrinterTelemetry(null);
        setPrinterConnectionStatus('offline');
        return false;
      }
    } catch (e) {
      console.warn('[BillingContext] verifyAndAutoConnectPrinter error:', e);
      setPrinterTelemetry(null);
      setPrinterConnectionStatus('offline');
      return false;
    } finally {
      setIsPrinterConnecting(false);
      isConnectingRef.current = false;
    }
  };

  // Initialize DB and fetch data on mount
  useEffect(() => {
    const startup = async () => {
      try {
        setIsLoading(true);
        const mode = await initDB();
        setDbMode(mode);
        
        // Seed database (if empty or if isMock is enabled)
        if (isMock) {
          const mockSeeded = await AsyncStorage.getItem('@parchiwala_mock_seeded');
          if (mockSeeded !== 'true') {
            await dbOps.seedMockDatabase(true);
          } else {
            await dbOps.seedDatabase();
          }
        } else {
          await dbOps.seedDatabase();
        }
        
        // Load operational data
        await loadData();

        // Load configured printer candidate from AsyncStorage
        const savedPrinter = await AsyncStorage.getItem('connected_printer');
        if (savedPrinter) {
          try {
            const parsed = JSON.parse(savedPrinter);
            setConnectedPrinter(parsed);
            setConnectedPrinterState(parsed);
          } catch (e) {
            console.warn('Failed to restore saved printer state:', e);
          }
        }

        // Initialize 48-hour printer security lock status
        try {
          const initialLock = await evaluatePrinterLockStatus();
          setPrinterLockStatus(initialLock);
          setIsPrinterLocked(initialLock.isLocked);
        } catch (e) {
          console.error('[BillingContext] Error evaluating printer lock status on startup:', e);
        }
      } catch (error) {
        console.error('Database startup failure:', error);
      } finally {
        setIsLoading(false);
      }

      // Check printer status on startup, display offline if disconnected, and auto-connect in background
      setTimeout(() => {
        verifyAndAutoConnectPrinter().catch(() => {});
      }, 350);

      // Query Android battery optimization status and backup preference
      isBatteryOptimizationIgnored().then((isIgnored) => {
        setIsBatteryOptimized(!isIgnored);
      }).catch(() => {});
      isAutoBackupEnabled().then(setAutoBackupEnabledState).catch(() => {});
    };
    startup();

    // AppState listener: Check printer status every time the app is reopened from background
    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        try {
          const status = await evaluatePrinterLockStatus();
          setPrinterLockStatus(status);
          setIsPrinterLocked(status.isLocked);
        } catch {
          // Silently handle background lock evaluation
        }
        // Verify printer connection on every app reopen and auto-connect in background if offline
        verifyAndAutoConnectPrinter().catch(() => {});

        // Re-check battery optimization status
        isBatteryOptimizationIgnored().then((isIgnored) => {
          setIsBatteryOptimized(!isIgnored);
        }).catch(() => {});
      }
    });

    const lockInterval = setInterval(async () => {
      try {
        const status = await evaluatePrinterLockStatus();
        setPrinterLockStatus(status);
        setIsPrinterLocked(status.isLocked);
      } catch {
        // Silently handle background lock evaluation
      }
    }, 10 * 60 * 1000); // Check every 10 minutes

    return () => {
      appStateSub.remove();
      clearInterval(lockInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      let org = await dbOps.getOrganization();
      let prods = await dbOps.getProducts();
      let custs = await dbOps.getCustomers();
      let invs = await dbOps.getInvoices();

      // If mock mode is enabled but no products exist, auto-seed mock data
      if (isMock && prods.length === 0) {
        await dbOps.seedMockDatabase(true);
        org = await dbOps.getOrganization();
        prods = await dbOps.getProducts();
        custs = await dbOps.getCustomers();
        invs = await dbOps.getInvoices();
      }

      setOrganization(org);
      setProducts(prods);
      setCustomers(custs);
      setInvoices(invs);

      // Perform daily background backup check outside of private sandbox
      if (org && (prods.length > 0 || invs.length > 0)) {
        dbOps.getAllInvoiceItems().then((items) => {
          checkAndRunDailyAutoBackup({
            organization: org,
            products: prods,
            customers: custs,
            invoices: invs,
            invoiceItems: items,
          }).catch(() => {});
        }).catch(() => {});
      }
    } catch (e) {
      console.error('Error fetching database records:', e);
    }
  };

  const resetToMockData = async () => {
    try {
      setIsLoading(true);
      await dbOps.seedMockDatabase(true);
      await loadData();
    } catch (e) {
      console.error('Error resetting to mock data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const updateOrgProfile = async (org: Organization) => {
    if (APP_CONFIG.IS_DEMO_MODE) {
      Alert.alert('Demo Version', APP_CONFIG.DEMO_MESSAGES.ORG_LOCKED);
      throw new Error(APP_CONFIG.DEMO_MESSAGES.ORG_LOCKED);
    }
    if (isPrinterLocked) {
      Alert.alert('Terminal Locked', 'Store profile editing is disabled while terminal is locked.');
      throw new Error('Terminal Locked');
    }
    try {
      setIsLoading(true);
      await dbOps.saveOrganization(org);
      setOrganization(org);
    } finally {
      setIsLoading(false);
    }
  };

  const saveProduct = async (prod: Product) => {
    if (isPrinterLocked) {
      Alert.alert(
        'Terminal Locked',
        'Cannot add or update products while terminal is locked. Please connect an authorized thermal printer or enter the Master Key.'
      );
      throw new Error('Terminal Locked');
    }
    // If creating a new product in demo mode, check limit
    const isNew = !prod.id || !products.some((p) => p.id === prod.id);
    if (APP_CONFIG.IS_DEMO_MODE && isNew && products.length >= APP_CONFIG.DEMO_LIMITS.MAX_PRODUCTS) {
      Alert.alert('Demo Limit Reached', APP_CONFIG.DEMO_MESSAGES.PRODUCT_LIMIT);
      throw new Error(APP_CONFIG.DEMO_MESSAGES.PRODUCT_LIMIT);
    }
    try {
      setIsLoading(true);
      await dbOps.saveProduct(prod);
      const updatedProds = await dbOps.getProducts();
      setProducts(updatedProds);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteProduct = async (id: string) => {
    if (isPrinterLocked) {
      Alert.alert('Terminal Locked', 'Cannot delete products while terminal is locked.');
      throw new Error('Terminal Locked');
    }
    try {
      setIsLoading(true);
      await dbOps.deleteProduct(id);
      const updatedProds = await dbOps.getProducts();
      setProducts(updatedProds);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCustomer = async (cust: Customer) => {
    if (isPrinterLocked) {
      Alert.alert(
        'Terminal Locked',
        'Cannot add or update customers while terminal is locked. Please connect an authorized thermal printer or enter the Master Key.'
      );
      throw new Error('Terminal Locked');
    }
    // If creating a new customer in demo mode, check limit
    const isNew = !cust.id || !customers.some((c) => c.id === cust.id);
    if (APP_CONFIG.IS_DEMO_MODE && isNew && customers.length >= APP_CONFIG.DEMO_LIMITS.MAX_CUSTOMERS) {
      Alert.alert('Demo Limit Reached', APP_CONFIG.DEMO_MESSAGES.CUSTOMER_LIMIT);
      throw new Error(APP_CONFIG.DEMO_MESSAGES.CUSTOMER_LIMIT);
    }
    try {
      setIsLoading(true);
      await dbOps.saveCustomer(cust);
      const updatedCusts = await dbOps.getCustomers();
      setCustomers(updatedCusts);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCustomer = async (id: string) => {
    if (isPrinterLocked) {
      Alert.alert('Terminal Locked', 'Cannot delete customers while terminal is locked.');
      throw new Error('Terminal Locked');
    }
    try {
      setIsLoading(true);
      await dbOps.deleteCustomer(id);
      const updatedCusts = await dbOps.getCustomers();
      setCustomers(updatedCusts);
    } finally {
      setIsLoading(false);
    }
  };

  const createInvoice = async (invoice: Invoice, items: any[]) => {
    if (isPrinterLocked) {
      Alert.alert(
        'Terminal Locked',
        'Cannot create invoices while terminal is locked. Please connect an authorized thermal printer or enter the Master Key.'
      );
      throw new Error('Terminal Locked');
    }
    if (APP_CONFIG.IS_DEMO_MODE && invoices.length >= APP_CONFIG.DEMO_LIMITS.MAX_INVOICES) {
      Alert.alert('Demo Limit Reached', APP_CONFIG.DEMO_MESSAGES.INVOICE_LIMIT);
      throw new Error(APP_CONFIG.DEMO_MESSAGES.INVOICE_LIMIT);
    }
    try {
      setIsLoading(true);
      await dbOps.saveInvoice(invoice, items);
      const updatedInvs = await dbOps.getInvoices();
      setInvoices(updatedInvs);
      const updatedProds = await dbOps.getProducts();
      setProducts(updatedProds);

      // Trigger daily backup in background if due
      dbOps.getAllInvoiceItems().then((allInvoiceItems) => {
        checkAndRunDailyAutoBackup({
          organization,
          products: updatedProds,
          customers,
          invoices: updatedInvs,
          invoiceItems: allInvoiceItems,
        }).catch(() => {});
      }).catch(() => {});
    } finally {
      setIsLoading(false);
    }
  };

  const deleteInvoice = async (id: string) => {
    if (isPrinterLocked) {
      Alert.alert('Terminal Locked', 'Cannot delete invoices while terminal is locked.');
      throw new Error('Terminal Locked');
    }
    try {
      setIsLoading(true);
      await dbOps.deleteInvoice(id);
      const updatedInvs = await dbOps.getInvoices();
      setInvoices(updatedInvs);
    } finally {
      setIsLoading(false);
    }
  };

  const clearAllData = async () => {
    if (isPrinterLocked) {
      Alert.alert('Terminal Locked', 'Database modifications are disabled while terminal is locked.');
      throw new Error('Terminal Locked');
    }
    try {
      setIsLoading(true);
      await dbOps.clearDatabase();
      await loadData();
    } finally {
      setIsLoading(false);
    }
  };

  const clearInvoicesOnly = async () => {
    if (isPrinterLocked) {
      Alert.alert('Terminal Locked', 'Database modifications are disabled while terminal is locked.');
      throw new Error('Terminal Locked');
    }
    try {
      setIsLoading(true);
      await dbOps.clearInvoicesOnly();
      await loadData();
    } finally {
      setIsLoading(false);
    }
  };

  const updateInvoicePaymentStatus = async (id: string, status: 'Paid' | 'Unpaid') => {
    if (isPrinterLocked) {
      Alert.alert('Terminal Locked', 'Updating invoice status is disabled while terminal is locked.');
      throw new Error('Terminal Locked');
    }
    try {
      setIsLoading(true);
      await dbOps.updateInvoicePaymentStatus(id, status);
      await loadData();
    } finally {
      setIsLoading(false);
    }
  };

  const getAllInvoiceItems = async (): Promise<any[]> => {
    return await dbOps.getAllInvoiceItems();
  };
 
  const exportData = async (): Promise<{ jsonStr: string; filename: string }> => {
    if (APP_CONFIG.IS_DEMO_MODE) {
      Alert.alert('Demo Version', APP_CONFIG.DEMO_MESSAGES.EXPORT_IMPORT_DISABLED);
      throw new Error(APP_CONFIG.DEMO_MESSAGES.EXPORT_IMPORT_DISABLED);
    }
    try {
      setIsLoading(true);
      return await dbOps.exportDatabaseData();
    } finally {
      setIsLoading(false);
    }
  };

  const importData = async (jsonStrOrObj: string | any): Promise<void> => {
    if (isPrinterLocked) {
      Alert.alert('Terminal Locked', 'Data import is disabled while terminal is locked.');
      throw new Error('Terminal Locked');
    }
    if (APP_CONFIG.IS_DEMO_MODE) {
      Alert.alert('Demo Version', APP_CONFIG.DEMO_MESSAGES.EXPORT_IMPORT_DISABLED);
      throw new Error(APP_CONFIG.DEMO_MESSAGES.EXPORT_IMPORT_DISABLED);
    }
    try {
      setIsLoading(true);
      const payload = typeof jsonStrOrObj === 'string' ? jsonStrOrObj : JSON.stringify(jsonStrOrObj);
      await dbOps.importDatabaseData(payload);
      await loadData();
    } finally {
      setIsLoading(false);
    }
  };

  const connectPrinter = async (device: BluetoothDevice): Promise<boolean> => {
    try {
      setIsPrinterConnecting(true);
      setPrinterConnectionStatus('connecting');
      const success = await connectBluetoothPrinter(device);
      if (success) {
        setConnectedPrinter({ ...device, connected: true });
        setPrinterConnectionStatus('connected');
        await AsyncStorage.setItem('connected_printer', JSON.stringify({ ...device, connected: true }));
        await recordPrinterConnection(device);
        const lockStatus = await evaluatePrinterLockStatus();
        setPrinterLockStatus(lockStatus);
        setIsPrinterLocked(lockStatus.isLocked);
        // Query telemetry and check battery level upon connection
        queryPrinterTelemetry(device).then((telemetry) => {
          setPrinterTelemetry(telemetry);
          checkAndAlertLowBattery(telemetry);
        }).catch(() => {});
        return true;
      }
      setPrinterTelemetry(null);
      setPrinterConnectionStatus('offline');
      return false;
    } catch (e) {
      console.error('connectPrinter error:', e);
      setPrinterTelemetry(null);
      setPrinterConnectionStatus('offline');
      return false;
    } finally {
      setIsPrinterConnecting(false);
    }
  };

  const disconnectPrinter = async () => {
    try {
      await disconnectBluetoothPrinter();
      setConnectedPrinter(null);
      setPrinterTelemetry(null);
      setPrinterConnectionStatus('offline');
      await AsyncStorage.removeItem('connected_printer');
    } catch (e) {
      console.error('disconnectPrinter error:', e);
      setPrinterTelemetry(null);
      setPrinterConnectionStatus('offline');
    }
  };

  const printReceipt = async (
    text: string,
    navigation?: any,
    options?: ReceiptBrandingOptions
  ): Promise<boolean> => {
    if (!connectedPrinter) {
      setPrinterConnectionStatus('offline');
      Alert.alert(
        'No Printer Connected',
        'You need to connect a Bluetooth thermal printer to print receipts.',
        [
          { text: 'Cancel', style: 'cancel' },
          ...(navigation ? [{ text: 'Connect Printer', onPress: () => navigation.navigate('PrinterConnect') }] : []),
        ]
      );
      return false;
    }

    try {
      // 1. Verify physical connection FIRST before attempting print payload
      const connCheck = await ensureBluetoothConnected(connectedPrinter);
      if (!connCheck.ok) {
        setPrinterConnectionStatus('offline');
        verifyAndAutoConnectPrinter().catch(() => {});
        if (connCheck.reason === 'BT_OFF') {
          Alert.alert(
            'Bluetooth Turned Off',
            'Bluetooth is disabled on your device. Please turn ON Bluetooth in system settings and try again.'
          );
        } else {
          Alert.alert(
            'Printer Offline or Turned Off',
            `Unable to connect to printer '${connectedPrinter.name}'.\n\nPlease check if your thermal printer is turned ON, charged, and within Bluetooth range, or reconnect the printer.`,
            [
              { text: 'Cancel', style: 'cancel' },
              ...(navigation ? [{ text: 'Configure Printer', onPress: () => navigation.navigate('PrinterConnect') }] : []),
            ]
          );
        }
        return false;
      }

      // 2. Physical connection confirmed! Send print bytes
      const printSuccess = await printReceiptRaw(text, options);
      if (printSuccess && connectedPrinter) {
        setPrinterConnectionStatus('connected');
        await recordPrinterConnection(connectedPrinter);
        const lockStatus = await evaluatePrinterLockStatus();
        setPrinterLockStatus(lockStatus);
        setIsPrinterLocked(lockStatus.isLocked);
      }
      return printSuccess;
    } catch (e: any) {
      console.error('[BillingContext] printReceipt error:', e);
      if (e && e.message && e.message.includes('PRINTER_PAPER_OUT')) {
        Alert.alert(
          'Thermal Printer Paper Out',
          'Your thermal receipt printer is out of paper. Please reload a paper roll and try again.',
          [{ text: 'OK' }]
        );
      }
      return false;
    }
  };

  const printReceiptAsImage = async (
    text: string,
    navigation?: any,
    options?: ReceiptImagePrintOptions
  ): Promise<boolean> => {
    if (!connectedPrinter) {
      setPrinterConnectionStatus('offline');
      Alert.alert(
        'No Printer Connected',
        'You need to connect a Bluetooth thermal printer to print receipts.',
        [
          { text: 'Cancel', style: 'cancel' },
          ...(navigation ? [{ text: 'Connect Printer', onPress: () => navigation.navigate('PrinterConnect') }] : []),
        ]
      );
      return false;
    }

    try {
      // 1. Verify physical connection FIRST before attempting print payload
      const connCheck = await ensureBluetoothConnected(connectedPrinter);
      if (!connCheck.ok) {
        setPrinterConnectionStatus('offline');
        verifyAndAutoConnectPrinter().catch(() => {});
        if (connCheck.reason === 'BT_OFF') {
          Alert.alert(
            'Bluetooth Turned Off',
            'Bluetooth is disabled on your device. Please turn ON Bluetooth in system settings and try again.'
          );
        } else {
          Alert.alert(
            'Printer Offline or Turned Off',
            `Unable to connect to printer '${connectedPrinter.name}'.\n\nPlease check if your thermal printer is turned ON, charged, and within Bluetooth range, or reconnect the printer.`,
            [
              { text: 'Cancel', style: 'cancel' },
              ...(navigation ? [{ text: 'Configure Printer', onPress: () => navigation.navigate('PrinterConnect') }] : []),
            ]
          );
        }
        return false;
      }

      // 2. Physical connection confirmed! Send raster print bytes
      const printSuccess = await printReceiptAsImageRaw(text, options);
      if (printSuccess && connectedPrinter) {
        setPrinterConnectionStatus('connected');
        await recordPrinterConnection(connectedPrinter);
        const lockStatus = await evaluatePrinterLockStatus();
        setPrinterLockStatus(lockStatus);
        setIsPrinterLocked(lockStatus.isLocked);
      }
      return printSuccess;
    } catch (e: any) {
      console.error('[BillingContext] printReceiptAsImage error:', e);
      if (e && e.message && e.message.includes('PRINTER_PAPER_OUT')) {
        Alert.alert(
          'Thermal Printer Paper Out',
          'Your thermal receipt printer is out of paper. Please reload a paper roll and try again.',
          [{ text: 'OK' }]
        );
      }
      return false;
    }
  };

  const verifyPrinterConnectionOrRedirect = async (navigation: any): Promise<boolean> => {
    if (!connectedPrinter) {
      setPrinterConnectionStatus('offline');
      Alert.alert(
        'Printer Needs Configuration',
        'No Bluetooth thermal printer is connected. Please configure your printer to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Configure Printer',
            onPress: () => navigation.navigate('PrinterConnect'),
          },
        ]
      );
      return false;
    }

    const connCheck = await ensureBluetoothConnected(connectedPrinter);
    if (!connCheck.ok) {
      setPrinterConnectionStatus('offline');
      verifyAndAutoConnectPrinter().catch(() => {});
      if (connCheck.reason === 'BT_OFF') {
        Alert.alert(
          'Bluetooth Turned Off',
          'Bluetooth is disabled on your device. Please turn ON Bluetooth in system settings and try again.'
        );
      } else {
        Alert.alert(
          'Printer Offline or Disconnected',
          `Unable to communicate with '${connectedPrinter.name}'.\n\nPlease check if your thermal printer is turned ON or reconfigure your printer connection.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Configure Printer',
              onPress: () => navigation.navigate('PrinterConnect'),
            },
          ]
        );
      }
      return false;
    }

    setPrinterConnectionStatus('connected');
    return true;
  };

  const checkPrinterLock = async (): Promise<PrinterLockStatus> => {
    const status = await evaluatePrinterLockStatus();
    setPrinterLockStatus(status);
    setIsPrinterLocked(status.isLocked);
    return status;
  };

  const unlockViaMasterPassword = async (
    password: string
  ): Promise<{ success: boolean; message: string }> => {
    const storeId = organization?.name || organization?.id || 'PARCHIWALA_STORE';
    const res = await unlockWithMasterPassword(password, storeId);
    if (res.success) {
      const status = await evaluatePrinterLockStatus();
      setPrinterLockStatus(status);
      setIsPrinterLocked(status.isLocked);
    }
    return res;
  };

  const reconnectRegisteredPrinter = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const registered = await getRegisteredPrinter();
      if (!registered || !registered.address) {
        return {
          success: false,
          message: 'No registered printer found on this device. Please pair your printer first.',
        };
      }
      const device: BluetoothDevice = {
        name: registered.name,
        address: registered.address,
      };
      const success = await connectBluetoothPrinter(device);
      if (success) {
        setConnectedPrinter({ ...device, connected: true });
        await AsyncStorage.setItem('connected_printer', JSON.stringify({ ...device, connected: true }));
        await recordPrinterConnection(device);
        const status = await evaluatePrinterLockStatus();
        setPrinterLockStatus(status);
        setIsPrinterLocked(status.isLocked);
        queryPrinterTelemetry(device).then((telemetry) => {
          setPrinterTelemetry(telemetry);
          checkAndAlertLowBattery(telemetry);
        }).catch(() => {});
        return {
          success: true,
          message: `Connected to ${registered.name}. Terminal unlocked successfully!`,
        };
      }
      return {
        success: false,
        message: `Failed to connect to ${registered.name}. Please ensure the printer is turned ON and within Bluetooth range.`,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'Error occurred while connecting to registered printer.',
      };
    }
  };

  const checkBatteryOptimizationStatus = async (): Promise<boolean> => {
    const isIgnored = await isBatteryOptimizationIgnored();
    setIsBatteryOptimized(!isIgnored);
    return !isIgnored;
  };

  const requestDisableBatteryOptimization = async (): Promise<boolean> => {
    const ok = await reqDisableBatteryOpt();
    const isIgnored = await isBatteryOptimizationIgnored();
    setIsBatteryOptimized(!isIgnored);
    return ok;
  };

  const checkPrinterTelemetryStatus = async (): Promise<PrinterTelemetryResult> => {
    const res = await queryPrinterTelemetry(connectedPrinter);
    setPrinterTelemetry(res);
    checkAndAlertLowBattery(res);
    return res;
  };

  const toggleAutoBackup = async (enabled: boolean): Promise<void> => {
    await setAutoBackupEnabled(enabled);
    setAutoBackupEnabledState(enabled);
  };

  const createLocalBackup = async (isManual: boolean = true) => {
    const items = await dbOps.getAllInvoiceItems();
    return await createEncryptedLocalBackup(
      {
        organization,
        products,
        customers,
        invoices,
        invoiceItems: items,
      },
      isManual
    );
  };

  const getLocalBackupsList = async () => {
    return await listLocalBackups();
  };

  const restoreLocalBackup = async (filePath: string) => {
    return await restoreFromLocalBackupFile(filePath, importData);
  };

  return (
    <BillingContext.Provider
      value={{
        isMock,
        isDemoMode: APP_CONFIG.IS_DEMO_MODE,
        dbMode,
        organization,
        products,
        customers,
        invoices,
        isLoading,
        loadData,
        resetToMockData,
        updateOrgProfile,
        saveProduct,
        deleteProduct,
        saveCustomer,
        deleteCustomer,
        createInvoice,
        deleteInvoice,
        clearAllData,
        clearInvoicesOnly,
        updateInvoicePaymentStatus,
        getAllInvoiceItems,
        exportData,
        importData,
        connectedPrinter,
        printerConnectionStatus,
        isPrinterConnecting,
        verifyAndAutoConnectPrinter,
        connectPrinter,
        disconnectPrinter,
        printReceipt,
        printReceiptAsImage,
        verifyPrinterConnectionOrRedirect,
        checkServicesStatus: checkSystemServices,
        printerLockStatus,
        isPrinterLocked,
        checkPrinterLock,
        unlockViaMasterPassword,
        reconnectRegisteredPrinter,
        getPaginatedInvoices: dbOps.getPaginatedInvoices,
        getDashboardMetrics: dbOps.getDashboardMetrics,
        getTodayInvoices: dbOps.getTodayInvoicesOptimized,
        isBatteryOptimized,
        checkBatteryOptimizationStatus,
        requestDisableBatteryOptimization,
        printerTelemetry,
        checkPrinterTelemetry: checkPrinterTelemetryStatus,
        autoBackupEnabled,
        toggleAutoBackup,
        createLocalBackup,
        listLocalBackups: getLocalBackupsList,
        restoreLocalBackup,
      }}
    >
      {children}
    </BillingContext.Provider>
  );
};

export const useBilling = () => {
  const context = useContext(BillingContext);
  if (!context) {
    throw new Error('useBilling must be used within a BillingProvider');
  }
  return context;
};
