export interface Organization {
  id: string;
  name: string;
  address: string;
  phone: string;
  mobile: string;
  email: string;
  gstNumber: string;
  showGstOnBill: boolean;
  currency: string;
  slogan: string;
  printWidth?: string; // '58mm' | '80mm'
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  taxRate: number; // percentage, e.g. 18 for 18%
  unit: string; // e.g. "KG", "Meter", "Pcs"
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  date: string; // ISO string
  subtotal: number;
  taxTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  discount: number;
  grandTotal: number;
  paymentStatus: 'Paid' | 'Unpaid';
  paymentMethod: string; // Cash, Card, UPI, etc.
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  taxRate: number;
  total: number;
  unit: string;
}
