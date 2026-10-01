import {
  MERCHANT_BILLING_SYSTEM_PROMPT,
  MERCHANT_FEW_SHOT_EXAMPLES,
  buildMerchantBillingPrompt,
  MERCHANT_BILLING_PROMPTS,
} from '../src/ai';
import { Product, Customer, Organization } from '../src/db/types';

describe('Merchant-Centric AI Prompt System', () => {
  it('should define a merchant persona and zero-math constraint in system prompt', () => {
    expect(MERCHANT_BILLING_SYSTEM_PROMPT).toContain('STORE MERCHANT / SHOPKEEPER / CASHIER');
    expect(MERCHANT_BILLING_SYSTEM_PROMPT).toContain('ZERO MATH HALLUCINATION');
    expect(MERCHANT_BILLING_SYSTEM_PROMPT).toContain('create_bill');
    expect(MERCHANT_BILLING_SYSTEM_PROMPT).toContain('Walkin-customer');
    expect(MERCHANT_BILLING_SYSTEM_PROMPT).toContain('Unpaid');
  });

  it('should have valid few-shot examples with matching JSON structure', () => {
    expect(MERCHANT_FEW_SHOT_EXAMPLES.length).toBeGreaterThanOrEqual(4);
    for (const ex of MERCHANT_FEW_SHOT_EXAMPLES) {
      expect(ex.input).toBeDefined();
      expect(ex.output.tool).toBe('create_bill');
      expect(ex.output.parameters.items).toBeDefined();
      expect(ex.output.parameters.items!.length).toBeGreaterThan(0);
      expect(ex.output.summary).toBeDefined();
    }
  });

  it('should dynamically inject store inventory and customers into the prompt', () => {
    const mockOrg: Organization = {
      id: 'org1',
      name: 'Super Kirana Store',
      currency: '₹',
      address: '',
      phone: '',
      mobile: '',
      email: '',
      gstNumber: '',
      showGstOnBill: false,
      slogan: '',
    };

    const mockProds: Product[] = [
      { id: 'p1', name: 'Kolam Rice', price: 65, unit: 'kg', description: '', taxRate: 0, stockQuantity: 50 },
      { id: 'p2', name: 'Sunflower Oil', price: 140, unit: 'ltr', description: '', taxRate: 0, stockQuantity: 20 },
    ];

    const mockCusts: Customer[] = [
      { id: 'c1', name: 'Ganesh Shinde', phone: '9876543210', email: '', address: '' },
    ];

    const prompt = buildMerchantBillingPrompt({
      organization: mockOrg,
      products: mockProds,
      customers: mockCusts,
    });

    expect(prompt).toContain('Super Kirana Store');
    expect(prompt).toContain('Kolam Rice (₹65/kg)');
    expect(prompt).toContain('Sunflower Oil (₹140/ltr)');
    expect(prompt).toContain('Ganesh Shinde (9876543210)');
    expect(prompt).toContain('FEW-SHOT EXAMPLES');
  });

  it('should export merchant quick billing prompts for counter use', () => {
    expect(MERCHANT_BILLING_PROMPTS.length).toBeGreaterThanOrEqual(4);
    const cashPrompt = MERCHANT_BILLING_PROMPTS.find((p) => p.id === 'mb_cash');
    expect(cashPrompt).toBeDefined();
    expect(cashPrompt?.query).toContain('cash bill');
  });
});
