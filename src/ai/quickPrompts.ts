import { SuggestedPrompt } from './types';

export const QUICK_PROMPTS: SuggestedPrompt[] = [
  {
    id: 'p0',
    title: 'Cash Bill',
    query: 'cash bill',
    icon: 'cart-plus',
  },
  {
    id: 'p2',
    title: "Today's Sales",
    query: "How much did I sell today?",
    icon: 'cash-register',
  },
  {
    id: 'p3',
    title: 'Unpaid Khata List',
    query: 'Show me unpaid bills and pending dues',
    icon: 'clock-alert-outline',
  },
  {
    id: 'p4',
    title: 'Low Stock Alert',
    query: 'Which products are low on stock?',
    icon: 'alert-circle-outline',
  },
  {
    id: 'p5',
    title: 'Print Last Bill',
    query: 'Print the last invoice',
    icon: 'printer',
  },
];

export const MERCHANT_BILLING_PROMPTS: SuggestedPrompt[] = [
  {
    id: 'mb_cash',
    title: 'Cash Bill',
    query: 'cash bill',
    icon: 'cash',
  },
  {
    id: 'mb_marathi',
    title: 'मराठी पावती',
    query: 'Bhau 1 kg apple karun dya',
    icon: 'translate',
  },
  {
    id: 'mb_multi',
    title: 'Multi-Item Order',
    query: '2 kilo tandul aani 1 tel lihun ghya',
    icon: 'basket-outline',
  },
  {
    id: 'mb_sales',
    title: "Today's Sales",
    query: "How much did I sell today?",
    icon: 'cash-register',
  },
  {
    id: 'mb_print',
    title: 'Print Last Bill',
    query: 'Print the last invoice',
    icon: 'printer',
  },
];

