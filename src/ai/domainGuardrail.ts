/**
 * Domain guardrails ensure the AI assistant remains strictly scoped
 * to Parchiwala Billing & Shop Operations.
 */

const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /\b(weather|temperature|forecast)\b/i,
  /\b(president|prime minister|politics|election|minister)\b/i,
  /\b(poem|poetry|story|joke|riddle|song|lyrics)\b/i,
  /\b(movie|cinema|actor|actress|cricket|football|match score)\b/i,
  /\b(python|javascript|java|c\+\+|html|css|coding|code)\b/i,
  /\b(recipe|how to cook|ingredients for pizza|cake)\b/i,
  /\b(capital of|population of|distance between)\b/i,
  /\b(who is the richest|who made you|who created world)\b/i,
  /\b(translate|french|spanish|german|hindi to english)\b/i,
];

const IN_SCOPE_KEYWORDS: RegExp[] = [
  /\b(bill|billing|invoice|invoices|parchi|receipt|slip|order|pavti|bila)\b/i,
  /\b(sale|sales|revenue|collection|earning|earnings|income|profit|turnover|vikri|kamai|dhandha)\b/i,
  /\b(product|products|item|items|stock|inventory|price|cost|rate|quantity|unit|vastu|maal|saman|bhav|kimat|dar)\b/i,
  /\b(customer|customers|client|buyer|phone|mobile|address|ledger|khata|grahak|party)\b/i,
  /\b(unpaid|pending|due|dues|debt|balance|paid|payment|cash|upi|card|udhari|udhar|baki|jama|rok|rokh)\b/i,
  /\b(print|printer|bluetooth|thermal|paper|chhap|chhape|dya|kara)\b/i,
  /\b(backup|restore|export|import|security|pin|store|profile|settings|gst|tax|cgst|sgst|dukan)\b/i,
  /\b(today|yesterday|week|month|daily|summary|report|stats|stat|dashboard|aaj|kal|mahina|aathvada)\b/i,
  /\b(create|make|add|generate|find|search|show|check|view|open|navigate|banao|banva|liha|likho|kar|karo|dakhva|dikhana)\b/i,
  /\b(hi|hello|hey|namaste|morning|evening|help|who are you|what can you do|features|madat|namaskar|ram ram)\b/i,
  /\b(apple|rice|oil|sugar|milk|tea|soap|chawal|tandul|tel|sakhar|cheeni|dudh|doodh|chaha|chai|seb|safarchand|kanda|batata|aloo|pyaaz|aata|dal|daal|masala)\b/i,
  /\b(bhau|bhaiya|bhai|dada|kaka|mama|anna|tai|didi|udhari|udhar|jhala|ahet|aahe|kiti|ghya|lihun)\b/i,
];

export interface GuardrailCheckResult {
  isWithinDomain: boolean;
  rejectReason?: string;
  suggestedPrompt?: string;
}

export const checkDomainGuardrail = (rawQuery: string): GuardrailCheckResult => {
  const cleanQuery = rawQuery.trim().toLowerCase();

  if (!cleanQuery) {
    return {
      isWithinDomain: false,
      rejectReason: 'Please enter a billing or store query.',
    };
  }

  // 1. Explicit out-of-domain patterns
  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(cleanQuery)) {
      return {
        isWithinDomain: false,
        rejectReason:
          'I am your Parchiwala store assistant, designed strictly to help with your shop billing, inventory, sales analytics, and printer operations. I cannot answer general knowledge or external questions.',
        suggestedPrompt: "Try asking: 'How much did I sell today?' or 'Show low stock products'",
      };
    }
  }

  // 2. Check if at least one in-scope keyword matches
  const hasInScopeKeyword = IN_SCOPE_KEYWORDS.some((kw) => kw.test(cleanQuery));

  if (!hasInScopeKeyword && cleanQuery.split(' ').length > 2) {
    // If the query is more than 2 words and contains zero store/billing keywords, reject it
    return {
      isWithinDomain: false,
      rejectReason:
        'This request is outside the scope of Parchiwala. I can only assist with your store bills, inventory stock, customer lookups, and sales reports.',
      suggestedPrompt: "Try: 'Show today's sales' or 'Print last bill'",
    };
  }

  return { isWithinDomain: true };
};
