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
  setConnectedPrinterState, 
  checkSystemServices,
  ensureBluetoothConnected 
} from '../services/bluetoothPrinterService';
import {
  evaluatePrinterLockStatus,
  recordPrinterConnection,
  unlockWithMasterPassword,
  getRegisteredPrinter,
  PrinterLockStatus,
} from '../utils/printerLockManager';

import { APP_CONFIG } from '../config/app_config';

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
  importData: (jsonStr: string) => Promise<void>;
  connectedPrinter: BluetoothDevice | null;
  connectPrinter: (device: BluetoothDevice) => Promise<boolean>;
  disconnectPrinter: () => Promise<void>;
  printReceipt: (text: string, navigation?: any) => Promise<boolean>;
  verifyPrinterConnectionOrRedirect: (navigation: any) => Promise<boolean>;
  checkServicesStatus: () => Promise<{ bluetoothEnabled: boolean; locationEnabled: boolean }>;
  printerLockStatus: PrinterLockStatus | null;
  isPrinterLocked: boolean;
  checkPrinterLock: () => Promise<PrinterLockStatus>;
  unlockViaMasterPassword: (password: string) => Promise<{ success: boolean; message: string }>;
  reconnectRegisteredPrinter: () => Promise<{ success: boolean; message: string }>;
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
  const [printerLockStatus, setPrinterLockStatus] = useState<PrinterLockStatus | null>(null);
  const [isPrinterLocked, setIsPrinterLocked] = useState<boolean>(false);

  const isMock = Boolean(APP_CONFIG.isMock || APP_CONFIG.IS_MOCK);

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

        // Load connected printer configuration from AsyncStorage
        const savedPrinter = await AsyncStorage.getItem('connected_printer');
        if (savedPrinter) {
          try {
            const parsed = JSON.parse(savedPrinter);
            setConnectedPrinter(parsed);
            setConnectedPrinterState(parsed); // Sync printer state with service
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

      // Non-blocking background verification of saved printer (does not block splash screen)
      try {
        const savedPrinter = await AsyncStorage.getItem('connected_printer');
        if (savedPrinter) {
          setTimeout(async () => {
            try {
              const parsed = JSON.parse(savedPrinter);
              const { bluetoothEnabled } = await checkSystemServices();
              if (bluetoothEnabled) {
                await ensureBluetoothConnected(parsed);
              }
            } catch {
              // Silently handle in background
            }
          }, 800);
        }
      } catch {
        // Silently handle startup error
      }
    };
    startup();

    // AppState and interval checks for 48-hour printer security lock
    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        try {
          const status = await evaluatePrinterLockStatus();
          setPrinterLockStatus(status);
          setIsPrinterLocked(status.isLocked);
        } catch {
          // Silently handle background lock evaluation
        }
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
    try {
      setIsLoading(true);
      await dbOps.saveOrganization(org);
      setOrganization(org);
    } finally {
      setIsLoading(false);
    }
  };

  const saveProduct = async (prod: Product) => {
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
    } finally {
      setIsLoading(false);
    }
  };

  const deleteInvoice = async (id: string) => {
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
    try {
      setIsLoading(true);
      await dbOps.clearDatabase();
      await loadData();
    } finally {
      setIsLoading(false);
    }
  };

  const clearInvoicesOnly = async () => {
    try {
      setIsLoading(true);
      await dbOps.clearInvoicesOnly();
      await loadData();
    } finally {
      setIsLoading(false);
    }
  };

  const updateInvoicePaymentStatus = async (id: string, status: 'Paid' | 'Unpaid') => {
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

  const importData = async (jsonStr: string): Promise<void> => {
    if (APP_CONFIG.IS_DEMO_MODE) {
      Alert.alert('Demo Version', APP_CONFIG.DEMO_MESSAGES.EXPORT_IMPORT_DISABLED);
      throw new Error(APP_CONFIG.DEMO_MESSAGES.EXPORT_IMPORT_DISABLED);
    }
    try {
      setIsLoading(true);
      await dbOps.importDatabaseData(jsonStr);
      await loadData();
    } finally {
      setIsLoading(false);
    }
  };

  const connectPrinter = async (device: BluetoothDevice): Promise<boolean> => {
    try {
      const success = await connectBluetoothPrinter(device);
      if (success) {
        setConnectedPrinter({ ...device, connected: true });
        await AsyncStorage.setItem('connected_printer', JSON.stringify({ ...device, connected: true }));
        await recordPrinterConnection(device);
        const lockStatus = await evaluatePrinterLockStatus();
        setPrinterLockStatus(lockStatus);
        setIsPrinterLocked(lockStatus.isLocked);
        return true;
      }
      return false;
    } catch (e) {
      console.error('connectPrinter error:', e);
      return false;
    }
  };

  const disconnectPrinter = async () => {
    try {
      await disconnectBluetoothPrinter();
      setConnectedPrinter(null);
      await AsyncStorage.removeItem('connected_printer');
    } catch (e) {
      console.error('disconnectPrinter error:', e);
    }
  };

  const printReceipt = async (text: string, navigation?: any): Promise<boolean> => {
    if (APP_CONFIG.IS_DEMO_MODE) {
      Alert.alert('Demo Version', APP_CONFIG.DEMO_MESSAGES.PRINTING_DISABLED);
      return false;
    }

    if (!connectedPrinter) {
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
      const printSuccess = await printReceiptRaw(text);
      if (printSuccess && connectedPrinter) {
        await recordPrinterConnection(connectedPrinter);
        const lockStatus = await evaluatePrinterLockStatus();
        setPrinterLockStatus(lockStatus);
        setIsPrinterLocked(lockStatus.isLocked);
      }
      return printSuccess;
    } catch (e) {
      console.error('[BillingContext] printReceipt error:', e);
      return false;
    }
  };

  const verifyPrinterConnectionOrRedirect = async (navigation: any): Promise<boolean> => {
    if (APP_CONFIG.IS_DEMO_MODE) {
      Alert.alert('Demo Version', APP_CONFIG.DEMO_MESSAGES.PRINTING_DISABLED);
      return false;
    }

    if (!connectedPrinter) {
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
    const res = await unlockWithMasterPassword(password);
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
        connectPrinter,
        disconnectPrinter,
        printReceipt,
        verifyPrinterConnectionOrRedirect,
        checkServicesStatus: checkSystemServices,
        printerLockStatus,
        isPrinterLocked,
        checkPrinterLock,
        unlockViaMasterPassword,
        reconnectRegisteredPrinter,
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
