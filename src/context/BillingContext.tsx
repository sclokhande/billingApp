import React, { createContext, useContext, useState, useEffect } from 'react';
import { Organization, Product, Customer, Invoice } from '../db/types';
import { initDB, getDBMode } from '../db/db';
import * as dbOps from '../db/operations';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { 
  BluetoothDevice, 
  connectBluetoothPrinter, 
  disconnectBluetoothPrinter, 
  printReceiptRaw, 
  setConnectedPrinterState, 
  isBluetoothEnabled, 
  isLocationEnabled,
  enableBluetooth,
  openLocationSettings,
  checkSystemServices,
  ensureBluetoothConnected 
} from '../services/bluetoothPrinterService';

import { APP_CONFIG } from '../config/app_config';

interface BillingContextProps {
  isDemoMode: boolean;
  dbMode: string;
  organization: Organization;
  products: Product[];
  customers: Customer[];
  invoices: dbOps.InvoiceWithCustomerName[];
  isLoading: boolean;
  loadData: () => Promise<void>;
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
  exportData: () => Promise<{ jsonStr: string; filename: string }>;
  importData: (jsonStr: string) => Promise<void>;
  connectedPrinter: BluetoothDevice | null;
  connectPrinter: (device: BluetoothDevice) => Promise<boolean>;
  disconnectPrinter: () => Promise<void>;
  printReceipt: (text: string, navigation?: any) => Promise<boolean>;
  verifyPrinterConnectionOrRedirect: (navigation: any) => Promise<boolean>;
  checkServicesStatus: () => Promise<{ bluetoothEnabled: boolean; locationEnabled: boolean }>;
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

  // Initialize DB and fetch data on mount
  useEffect(() => {
    const startup = async () => {
      try {
        setIsLoading(true);
        const mode = await initDB();
        setDbMode(mode);
        
        // Seed database (if empty)
        await dbOps.seedDatabase();
        
        // Load operational data
        await loadData();

        // Load connected printer configuration from AsyncStorage
        const savedPrinter = await AsyncStorage.getItem('connected_printer');
        if (savedPrinter) {
          try {
            const parsed = JSON.parse(savedPrinter);
            setConnectedPrinter(parsed);
            setConnectedPrinterState(parsed); // Sync printer state with service

            // Check system Bluetooth and Location services status for saved printer on app launch
            const { bluetoothEnabled, locationEnabled } = await checkSystemServices();

            if (!bluetoothEnabled || !locationEnabled) {
              let missingServicesMsg = '';
              if (!bluetoothEnabled && !locationEnabled) {
                missingServicesMsg = 'Bluetooth connection and Location services are currently turned OFF.';
              } else if (!bluetoothEnabled) {
                missingServicesMsg = 'Bluetooth connection is currently turned OFF.';
              } else {
                missingServicesMsg = 'Location services are currently turned OFF.';
              }

              Alert.alert(
                'Printer Service Required',
                `You have previously configured printer '${parsed.name}'. ${missingServicesMsg}\n\nPlease start this service to connect your printer and print receipts.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  ...(!bluetoothEnabled ? [{ text: 'Turn On Bluetooth', onPress: () => enableBluetooth() }] : []),
                  ...(!locationEnabled ? [{ text: 'Location Settings', onPress: () => openLocationSettings() }] : []),
                ]
              );
            } else {
              // Both services enabled: attempt background socket check
              const connCheck = await ensureBluetoothConnected(parsed);
              if (!connCheck.ok) {
                console.warn('Saved printer offline or not reachable on startup:', parsed.name);
              }
            }
          } catch (e) {
            console.warn('Failed to restore saved printer state:', e);
          }
        }
      } catch (error) {
        console.error('Database startup failure:', error);
      } finally {
        setIsLoading(false);
      }
    };
    startup();
  }, []);

  const loadData = async () => {
    try {
      const org = await dbOps.getOrganization();
      const prods = await dbOps.getProducts();
      const custs = await dbOps.getCustomers();
      const invs = await dbOps.getInvoices();

      setOrganization(org);
      setProducts(prods);
      setCustomers(custs);
      setInvoices(invs);
    } catch (e) {
      console.error('Error fetching database records:', e);
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
      return await printReceiptRaw(text);
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

  return (
    <BillingContext.Provider
      value={{
        isDemoMode: APP_CONFIG.IS_DEMO_MODE,
        dbMode,
        organization,
        products,
        customers,
        invoices,
        isLoading,
        loadData,
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
        exportData,
        importData,
        connectedPrinter,
        connectPrinter,
        disconnectPrinter,
        printReceipt,
        verifyPrinterConnectionOrRedirect,
        checkServicesStatus: checkSystemServices,
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
