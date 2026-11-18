import { dispatchAgentQuery } from '../src/ai/agentDispatcher';

describe('Feature Lockdown Security Tests', () => {
  const dummyContext = {
    invoices: [],
    products: [
      {
        id: 'p1',
        name: 'Apple',
        description: 'Fresh apples',
        price: 100,
        taxRate: 0,
        unit: 'Kg',
        stockQuantity: 10,
      },
    ],
    customers: [
      {
        id: 'c1',
        name: 'Ramesh',
        phone: '9876543210',
        email: 'ramesh@example.com',
        address: 'Market Yard',
      },
    ],
    organization: {
      id: 'org1',
      name: 'Test Store',
      currency: '₹',
      address: 'Main Street',
      phone: '9876543210',
      mobile: '9876543210',
      email: 'test@example.com',
      gstNumber: '',
      showGstOnBill: false,
      slogan: 'Best Quality',
    },
    connectedPrinter: null,
  };

  it('blocks AI voice and text draft bill creation when terminal is locked', async () => {
    const res = await dispatchAgentQuery('create bill for 1 kg apple', {
      ...dummyContext,
      isPrinterLocked: true,
    });

    expect(res.text).toContain('Terminal Creation Restricted');
    expect(res.actions).toBeDefined();
    expect(res.actions?.some((a) => a.type === 'NAVIGATE')).toBe(true);
  });

  it('allows general queries like checking stock and sales even when terminal is locked', async () => {
    const res = await dispatchAgentQuery('check stock of apple', {
      ...dummyContext,
      isPrinterLocked: true,
    });

    expect(res.text).not.toContain('Terminal Creation Restricted');
    expect(res.text).toContain('Apple');
  });
});
