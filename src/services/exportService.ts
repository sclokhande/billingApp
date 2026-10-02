import { Invoice, InvoiceItem, Product, Customer, Organization } from '../db/types';
import { formatInvoiceDateTime } from '../utils/dateUtils';

export type ExportTarget = 'invoices' | 'products' | 'customers' | 'full';
export type InvoiceGstFilter = 'all' | 'gst' | 'nongst';
export type ExportFormat = 'csv' | 'json';

export interface ExportOptions {
  target: ExportTarget;
  gstFilter?: InvoiceGstFilter;
  format: ExportFormat;
}

export interface ExportResult {
  content: string;
  filename: string;
  mimeType: string;
  recordCount: number;
}

/**
 * Standard RFC-4180 CSV cell escaping
 */
export const escapeCsv = (val: any): string => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Generate formatted timestamp string for filenames: YYYYMMDD_HHMM
 */
export const getFileTimestamp = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}${month}${day}_${hours}${minutes}`;
};

/**
 * Filter invoices based on GST filter ('all' | 'gst' | 'nongst')
 */
export const filterInvoices = (
  invoices: Invoice[],
  gstFilter: InvoiceGstFilter = 'all'
): Invoice[] => {
  const safeList = Array.isArray(invoices) ? invoices : [];
  if (gstFilter === 'gst') {
    return safeList.filter((inv) => {
      const tax = typeof inv.taxTotal === 'number' ? inv.taxTotal : parseFloat(inv.taxTotal as any) || 0;
      const cgst = typeof inv.cgstTotal === 'number' ? inv.cgstTotal : parseFloat(inv.cgstTotal as any) || 0;
      const sgst = typeof inv.sgstTotal === 'number' ? inv.sgstTotal : parseFloat(inv.sgstTotal as any) || 0;
      return tax > 0 || (cgst + sgst) > 0;
    });
  }
  if (gstFilter === 'nongst') {
    return safeList.filter((inv) => {
      const tax = typeof inv.taxTotal === 'number' ? inv.taxTotal : parseFloat(inv.taxTotal as any) || 0;
      const cgst = typeof inv.cgstTotal === 'number' ? inv.cgstTotal : parseFloat(inv.cgstTotal as any) || 0;
      const sgst = typeof inv.sgstTotal === 'number' ? inv.sgstTotal : parseFloat(inv.sgstTotal as any) || 0;
      return tax === 0 && (cgst + sgst) === 0;
    });
  }
  return safeList;
};

/**
 * Export Invoices as CSV
 */
export const exportInvoicesToCsv = (
  invoices: Invoice[],
  items: InvoiceItem[],
  customers: Customer[],
  gstFilter: InvoiceGstFilter = 'all'
): ExportResult => {
  const filtered = filterInvoices(invoices, gstFilter);
  const customerMap = new Map<string, Customer>();
  (customers || []).forEach((c) => customerMap.set(c.id, c));

  const itemsMap = new Map<string, InvoiceItem[]>();
  (items || []).forEach((it) => {
    const list = itemsMap.get(it.invoiceId) || [];
    list.push(it);
    itemsMap.set(it.invoiceId, list);
  });

  const headers = [
    'Invoice Number',
    'Date',
    'Customer Name',
    'Customer Phone',
    'Payment Method',
    'Payment Status',
    'Subtotal',
    'GST Tax',
    'CGST',
    'SGST',
    'Discount',
    'Grand Total',
    'Items Count',
    'Items Details',
  ];

  const rows: string[] = [headers.map(escapeCsv).join(',')];

  for (const inv of filtered) {
    const cust = customerMap.get(inv.customerId);
    const invItems = itemsMap.get(inv.id) || [];
    const itemsDetailsStr = invItems
      .map((it) => `${it.name} (${it.quantity} ${it.unit || 'Pcs'} @ ${it.price})`)
      .join(' | ');

    const dateFormatted = formatInvoiceDateTime(inv.date);
    const row = [
      escapeCsv(inv.invoiceNumber || ''),
      escapeCsv(dateFormatted),
      escapeCsv(cust?.name || 'Walk-in'),
      escapeCsv(cust?.phone || ''),
      escapeCsv(inv.paymentMethod || 'Cash'),
      escapeCsv(inv.paymentStatus || 'Paid'),
      escapeCsv(Number(inv.subtotal || 0).toFixed(2)),
      escapeCsv(Number(inv.taxTotal || 0).toFixed(2)),
      escapeCsv(Number(inv.cgstTotal || 0).toFixed(2)),
      escapeCsv(Number(inv.sgstTotal || 0).toFixed(2)),
      escapeCsv(Number(inv.discount || 0).toFixed(2)),
      escapeCsv(Number(inv.grandTotal || 0).toFixed(2)),
      escapeCsv(invItems.length),
      escapeCsv(itemsDetailsStr),
    ];
    rows.push(row.join(','));
  }

  const prefix = gstFilter === 'gst' ? 'invoices_gst' : gstFilter === 'nongst' ? 'invoices_non_gst' : 'invoices_all';
  const filename = `${prefix}_${getFileTimestamp()}.csv`;

  return {
    content: rows.join('\r\n'),
    filename,
    mimeType: 'text/csv',
    recordCount: filtered.length,
  };
};

/**
 * Export Invoices as JSON
 */
export const exportInvoicesToJson = (
  invoices: Invoice[],
  items: InvoiceItem[],
  customers: Customer[],
  gstFilter: InvoiceGstFilter = 'all'
): ExportResult => {
  const filtered = filterInvoices(invoices, gstFilter);
  const customerMap = new Map<string, Customer>();
  (customers || []).forEach((c) => customerMap.set(c.id, c));

  const itemsMap = new Map<string, InvoiceItem[]>();
  (items || []).forEach((it) => {
    const list = itemsMap.get(it.invoiceId) || [];
    list.push(it);
    itemsMap.set(it.invoiceId, list);
  });

  const structuredInvoices = filtered.map((inv) => {
    const cust = customerMap.get(inv.customerId);
    const invItems = itemsMap.get(inv.id) || [];
    return {
      ...inv,
      customer: cust || { id: inv.customerId, name: 'Walk-in', phone: '', email: '', address: '' },
      items: invItems,
    };
  });

  const data = {
    exportType: 'invoices',
    gstFilter,
    exportedAt: new Date().toISOString(),
    recordCount: filtered.length,
    invoices: structuredInvoices,
  };

  const prefix = gstFilter === 'gst' ? 'invoices_gst' : gstFilter === 'nongst' ? 'invoices_non_gst' : 'invoices_all';
  const filename = `${prefix}_${getFileTimestamp()}.json`;

  return {
    content: JSON.stringify(data, null, 2),
    filename,
    mimeType: 'application/json',
    recordCount: filtered.length,
  };
};

/**
 * Export Products as CSV
 */
export const exportProductsToCsv = (products: Product[]): ExportResult => {
  const safeList = Array.isArray(products) ? products : [];
  const headers = [
    'Product ID',
    'Product Name',
    'Price (Rs.)',
    'Unit',
    'GST Tax Rate (%)',
    'Stock Quantity',
    'Description',
  ];

  const rows: string[] = [headers.map(escapeCsv).join(',')];

  for (const prod of safeList) {
    const row = [
      escapeCsv(prod.id),
      escapeCsv(prod.name),
      escapeCsv(Number(prod.price || 0).toFixed(2)),
      escapeCsv(prod.unit || 'Pcs'),
      escapeCsv(prod.taxRate || 0),
      escapeCsv(prod.stockQuantity ?? 0),
      escapeCsv(prod.description || ''),
    ];
    rows.push(row.join(','));
  }

  const filename = `products_${getFileTimestamp()}.csv`;
  return {
    content: rows.join('\r\n'),
    filename,
    mimeType: 'text/csv',
    recordCount: safeList.length,
  };
};

/**
 * Export Products as JSON
 */
export const exportProductsToJson = (products: Product[]): ExportResult => {
  const safeList = Array.isArray(products) ? products : [];
  const data = {
    exportType: 'products',
    exportedAt: new Date().toISOString(),
    recordCount: safeList.length,
    products: safeList,
  };
  const filename = `products_${getFileTimestamp()}.json`;
  return {
    content: JSON.stringify(data, null, 2),
    filename,
    mimeType: 'application/json',
    recordCount: safeList.length,
  };
};

/**
 * Export Customers as CSV
 */
export const exportCustomersToCsv = (customers: Customer[]): ExportResult => {
  const safeList = Array.isArray(customers) ? customers : [];
  const headers = [
    'Customer ID',
    'Customer Name',
    'Phone Number',
    'Email',
    'Address',
  ];

  const rows: string[] = [headers.map(escapeCsv).join(',')];

  for (const cust of safeList) {
    const row = [
      escapeCsv(cust.id),
      escapeCsv(cust.name),
      escapeCsv(cust.phone),
      escapeCsv(cust.email || ''),
      escapeCsv(cust.address || ''),
    ];
    rows.push(row.join(','));
  }

  const filename = `customers_${getFileTimestamp()}.csv`;
  return {
    content: rows.join('\r\n'),
    filename,
    mimeType: 'text/csv',
    recordCount: safeList.length,
  };
};

/**
 * Export Customers as JSON
 */
export const exportCustomersToJson = (customers: Customer[]): ExportResult => {
  const safeList = Array.isArray(customers) ? customers : [];
  const data = {
    exportType: 'customers',
    exportedAt: new Date().toISOString(),
    recordCount: safeList.length,
    customers: safeList,
  };
  const filename = `customers_${getFileTimestamp()}.json`;
  return {
    content: JSON.stringify(data, null, 2),
    filename,
    mimeType: 'application/json',
    recordCount: safeList.length,
  };
};

/**
 * Main dispatcher to export based on selected options
 */
export const executeDataExport = (
  options: ExportOptions,
  data: {
    invoices: Invoice[];
    invoiceItems: InvoiceItem[];
    products: Product[];
    customers: Customer[];
    organization: Organization | null;
  }
): ExportResult => {
  const { target, gstFilter = 'all', format } = options;

  if (target === 'invoices') {
    if (format === 'csv') {
      return exportInvoicesToCsv(data.invoices, data.invoiceItems, data.customers, gstFilter);
    }
    return exportInvoicesToJson(data.invoices, data.invoiceItems, data.customers, gstFilter);
  }

  if (target === 'products') {
    if (format === 'csv') {
      return exportProductsToCsv(data.products);
    }
    return exportProductsToJson(data.products);
  }

  if (target === 'customers') {
    if (format === 'csv') {
      return exportCustomersToCsv(data.customers);
    }
    return exportCustomersToJson(data.customers);
  }

  // Full backup
  const backup = {
    version: '1.0',
    exportType: 'full_database_backup',
    exportedAt: new Date().toISOString(),
    organization: data.organization,
    products: data.products,
    customers: data.customers,
    invoices: data.invoices,
    invoiceItems: data.invoiceItems,
  };
  const filename = `parchiwala_backup_${getFileTimestamp()}.json`;
  return {
    content: JSON.stringify(backup, null, 2),
    filename,
    mimeType: 'application/json',
    recordCount: data.invoices.length + data.products.length + data.customers.length,
  };
};
