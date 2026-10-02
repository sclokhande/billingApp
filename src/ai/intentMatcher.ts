import { AgentIntentType, AgentEntity, ParsedItem } from './types';

export interface MatchResult {
  intent: AgentIntentType;
  confidence: number;
  entities: AgentEntity;
}

// Spoken fractions in Marathi / Hindi / English
const FRACTION_WORDS: Record<string, number> = {
  ardha: 0.5,
  aadha: 0.5,
  adha: 0.5,
  paav: 0.25,
  pao: 0.25,
  pav: 0.25,
  paune: 0.75,
  paun: 0.75,
  dheed: 1.5,
  dedh: 1.5,
  adich: 2.5,
  dhai: 2.5,
  sawa: 1.25,
  savva: 1.25,
};

// Spoken numbers in Marathi / Hindi
const NUMBER_WORDS: Record<string, number> = {
  ek: 1,
  don: 2,
  do: 2,
  teen: 3,
  tin: 3,
  char: 4,
  chaar: 4,
  paach: 5,
  paanch: 5,
  panch: 5,
  saha: 6,
  chhe: 6,
  che: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  nauu: 9,
  nav: 9,
  daha: 10,
  das: 10,
  pandhra: 15,
  pandrah: 15,
  vis: 20,
  bees: 20,
  panchas: 50,
  pannaas: 50,
  shambhar: 100,
  sau: 100,
};

// Common grocery transliteration and translation helpers
export const PRODUCT_SYNONYMS: Record<string, string[]> = {
  apple: ['safarchand', 'seb', 'apple', 'apples'],
  chikoo: ['chiku', 'chikoo', 'chiuku', 'chikku', 'sapota', 'sapodilla'],
  banana: ['kela', 'kele', 'banana', 'bananas'],
  mango: ['aamba', 'aam', 'mango', 'mangoes'],
  rice: ['tandul', 'chawal', 'rice', 'basmati'],
  sugar: ['sakhar', 'cheeni', 'sugar'],
  tea: ['chaha', 'chai', 'tea', 'patti'],
  milk: ['doodh', 'dudh', 'milk'],
  oil: ['tel', 'refined', 'oil', 'shingdana tel'],
  onion: ['kanda', 'pyaaz', 'onion'],
  potato: ['batata', 'aloo', 'potato'],
  soap: ['sabun', 'soap'],
  wheat: ['gahu', 'gehu', 'atta', 'aata', 'wheat'],
  salt: ['meeth', 'namak', 'salt'],
};

export const isAddProductCommand = (text: string): boolean => {
  const norm = text.trim().toLowerCase();
  return (
    /^(add|add product|add products|add item|add items|add more|add more product|add more products|\+ add product|\+ add more product|\+ add more products|\+ add|\+ add item|aur add karo|aur product|ek aur|yes|haan|ho)\b/i.test(
      norm
    ) ||
    norm === 'add' ||
    norm === 'add product' ||
    norm === 'add products' ||
    norm === '+ add product' ||
    norm === '+ add more product' ||
    norm === '+ add more products' ||
    norm === 'add more' ||
    norm === '+ add' ||
    norm === 'add item' ||
    norm === 'yes'
  );
};

export const isAffirmative = (text: string): boolean => {
  const norm = text.trim().toLowerCase();
  return (
    /^(yes|yeah|yep|yup|haan|ha|haa|ho|hoyi|sure|ok|okay|add|add more|aur|aur add karo|yes please|y)\b/i.test(norm) ||
    norm === 'yes' ||
    norm === 'haan' ||
    norm === 'ho' ||
    norm === 'add'
  );
};

export const isNegativeOrDone = (text: string): boolean => {
  const norm = text.trim().toLowerCase();
  if (
    /^(i\s+)?(?:don'?t|dont|do\s+not)\s+(?:want\s+to\s+)?add(?:\s+(?:any\s+)?product[s]?)?/i.test(norm) ||
    /^(no\s+(?:more\s+)?(?:product[s]?|item[s]?|add)|no\s+need|nothing|skip|leave\s+it)\b/i.test(norm) ||
    /\b(dont\s+add|don't\s+add|nahi\s+pahije|nako|kahi\s+nako|kuch\s+nahi)\b/i.test(norm)
  ) {
    return true;
  }
  return (
    /^(no|nope|nah|nahi|nahin|na|n|bas|no more|done|proceed|proceed for bill|proceed to bill|proceed bill|checkout|finish|nahi pahije|create bill|nikalo|banao|khatam|no discount|none|bill karo|bill please)\b/i.test(
      norm
    ) ||
    norm === 'no' ||
    norm === 'nahi' ||
    norm === 'bas' ||
    norm === 'done' ||
    norm === 'proceed' ||
    norm === 'proceed for bill' ||
    norm === 'proceed to bill'
  );
};

export const isProceedForBill = (text: string): boolean => {
  const norm = text.trim().toLowerCase();
  if (
    /^(i\s+)?(?:don'?t|dont|do\s+not)\s+(?:want\s+to\s+)?add(?:\s+(?:any\s+)?product[s]?)?/i.test(norm) ||
    /^(no\s+(?:more\s+)?(?:product[s]?|item[s]?|add)|no\s+need|nothing|skip|leave\s+it)\b/i.test(norm) ||
    /\b(dont\s+add|don't\s+add|nahi\s+pahije|nako|kahi\s+nako|kuch\s+nahi)\b/i.test(norm)
  ) {
    return true;
  }
  return (
    /\b(proceed for bill|proceed to bill|proceed bill|proceed with bill|proceed|generate bill|generate|create bill|bill banao|bill banva|bill nikalo|bill please|only bill|just bill|checkout|make bill|banao bill)\b/i.test(
      norm
    ) ||
    norm === 'proceed for bill' ||
    norm === 'proceed to bill' ||
    norm === 'proceed' ||
    norm === 'generate bill' ||
    norm === 'generate' ||
    norm === 'bill' ||
    norm === 'done' ||
    norm === 'finish' ||
    norm === 'bas'
  );
};

export const isCancelCommand = (text: string): boolean => {
  const norm = text.trim().toLowerCase();
  return /^(cancel|stop|reset|abort|cancel order|radd|radd kara|nahi chahiye|chhod do|chhod)\b/i.test(
    norm
  );
};

export const parseDiscount = (text: string): { percentage?: number; amount?: number } | null => {
  const norm = text.trim().toLowerCase();
  if (isNegativeOrDone(norm) || /\b(no discount|zero|none|0%|0 percent|0)\b/i.test(norm)) {
    return { percentage: 0 };
  }
  const mPct = norm.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|pratishat|takke)/i);
  if (mPct) {
    const val = parseFloat(mPct[1]);
    if (val >= 0 && val <= 100) {
      return { percentage: val };
    }
  }
  const mFlatRs = norm.match(/(?:discount\s+)?(\d+(?:\.\d+)?)\s*(?:rs|rupees|rupaye|inr)/i);
  if (mFlatRs) {
    return { amount: parseFloat(mFlatRs[1]) };
  }
  const mPlainNum = norm.match(/^(\d+(?:\.\d+)?)$/);
  if (mPlainNum) {
    const val = parseFloat(mPlainNum[1]);
    if (val > 0 && val <= 50) {
      return { percentage: val };
    }
    return { amount: val };
  }
  return null;
};

const resolveProductSynonyms = (rawName: string): { canonicalName: string; synonyms: string[] } => {
  const lower = rawName.toLowerCase().trim();
  const stripped = lower.replace(/\(.*?\)/g, '').trim();
  for (const [canonical, syns] of Object.entries(PRODUCT_SYNONYMS)) {
    if (
      syns.some(
        (s) =>
          lower === s ||
          lower.includes(s) ||
          s.includes(lower) ||
          stripped === s ||
          stripped.includes(s) ||
          s.includes(stripped)
      )
    ) {
      return { canonicalName: canonical, synonyms: [rawName, stripped, canonical, ...syns] };
    }
  }
  return { canonicalName: rawName, synonyms: [rawName, stripped] };
};

/**
 * Extract multiple items, customer, and payment status from multilingual queries like:
 * "create a new order 1 kg apple with unpaid bill"
 * "bhaiya 1 kg apple kar do udhar par"
 * "bhau 1 kg apple karun dya udhari var"
 * "dada 2 kilo tandul aani 1 tel lihun ghya"
 * "bhau ardha kilo sakhar aani paav kilo chaha"
 */
export const parseOrderItems = (
  text: string
): {
  items: ParsedItem[];
  customerName?: string;
  paymentStatus?: 'Paid' | 'Unpaid';
  paymentMethod?: string;
} => {
  let workingText = text.trim();
  let customerName: string | undefined;
  let paymentStatus: 'Paid' | 'Unpaid' | undefined;
  let paymentMethod: string | undefined;

  // 0. Strip leading plus or symbol
  workingText = workingText.replace(/^\s*\+\s*/, '');

  // 1. Normalize units: kilo -> kg, liter -> ltr, etc.
  workingText = workingText
    .replace(/\b(?:kilo|kilos)\b/gi, 'kg')
    .replace(/\b(?:gram|grams|giram)\b/gi, 'gm')
    .replace(/\b(?:liter|litre|litr|liters|litres)\b/gi, 'ltr')
    .replace(/\b(?:packet|packets|pudha|pudhe)\b/gi, 'pkt')
    .replace(/\b(?:dabi|dabbi|box|boxes)\b/gi, 'box')
    .replace(/\b(?:nag|dana|piece|pieces)\b/gi, 'pcs');

  // 2. Detect payment status in English, Hindi, and Marathi
  if (
    /\b(unpaid|pending|due|not paid|credit|udhaar|udhar|udhari|khatyavar|khata|baki|nantar deto)\b/i.test(
      workingText
    )
  ) {
    paymentStatus = 'Unpaid';
  } else if (/\b(paid|rokh|rok|jama|chukt)\b/i.test(workingText)) {
    paymentStatus = 'Paid';
  }

  // 3. Detect payment method
  if (/\b(cash|rok|rokh)\b/i.test(workingText)) {
    paymentMethod = 'Cash';
  } else if (/\b(upi|online|gpay|phonepe|paytm)\b/i.test(workingText)) {
    paymentMethod = 'UPI';
  } else if (/\b(card)\b/i.test(workingText)) {
    paymentMethod = 'Card';
  }

  // 4. Strip honorifics (bhau, bhaiya, dada, kaka, tai, etc.)
  workingText = workingText.replace(
    /^\s*(?:bhau|bhaiya|bhai|dada|kaka|mama|anna|tai|didi|seth|shethji|babu|ji)\s+/gi,
    ''
  );

  // 5. Strip payment status and billing clauses
  workingText = workingText
    .replace(/\b(?:with|as|and)?\s*(?:unpaid|pending|due|paid|rokh|rok)\s*(?:bill|invoice|payment|status|order|pavti)?\b/gi, ' ')
    .replace(/\b(?:udhari\s+var|udhar\s+par|udhari|udhar|khatyavar|nantar\s+deto)\b/gi, ' ')
    .replace(/\b(?:by|in|via)?\s*(?:cash|upi|card|online)\s*(?:payment|mode)?\b/gi, ' ');

  // 6. Strip action verbs in Marathi, Hindi & English (including select, pick, product, etc.)
  workingText = workingText
    .replace(/\b(kar\s+do|karun\s+dya|kar\s+dena|banva|banao|lihun\s+ghya|likh\s+lo|likh\s+do|taak|kara|karo|bilaat\s+ghya|bilaat|pavti|create|make|new|draft|place|take|an|a|bill|invoice|order|parchi|with|please|add|aur|select|choose|pick|product|item|products|items|chahiye|pahije|dya|de\s+do|de|dena|want|need)\b/gi, ' ');

  // 7. Match customer clause (e.g. "for Ramesh", "Ramesh saathi", "for customer Ramesh")
  const custMatch = workingText.match(/\b(?:for|saathi|sathi)\s+(?:customer\s+|client\s+)?([a-zA-Z\s]+)$/i);
  if (custMatch) {
    const candidate = custMatch[1].trim();
    if (!/^(?:\d|kg|gm|pcs|ltr|box|pkt)/i.test(candidate)) {
      customerName = candidate;
      workingText = workingText.slice(0, custMatch.index).trim();
    }
  }

  // 8. Convert spoken fractions (ardha kilo -> 0.5 kg, paav kilo -> 0.25 kg)
  for (const [fracWord, val] of Object.entries(FRACTION_WORDS)) {
    const reg = new RegExp(`\\b${fracWord}\\s*(kg|gm|ltr|pcs|pkt|box)?\\b`, 'gi');
    workingText = workingText.replace(reg, (_match, u) => `${val}${u ? ' ' + u : ''}`);
  }

  // 9. Convert spoken numbers in Marathi / Hindi (don kilo -> 2 kg, teen -> 3)
  for (const [numWord, val] of Object.entries(NUMBER_WORDS)) {
    const reg = new RegExp(`\\b${numWord}\\b`, 'gi');
    workingText = workingText.replace(reg, String(val));
  }

  const clean = workingText
    .replace(/\bfor\s+(\d)/gi, '$1')
    .replace(/^\s*for\s+/gi, '')
    .trim();

  // 10. Split by conjunctions: "and", "aani", "ani", "aur", "va", "&", "+", or commas
  const segments = clean
    .split(/\s*(?:,|&|\+|\band\b|\baani\b|\bani\b|\baur\b|\bva\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: ParsedItem[] = [];

  for (const seg of segments) {
    const cleanSeg = seg.replace(/^\s*(?:for|with|of|add|aur|select|choose|pick|product|item)\s+/i, '').trim();

    // Pattern 1: quantity first (e.g. "1.5 kg apple (fresh)" or "2 milk at 30")
    const m = cleanSeg.match(
      /^(\d+(?:\.\d+)?)\s*(kg|gm|pcs|ltr|pkt|meter|box)?\s+([a-zA-Z0-9\s\-\(\)\.\/\'\&]+?)(?:\s+(?:at|@|rate|price|rs\.?|inr|rupaye|rupya)\s*(\d+(?:\.\d+)?)(?:\s*(?:rs|inr|\/\-|rupaye|rupya))?)?$/i
    );

    // Pattern 2: product first (e.g. "apple (fresh) 1.5kg" or "chiuku 1kg" or "chawal 5kg rate 50")
    const mPostQty = cleanSeg.match(
      /^([a-zA-Z0-9\s\-\(\)\.\/\'\&]+?)\s+(\d+(?:\.\d+)?)\s*(kg|gm|pcs|ltr|pkt|meter|box)?(?:\s+(?:at|@|rate|price|rs\.?|inr|rupaye|rupya)\s*(\d+(?:\.\d+)?)(?:\s*(?:rs|inr|\/\-|rupaye|rupya))?)?$/i
    );

    if (m) {
      const rawName = m[3].replace(/^(?:for|with|of|add|select|product|item)\s+/i, '').trim();
      const { canonicalName, synonyms } = resolveProductSynonyms(rawName);
      items.push({
        quantity: parseFloat(m[1]),
        unit: m[2],
        productName: canonicalName,
        price: m[4] ? parseFloat(m[4]) : undefined,
        synonyms,
      });
    } else if (mPostQty) {
      const rawName = mPostQty[1].replace(/^(?:for|with|of|add|select|product|item)\s+/i, '').trim();
      const { canonicalName, synonyms } = resolveProductSynonyms(rawName);
      items.push({
        quantity: parseFloat(mPostQty[2]),
        unit: mPostQty[3],
        productName: canonicalName,
        price: mPostQty[4] ? parseFloat(mPostQty[4]) : undefined,
        synonyms,
      });
    } else {
      // If no quantity at start or end, check if item name with optional price
      const mNoQty = cleanSeg.match(
        /^([a-zA-Z0-9\s\-\(\)\.\/\'\&]+?)(?:\s+(?:at|@|rate|price|rs\.?|inr|rupaye|rupya)\s*(\d+(?:\.\d+)?)(?:\s*(?:rs|inr|\/\-|rupaye|rupya))?)?$/i
      );
      if (mNoQty) {
        const cleanName = mNoQty[1].replace(/^(?:customer|client|for|with|of|add|select|product|item)\s+/i, '').trim();
        if (cleanName.length > 1 && !/^\d+$/.test(cleanName)) {
          const { canonicalName, synonyms } = resolveProductSynonyms(cleanName);
          items.push({
            quantity: 1,
            productName: canonicalName,
            price: mNoQty[2] ? parseFloat(mNoQty[2]) : undefined,
            synonyms,
          });
        }
      }
    }
  }

  return { items, customerName, paymentStatus, paymentMethod };
};

export const matchIntent = (query: string): MatchResult => {
  const normalized = query.trim().toLowerCase();
  const entities: AgentEntity = {};

  // 1. GREETING
  if (
    /^(hi|hello|hey|namaste|namaskar|ram ram|good morning|good afternoon|good evening)\b/i.test(
      normalized
    )
  ) {
    return { intent: 'GREETING', confidence: 0.95, entities };
  }

  // 2. HELP QUERY
  if (
    /^(help|what can you do|who are you|how to use|commands|features|guide|madat|kasa vapraycha)\b/i.test(
      normalized
    ) ||
    normalized === 'help'
  ) {
    return { intent: 'HELP_QUERY', confidence: 0.95, entities };
  }

  // 3. DRAFT BILL / CREATE ORDER (High priority: Check creation commands before queries)
  // Supports English, Hinglish ("bhaiya 1 kg apple kar do udhar par"), and Marathi ("bhau 1 kg apple karun dya udhari var")
  const isDraftBill =
    /\b(fast cash bill|cash bill|quick bill|fast bill|quick cash bill|udhar bill|credit bill)\b/i.test(normalized) ||
    /^(?:create\s+(?:an?\s+)?order|new\s+order|order\s+karo|order\s+banao|order)$/i.test(normalized) ||
    (/\b(create|make|new|draft|place|take)\b/i.test(normalized) &&
      /\b(bill|invoice|parchi|order|pavti)\b/i.test(normalized)) ||
    /^(?:order|bill|pavti)\s+/i.test(normalized) ||
    /\b(kar\s*do|karun\s*dya|kar\s*dena|banva|banao|lihun\s*ghya|likh\s*lo|likh\s*do|bilaat)\b/i.test(
      normalized
    ) ||
    (/\b(udhari\s*var|udhar\s*par|udhari|udhar)\b/i.test(normalized) &&
      /\b(\d+|kilo|kg|apple|rice|oil|sugar|milk|tea|soap|tandul|chawal|tel|sakhar|seb|safarchand)\b/i.test(
        normalized
      )) ||
    (/^(?:bhau|bhaiya|bhai|dada|kaka|mama|tai|didi)\b/i.test(normalized) &&
      /\b(\d+|kilo|kg|ardha|aadha|paav|pao|don|teen|chaar|paach)\b/i.test(normalized));

  if (isDraftBill) {
    const { items, customerName, paymentStatus, paymentMethod } = parseOrderItems(normalized);
    if (customerName) {
      entities.customerName = customerName;
    }
    if (paymentStatus) {
      entities.paymentStatus = paymentStatus;
    }
    if (paymentMethod) {
      entities.paymentMethod = paymentMethod;
    }
    if (items.length > 0) {
      entities.orderItems = items;
      entities.quantity = items[0].quantity;
      entities.unit = items[0].unit;
      entities.productName = items[0].productName;
      entities.price = items[0].price;
    }

    return { intent: 'DRAFT_BILL', confidence: 0.95, entities };
  }

  // 4. PRINT ACTION (Supports English, Hindi, and Marathi: "shevatche bill print kara")
  if (
    (/\b(print|printing|chhap|chhape|chhapoon)\b/i.test(normalized) &&
      /\b(bill|invoice|receipt|slip|parchi|order|last|shevatche|aakhri|pavti)\b/i.test(normalized)) ||
    /\b(shevatche|aakhri|last)\s*(?:bill|invoice|parchi|pavti)?\s*(?:print|chhapoon|kara|karo|dya)\b/i.test(
      normalized
    )
  ) {
    return { intent: 'PRINT_ACTION', confidence: 0.92, entities };
  }

  if (/\b(printer status|is printer connected|check printer)\b/i.test(normalized)) {
    return { intent: 'PRINT_ACTION', confidence: 0.9, entities };
  }

  // 5. LOW STOCK QUERY
  if (
    /\b(low stock|out of stock|running out|low inventory|stock alert|reorder)\b/i.test(normalized) ||
    (/\bstock\b/i.test(normalized) && /\b(low|empty|less|alert|finish)\b/i.test(normalized)) ||
    /\b(kami\s*stock|sampat\s*aalele|kam\s*stock)\b/i.test(normalized)
  ) {
    return { intent: 'LOW_STOCK_QUERY', confidence: 0.95, entities };
  }

  // 6. UNPAID / DUE QUERY (e.g. "konache paise baki ahet", "kiska paisa baki hai", "udhari kiti aahe")
  if (
    (/\b(unpaid|pending|due|dues|debt|balance|owing|not paid|un-paid)\b/i.test(normalized) ||
      (/\b(baki|udhari)\b/i.test(normalized) &&
        /\b(paise|kiti|kitna|konache|kiska|dakhva|dikhao|ahet|hai)\b/i.test(normalized)) ||
      /\b(konache|kiske)\s+paise\s+baki\b/i.test(normalized)) &&
    !/\b(create|make|new|draft|place|take|kar\s*do|karun\s*dya)\b/i.test(normalized)
  ) {
    return { intent: 'UNPAID_QUERY', confidence: 0.92, entities };
  }

  // 7. SALES / REVENUE QUERY (Supports Marathi: "aaj cha sale kiti jhala", "kal cha sale")
  if (
    /\b(sale|sales|revenue|collection|collected|earned|earning|earnings|income|turnover|vikri|kamai|dhandha)\b/i.test(
      normalized
    ) ||
    (/\b(aaj|kal)\b/i.test(normalized) &&
      /\b(kiti|kitna|kamavle|jhala|hua|sale|vikri|bika)\b/i.test(normalized)) ||
    (/\b(how much|total|kiti|kitna)\b/i.test(normalized) &&
      /\b(money|business|sold|today|yesterday|month|week|dhandha|kamai|aaj|kal)\b/i.test(normalized)) ||
    /\b(today('s)? bills|today('s)? invoices|today('s)? orders)\b/i.test(normalized)
  ) {
    if (/\b(yesterday|kal)\b/i.test(normalized)) {
      entities.dateRange = 'yesterday';
    } else if (/\b(month|this month|mahina|mahinyat)\b/i.test(normalized)) {
      entities.dateRange = 'this_month';
    } else if (/\b(week|this week|last 7 days|aathvada|hafte)\b/i.test(normalized)) {
      entities.dateRange = 'this_week';
    } else if (/\b(all time|overall|total life)\b/i.test(normalized)) {
      entities.dateRange = 'all_time';
    } else {
      entities.dateRange = 'today';
    }
    return { intent: 'SALES_QUERY', confidence: 0.9, entities };
  }

  // 8. INVOICE / ORDER LOOKUP
  if (
    /\b(last|latest|recent|shevatche|aakhri)\b/i.test(normalized) &&
    /\b(bill|invoice|parchi|receipt|order|pavti)\b/i.test(normalized)
  ) {
    return { intent: 'INVOICE_QUERY', confidence: 0.9, entities: { invoiceNumber: 'LAST' } };
  }

  const invNumMatch = normalized.match(
    /\b(inv-\d+|\b(?:bill|invoice|order|pavti)\s*(?:#|no\.?|number)?\s*([a-zA-Z0-9\-]+))\b/i
  );
  if (invNumMatch) {
    entities.invoiceNumber = invNumMatch[2] || invNumMatch[1];
    return { intent: 'INVOICE_QUERY', confidence: 0.9, entities };
  }

  // 9. NAVIGATION SHORTCUTS
  if (/\b(go to|open|take me to|navigate to|show screen|dakhva)\b/i.test(normalized)) {
    if (/\b(printer|bluetooth)\b/i.test(normalized)) {
      entities.targetScreen = 'PrinterConnect';
    } else if (/\b(backup|restore|export|import|security)\b/i.test(normalized)) {
      entities.targetScreen = 'SecurityBackup';
    } else if (/\b(product|products|inventory|item|items|stock|maal)\b/i.test(normalized)) {
      entities.targetScreen = 'Inventory';
    } else if (/\b(customer|customers|client|clients|grahak)\b/i.test(normalized)) {
      entities.targetScreen = 'Customers';
    } else if (/\b(billing|new bill|create bill|order|pavti)\b/i.test(normalized)) {
      entities.targetScreen = 'Billing';
    } else if (/\b(profile|store|shop|settings|dukan)\b/i.test(normalized)) {
      entities.targetScreen = 'Profile';
    }
    return { intent: 'NAVIGATION_ACTION', confidence: 0.92, entities };
  }

  // 10. CUSTOMER QUERY
  if (/\b(customer|customers|client|grahak)\b/i.test(normalized)) {
    const custNameMatch = normalized.match(/(?:customer|client|grahak)\s+([a-zA-Z0-9\s]+)/i);
    if (custNameMatch) {
      entities.customerName = custNameMatch[1].trim();
    }
    return { intent: 'CUSTOMER_QUERY', confidence: 0.85, entities };
  }

  // 11. INVENTORY / PRODUCT QUERY (e.g. "sakhar kiti baki aahe", "price of milk")
  if (
    /\b(product|products|item|items|price of|rate of|how much is|stock of|bhav|kimat|dar)\b/i.test(
      normalized
    ) ||
    /\b(kiti\s*baki|kitna\s*bacha)\b/i.test(normalized)
  ) {
    const prodMatch = normalized.match(
      /(?:price of|stock of|rate of|for)\s+([a-zA-Z0-9\s]+)|([a-zA-Z0-9\s]+)\s+(?:kiti\s*baki|kitna\s*bacha|cha\s*bhav|ka\s*rate)/i
    );
    if (prodMatch) {
      entities.productName = (prodMatch[1] || prodMatch[2] || '').trim();
    }
    return { intent: 'INVENTORY_QUERY', confidence: 0.85, entities };
  }

  // Fallback / Default Intent
  return {
    intent: 'HELP_QUERY',
    confidence: 0.5,
    entities,
  };
};

