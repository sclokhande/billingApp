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

  it('should execute full conversational Q&A flow: create order -> apple 1.5kg -> Yes -> chiuku 1kg -> No -> 10% -> Final bill -> Confirm', async () => {
    const catalog: Product[] = [
      { id: 'p_app', name: 'Apple', description: 'Fresh Apples', price: 100, taxRate: 0, unit: 'KG', stockQuantity: 50 },
      { id: 'p_chi', name: 'Chikoo', description: 'Sweet Chikoo', price: 60, taxRate: 0, unit: 'KG', stockQuantity: 50 },
    ];

    // Turn 1: user: "Create an order"
    const turn1 = await dispatchAgentQuery('Create an order', {
      invoices: mockInvoices,
      products: catalog,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(turn1.text).toContain('Create a New Order');
    expect(turn1.text).toContain('Which product would you like to add');
    expect(turn1.orderSession).toBeDefined();
    expect(turn1.orderSession?.step).toBe('AWAITING_PRODUCT');

    // Turn 2: user: "add apple 1.5kg"
    const turn2 = await dispatchAgentQuery('add apple 1.5kg', {
      invoices: mockInvoices,
      products: catalog,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn1.orderSession,
    });

    expect(turn2.text).toContain('Added **Apple** — 1.5 kg');
    expect(turn2.text).toContain('Do you want to add more products? (Yes / No)');
    expect(turn2.orderSession?.step).toBe('AWAITING_MORE_PRODUCTS');
    expect(turn2.orderSession?.items.length).toBe(1);
    expect(turn2.orderSession?.items[0].total).toBe(150); // 1.5 * 100

    // Turn 3: user: "Yes"
    const turn3 = await dispatchAgentQuery('Yes', {
      invoices: mockInvoices,
      products: catalog,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn2.orderSession,
    });

    expect(turn3.text).toContain('Which product would you like to add next?');
    expect(turn3.orderSession?.step).toBe('AWAITING_PRODUCT');

    // Turn 4: user: "chiuku 1kg"
    const turn4 = await dispatchAgentQuery('chiuku 1kg', {
      invoices: mockInvoices,
      products: catalog,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn3.orderSession,
    });

    expect(turn4.text).toContain('Added **Chikoo** — 1 kg');
    expect(turn4.text).toContain('Do you want to add more products? (Yes / No)');
    expect(turn4.orderSession?.step).toBe('AWAITING_MORE_PRODUCTS');
    expect(turn4.orderSession?.items.length).toBe(2);

    // Turn 5: user: "no"
    const turn5 = await dispatchAgentQuery('no', {
      invoices: mockInvoices,
      products: catalog,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn4.orderSession,
    });

    expect(turn5.text).toContain('Cart total is');
    expect(turn5.text).toContain('add any discount');
    expect(turn5.orderSession?.step).toBe('AWAITING_DISCOUNT');

    // Turn 6: user: "10%"
    const turn6 = await dispatchAgentQuery('10%', {
      invoices: mockInvoices,
      products: catalog,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn5.orderSession,
    });

    expect(turn6.text).toContain('Final Bill Summary');
    expect(turn6.text).toContain('Discount (10%)');
    expect(turn6.cardType).toBe('FINAL_BILL_PREVIEW');
    expect(turn6.cardData.discountPct).toBe(10);
    // Subtotal: 150 + 60 = 210, Discount: 21, Grand Total: 189
    expect(turn6.cardData.subtotal).toBe(210);
    expect(turn6.cardData.grandTotal).toBe(189);
    expect(turn6.orderSession?.step).toBe('AWAITING_CONFIRMATION');

    // Turn 7: user: "Confirm"
    const turn7 = await dispatchAgentQuery('Confirm', {
      invoices: mockInvoices,
      products: catalog,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn6.orderSession,
    });

    expect(turn7.text).toContain('Print Preview');
    expect(turn7.actions?.[0].type).toBe('AUTO_PRINT_PREVIEW');
    expect(turn7.orderSession).toBeNull();
  });

  it('should support shortcut: directly typing next product at AWAITING_MORE_PRODUCTS', async () => {
    const catalog: Product[] = [
      { id: 'p_app', name: 'Apple', description: 'Fresh Apples', price: 100, taxRate: 0, unit: 'KG', stockQuantity: 50 },
      { id: 'p_chi', name: 'Chikoo', description: 'Sweet Chikoo', price: 60, taxRate: 0, unit: 'KG', stockQuantity: 50 },
    ];

    const turn1 = await dispatchAgentQuery('add apple 1kg', {
      invoices: mockInvoices,
      products: catalog,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: { step: 'AWAITING_PRODUCT', items: [] },
    });
    expect(turn1.orderSession?.step).toBe('AWAITING_MORE_PRODUCTS');

    // Directly type "chiuku 1kg" without saying "yes"
    const turn2 = await dispatchAgentQuery('chiuku 1kg', {
      invoices: mockInvoices,
      products: catalog,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn1.orderSession,
    });
    expect(turn2.orderSession?.items.length).toBe(2);
    expect(turn2.text).toContain('Added **Chikoo**');
    expect(turn2.text).toContain('Do you want to add more products?');
  });

  it('should cancel active order session upon cancel command', async () => {
    const res = await dispatchAgentQuery('cancel order', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: { step: 'AWAITING_PRODUCT', items: [] },
    });
    expect(res.text).toContain('Order cancelled');
    expect(res.orderSession).toBeNull();
  });

  it('should offer Add Product or Cancel Order if user does not add product when cart is empty', async () => {
    const res = await dispatchAgentQuery('i dont add product', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: { step: 'AWAITING_PRODUCT', items: [] },
    });
    expect(res.text).toContain('cart is currently empty');
    expect(res.text).toContain('Add a Product');
    expect(res.suggestedFollowUps).toContain('+ Add Product');
    expect(res.suggestedFollowUps).toContain('Cancel Order');
  });

  it('should advance to bill/discount when user says "i dont add product" or "proceed for bill" with items in cart', async () => {
    const existingSession = {
      step: 'AWAITING_PRODUCT' as const,
      items: [
        {
          productId: 'p_app',
          name: 'Apple',
          price: 100,
          quantity: 1.5,
          unit: 'KG',
          taxRate: 0,
          total: 150,
        },
      ],
    };

    const res = await dispatchAgentQuery('i dont add product', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: existingSession,
    });

    expect(res.text).toContain('Cart total is');
    expect(res.text).toContain('150.00');
    expect(res.orderSession?.step).toBe('AWAITING_DISCOUNT');
    expect(res.suggestedFollowUps).toContain('Proceed for Bill');
    expect(res.suggestedFollowUps).toContain('+ Add Product');
  });

  it('should allow user to tap "+ Add Product" to view and pick more products at any point', async () => {
    const existingSession = {
      step: 'AWAITING_DISCOUNT' as const,
      items: [
        {
          productId: 'p_app',
          name: 'Apple',
          price: 100,
          quantity: 1,
          unit: 'KG',
          taxRate: 0,
          total: 100,
        },
      ],
    };

    const res = await dispatchAgentQuery('+ Add Product', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: existingSession,
    });

    expect(res.text).toContain('Which product would you like to add next');
    expect(res.orderSession?.step).toBe('AWAITING_PRODUCT');
    expect(res.suggestedFollowUps).toContain('Generate Bill');
  });

  it('should support Cash Bill flow: select cash bill -> add product -> provide both Proceed button and Add More Product button', async () => {
    // 1. Select "cash bill"
    const turn1 = await dispatchAgentQuery('cash bill', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    expect(turn1.text).toContain('Create Cash Bill');
    expect(turn1.orderSession?.step).toBe('AWAITING_PRODUCT');
    expect(turn1.orderSession?.paymentMethod).toBe('Cash');
    expect(turn1.orderSession?.paymentStatus).toBe('Paid');
    expect(turn1.suggestedFollowUps).toContain('+ Add Product');

    // 2. Add product: "1 kg basmati rice"
    const turn2 = await dispatchAgentQuery('1 kg basmati rice', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn1.orderSession,
    });

    expect(turn2.text).toContain('Added **Basmati Rice**');
    expect(turn2.orderSession?.step).toBe('AWAITING_MORE_PRODUCTS');
    expect(turn2.orderSession?.items.length).toBe(1);

    // Verify BOTH action buttons exist: Generate Bill and + Add More Products
    expect(turn2.actions).toBeDefined();
    const proceedAction = turn2.actions?.find((a) => a.type === 'PROCEED_FOR_BILL');
    const addAction = turn2.actions?.find((a) => a.type === 'ADD_PRODUCT');
    expect(proceedAction).toBeDefined();
    expect(proceedAction?.label).toContain('Generate Bill');
    expect(addAction).toBeDefined();
    expect(addAction?.label).toContain('+ Add More Products');

    // Verify chips also have both options
    expect(turn2.suggestedFollowUps).toContain('Generate Bill');
    expect(turn2.suggestedFollowUps).toContain('+ Add Product');

    // 3. Tap Generate Bill
    const turn3 = await dispatchAgentQuery('Generate Bill', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn2.orderSession,
    });

    expect(turn3.text).toContain('Cart total is');
    expect(turn3.orderSession?.step).toBe('AWAITING_DISCOUNT');
    expect(turn3.suggestedFollowUps).toContain('Generate Bill');
  });

  it('should generate and print bill when user confirms with "Generate Bill" or "Confirm & Print"', async () => {
    const existingSession = {
      step: 'AWAITING_CONFIRMATION' as const,
      items: [
        {
          productId: 'p_app',
          name: 'Apple',
          price: 100,
          quantity: 2,
          unit: 'KG',
          taxRate: 0,
          total: 200,
        },
      ],
      discountPct: 10,
      discountAmount: 20,
    };

    const res = await dispatchAgentQuery('Generate Bill', {
      invoices: mockInvoices,
      products: mockProducts,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: existingSession,
    });

    expect(res.text).toContain('Generating bill');
    expect(res.actions).toBeDefined();
    const printAction = res.actions?.find((a) => a.type === 'AUTO_PRINT_PREVIEW');
    expect(printAction).toBeDefined();
    expect(printAction?.payload?.grandTotal).toBe(180);
    expect(res.orderSession).toBeNull();
  });

  it('should successfully add product with parentheses like "Apple (Fresh)" or "1 KG Apple (Fresh)" and allow generating bill', async () => {
    const productsWithSpecialNames: Product[] = [
      {
        id: 'prod_apple',
        name: 'Apple (Fresh)',
        description: 'Crisp apples',
        price: 120,
        taxRate: 0,
        unit: 'KG',
        stockQuantity: 50,
      },
      {
        id: 'prod_rice',
        name: 'Kolam Rice (Tandul)',
        description: 'Rice',
        price: 60,
        taxRate: 0,
        unit: 'KG',
        stockQuantity: 100,
      },
    ];

    // 1. Start cash bill
    const turn1 = await dispatchAgentQuery('cash bill', {
      invoices: mockInvoices,
      products: productsWithSpecialNames,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });
    expect(turn1.orderSession?.step).toBe('AWAITING_PRODUCT');

    // 2. Select product from chip: "1 KG Apple (Fresh)"
    const turn2 = await dispatchAgentQuery('1 KG Apple (Fresh)', {
      invoices: mockInvoices,
      products: productsWithSpecialNames,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn1.orderSession,
    });

    expect(turn2.text).toContain('Added **Apple (Fresh)**');
    expect(turn2.orderSession?.items.length).toBe(1);
    expect(turn2.orderSession?.items[0].name).toBe('Apple (Fresh)');
    expect(turn2.orderSession?.step).toBe('AWAITING_MORE_PRODUCTS');

    // 3. Click Generate Bill
    const turn3 = await dispatchAgentQuery('Generate Bill', {
      invoices: mockInvoices,
      products: productsWithSpecialNames,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn2.orderSession,
    });

    // Must NOT say cart is empty! Must show cart total and proceed
    expect(turn3.text).not.toContain('cart is currently empty');
    expect(turn3.text).toContain('Cart total is');
    expect(turn3.text).toContain('120.00');
    expect(turn3.orderSession?.step).toBe('AWAITING_DISCOUNT');
  });

  it('should support "select product" or "add Apple (Fresh)" syntax and add to cart', async () => {
    const productsWithSpecialNames: Product[] = [
      {
        id: 'prod_apple',
        name: 'Apple (Fresh)',
        description: 'Crisp apples',
        price: 120,
        taxRate: 0,
        unit: 'KG',
        stockQuantity: 50,
      },
    ];

    const turn1 = await dispatchAgentQuery('cash bill', {
      invoices: mockInvoices,
      products: productsWithSpecialNames,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
    });

    // User types "select Apple (Fresh)"
    const turn2 = await dispatchAgentQuery('select Apple (Fresh)', {
      invoices: mockInvoices,
      products: productsWithSpecialNames,
      customers: mockCustomers,
      organization: mockOrg,
      connectedPrinter: null,
      orderSession: turn1.orderSession,
    });

    expect(turn2.text).toContain('Added **Apple (Fresh)**');
    expect(turn2.orderSession?.items.length).toBe(1);
  });
});

