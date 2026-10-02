import { Organization, Product, Customer, Invoice, InvoiceItem } from '../db/types';

// Dynamic timestamps for today so Dashboard always displays active today metrics.
// All today timestamps are strictly in the PAST relative to Date.now()
// so any real bill created by the user will always be newer than mock bills.
export const getDynamicTimestamps = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const startOfDay = new Date(y, m, d, 0, 0, 1).getTime();
  const nowTime = now.getTime();

  // Safe ceiling: at least 60 seconds before now, but not before startOfDay
  const maxTodayTime = Math.max(startOfDay + 1000, nowTime - 60 * 1000);
  const elapsed = Math.max(maxTodayTime - startOfDay, 1000);

  return {
    todayMorning: new Date(startOfDay + Math.floor(elapsed * 0.15)).toISOString(),
    todayNoon: new Date(startOfDay + Math.floor(elapsed * 0.35)).toISOString(),
    todayAfternoon: new Date(startOfDay + Math.floor(elapsed * 0.55)).toISOString(),
    todayEvening: new Date(startOfDay + Math.floor(elapsed * 0.75)).toISOString(),
    todayRecent: new Date(startOfDay + Math.floor(elapsed * 0.90)).toISOString(),
    yesterday: new Date(y, m, d - 1, 17, 0, 0).toISOString(),
  };
};

export const MOCK_ORGANIZATION: Organization = {
  id: 'mock_org',
  name: 'Parchiwala Kirana & General Store',
  address: 'Shop No. 12, Main Market, Shivaji Chowk, Pune, Maharashtra - 411001',
  phone: '020-24458899',
  mobile: '9876543210',
  email: 'contact@parchiwala.com',
  gstNumber: '27AAAAA0000A1Z5',
  showGstOnBill: true,
  currency: 'Rs.',
  slogan: 'Fresh Groceries • Best Prices • Visit Again!',
  printWidth: '58mm',
  securityPin: '1234',
  showFooterTextOnBill: true,
  footerText: 'Print by Parchiwala',
};

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod_apple',
    name: 'Apple (Fresh)',
    description: 'Crisp Kashmiri apples',
    price: 120,
    taxRate: 0,
    unit: 'KG',
    stockQuantity: 45,
  },
  {
    id: 'prod_rice',
    name: 'Kolam Rice (Tandul)',
    description: 'Daily consumption kolam rice',
    price: 60,
    taxRate: 0,
    unit: 'KG',
    stockQuantity: 120,
  },
  {
    id: 'prod_sugar',
    name: 'Sugar (Sakhar)',
    description: 'Refined crystal white sugar',
    price: 44,
    taxRate: 5,
    unit: 'KG',
    stockQuantity: 80,
  },
  {
    id: 'prod_oil',
    name: 'Fortune Sunflower Oil (Tel)',
    description: 'Refined cooking oil 1 Litre pouch',
    price: 145,
    taxRate: 5,
    unit: 'Pcs',
    stockQuantity: 28,
  },
  {
    id: 'prod_tea',
    name: 'Red Label Tea (Chaha)',
    description: 'Premium tea blend 250g pack',
    price: 125,
    taxRate: 5,
    unit: 'Pcs',
    stockQuantity: 40,
  },
  {
    id: 'prod_peanuts',
    name: 'Peanuts (Shingdana)',
    description: 'Raw high-grade peanuts',
    price: 130,
    taxRate: 0,
    unit: 'KG',
    stockQuantity: 35,
  },
  {
    id: 'prod_atta',
    name: 'Aashirvaad Atta (5 KG)',
    description: '100% whole wheat flour 5kg',
    price: 230,
    taxRate: 0,
    unit: 'Pcs',
    stockQuantity: 18, // Low stock indicator
  },
  {
    id: 'prod_dal',
    name: 'Toor Dal (Premium)',
    description: 'Unpolished protein-rich toor dal',
    price: 160,
    taxRate: 0,
    unit: 'KG',
    stockQuantity: 50,
  },
  {
    id: 'prod_biscuit',
    name: 'Parle-G Gold Biscuits',
    description: 'Classic glucose biscuits pack',
    price: 10,
    taxRate: 18,
    unit: 'Pcs',
    stockQuantity: 100,
  },
  {
    id: 'prod_milk',
    name: 'Amul Taaza Milk 500ml (Doodh)',
    description: 'Pasteurised toned milk',
    price: 28,
    taxRate: 0,
    unit: 'Pcs',
    stockQuantity: 35,
  },
  {
    id: 'prod_soap',
    name: 'Lifebuoy Soap 125g (Sabun)',
    description: 'Total germ protection soap bar',
    price: 35,
    taxRate: 18,
    unit: 'Pcs',
    stockQuantity: 60,
  },
  {
    id: 'prod_salt',
    name: 'Tata Salt 1kg (Meeth)',
    description: 'Vacuum evaporated iodised salt 1kg',
    price: 28,
    taxRate: 0,
    unit: 'Pcs',
    stockQuantity: 75,
  },
];

export const MOCK_CUSTOMERS: Customer[] = [
  {
    id: 'cust_walkin',
    name: 'Walkin-customer',
    phone: '0000000000',
    email: '',
    address: 'Counter Cash Sale',
  },
  {
    id: 'cust_rahul',
    name: 'Rahul Sharma',
    phone: '9822012345',
    email: 'rahul.sharma@example.com',
    address: 'Flat 302, Green Park Society, Pune',
  },
  {
    id: 'cust_aniket',
    name: 'Aniket Patil',
    phone: '9822054321',
    email: 'aniket.patil@example.com',
    address: 'Shivaji Chowk, Main Road, Pune',
  },
  {
    id: 'cust_priya',
    name: 'Priya Deshmukh',
    phone: '9890112233',
    email: 'priya.d@example.com',
    address: 'Near Ganesh Mandir, Karve Nagar, Pune',
  },
  {
    id: 'cust_suresh',
    name: 'Suresh Kulkarni',
    phone: '9850998877',
    email: 'suresh.k@example.com',
    address: 'Shop 4, Market Yard, Pune',
  },
];

export const getMockInvoicesAndItems = () => {
  const times = getDynamicTimestamps();

  const invoices: Invoice[] = [
    {
      id: 'inv_1001',
      invoiceNumber: 'INV-1001',
      customerId: 'cust_rahul',
      date: times.todayMorning,
      subtotal: 289,
      taxTotal: 12,
      cgstTotal: 6,
      sgstTotal: 6,
      discount: 0,
      grandTotal: 301,
      paymentStatus: 'Paid',
      paymentMethod: 'UPI',
    },
    {
      id: 'inv_1002',
      invoiceNumber: 'INV-1002',
      customerId: 'cust_aniket',
      date: times.todayNoon,
      subtotal: 413,
      taxTotal: 7,
      cgstTotal: 3.5,
      sgstTotal: 3.5,
      discount: 0,
      grandTotal: 420,
      paymentStatus: 'Unpaid', // Udhari / Credit dues
      paymentMethod: 'Credit',
    },
    {
      id: 'inv_1003',
      invoiceNumber: 'INV-1003',
      customerId: 'cust_walkin',
      date: times.todayAfternoon,
      subtotal: 177,
      taxTotal: 3,
      cgstTotal: 1.5,
      sgstTotal: 1.5,
      discount: 0,
      grandTotal: 180,
      paymentStatus: 'Paid',
      paymentMethod: 'Cash',
    },
    {
      id: 'inv_1004',
      invoiceNumber: 'INV-1004',
      customerId: 'cust_priya',
      date: times.todayEvening,
      subtotal: 350,
      taxTotal: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      discount: 0,
      grandTotal: 350,
      paymentStatus: 'Unpaid', // Udhari / Credit dues
      paymentMethod: 'Credit',
    },
    {
      id: 'inv_1005',
      invoiceNumber: 'INV-1005',
      customerId: 'cust_suresh',
      date: times.todayRecent,
      subtotal: 260,
      taxTotal: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      discount: 0,
      grandTotal: 260,
      paymentStatus: 'Paid',
      paymentMethod: 'Cash',
    },
    {
      id: 'inv_1000',
      invoiceNumber: 'INV-1000',
      customerId: 'cust_walkin',
      date: times.yesterday,
      subtotal: 120,
      taxTotal: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      discount: 0,
      grandTotal: 120,
      paymentStatus: 'Paid',
      paymentMethod: 'Cash',
    },
  ];

  const invoiceItems: InvoiceItem[] = [
    // INV-1001 (Rahul Sharma - Paid UPI)
    {
      id: 'item_1001_1',
      invoiceId: 'inv_1001',
      productId: 'prod_rice',
      name: 'Kolam Rice (Tandul)',
      price: 60,
      quantity: 2,
      taxRate: 0,
      total: 120,
      unit: 'KG',
    },
    {
      id: 'item_1001_2',
      invoiceId: 'inv_1001',
      productId: 'prod_sugar',
      name: 'Sugar (Sakhar)',
      price: 44,
      quantity: 1,
      taxRate: 5,
      total: 44,
      unit: 'KG',
    },
    {
      id: 'item_1001_3',
      invoiceId: 'inv_1001',
      productId: 'prod_tea',
      name: 'Red Label Tea (Chaha)',
      price: 125,
      quantity: 1,
      taxRate: 5,
      total: 125,
      unit: 'Pcs',
    },

    // INV-1002 (Aniket Patil - Unpaid Credit / Udhari)
    {
      id: 'item_1002_1',
      invoiceId: 'inv_1002',
      productId: 'prod_apple',
      name: 'Apple (Fresh)',
      price: 120,
      quantity: 2,
      taxRate: 0,
      total: 240,
      unit: 'KG',
    },
    {
      id: 'item_1002_2',
      invoiceId: 'inv_1002',
      productId: 'prod_oil',
      name: 'Fortune Sunflower Oil (Tel)',
      price: 145,
      quantity: 1,
      taxRate: 5,
      total: 145,
      unit: 'Pcs',
    },
    {
      id: 'item_1002_3',
      invoiceId: 'inv_1002',
      productId: 'prod_salt',
      name: 'Tata Salt 1kg (Meeth)',
      price: 28,
      quantity: 1,
      taxRate: 0,
      total: 28,
      unit: 'Pcs',
    },

    // INV-1003 (Walkin - Paid Cash)
    {
      id: 'item_1003_1',
      invoiceId: 'inv_1003',
      productId: 'prod_dal',
      name: 'Toor Dal (Premium)',
      price: 160,
      quantity: 1,
      taxRate: 0,
      total: 160,
      unit: 'KG',
    },
    {
      id: 'item_1003_2',
      invoiceId: 'inv_1003',
      productId: 'prod_biscuit',
      name: 'Parle-G Gold Biscuits',
      price: 10,
      quantity: 2,
      taxRate: 18,
      total: 20,
      unit: 'Pcs',
    },

    // INV-1004 (Priya Deshmukh - Unpaid Credit / Udhari)
    {
      id: 'item_1004_1',
      invoiceId: 'inv_1004',
      productId: 'prod_atta',
      name: 'Aashirvaad Atta (5 KG)',
      price: 230,
      quantity: 1,
      taxRate: 0,
      total: 230,
      unit: 'Pcs',
    },
    {
      id: 'item_1004_2',
      invoiceId: 'inv_1004',
      productId: 'prod_apple',
      name: 'Apple (Fresh)',
      price: 120,
      quantity: 1,
      taxRate: 0,
      total: 120,
      unit: 'KG',
    },

    // INV-1005 (Suresh Kulkarni - Paid Cash)
    {
      id: 'item_1005_1',
      invoiceId: 'inv_1005',
      productId: 'prod_peanuts',
      name: 'Peanuts (Shingdana)',
      price: 130,
      quantity: 2,
      taxRate: 0,
      total: 260,
      unit: 'KG',
    },

    // INV-1000 (Yesterday)
    {
      id: 'item_1000_1',
      invoiceId: 'inv_1000',
      productId: 'prod_apple',
      name: 'Apple (Fresh)',
      price: 120,
      quantity: 1,
      taxRate: 0,
      total: 120,
      unit: 'KG',
    },
  ];

  return { invoices, invoiceItems };
};

export const getMockFullDataset = () => {
  const { invoices, invoiceItems } = getMockInvoicesAndItems();
  return {
    organization: MOCK_ORGANIZATION,
    products: MOCK_PRODUCTS,
    customers: MOCK_CUSTOMERS,
    invoices,
    invoiceItems,
  };
};
