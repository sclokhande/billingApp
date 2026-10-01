/**
 * Merchant-Centric AI Agent Prompt & Context Builder for Parchiwala Billing App
 *
 * Designed specifically for retail merchants, shopkeepers, and cashiers
 * operating a point-of-sale (POS) billing counter.
 */

import { Product, Customer, Organization } from '../db/types';

/**
 * Standard tool call structure returned by the AI agent for billing.
 */
export interface MerchantBillToolCall {
  tool: 'create_bill' | 'print_bill' | 'check_stock' | 'unknown';
  parameters: {
    customer_name?: string;
    customer_phone?: string | null;
    payment_status?: 'Paid' | 'Unpaid';
    payment_method?: 'Cash' | 'UPI' | 'Card';
    discount_amount?: number;
    notes?: string | null;
    items?: Array<{
      name: string;
      quantity: number;
      unit?: string;
      custom_price?: number | null;
    }>;
  };
  summary: string;
}

/**
 * The Master System Prompt for the AI Agent when the user is a Merchant.
 * Compatible with on-device LLMs (e.g. Qwen2.5-0.5B, Llama-3.2-1B) and Cloud LLMs (Gemini, GPT).
 */
export const MERCHANT_BILLING_SYSTEM_PROMPT = `
You are the high-speed AI Billing Assistant for Parchiwala, an on-device retail POS billing system.

### USER PERSONA:
- The user is the STORE MERCHANT / SHOPKEEPER / CASHIER (दुकानदार / व्यापारी).
- The merchant is standing at the billing counter, rapidly creating customer bills via speech or text shorthand.
- NEVER address the user as an end consumer. Do NOT say "Thank you for shopping with us" or "Your order is placed".
- Address the user as the store merchant (e.g., "Bill created for customer Ramesh", "Draft invoice ready for print").

### PRIMARY DIRECTIVE:
When the merchant gives a billing command, extract the items, quantities, customer details, payment method, and credit status, and output ONLY a valid JSON object matching the tool calling schema.

### STRICT RULES & CONSTRAINTS:
1. **ZERO MATH HALLUCINATION**:
   - DO NOT multiply prices, DO NOT calculate GST, DO NOT calculate grand totals or balances.
   - The app's deterministic billing engine performs exact mathematical and tax calculations.
   - You only extract quantities, units, and custom prices (if specified).

2. **CUSTOMER RESOLUTION**:
   - If the merchant mentions a customer name (e.g., "for Ramesh", "Raju bhai ka", "Suresh sathi"), extract it as customer_name.
   - If NO customer is mentioned, ALWAYS default customer_name to "Walkin-customer".

3. **PAYMENT STATUS & MODE**:
   - Default payment_status is "Paid" and payment_method is "Cash".
   - If the merchant mentions credit/dues ("udhar", "udhari", "khata", "baki", "credit", "pending", "nantar deto", "kal aake dega"), set:
     "payment_status": "Unpaid"
   - If online payment is mentioned ("GPay", "PhonePe", "Paytm", "UPI", "online", "QR code"), set:
     "payment_method": "UPI", "payment_status": "Paid"
   - If card is mentioned ("card", "swipe", "debit", "credit card"), set:
     "payment_method": "Card", "payment_status": "Paid"

4. **INDIAN RETAIL FRACTIONS & REGIONAL QUANTITIES**:
   - "aadha" / "ardha" = 0.5
   - "paav" / "pav" / "pao" = 0.25
   - "paune" / "paun" = 0.75
   - "dedh" / "dheed" = 1.5
   - "dhai" / "adich" = 2.5
   - "sawa" / "savva" = 1.25
   - "dozen" = 12 pcs, "aadha dozen" = 6 pcs
   - If no quantity is specified for an item, default quantity to 1.
   - Standard units: "kg", "gm", "ltr", "ml", "pcs", "pkt", "box", "meter".

5. **IGNORE HONORIFICS & FILLER WORDS**:
   - Strip colloquial conversational prefixes and suffixes:
     "bhau", "bhaiya", "dada", "kaka", "sethji", "anna", "tai", "bhai", "please", "kar do", "karun dya", "banao", "likho", "lihun ghya", "parchi", "pavti".

6. **CUSTOM ON-THE-FLY PRICES**:
   - If the merchant specifies a price on-the-fly (e.g., "apple at 120", "oil pouch 130 rs", "chawal rate 60"), set "custom_price" to that number.
   - If no price is mentioned, set "custom_price": null so the app uses the inventory catalog price.

### JSON OUTPUT SCHEMA:
Respond ONLY with this raw JSON object. Do not include markdown fences, backticks, or preamble:
{
  "tool": "create_bill",
  "parameters": {
    "customer_name": "string (default: 'Walkin-customer')",
    "customer_phone": "string | null",
    "payment_status": "'Paid' | 'Unpaid'",
    "payment_method": "'Cash' | 'UPI' | 'Card'",
    "discount_amount": 0,
    "notes": "string | null",
    "items": [
      {
        "name": "string",
        "quantity": 1,
        "unit": "string",
        "custom_price": null
      }
    ]
  },
  "summary": "Brief 1-sentence confirmation for merchant"
}
`.trim();

/**
 * High-quality few-shot examples representing real Indian merchant billing scenarios.
 */
export const MERCHANT_FEW_SHOT_EXAMPLES = [
  {
    input: "2 kg sugar, 1 kg basmati rice cash bill",
    output: {
      tool: "create_bill",
      parameters: {
        customer_name: "Walkin-customer",
        customer_phone: null,
        payment_status: "Paid",
        payment_method: "Cash",
        discount_amount: 0,
        notes: null,
        items: [
          { name: "Sugar", quantity: 2, unit: "kg", custom_price: null },
          { name: "Basmati Rice", quantity: 1, unit: "kg", custom_price: null }
        ]
      },
      summary: "Creating Cash Bill for Walkin-customer: 2 kg Sugar, 1 kg Basmati Rice"
    }
  },
  {
    input: "Bhaiya Ramesh ke naam pe 3 oil pouch udhar likh do, paise kal aake dega",
    output: {
      tool: "create_bill",
      parameters: {
        customer_name: "Ramesh",
        customer_phone: null,
        payment_status: "Unpaid",
        payment_method: "Cash",
        discount_amount: 0,
        notes: "Paise kal aake dega",
        items: [
          { name: "Oil", quantity: 3, unit: "pkt", custom_price: null }
        ]
      },
      summary: "Creating Unpaid (Udhar) Bill for Ramesh: 3 pkt Oil"
    }
  },
  {
    input: "Bhau ardha kilo sakhar aani paav kilo chaha Suresh sathi rokh",
    output: {
      tool: "create_bill",
      parameters: {
        customer_name: "Suresh",
        customer_phone: null,
        payment_status: "Paid",
        payment_method: "Cash",
        discount_amount: 0,
        notes: null,
        items: [
          { name: "Sugar", quantity: 0.5, unit: "kg", custom_price: null },
          { name: "Tea", quantity: 0.25, unit: "kg", custom_price: null }
        ]
      },
      summary: "Creating Cash Bill for Suresh: 0.5 kg Sugar, 0.25 kg Tea"
    }
  },
  {
    input: "1 kg apple at 120 rs and 2 packet bread for walkin via GPay",
    output: {
      tool: "create_bill",
      parameters: {
        customer_name: "Walkin-customer",
        customer_phone: null,
        payment_status: "Paid",
        payment_method: "UPI",
        discount_amount: 0,
        notes: null,
        items: [
          { name: "Apple", quantity: 1, unit: "kg", custom_price: 120 },
          { name: "Bread", quantity: 2, unit: "pkt", custom_price: null }
        ]
      },
      summary: "Creating UPI Bill for Walkin-customer: 1 kg Apple @ ₹120, 2 pkt Bread"
    }
  },
  {
    input: "5 kg gehu for Anita, 50 rupaye discount de do, card se payment kiya",
    output: {
      tool: "create_bill",
      parameters: {
        customer_name: "Anita",
        customer_phone: null,
        payment_status: "Paid",
        payment_method: "Card",
        discount_amount: 50,
        notes: null,
        items: [
          { name: "Wheat", quantity: 5, unit: "kg", custom_price: null }
        ]
      },
      summary: "Creating Card Bill for Anita with ₹50 discount: 5 kg Wheat"
    }
  }
];

/**
 * Context options for dynamically assembling merchant-tailored prompt.
 */
export interface MerchantPromptContext {
  organization?: Partial<Organization>;
  products?: Product[];
  customers?: Customer[];
}

/**
 * Builds a dynamic prompt injecting the store's actual catalog and customer list
 * to maximize extraction accuracy and fuzzy item resolution.
 */
export const buildMerchantBillingPrompt = (context: MerchantPromptContext = {}): string => {
  const storeName = context.organization?.name || 'Store';
  const currency = context.organization?.currency || '₹';

  let productContextText = '';
  if (context.products && context.products.length > 0) {
    const productList = context.products
      .slice(0, 50)
      .map((p) => `- ${p.name} (${currency}${p.price}/${p.unit || 'pcs'})`)
      .join('\n');
    productContextText = `
### CURRENT STORE INVENTORY CATALOG:
Use these exact product names when matching merchant speech:
${productList}
`;
  }

  let customerContextText = '';
  if (context.customers && context.customers.length > 0) {
    const custList = context.customers
      .slice(0, 30)
      .map((c) => `- ${c.name} ${c.phone ? `(${c.phone})` : ''}`)
      .join('\n');
    customerContextText = `
### REGISTERED CUSTOMERS (KHATA ACCOUNTS):
Match customer names against this store list:
${custList}
`;
  }

  const examplesText = MERCHANT_FEW_SHOT_EXAMPLES.map(
    (ex, idx) => `Example ${idx + 1}:
Merchant: "${ex.input}"
Assistant:
${JSON.stringify(ex.output, null, 2)}`
  ).join('\n\n');

  return `
${MERCHANT_BILLING_SYSTEM_PROMPT}

### STORE INFORMATION:
- Store Name: ${storeName}
- Currency: ${currency}
${productContextText}${customerContextText}
### FEW-SHOT EXAMPLES:
${examplesText}
`.trim();
};
