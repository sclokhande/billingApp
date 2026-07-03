import { Organization, Customer, Invoice, InvoiceItem } from '../db/types';

const LINE_WIDTH = 32; // 32 characters per line for standard 58mm printers

// Helper to center text
export const centerText = (text: string, width: number = LINE_WIDTH): string => {
  if (text.length >= width) {
    return text.substring(0, width);
  }
  const padding = Math.floor((width - text.length) / 2);
  return ' '.repeat(padding) + text + ' '.repeat(width - text.length - padding);
};

// Helper to pad right/left for columns
export const formatRow = (leftText: string, rightText: string, width: number = LINE_WIDTH): string => {
  const spaceCount = width - (leftText.length + rightText.length);
  if (spaceCount <= 0) {
    // If text exceeds width, truncate left text
    const truncatedLeft = leftText.substring(0, width - rightText.length - 2) + '..';
    const spaces = width - (truncatedLeft.length + rightText.length);
    return truncatedLeft + ' '.repeat(spaces > 0 ? spaces : 1) + rightText;
  }
  return leftText + ' '.repeat(spaceCount) + rightText;
};

// Format address with word-wrapping
export const wrapText = (text: string, width: number = LINE_WIDTH): string[] => {
  const words = text.split(' ');
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
  if (u === 'numbers') return ' no';
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
  const words = text.split(' ');
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
  if (qty.length > qtyWidth) {
    extraWidth += (qty.length - qtyWidth);
  }
  if (rate.length > rateWidth) {
    extraWidth += (rate.length - rateWidth);
  }
  if (total.length > totalWidth) {
    extraWidth += (total.length - totalWidth);
  }

  // Deduct the extra width from nameWidth, but keep name column at least 4 characters wide
  if (extraWidth > 0) {
    nameWidth = Math.max(4, nameWidth - extraWidth);
  }

  const nameLines = wrapTextForColumn(name, nameWidth);
  const formattedLines: string[] = [];

  for (let i = 0; i < nameLines.length; i++) {
    const namePart = nameLines[i].padEnd(nameWidth, ' ');
    if (i === 0) {
      const qtyPart = qty.padStart(qty.length > qtyWidth ? qty.length : qtyWidth, ' ');
      const ratePart = rate.padStart(rate.length > rateWidth ? rate.length : rateWidth, ' ');
      const totalPart = total.padStart(total.length > totalWidth ? total.length : totalWidth, ' ');
      // Join with explicit 1-character spaces to guarantee a gap between columns
      formattedLines.push(namePart + ' ' + qtyPart + ' ' + ratePart + ' ' + totalPart);
    } else {
      const actualQtyWidth = qty.length > qtyWidth ? qty.length : qtyWidth;
      const actualRateWidth = rate.length > rateWidth ? rate.length : rateWidth;
      const actualTotalWidth = total.length > totalWidth ? total.length : totalWidth;
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
  const width = org.printWidth === '80mm' ? 48 : 32;
  const lines: string[] = [];

  // 1. Organization Header
  lines.push(centerText(org.name.toUpperCase(), width));
  const wrappedAddress = wrapText(org.address, width);
  wrappedAddress.forEach((addrLine) => lines.push(centerText(addrLine, width)));
  
  if (org.phone || org.mobile) {
    const contactLine = [org.phone, org.mobile].filter(Boolean).join(', ');
    lines.push(centerText(`Ph: ${contactLine}`, width));
  }
  
  if (org.showGstOnBill && org.gstNumber) {
    lines.push(centerText(`GSTIN: ${org.gstNumber}`, width));
  }
  
  lines.push('-'.repeat(width));

  // 2. Invoice Meta Info
  lines.push(`Bill No: ${invoice.invoiceNumber}`);
  
  // Format Date (simple readable format)
  const billDate = new Date(invoice.date);
  const dateStr = billDate.toLocaleDateString();
  const timeStr = billDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  lines.push(`Date: ${dateStr} ${timeStr}`);
  
  if (customer) {
    lines.push(`Cust: ${customer.name}`);
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
  items.forEach((item) => {
    let qtyStr = item.quantity.toString();
    if (qtyStr.includes('.')) {
      const num = parseFloat(qtyStr);
      qtyStr = num.toFixed(num % 1 === 0 ? 0 : (num * 10) % 1 === 0 ? 1 : 2);
    }
    // Print exact selected unit from bill in the format: qty / UOM
    const finalQtyStr = qtyStr + '/' + (item.unit || '');

    const rateStr = item.price.toFixed(2);
    const totalStr = item.total.toFixed(2);

    lines.push(formatTabularRow(item.name, finalQtyStr, rateStr, totalStr, width));
  });

  lines.push('-'.repeat(width));

  // 5. Totals
  lines.push(formatRow('Subtotal:', invoice.subtotal.toFixed(2), width));
  
  if (org.showGstOnBill && org.gstNumber) {
    if (invoice.cgstTotal > 0) {
      lines.push(formatRow('CGST (Central):', invoice.cgstTotal.toFixed(2), width));
    }
    if (invoice.sgstTotal > 0) {
      lines.push(formatRow('SGST (State):', invoice.sgstTotal.toFixed(2), width));
    }
  }

  if (invoice.discount > 0) {
    lines.push(formatRow('Discount:', `-${invoice.discount.toFixed(2)}`, width));
  }

  lines.push('='.repeat(width));
  
  // Grand Total
  lines.push(formatRow('GRAND TOTAL:', `${org.currency} ${invoice.grandTotal.toFixed(2)}`, width));
  lines.push('='.repeat(width));

  // Payment Mode
  lines.push(`Pay Mode: ${invoice.paymentMethod}`);
  lines.push(`Status:   ${invoice.paymentStatus}`);
  lines.push('-'.repeat(width));

  // 6. Bottom Slogan / Footer
  if (org.slogan) {
    const wrappedSlogan = wrapText(org.slogan, width);
    wrappedSlogan.forEach((slogLine) => lines.push(centerText(slogLine, width)));
  } else {
    lines.push(centerText('Thank You Visit again', width));
  }
  
  lines.push('');
  lines.push(centerText('print by Parchiwala', width));
  lines.push('');
  lines.push('');
  lines.push(''); // Feeding lines for tear off

  return lines.join('\n');
};
