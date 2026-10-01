import { checkDomainGuardrail } from './domainGuardrail';
import { matchIntent, PRODUCT_SYNONYMS } from './intentMatcher';
import { AgentResponse, AgentAction } from './types';
import { Product, Customer, Organization } from '../db/types';
import { InvoiceWithCustomerName } from '../db/operations';

export interface DispatchContext {
  invoices: InvoiceWithCustomerName[];
  products: Product[];
  customers: Customer[];
  organization: Organization;
  connectedPrinter: any | null;
  onNavigate?: (screenName: string, params?: any) => void;
  onPrintInvoice?: (invoiceId: string) => Promise<boolean>;
}

// Date helpers
const isToday = (dateStr: string): boolean => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
};

const isYesterday = (dateStr: string): boolean => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return (
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate()
  );
};

const isThisWeek = (dateStr: string): boolean => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);
  return diffDays >= 0 && diffDays <= 7;
};

const isThisMonth = (dateStr: string): boolean => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

export const dispatchAgentQuery = async (
  rawQuery: string,
  context: DispatchContext
): Promise<AgentResponse> => {
  const { invoices, products, customers, organization, connectedPrinter } = context;
  const currency = organization.currency || '₹';

  // 1. Guardrail Scope Check
  const guardrail = checkDomainGuardrail(rawQuery);
  if (!guardrail.isWithinDomain) {
    return {
      text: guardrail.rejectReason || 'This query is outside of Parchiwala Billing scope.',
      suggestedFollowUps: ["How much did I sell today?", 'Show low stock products', 'Print last bill'],
    };
  }

  // 2. Offline Intent & Entity Extraction
  const { intent, entities } = matchIntent(rawQuery);

  // 3. Dispatch to Domain Handlers
  switch (intent) {
    case 'GREETING': {
      const storeName = organization.name ? ` at **${organization.name}**` : '';
      return {
        text: `Hello! 👋 I am your offline **Parchiwala Store Assistant**${storeName}.\n\nHow can I help you manage your shop today?`,
        suggestedFollowUps: ["Today's Sales", 'Low Stock Alert', 'Unpaid Invoices', 'Print Last Bill'],
      };
    }

    case 'HELP_QUERY': {
      return {
        text: `Here is everything I can help you with right on your device:\n\n` +
          `• 📊 **Sales & Revenue**: *"Today's sales"*, *"This month revenue"*, *"Total bills"*\n` +
          `• ⚠️ **Inventory Alerts**: *"Low stock items"*, *"Stock of Rice"*, *"Price of Milk"*\n` +
          `• 💰 **Payment Khata**: *"Unpaid bills"*, *"Pending payments"*\n` +
          `• 🧾 **Invoices**: *"Show last bill"*, *"Find bill INV-001"*\n` +
          `• 🖨️ **Receipt Printer**: *"Print last bill"*, *"Is printer connected?"*\n` +
          `• ⚡ **App Navigation**: *"Open printer settings"*, *"Go to backup"*, *"Store profile"*`,
        suggestedFollowUps: ["Today's Sales", 'Low Stock Alert', 'Unpaid Invoices'],
      };
    }

    case 'SALES_QUERY': {
      let filteredInvoices = invoices;
      let periodLabel = "All-Time";

      if (entities.dateRange === 'yesterday') {
        filteredInvoices = invoices.filter((i) => isYesterday(i.date));
        periodLabel = 'Yesterday';
      } else if (entities.dateRange === 'this_week') {
        filteredInvoices = invoices.filter((i) => isThisWeek(i.date));
        periodLabel = 'Last 7 Days';
      } else if (entities.dateRange === 'this_month') {
        filteredInvoices = invoices.filter((i) => isThisMonth(i.date));
        periodLabel = 'This Month';
      } else if (entities.dateRange === 'all_time') {
        filteredInvoices = invoices;
        periodLabel = 'All-Time';
      } else {
        filteredInvoices = invoices.filter((i) => isToday(i.date));
        periodLabel = "Today";
      }

      const totalCount = filteredInvoices.length;
      const totalAmount = filteredInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
      const paidAmount = filteredInvoices
        .filter((i) => i.paymentStatus === 'Paid')
        .reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
      const unpaidAmount = filteredInvoices
        .filter((i) => i.paymentStatus === 'Unpaid')
        .reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

      const responseText =
        `📊 **${periodLabel}'s Sales Performance**\n\n` +
        `• **Total Invoices**: ${totalCount} bill${totalCount === 1 ? '' : 's'}\n` +
        `• **Total Revenue**: ${currency}${totalAmount.toFixed(2)}\n` +
        `• **Collected (Paid)**: ${currency}${paidAmount.toFixed(2)}\n` +
        `• **Pending (Unpaid)**: ${currency}${unpaidAmount.toFixed(2)}`;

      const actions: AgentAction[] = [
        {
          id: 'act_view_bills',
          label: 'View Invoices List',
          type: 'NAVIGATE',
          payload: { screen: 'Dashboard' },
          icon: 'receipt',
        },
      ];

      return {
        text: responseText,
        cardType: 'SALES_STATS',
        cardData: {
          periodLabel,
          totalCount,
          totalAmount,
          paidAmount,
          unpaidAmount,
          currency,
        },
        actions,
        suggestedFollowUps: ['Who has unpaid bills?', 'Low stock alert', 'Print last bill'],
      };
    }

    case 'UNPAID_QUERY': {
      const unpaidList = invoices.filter((i) => i.paymentStatus === 'Unpaid');
      const totalUnpaid = unpaidList.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

      if (unpaidList.length === 0) {
        return {
          text: `🎉 **Great news!** You have **0 unpaid bills**.\nAll invoices are fully settled!`,
          suggestedFollowUps: ["Today's Sales", 'Low Stock Alert'],
        };
      }

      const topUnpaid = unpaidList.slice(0, 5);
      const listText = topUnpaid
        .map(
          (inv) =>
            `• Bill **#${inv.invoiceNumber}** — ${inv.customerName || 'Walkin'} — **${currency}${inv.grandTotal.toFixed(2)}**`
        )
        .join('\n');

      const text =
        `⚠️ You have **${unpaidList.length} unpaid bill${unpaidList.length === 1 ? '' : 's'}** totaling **${currency}${totalUnpaid.toFixed(2)}**.\n\n` +
        listText +
        (unpaidList.length > 5 ? `\n...and ${unpaidList.length - 5} more.` : '');

      const actions: AgentAction[] = [];
      if (topUnpaid[0]) {
        actions.push({
          id: 'act_view_unpaid',
          label: `View Bill #${topUnpaid[0].invoiceNumber}`,
          type: 'VIEW_INVOICE',
          payload: { invoiceId: topUnpaid[0].id },
          icon: 'eye-outline',
        });
      }

      return {
        text,
        actions,
        suggestedFollowUps: ["Today's Sales", 'Print last bill'],
      };
    }

    case 'LOW_STOCK_QUERY': {
      const lowStockThreshold = 5;
      const lowStockItems = products.filter(
        (p) => (p.stockQuantity ?? 0) <= lowStockThreshold
      );

      if (lowStockItems.length === 0) {
        return {
          text: `✅ **Inventory Healthy!** No items are below the safety stock threshold of ${lowStockThreshold} units.`,
          suggestedFollowUps: ["Today's Sales", 'Show store summary'],
        };
      }

      const listText = lowStockItems
        .slice(0, 6)
        .map((p) => {
          const isOut = (p.stockQuantity ?? 0) <= 0;
          return `• **${p.name}**: ${isOut ? '❌ OUT OF STOCK' : `⚠️ Only ${p.stockQuantity} ${p.unit || 'pcs'} left`}`;
        })
        .join('\n');

      const text =
        `⚠️ Found **${lowStockItems.length} product${lowStockItems.length === 1 ? '' : 's'}** needing restock:\n\n` +
        listText +
        (lowStockItems.length > 6 ? `\n...and ${lowStockItems.length - 6} other items.` : '');

      const actions: AgentAction[] = [
        {
          id: 'act_go_inventory',
          label: 'Manage Inventory',
          type: 'NAVIGATE',
          payload: { screen: 'Inventory' },
          icon: 'package-variant-closed',
        },
      ];

      return {
        text,
        cardType: 'LOW_STOCK_LIST',
        cardData: { items: lowStockItems.slice(0, 5) },
        actions,
        suggestedFollowUps: ["Today's Sales", 'Unpaid Invoices'],
      };
    }

    case 'INVENTORY_QUERY': {
      if (entities.productName) {
        const queryTerm = entities.productName.toLowerCase();
        const searchTerms = [queryTerm];
        for (const [canonical, syns] of Object.entries(PRODUCT_SYNONYMS)) {
          if (syns.some((s) => s === queryTerm || s.includes(queryTerm) || queryTerm.includes(s))) {
            searchTerms.push(canonical, ...syns);
            break;
          }
        }

        const match = products.find((p) => {
          const pName = p.name.toLowerCase();
          return searchTerms.some((st) => pName.includes(st) || st.includes(pName));
        });

        if (match) {
          const isLow = (match.stockQuantity ?? 0) <= 5;
          return {
            text:
              `📦 **${match.name}**\n\n` +
              `• **Price**: ${currency}${match.price.toFixed(2)} per ${match.unit || 'pcs'}\n` +
              `• **Stock Quantity**: ${match.stockQuantity} ${match.unit || 'pcs'} ${isLow ? '⚠️ (Low Stock)' : '✅'}\n` +
              `• **Tax / GST Rate**: ${match.taxRate || 0}%\n` +
              (match.description ? `• **Details**: ${match.description}` : ''),
            actions: [
              {
                id: 'act_view_prod',
                label: 'View in Inventory',
                type: 'NAVIGATE',
                payload: { screen: 'Inventory' },
                icon: 'package-variant',
              },
            ],
            suggestedFollowUps: ['Low stock alert', 'Create new bill'],
          };
        } else {
          return {
            text: `I couldn't find a product named **"${entities.productName}"** in your inventory.`,
            actions: [
              {
                id: 'act_add_prod',
                label: 'Add New Product',
                type: 'NAVIGATE',
                payload: { screen: 'Inventory' },
                icon: 'plus',
              },
            ],
            suggestedFollowUps: ['Show low stock products', 'Today\'s Sales'],
          };
        }
      }

      // General inventory summary
      const totalProds = products.length;
      const outOfStockCount = products.filter((p) => (p.stockQuantity ?? 0) <= 0).length;
      return {
        text:
          `📦 **Store Inventory Overview**\n\n` +
          `• Total Products Listed: **${totalProds}**\n` +
          `• Out of Stock Items: **${outOfStockCount}**`,
        actions: [
          {
            id: 'act_open_inv',
            label: 'Open Inventory',
            type: 'NAVIGATE',
            payload: { screen: 'Inventory' },
            icon: 'package-variant-closed',
          },
        ],
        suggestedFollowUps: ['Low stock alert', "Today's Sales"],
      };
    }

    case 'CUSTOMER_QUERY': {
      if (entities.customerName) {
        const queryTerm = entities.customerName.toLowerCase();
        const match = customers.find(
          (c) =>
            c.name.toLowerCase().includes(queryTerm) ||
            (c.phone && c.phone.includes(queryTerm))
        );

        if (match) {
          const custBills = invoices.filter((i) => i.customerId === match.id);
          const totalSpent = custBills.reduce((sum, i) => sum + (i.grandTotal || 0), 0);
          const unpaidBills = custBills.filter((i) => i.paymentStatus === 'Unpaid');
          const unpaidAmount = unpaidBills.reduce((sum, i) => sum + (i.grandTotal || 0), 0);

          return {
            text:
              `👤 **Customer Profile: ${match.name}**\n\n` +
              `• **Phone**: ${match.phone || 'N/A'}\n` +
              `• **Total Orders**: ${custBills.length} invoices\n` +
              `• **Total Purchase**: ${currency}${totalSpent.toFixed(2)}\n` +
              `• **Pending Due**: ${currency}${unpaidAmount.toFixed(2)} ${unpaidAmount > 0 ? '⚠️' : '✅'}`,
            actions: [
              {
                id: 'act_view_cust',
                label: 'View Customers',
                type: 'NAVIGATE',
                payload: { screen: 'Customers' },
                icon: 'account-outline',
              },
            ],
            suggestedFollowUps: ["Today's Sales", 'Unpaid Invoices'],
          };
        } else {
          return {
            text: `I couldn't find a customer named **"${entities.customerName}"**.`,
            actions: [
              {
                id: 'act_add_cust',
                label: 'Add Customer',
                type: 'NAVIGATE',
                payload: { screen: 'Customers' },
                icon: 'account-plus',
              },
            ],
            suggestedFollowUps: ['Unpaid Invoices', "Today's Sales"],
          };
        }
      }

      return {
        text: `You currently have **${customers.length} registered customers** in your store.`,
        actions: [
          {
            id: 'act_open_custs',
            label: 'Open Customers',
            type: 'NAVIGATE',
            payload: { screen: 'Customers' },
            icon: 'account-multiple',
          },
        ],
        suggestedFollowUps: ['Unpaid Invoices', "Today's Sales"],
      };
    }

    case 'INVOICE_QUERY': {
      if (invoices.length === 0) {
        return {
          text: `You have not created any bills yet. Tap below to create your first invoice!`,
          actions: [
            {
              id: 'act_create_first_bill',
              label: 'Create Invoice',
              type: 'NAVIGATE',
              payload: { screen: 'Billing' },
              icon: 'receipt',
            },
          ],
        };
      }

      let targetInvoice = invoices[0]; // default: latest

      if (entities.invoiceNumber && entities.invoiceNumber !== 'LAST') {
        const found = invoices.find(
          (i) =>
            i.invoiceNumber.toLowerCase() === entities.invoiceNumber!.toLowerCase() ||
            i.invoiceNumber.toLowerCase().includes(entities.invoiceNumber!.toLowerCase())
        );
        if (found) {
          targetInvoice = found;
        }
      }

      const invDate = new Date(targetInvoice.date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const text =
        `🧾 **Invoice #${targetInvoice.invoiceNumber}**\n\n` +
        `• **Customer**: ${targetInvoice.customerName || 'Walkin-customer'}\n` +
        `• **Date**: ${invDate}\n` +
        `• **Total Amount**: ${currency}${targetInvoice.grandTotal.toFixed(2)}\n` +
        `• **Status**: ${targetInvoice.paymentStatus === 'Paid' ? '✅ Paid' : '⚠️ Unpaid'}\n` +
        `• **Payment Mode**: ${targetInvoice.paymentMethod || 'Cash'}`;

      const actions: AgentAction[] = [
        {
          id: 'act_view_target_inv',
          label: 'View Bill Details',
          type: 'VIEW_INVOICE',
          payload: { invoiceId: targetInvoice.id },
          icon: 'eye-outline',
        },
        {
          id: 'act_print_target_inv',
          label: 'Print Bill',
          type: 'PRINT_INVOICE',
          payload: { invoiceId: targetInvoice.id },
          icon: 'printer',
        },
      ];

      return {
        text,
        cardType: 'INVOICE_SUMMARY',
        cardData: targetInvoice,
        actions,
        suggestedFollowUps: ["Today's Sales", 'Unpaid Invoices'],
      };
    }

    case 'PRINT_ACTION': {
      if (invoices.length === 0) {
        return {
          text: `There are no invoices available to print yet.`,
          suggestedFollowUps: ["Create a new bill", "Today's Sales"],
        };
      }

      const lastInv = invoices[0];
      const printerName = connectedPrinter ? connectedPrinter.name || 'Bluetooth Printer' : null;

      if (!printerName) {
        return {
          text:
            `⚠️ **No Thermal Printer Connected**\n\n` +
            `To print invoice **#${lastInv.invoiceNumber}**, please connect your Bluetooth thermal printer first.`,
          actions: [
            {
              id: 'act_connect_printer',
              label: 'Connect Printer',
              type: 'NAVIGATE',
              payload: { screen: 'PrinterConnect' },
              icon: 'bluetooth',
            },
          ],
        };
      }

      return {
        text:
          `🖨️ **Printer Ready: ${printerName}**\n\n` +
          `Ready to print last invoice **#${lastInv.invoiceNumber}** for **${currency}${lastInv.grandTotal.toFixed(2)}**.`,
        actions: [
          {
            id: 'act_do_print',
            label: `Print #${lastInv.invoiceNumber}`,
            type: 'PRINT_INVOICE',
            payload: { invoiceId: lastInv.id },
            icon: 'printer',
          },
          {
            id: 'act_preview_print',
            label: 'Print Preview',
            type: 'NAVIGATE',
            payload: { screen: 'PrintPreview', params: { invoiceId: lastInv.id } },
            icon: 'file-document-outline',
          },
        ],
      };
    }

    case 'DRAFT_BILL': {
      // 1. Resolve Customer
      let targetCustomer: Customer | undefined;
      if (entities.customerName) {
        const queryTerm = entities.customerName.toLowerCase();
        targetCustomer = customers.find(
          (c) =>
            c.name.toLowerCase().includes(queryTerm) ||
            (c.phone && c.phone.includes(queryTerm))
        );
      }
      if (!targetCustomer) {
        targetCustomer =
          customers.find(
            (c) =>
              c.id === 'default_customer' ||
              c.name.toLowerCase().includes('walkin')
          ) ||
          customers[0] || {
            id: 'default_customer',
            name: 'Walkin-customer',
            phone: '0000000000',
            email: '',
            address: '',
          };
      }

      // Helper for unit conversion
      const getConvertedPrice = (basePrice: number, baseUnit: string, targetUnit: string): number => {
        const bu = (baseUnit || 'Pcs').toLowerCase();
        const tu = (targetUnit || 'Pcs').toLowerCase();
        if (bu === tu) return basePrice;
        if (bu === 'kg' && tu === 'gm') return basePrice / 1000;
        if (bu === 'gm' && tu === 'kg') return basePrice * 1000;
        if ((bu === 'ltr' || bu === 'litre') && tu === 'ml') return basePrice / 1000;
        if (bu === 'ml' && (tu === 'ltr' || tu === 'litre')) return basePrice * 1000;
        return basePrice;
      };

      // 2. Resolve Items
      const rawItems = entities.orderItems && entities.orderItems.length > 0
        ? entities.orderItems
        : entities.productName
        ? [{ productName: entities.productName, quantity: entities.quantity || 1, unit: entities.unit, price: entities.price }]
        : [];

      const draftItems: any[] = [];
      const notFoundNames: string[] = [];

      for (const item of rawItems) {
        const searchTerms = [
          item.productName,
          ...(item.synonyms || []),
        ].map((t) => t.toLowerCase());

        const matchedProduct = products.find((p) => {
          const pName = p.name.toLowerCase();
          return searchTerms.some((st) => pName.includes(st) || st.includes(pName));
        });

        if (matchedProduct) {
          const itemUnit = item.unit || matchedProduct.unit || 'Pcs';
          const basePrice = item.price || matchedProduct.price;
          const unitPrice = getConvertedPrice(basePrice, matchedProduct.unit, itemUnit);
          const itemTaxRate = organization.showGstOnBill && organization.gstNumber ? matchedProduct.taxRate || 0 : 0;
          const itemSubtotal = unitPrice * item.quantity;
          const itemTax = itemSubtotal * (itemTaxRate / 100);
          const itemTotal = itemSubtotal + itemTax;

          draftItems.push({
            productId: matchedProduct.id,
            name: matchedProduct.name,
            price: unitPrice,
            quantity: item.quantity,
            unit: itemUnit,
            taxRate: itemTaxRate,
            total: itemTotal,
            availableStock: matchedProduct.stockQuantity ?? 0,
          });
        } else if (item.price && item.price > 0) {
          // Dynamic on-the-fly item if user provided price (e.g. "1 kg apple at 100 rs")
          const itemUnit = item.unit || 'KG';
          const unitPrice = item.price;
          const itemTaxRate = 0;
          const itemSubtotal = unitPrice * item.quantity;
          const itemTax = 0;
          const itemTotal = itemSubtotal + itemTax;

          draftItems.push({
            productId: 'custom_' + Math.random().toString(36).substring(2, 9),
            name: item.productName.charAt(0).toUpperCase() + item.productName.slice(1),
            price: unitPrice,
            quantity: item.quantity,
            unit: itemUnit,
            taxRate: itemTaxRate,
            total: itemTotal,
            availableStock: 999,
          });
        } else {
          notFoundNames.push(item.productName);
        }
      }

      // If no valid items matched or specified
      if (draftItems.length === 0) {
        if (notFoundNames.length > 0) {
          return {
            text:
              `⚠️ Product **"${notFoundNames.join(', ')}"** was not found in your inventory.\n\n` +
              `To auto-create this bill, you can:\n` +
              `• Mention the price: e.g. *"create a bill for 1 kg ${notFoundNames[0]} at 120"*\n` +
              `• Or add it to your inventory first.`,
            actions: [
              {
                id: 'act_add_first_prod',
                label: `Add "${notFoundNames[0]}" to Inventory`,
                type: 'NAVIGATE',
                payload: { screen: 'Inventory' },
                icon: 'plus',
              },
            ],
            suggestedFollowUps: products.slice(0, 3).map((p) => `Create bill for 1 ${p.name}`),
          };
        }

        if (products.length === 0) {
          return {
            text: `⚠️ You don't have any products in your inventory yet. Please add products first before creating an order.`,
            actions: [
              {
                id: 'act_add_first_prod',
                label: 'Add Products to Inventory',
                type: 'NAVIGATE',
                payload: { screen: 'Inventory' },
                icon: 'package-variant-closed',
              },
            ],
          };
        }

        const topProds = products.slice(0, 4);
        const prodSuggestions = topProds
          .map((p) => `• *'Create bill for 1 ${p.unit || 'pcs'} ${p.name}'*`)
          .join('\n');

        return {
          text:
            `🛍️ **Create a New Order**\n\n` +
            `Tell me which items you want to bill, for example:\n` +
            prodSuggestions +
            `\n\nOr tap below to open the standard billing screen.`,
          actions: [
            {
              id: 'act_open_billing',
              label: 'Open Billing Screen',
              type: 'NAVIGATE',
              payload: { screen: 'Billing' },
              icon: 'receipt',
            },
          ],
          suggestedFollowUps: topProds.slice(0, 3).map((p) => `Order 1 ${p.name}`),
        };
      }

      // Calculations for matched draft items
      const subtotal = draftItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const taxTotal = organization.showGstOnBill && organization.gstNumber
        ? draftItems.reduce((sum, item) => sum + (item.price * item.quantity * (item.taxRate / 100)), 0)
        : 0;
      const cgstTotal = taxTotal / 2;
      const sgstTotal = taxTotal / 2;
      const grandTotal = subtotal + taxTotal;

      // Check stock warnings
      const stockWarnings = draftItems
        .filter((item) => item.quantity > item.availableStock)
        .map((item) => `⚠️ Note: *${item.name}* order qty (${item.quantity}) exceeds in-stock (${item.availableStock} ${item.unit})`);

      const itemsSummary = draftItems
        .map(
          (item, idx) =>
            `${idx + 1}. **${item.name}** — ${item.quantity} ${item.unit} × ${currency}${item.price.toFixed(2)} = **${currency}${(item.price * item.quantity).toFixed(2)}**`
        )
        .join('\n');

      const paymentStatus = entities.paymentStatus || 'Paid';
      const paymentMethod = entities.paymentMethod || 'Cash';

      const draftOrderData = {
        customer: targetCustomer,
        items: draftItems,
        subtotal,
        taxTotal,
        cgstTotal,
        sgstTotal,
        grandTotal,
        paymentMethod,
        paymentStatus,
      };

      const responseText =
        `🧾 **Bill Auto-Created for ${targetCustomer.name}**\n\n` +
        `• **Items (${draftItems.length})**:\n${itemsSummary}\n\n` +
        `• **Subtotal**: ${currency}${subtotal.toFixed(2)}\n` +
        (taxTotal > 0 ? `• **GST Tax**: ${currency}${taxTotal.toFixed(2)}\n` : '') +
        `• **Grand Total**: **${currency}${grandTotal.toFixed(2)}**\n` +
        `• **Payment Status**: ${paymentStatus === 'Unpaid' ? '⚠️ Unpaid (Pending)' : '✅ Paid'}\n` +
        (stockWarnings.length > 0 ? `\n${stockWarnings.join('\n')}\n` : '') +
        `\nOpening Print Preview for this bill...`;

      const actions: AgentAction[] = [
        {
          id: 'act_auto_print',
          label: `Open Print Preview (${currency}${grandTotal.toFixed(2)})`,
          type: 'AUTO_PRINT_PREVIEW',
          payload: draftOrderData,
          icon: 'printer',
        },
        {
          id: 'act_open_billing_manual',
          label: 'Edit in Billing Screen',
          type: 'NAVIGATE',
          payload: { screen: 'Billing' },
          icon: 'pencil-outline',
        },
      ];

      return {
        text: responseText,
        cardType: 'DRAFT_BILL',
        cardData: draftOrderData,
        actions,
        suggestedFollowUps: ['Print last bill', "Today's Sales"],
      };
    }

    case 'NAVIGATION_ACTION': {
      const target = entities.targetScreen || 'Dashboard';
      const screenTitles: Record<string, string> = {
        PrinterConnect: 'Bluetooth Printer Settings',
        SecurityBackup: 'Backup & Security Settings',
        Inventory: 'Products Inventory',
        Customers: 'Customers List',
        Billing: 'New Invoice Builder',
        Profile: 'Store Profile & Settings',
        Dashboard: 'Store Dashboard',
      };

      return {
        text: `Opening **${screenTitles[target] || target}** for you...`,
        actions: [
          {
            id: 'act_nav_now',
            label: `Open ${screenTitles[target] || target}`,
            type: 'NAVIGATE',
            payload: { screen: target },
            icon: 'arrow-right-circle',
          },
        ],
      };
    }

    default: {
      return {
        text: `I'm here to help with your Parchiwala store! You can ask me about today's sales, low stock items, unpaid bills, or thermal printing.`,
        suggestedFollowUps: ["Today's Sales", 'Low Stock Alert', 'Print Last Bill'],
      };
    }
  }
};
