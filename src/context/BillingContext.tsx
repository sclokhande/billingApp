import React, { createContext, useContext, useState, useEffect } from 'react';
import { Organization, Product, Customer, Invoice } from '../db/types';
import { initDB, getDBMode } from '../db/db';
import * as dbOps from '../db/operations';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BluetoothDevice, connectBluetoothPrinter, disconnectBluetoothPrinter, printReceiptRaw, setConnectedPrinterState, isBluetoothEnabled } from '../services/bluetoothPrinterService';

interface BillingContextProps {
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
  exportData: () => Promise<string>;
  importData: (jsonStr: string) => Promise<void>;
  connectedPrinter: BluetoothDevice | null;
  connectPrinter: (device: BluetoothDevice) => Promise<boolean>;
  disconnectPrinter: () => Promise<void>;
  printReceipt: (text: string) => Promise<boolean>;
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
            const btEnabled = await isBluetoothEnabled();
            if (btEnabled) {
              setConnectedPrinter(parsed);
              setConnectedPrinterState(parsed); // Sync printer state with service
            } else {
              setConnectedPrinter(null);
              setConnectedPrinterState(null);
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
    try {
      setIsLoading(true);
      await dbOps.saveOrganization(org);
      setOrganization(org);
    } finally {
      setIsLoading(false);
    }
  };

  const saveProduct = async (prod: Product) => {
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
 
  const exportData = async (): Promise<string> => {
    return await dbOps.exportDatabaseData();
  };

  const importData = async (jsonStr: string): Promise<void> => {
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

  const printReceipt = async (text: string): Promise<boolean> => {
    try {
      return await printReceiptRaw(text);
    } catch (e) {
      console.error('printReceipt error:', e);
      return false;
    }
  };

  return (
    <BillingContext.Provider
      value={{
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
