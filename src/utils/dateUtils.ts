/**
 * Date and Time Utility Functions for Parchiwala Billing App
 * Ensures consistent date parsing, filtering, formatting, and sorting
 * across all mobile platforms, SQLite queries, and timezone variations.
 */

/**
 * Safely parse any date representation (ISO string, SQLite string, timestamp, etc.)
 * into a valid JavaScript Date object in local time.
 */
export const parseInvoiceDate = (dateVal: any): Date => {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? new Date() : dateVal;
  }

  if (typeof dateVal === 'number') {
    const d = new Date(dateVal > 9999999999 ? dateVal : dateVal * 1000);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  const str = String(dateVal).trim();
  if (!str) return new Date();

  // Pure numeric string timestamp
  if (/^\d{10,13}$/.test(str)) {
    const num = parseInt(str, 10);
    const d = new Date(num > 9999999999 ? num : num * 1000);
    if (!isNaN(d.getTime())) return d;
  }

  // Date-only string "YYYY-MM-DD" - parse in local time to avoid UTC midnight timezone rollback
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return new Date(year, month, day);
  }

  // SQLite space format "YYYY-MM-DD HH:mm:ss" -> normalize to ISO "YYYY-MM-DDTHH:mm:ss"
  let normalized = str;
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(str)) {
    normalized = str.replace(' ', 'T');
  }

  const d = new Date(normalized);
  if (!isNaN(d.getTime())) return d;

  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
};

/**
 * Check whether a date matches today in the local calendar.
 */
export const isToday = (dateVal: any, referenceDate: Date = new Date()): boolean => {
  if (!dateVal) return false;
  const invDate = parseInvoiceDate(dateVal);
  return (
    invDate.getFullYear() === referenceDate.getFullYear() &&
    invDate.getMonth() === referenceDate.getMonth() &&
    invDate.getDate() === referenceDate.getDate()
  );
};

/**
 * Format time in 12-hour format with AM/PM (e.g., "11:17 AM", "08:05 PM").
 */
export const formatInvoiceTime = (dateVal: any): string => {
  const d = parseInvoiceDate(dateVal);
  if (isNaN(d.getTime())) return '';
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const hoursStr = hours < 10 ? `0${hours}` : `${hours}`;
  return `${hoursStr}:${minutesStr} ${ampm}`;
};

/**
 * Format date in standard short format (e.g., "Oct 1, 2026").
 */
export const formatInvoiceDate = (dateVal: any): string => {
  const d = parseInvoiceDate(dateVal);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
};

/**
 * Format combined date and time (e.g., "11:17 AM • Oct 1, 2026").
 */
export const formatInvoiceDateTime = (dateVal: any): string => {
  const time = formatInvoiceTime(dateVal);
  const date = formatInvoiceDate(dateVal);
  if (!time && !date) return '';
  if (!time) return date;
  if (!date) return time;
  return `${time} • ${date}`;
};

/**
 * Identify if an invoice is a seeded mock demo invoice.
 */
export const isMockInvoice = (invoiceOrId: any): boolean => {
  if (!invoiceOrId) return false;
  const id = typeof invoiceOrId === 'string' ? invoiceOrId : invoiceOrId.id;
  const invoiceNumber = typeof invoiceOrId === 'object' ? invoiceOrId.invoiceNumber : '';
  if (id && typeof id === 'string' && id.startsWith('inv_')) {
    return true;
  }
  if (invoiceNumber && typeof invoiceNumber === 'string' && /^INV-100\d$/.test(invoiceNumber)) {
    return true;
  }
  return false;
};

/**
 * Sort invoices with strict latest-first hierarchy:
 * 1. Real user-created invoices always rank ahead of seeded mock invoices.
 * 2. Newest timestamp first (clamps any future timestamps so mock data with future hours cannot jump ahead).
 * 3. Invoice number descending as tiebreaker.
 * 4. ID descending as final tiebreaker.
 */
export const sortInvoicesLatestFirst = <T extends { id?: string; date?: string; invoiceNumber?: string }>(
  invoices: T[]
): T[] => {
  if (!Array.isArray(invoices)) return [];
  const now = Date.now();

  return [...invoices].sort((a, b) => {
    const isMockA = isMockInvoice(a);
    const isMockB = isMockInvoice(b);

    // Rule 1: Real invoices strictly take precedence over mock demo invoices
    if (!isMockA && isMockB) return -1;
    if (isMockA && !isMockB) return 1;

    // Rule 2: Chronological order descending (most recent first)
    const rawTimeA = parseInvoiceDate(a.date).getTime();
    const rawTimeB = parseInvoiceDate(b.date).getTime();

    // Clamp any future timestamps (> 1 minute ahead) to avoid mock or clock bugs jumping to top
    const timeA = rawTimeA > now + 60000 ? (isMockA ? now - 3600000 : rawTimeA) : rawTimeA;
    const timeB = rawTimeB > now + 60000 ? (isMockB ? now - 3600000 : rawTimeB) : rawTimeB;

    if (timeB !== timeA) {
      return timeB - timeA;
    }

    // Rule 3: Invoice number descending tiebreaker
    const numCompare = (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '');
    if (numCompare !== 0) return numCompare;

    // Rule 4: ID descending tiebreaker
    return (b.id || '').localeCompare(a.id || '');
  });
};
