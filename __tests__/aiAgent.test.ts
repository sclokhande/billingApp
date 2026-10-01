import { checkDomainGuardrail } from '../src/ai/domainGuardrail';
import { matchIntent } from '../src/ai/intentMatcher';
import { dispatchAgentQuery } from '../src/ai/agentDispatcher';
import { Product, Customer, Organization } from '../src/db/types';
import { InvoiceWithCustomerName } from '../src/db/operations';

describe('Offline AI Agent - Domain Guardrails', () => {
  it('should reject non-app queries (weather, politics, poems, code)', () => {
    expect(checkDomainGuardrail('What is the weather today?').isWithinDomain).toBe(false);
    expect(checkDomainGuardrail('Who is the president of France?').isWithinDomain).toBe(false);
    expect(checkDomainGuardrail('Write a poem about love').isWithinDomain).toBe(false);
    expect(checkDomainGuardrail('Can you write Python code for a loop?').isWithinDomain).toBe(false);
  });

  it('should accept valid in-app billing queries', () => {
    expect(checkDomainGuardrail("How much did I sell today?").isWithinDomain).toBe(true);
    expect(checkDomainGuardrail('Show low stock products').isWithinDomain).toBe(true);
    expect(checkDomainGuardrail('Print the last invoice').isWithinDomain).toBe(true);
    expect(checkDomainGuardrail('Who has unpaid bills?').isWithinDomain).toBe(true);
    expect(checkDomainGuardrail('Check price of milk').isWithinDomain).toBe(true);
  });
});

describe('Offline AI Agent - Intent Matcher', () => {
  it('should identify greetings and help', () => {
    expect(matchIntent('hello').intent).toBe('GREETING');
    expect(matchIntent('namaste').intent).toBe('GREETING');
    expect(matchIntent('what can you do').intent).toBe('HELP_QUERY');
  });

  it('should match sales queries with proper date entities', () => {
    const todayRes = matchIntent("How much did I sell today?");
    expect(todayRes.intent).toBe('SALES_QUERY');
    expect(todayRes.entities.dateRange).toBe('today');

    const yestRes = matchIntent("Yesterday's sales");
    expect(yestRes.intent).toBe('SALES_QUERY');
    expect(yestRes.entities.dateRange).toBe('yesterday');

    const monthRes = matchIntent('Total revenue this month');
    expect(monthRes.intent).toBe('SALES_QUERY');
    expect(monthRes.entities.dateRange).toBe('this_month');
  });

  it('should match low stock and unpaid bills', () => {
    expect(matchIntent('Which products are low on stock?').intent).toBe('LOW_STOCK_QUERY');
    expect(matchIntent('Show unpaid bills').intent).toBe('UNPAID_QUERY');
    expect(matchIntent('pending payments from customers').intent).toBe('UNPAID_QUERY');
  });

  it('should match printer action', () => {
    expect(matchIntent('print last bill').intent).toBe('PRINT_ACTION');
    expect(matchIntent('is printer connected').intent).toBe('PRINT_ACTION');
  });
});

describe('Offline AI Agent - Agent Dispatcher', () => {
  const mockOrg: Organization = {
    id: 'test_org',
    name: 'Shree Ganesh Mart',
    address: 'Pune, Maharashtra',
    phone: '9876543210',
    mobile: '9876543210',
    email: 'shop@mart.com',
    gstNumber: '27AAAAA0000A1Z5',
    showGstOnBill: true,
    currency: '₹',
    slogan: 'Visit Again',
  };

  const mockProducts: Product[] = [
    {
      id: 'p1',
      name: 'Basmati Rice',
      description: 'Premium quality',
      price: 90,
      taxRate: 5,
      unit: 'KG',
      stockQuantity: 2, // Low stock!
    },
    {
      id: 'p2',
      name: 'Refined Oil',
      description: '1 Litre Pouch',
      price: 130,
      taxRate: 5,
      unit: 'Ltr',
      stockQuantity: 25,
    },
  ];

  const mockCustomers: Customer[] = [
    {
      id: 'default_customer',
      name: 'Walkin-customer',
      phone: '0000000000',
      email: '',
      address: '',
    },
    {
      id: 'c1',
      name: 'Ramesh Patel',
      phone: '9822001122',
      email: '',
      address: '',
    },
  ];

  const mockInvoices: InvoiceWithCustomerName[] = [
    {
      id: 'inv_1',
      invoiceNumber: 'INV-101',
      customerId: 'c1',
      customerName: 'Ramesh Patel',
      date: new Date().toISOString(), // today
      subtotal: 180,
      taxTotal: 9,
      cgstTotal: 4.5,
      sgstTotal: 4.5,
      discount: 0,
      grandTotal: 189,
      paymentStatus: 'Unpaid',
      paymentMethod: 'Cash',
    },
  ];

  it('should return sales summary for today', async () => {
    const res = await dispatchAgentQuery("How much did I sell today?", {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.text).toContain("Today's Sales Performance");
    expect(res.text).toContain('189.00');
    expect(res.cardType).toBe('SALES_STATS');
  });

  it('should flag low stock items accurately', async () => {
    const res = await dispatchAgentQuery('Show low stock products', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.text).toContain('Basmati Rice');
    expect(res.text).toContain('Only 2 KG left');
    expect(res.actions).toBeDefined();
    expect(res.actions![0].type).toBe('NAVIGATE');
  });

  it('should list unpaid bills', async () => {
    const res = await dispatchAgentQuery('Who has unpaid bills?', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.text).toContain('INV-101');
    expect(res.text).toContain('Ramesh Patel');
    expect(res.text).toContain('189.00');
  });

  it('should reject out-of-domain query gracefully', async () => {
    const res = await dispatchAgentQuery('What is the capital of France?', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.text).toContain('Parchiwala store assistant');
    expect(res.suggestedFollowUps).toBeDefined();
  });

  it('should draft a new order with items, customer and confirm action', async () => {
    const res = await dispatchAgentQuery('Order 2 kg Basmati Rice for Ramesh', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.text).toContain('Bill Auto-Created for Ramesh Patel');
    expect(res.text).toContain('Basmati Rice');
    expect(res.cardType).toBe('DRAFT_BILL');
    expect(res.cardData).toBeDefined();
    expect(res.cardData.items[0].name).toBe('Basmati Rice');
    expect(res.cardData.items[0].quantity).toBe(2);
    // Action to open print preview directly
    const autoPrintAction = res.actions?.find((a) => a.type === 'AUTO_PRINT_PREVIEW');
    expect(autoPrintAction).toBeDefined();
    expect(autoPrintAction?.payload).toBeDefined();
  });

  it('should auto-create bill for 1 kg apple at 120 and direct to print preview', async () => {
    const res = await dispatchAgentQuery('create a bill for 1 kg apple at 120', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.text).toContain('Bill Auto-Created for Walkin-customer');
    expect(res.text).toContain('Apple');
    expect(res.cardType).toBe('DRAFT_BILL');
    expect(res.cardData.items[0].name).toBe('Apple');
    expect(res.cardData.items[0].price).toBe(120);
    expect(res.cardData.items[0].quantity).toBe(1);
    const autoPrintAction = res.actions?.find((a) => a.type === 'AUTO_PRINT_PREVIEW');
    expect(autoPrintAction).toBeDefined();
  });

  it('should guide order creation when no items are specified', async () => {
    const res = await dispatchAgentQuery('Create a new order', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.text).toContain('Create a New Order');
    expect(res.text).toContain('Basmati Rice');
    expect(res.suggestedFollowUps).toBeDefined();
  });

  it('should auto-create unpaid order when user says "create a new order 1 kg apple with unpaid bill"', async () => {
    const appleProduct = {
      id: 'p3',
      name: 'Apple',
      description: 'Fresh apples',
      price: 120,
      taxRate: 0,
      unit: 'KG',
      stockQuantity: 50,
    };

    const res = await dispatchAgentQuery('create a new order 1 kg apple with unpaid bill', {
      invoices: mockInvoices,
      products: [...mockProducts, appleProduct],
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.text).toContain('Bill Auto-Created');
    expect(res.text).toContain('Apple');
    expect(res.text).toContain('Unpaid');
    expect(res.cardData.paymentStatus).toBe('Unpaid');
    expect(res.cardData.items[0].name).toBe('Apple');
    expect(res.cardData.items[0].quantity).toBe(1);
    const autoPrintAction = res.actions?.find((a) => a.type === 'AUTO_PRINT_PREVIEW');
    expect(autoPrintAction).toBeDefined();
    expect(autoPrintAction?.payload.paymentStatus).toBe('Unpaid');
  });

  it('should auto-create unpaid bill for Hinglish prompt "bhaiya 1 kg apple kar do udhar par"', async () => {
    const appleProduct = {
      id: 'p3',
      name: 'Apple',
      description: 'Fresh apples',
      price: 120,
      taxRate: 0,
      unit: 'KG',
      stockQuantity: 50,
    };

    const res = await dispatchAgentQuery('bhaiya 1 kg apple kar do udhar par', {
      invoices: mockInvoices,
      products: [...mockProducts, appleProduct],
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.text).toContain('Bill Auto-Created for Walkin-customer');
    expect(res.text).toContain('Apple');
    expect(res.cardType).toBe('DRAFT_BILL');
    expect(res.cardData.paymentStatus).toBe('Unpaid');
    expect(res.cardData.items[0].name).toBe('Apple');
    expect(res.cardData.items[0].quantity).toBe(1);
    const autoPrintAction = res.actions?.find((a) => a.type === 'AUTO_PRINT_PREVIEW');
    expect(autoPrintAction).toBeDefined();
    expect(autoPrintAction?.payload.paymentStatus).toBe('Unpaid');
  });

  it('should auto-create unpaid bill for Marathi prompt "bhau 1 kg apple karun dya udhari var"', async () => {
    const appleProduct = {
      id: 'p3',
      name: 'Apple',
      description: 'Fresh apples',
      price: 120,
      taxRate: 0,
      unit: 'KG',
      stockQuantity: 50,
    };

    const res = await dispatchAgentQuery('bhau 1 kg apple karun dya udhari var', {
      invoices: mockInvoices,
      products: [...mockProducts, appleProduct],
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.text).toContain('Bill Auto-Created for Walkin-customer');
    expect(res.text).toContain('Apple');
    expect(res.cardType).toBe('DRAFT_BILL');
    expect(res.cardData.paymentStatus).toBe('Unpaid');
    expect(res.cardData.items[0].name).toBe('Apple');
    expect(res.cardData.items[0].quantity).toBe(1);
    const autoPrintAction = res.actions?.find((a) => a.type === 'AUTO_PRINT_PREVIEW');
    expect(autoPrintAction).toBeDefined();
    expect(autoPrintAction?.payload.paymentStatus).toBe('Unpaid');
  });

  it('should auto-create multi-item order for Marathi prompt "dada 2 kilo tandul aani 1 tel lihun ghya"', async () => {
    const res = await dispatchAgentQuery('dada 2 kilo tandul aani 1 tel lihun ghya', {
      invoices: mockInvoices,
      products: mockProducts, // has Basmati Rice and Refined Oil
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.text).toContain('Bill Auto-Created');
    expect(res.cardType).toBe('DRAFT_BILL');
    expect(res.cardData.items.length).toBe(2);
    // Basmati Rice matched for "tandul"
    expect(res.cardData.items[0].name).toBe('Basmati Rice');
    expect(res.cardData.items[0].quantity).toBe(2);
    // Refined Oil matched for "tel"
    expect(res.cardData.items[1].name).toBe('Refined Oil');
    expect(res.cardData.items[1].quantity).toBe(1);
    const autoPrintAction = res.actions?.find((a) => a.type === 'AUTO_PRINT_PREVIEW');
    expect(autoPrintAction).toBeDefined();
  });

  it('should parse Marathi fractions like ardha kilo and paav kilo', async () => {
    const extraProds: Product[] = [
      { id: 'p_sug', name: 'Sugar', description: 'Refined sugar', price: 40, taxRate: 0, unit: 'KG', stockQuantity: 100 },
      { id: 'p_tea', name: 'Tea', description: 'Assam tea', price: 200, taxRate: 0, unit: 'KG', stockQuantity: 50 },
    ];

    const res = await dispatchAgentQuery('bhau ardha kilo sakhar aani paav kilo chaha', {
      invoices: mockInvoices,
      products: [...mockProducts, ...extraProds],
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(res.cardType).toBe('DRAFT_BILL');
    expect(res.cardData.items.length).toBe(2);
    // Sugar: 0.5 KG
    expect(res.cardData.items[0].name).toBe('Sugar');
    expect(res.cardData.items[0].quantity).toBe(0.5);
    // Tea: 0.25 KG
    expect(res.cardData.items[1].name).toBe('Tea');
    expect(res.cardData.items[1].quantity).toBe(0.25);
  });

  it('should process Marathi queries for sales, unpaid dues, and print', async () => {
    // 1. Marathi sales query
    const salesRes = await dispatchAgentQuery('aaj cha sale kiti jhala', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });
    expect(salesRes.cardType).toBe('SALES_STATS');
    expect(salesRes.text).toContain("Today's Sales Performance");

    // 2. Marathi unpaid query
    const unpaidRes = await dispatchAgentQuery('konache paise baki ahet', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });
    expect(unpaidRes.text).toContain('INV-101');
    expect(unpaidRes.text).toContain('Ramesh Patel');

    // 3. Marathi print action
    const printRes = await dispatchAgentQuery('shevatche bill print kara', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });
    expect(printRes.text).toContain('Printer');
  });
});
