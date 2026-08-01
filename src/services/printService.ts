import { Organization, Customer, Invoice, InvoiceItem } from '../db/types';

const LINE_WIDTH = 32; // 32 characters per line for standard 58mm printers

// Helper to center text
export const centerText = (text: string, width: number = LINE_WIDTH): string => {
  const safeText = String(text || '');
  if (safeText.length >= width) {
    return safeText.substring(0, width);
  }
  const padding = Math.floor((width - safeText.length) / 2);
  return ' '.repeat(padding) + safeText + ' '.repeat(width - safeText.length - padding);
};

// Helper to pad right/left for columns
export const formatRow = (leftText: string, rightText: string, width: number = LINE_WIDTH): string => {
  const safeLeft = String(leftText || '');
  const safeRight = String(rightText || '');
  const spaceCount = width - (safeLeft.length + safeRight.length);
  if (spaceCount <= 0) {
    return safeLeft + ' ' + safeRight;
  }
  return safeLeft + ' '.repeat(spaceCount) + safeRight;
};

// Format address with word-wrapping
export const wrapText = (text: string, width: number = LINE_WIDTH): string[] => {
  const safeText = String(text || '');
  const words = safeText.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + word).length >= width) {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }
  return lines;
};

const getCompactUnit = (unit: string): string => {
  const u = (unit || '').toLowerCase();
  if (u === 'pcs') return ' pc';
  if (u === 'nos' || u === 'no' || u === 'numbers' || u === 'number') return ' no';
  if (u === 'kg') return ' kg';
  if (u === 'gm') return ' g';
  if (u === 'ltr' || u === 'litre') return ' l';
  if (u === 'ml') return ' ml';
  if (u === 'meter') return ' m';
  if (u === 'pack') return ' pk';
  if (u === 'box') return ' bx';
  if (u === 'strip') return ' st';
  if (u === 'tablet') return ' tb';
  return '';
};

const wrapTextForColumn = (text: string, colWidth: number): string[] => {
  const safeText = String(text || '');
  const words = safeText.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;
    
    // If the word itself is longer than the column width, break it down
    if (word.length > colWidth) {
      if (currentLine) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      let tempWord = word;
      while (tempWord.length > colWidth) {
        lines.push(tempWord.substring(0, colWidth));
        tempWord = tempWord.substring(colWidth);
      }
      currentLine = tempWord + ' ';
    } else if ((currentLine + word).length > colWidth) {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines.length > 0 ? lines : [''];
};

export const formatTabularRow = (
  name: string,
  qty: string,
  rate: string,
  total: string,
  width: number
): string => {
  const safeName = String(name || '');
  const safeQty = String(qty || '');
  const safeRate = String(rate || '');
  const safeTotal = String(total || '');

  // Determine default column widths (excluding 1-character gap separators)
  let nameWidth = 11;
  let qtyWidth = 4;
  let rateWidth = 6;
  let totalWidth = 8;

  if (width === 48) {
    nameWidth = 23;
    qtyWidth = 5;
    rateWidth = 7;
    totalWidth = 10;
  }

  // Dynamically adjust nameWidth if other columns exceed their allocated widths
  let extraWidth = 0;
  if (safeQty.length > qtyWidth) {
    extraWidth += (safeQty.length - qtyWidth);
  }
  if (safeRate.length > rateWidth) {
    extraWidth += (safeRate.length - rateWidth);
  }
  if (safeTotal.length > totalWidth) {
    extraWidth += (safeTotal.length - totalWidth);
  }

  // Deduct the extra width from nameWidth, but keep name column at least 4 characters wide
  if (extraWidth > 0) {
    nameWidth = Math.max(4, nameWidth - extraWidth);
  }

  const nameLines = wrapTextForColumn(safeName, nameWidth);
  const formattedLines: string[] = [];

  for (let i = 0; i < nameLines.length; i++) {
    const namePart = nameLines[i].padEnd(nameWidth, ' ');
    if (i === 0) {
      const qtyPart = safeQty.padStart(safeQty.length > qtyWidth ? safeQty.length : qtyWidth, ' ');
      const ratePart = safeRate.padStart(safeRate.length > rateWidth ? safeRate.length : rateWidth, ' ');
      const totalPart = safeTotal.padStart(safeTotal.length > totalWidth ? safeTotal.length : totalWidth, ' ');
      // Join with explicit 1-character spaces to guarantee a gap between columns
      formattedLines.push(namePart + ' ' + qtyPart + ' ' + ratePart + ' ' + totalPart);
    } else {
      const actualQtyWidth = safeQty.length > qtyWidth ? safeQty.length : qtyWidth;
      const actualRateWidth = safeRate.length > rateWidth ? safeRate.length : rateWidth;
      const actualTotalWidth = safeTotal.length > totalWidth ? safeTotal.length : totalWidth;
      // Subsequent wrapped lines of item name should align properly with the spacing
      formattedLines.push(namePart + ' ' + ' '.repeat(actualQtyWidth) + ' ' + ' '.repeat(actualRateWidth) + ' ' + ' '.repeat(actualTotalWidth));
    }
  }

  return formattedLines.join('\n');
};

// Main formatter function
export const formatThermalReceipt = (
  org: Organization,
  customer: Customer | null,
  invoice: Invoice,
  items: InvoiceItem[]
): string => {
  const width = org?.printWidth === '80mm' ? 48 : 32;
  const lines: string[] = [];

  const orgName = (org?.name || 'STORE').toUpperCase();
  const orgAddress = org?.address || '';
  const currency = 'Rs.';

  // 1. Organization Header
  lines.push(centerText(orgName, width));
  if (orgAddress) {
    const wrappedAddress = wrapText(orgAddress, width);
    wrappedAddress.forEach((addrLine) => lines.push(centerText(addrLine, width)));
  }
  
  const orgMobile = (org?.mobile || org?.phone || '').trim();
  if (orgMobile) {
    lines.push(centerText(`Ph: ${orgMobile}`, width));
  }
  
  if (org?.showGstOnBill && org?.gstNumber) {
    lines.push(centerText(`GSTIN: ${org.gstNumber}`, width));
  }
  
  lines.push('-'.repeat(width));

  // 2. Invoice Meta Info
  lines.push(`Bill No: ${invoice?.invoiceNumber || ''}`);
  
  // Format Date (simple readable format)
  const billDate = invoice?.date ? new Date(invoice.date) : new Date();
  const dateStr = billDate.toLocaleDateString();
  const timeStr = billDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  lines.push(`Date: ${dateStr} ${timeStr}`);
  
  if (customer) {
    lines.push(`Cust: ${customer.name || 'Walk-in'}`);
    if (customer.phone && customer.phone !== '0000000000') {
      lines.push(`Ph:   ${customer.phone}`);
    }
  }
  
  lines.push('='.repeat(width));

  // 3. Item List Header
  // Columns: Item Name, Qty, Rate, Total
  lines.push(formatTabularRow('Item Name', 'Qty', 'Rate', 'Total', width));
  lines.push('-'.repeat(width));

  // 4. Item List
  const safeItems = Array.isArray(items) ? items : [];
  if (safeItems.length > 0) {
    safeItems.forEach((item) => {
      if (!item) return;

      const rawQty = item.quantity ?? 0;
      let qtyStr = typeof rawQty === 'number' ? rawQty.toString() : String(rawQty);
      if (qtyStr.includes('.')) {
        const num = parseFloat(qtyStr) || 0;
        qtyStr = num.toFixed(num % 1 === 0 ? 0 : (num * 10) % 1 === 0 ? 1 : 2);
      }
      // Print exact selected unit from bill in the format: qty / UOM
      const finalQtyStr = qtyStr + '/' + (item.unit || '');

      const priceNum = typeof item.price === 'number' ? item.price : parseFloat(item.price as any) || 0;
      const qtyNum = typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity as any) || 0;
      const totalNum = typeof item.total === 'number' ? item.total : parseFloat(item.total as any) || (priceNum * qtyNum);

      const rateStr = priceNum.toFixed(2);
      const totalStr = totalNum.toFixed(2);

      lines.push(formatTabularRow(item.name || 'Item', finalQtyStr, rateStr, totalStr, width));
    });
  } else {
    lines.push(centerText('NO ITEMS', width));
  }

  lines.push('-'.repeat(width));

  // 5. Totals
  const subtotalNum = typeof invoice?.subtotal === 'number' ? invoice.subtotal : parseFloat(invoice?.subtotal as any) || 0;
  const cgstNum = typeof invoice?.cgstTotal === 'number' ? invoice.cgstTotal : parseFloat(invoice?.cgstTotal as any) || 0;
  const sgstNum = typeof invoice?.sgstTotal === 'number' ? invoice.sgstTotal : parseFloat(invoice?.sgstTotal as any) || 0;
  const discountNum = typeof invoice?.discount === 'number' ? invoice.discount : parseFloat(invoice?.discount as any) || 0;
  const grandTotalNum = typeof invoice?.grandTotal === 'number' ? invoice.grandTotal : parseFloat(invoice?.grandTotal as any) || 0;

  lines.push(formatRow('Subtotal:', subtotalNum.toFixed(2), width));
  
  if (org?.showGstOnBill && org?.gstNumber) {
    if (cgstNum > 0) {
      lines.push(formatRow('CGST (Central):', cgstNum.toFixed(2), width));
    }
    if (sgstNum > 0) {
      lines.push(formatRow('SGST (State):', sgstNum.toFixed(2), width));
    }
  }

  if (discountNum > 0) {
    lines.push(formatRow('Discount:', `-${discountNum.toFixed(2)}`, width));
  }

  lines.push('='.repeat(width));
  
  // Grand Total - GRAND TOTAL: on line 1, Rs. <value> on line 2
  lines.push('GRAND TOTAL:');
  lines.push(`${currency} ${grandTotalNum.toFixed(2)}`);
  lines.push('='.repeat(width));

  // Payment Mode
  lines.push(`Pay Mode: ${invoice?.paymentMethod || 'Cash'}`);
  lines.push(`Status:   ${invoice?.paymentStatus || 'Paid'}`);
  lines.push('-'.repeat(width));

  // 6. Bottom Slogan / Footer
  if (org?.slogan) {
    const wrappedSlogan = wrapText(org.slogan, width);
    wrappedSlogan.forEach((slogLine) => lines.push(centerText(slogLine, width)));
  } else {
    lines.push(centerText('Thank You Visit again', width));
  }
  
  lines.push('');
  lines.push(centerText('print by Parchiwala', width));
  lines.push(''); // Reduced trailing lines to prevent too long paper feed

  return lines.join('\n');
};
