import { Customer } from '../db/types';

export type AgentIntentType =
  | 'SALES_QUERY'
  | 'UNPAID_QUERY'
  | 'INVENTORY_QUERY'
  | 'LOW_STOCK_QUERY'
  | 'CUSTOMER_QUERY'
  | 'INVOICE_QUERY'
  | 'PRINT_ACTION'
  | 'DRAFT_BILL'
  | 'NAVIGATION_ACTION'
  | 'HELP_QUERY'
  | 'GREETING'
  | 'OUT_OF_DOMAIN';

export interface ParsedItem {
  productName: string;
  quantity: number;
  unit?: string;
  price?: number;
  synonyms?: string[];
}

export interface AgentEntity {
  productName?: string;
  quantity?: number;
  unit?: string;
  price?: number;
  customerName?: string;
  customerPhone?: string;
  dateRange?: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all_time';
  invoiceNumber?: string;
  targetScreen?: string;
  orderItems?: ParsedItem[];
  paymentStatus?: 'Paid' | 'Unpaid';
  paymentMethod?: string;
}

export interface DraftOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  taxRate: number;
  total: number;
}

export interface DraftOrderData {
  customer: Customer;
  items: DraftOrderItem[];
  subtotal: number;
  taxTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: 'Paid' | 'Unpaid';
}

export interface ActiveOrderSession {
  step: 'AWAITING_PRODUCT' | 'AWAITING_MORE_PRODUCTS' | 'AWAITING_DISCOUNT' | 'AWAITING_CONFIRMATION';
  items: DraftOrderItem[];
  discountPct?: number;
  discountAmount?: number;
  customerId?: string;
  paymentMethod?: string;
  paymentStatus?: 'Paid' | 'Unpaid';
}

export interface AgentAction {
  id: string;
  label: string;
  type: 'NAVIGATE' | 'VIEW_INVOICE' | 'PRINT_INVOICE' | 'OPEN_BILLING' | 'CONFIRM_DRAFT' | 'AUTO_PRINT_PREVIEW' | 'CANCEL_ORDER' | 'CONFIRM_ORDER' | 'PROCEED_FOR_BILL' | 'ADD_PRODUCT';
  payload?: any;
  icon?: string;
}

export interface AgentMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actions?: AgentAction[];
  cardType?: 'INVOICE_SUMMARY' | 'LOW_STOCK_LIST' | 'DRAFT_BILL' | 'SALES_STATS' | 'PRODUCT_INFO' | 'FAST_BILL_BUILDER' | 'FINAL_BILL_PREVIEW';
  cardData?: any;
  suggestedFollowUps?: string[];
}

export interface AgentResponse {
  text: string;
  actions?: AgentAction[];
  cardType?: 'INVOICE_SUMMARY' | 'LOW_STOCK_LIST' | 'DRAFT_BILL' | 'SALES_STATS' | 'PRODUCT_INFO' | 'FAST_BILL_BUILDER' | 'FINAL_BILL_PREVIEW';
  cardData?: any;
  suggestedFollowUps?: string[];
  orderSession?: ActiveOrderSession | null;
}

export interface SuggestedPrompt {
  id: string;
  title: string;
  query: string;
  icon: string;
}
