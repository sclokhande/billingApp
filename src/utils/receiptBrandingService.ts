import { NativeModules, Platform } from 'react-native';
import qrcode from 'qrcode-generator';
import { wrapText } from '../services/printService';

/**
 * Validates merchant UPI ID / VPA format according to NPCI standards
 * Examples: store@okaxis, merchant.123@paytm, shop_name@icici
 */
export const isValidUpiId = (upiId: string): boolean => {
  if (!upiId || typeof upiId !== 'string') return false;
  const trimmed = upiId.trim();
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
  return upiRegex.test(trimmed);
};

export interface UpiUriParams {
  upiId: string;
  payeeName?: string;
  amount?: number;
  invoiceNumber?: string;
  note?: string;
}

/**
 * Builds standard NPCI UPI payment deep link URI
 * e.g. upi://pay?pa=merchant@upi&pn=Store%20Name&am=450.00&cu=INR&tn=Bill_INV-001
 */
export const buildUpiPaymentUri = ({
  upiId,
  payeeName,
  amount,
  invoiceNumber,
  note,
}: UpiUriParams): string => {
  const cleanUpi = (upiId || '').trim();
  const cleanName = (payeeName || 'Store').trim();
  const customNote = (
    note ||
    (invoiceNumber ? `Bill_${invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '')}` : 'Bill_POS')
  ).trim();

  let uri = `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(cleanName)}`;
  if (typeof amount === 'number' && amount > 0) {
    uri += `&am=${amount.toFixed(2)}&cu=INR`;
  }
  uri += `&tn=${encodeURIComponent(customNote)}`;
  return uri;
};

/**
 * Generates 2D boolean module matrix for any text payload using pure TypeScript qrcode-generator
 */
export const getQrMatrix = (data: string): boolean[][] => {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(data);
    qr.make();
    const count = qr.getModuleCount();
    const matrix: boolean[][] = [];
    for (let r = 0; r < count; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < count; c++) {
        row.push(qr.isDark(r, c));
      }
      matrix.push(row);
    }
    return matrix;
  } catch (e) {
    console.warn('[ReceiptBrandingService] getQrMatrix error:', e);
    return [];
  }
};

/**
 * Generates an SVG XML string representing the QR code for embedding in PDF reports
 */
export const getQrSvgXml = (data: string, targetSizePx: number = 160): string => {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(data);
    qr.make();
    const count = qr.getModuleCount();
    const quietZone = 4;
    const totalModules = count + quietZone * 2;
    const cellSize = targetSizePx / totalModules;

    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          const x = (c + quietZone) * cellSize;
          const y = (r + quietZone) * cellSize;
          path += `M${x.toFixed(1)},${y.toFixed(1)}h${cellSize.toFixed(1)}v${cellSize.toFixed(1)}h-${cellSize.toFixed(1)}z `;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${targetSizePx}" height="${targetSizePx}" viewBox="0 0 ${targetSizePx} ${targetSizePx}">
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d="${path}" fill="#000000" />
    </svg>`;
  } catch {
    return '';
  }
};

/**
 * Converts a QR 2D boolean matrix into an ESC/POS standard GS v 0 raster bit image byte array.
 * Centered horizontally across the thermal roll width (384 dots for 58mm, 576 dots for 80mm).
 */
export const convertQrMatrixToEscPosRaster = (
  matrix: boolean[][],
  paperWidth: '58mm' | '80mm' | number = 384,
  customScale?: number
): Uint8Array => {
  if (!matrix || matrix.length === 0) {
    return new Uint8Array(0);
  }

  const paperWidthDots =
    typeof paperWidth === 'number'
      ? paperWidth
      : paperWidth === '80mm'
      ? 576
      : 384;

  const moduleCount = matrix.length;
  // Module dot size: customScale if provided, otherwise 6 dots for 80mm, 4 dots for 58mm
  const scale = customScale || (paperWidthDots >= 576 ? 6 : 4);
  const quietZoneModules = 4;
  const totalModuleDimension = moduleCount + quietZoneModules * 2;
  const qrPixelDimension = totalModuleDimension * scale;

  // Paper line byte width (must be multiple of 8)
  const totalWidthBytes = Math.floor(paperWidthDots / 8);
  const totalWidthDots = totalWidthBytes * 8;

  // Center horizontally
  const leftOffsetDots = Math.max(0, Math.floor((totalWidthDots - qrPixelDimension) / 2));
  const totalHeightDots = qrPixelDimension;

  const header = [
    0x1d, // GS
    0x76, // v
    0x30, // 0 (raster bit image)
    0x00, // mode normal
    totalWidthBytes & 0xff, // xL
    (totalWidthBytes >> 8) & 0xff, // xH
    totalHeightDots & 0xff, // yL
    (totalHeightDots >> 8) & 0xff, // yH
  ];

  const dataBytesCount = totalWidthBytes * totalHeightDots;
  const result = new Uint8Array(header.length + dataBytesCount);
  result.set(header, 0);

  let dataOffset = header.length;

  for (let y = 0; y < totalHeightDots; y++) {
    const moduleRowIndex = Math.floor(y / scale) - quietZoneModules;
    const isQuietZoneY = moduleRowIndex < 0 || moduleRowIndex >= moduleCount;

    const rowBytes = new Uint8Array(totalWidthBytes);

    if (!isQuietZoneY) {
      const rowData = matrix[moduleRowIndex];
      for (let x = 0; x < qrPixelDimension; x++) {
        const moduleColIndex = Math.floor(x / scale) - quietZoneModules;
        if (moduleColIndex >= 0 && moduleColIndex < moduleCount && rowData[moduleColIndex]) {
          const dotX = leftOffsetDots + x;
          if (dotX < totalWidthDots) {
            const byteIndex = Math.floor(dotX / 8);
            const bitIndex = 7 - (dotX % 8);
            rowBytes[byteIndex] |= 1 << bitIndex;
          }
        }
      }
    }

    result.set(rowBytes, dataOffset);
    dataOffset += totalWidthBytes;
  }

  return result;
};

/**
 * Converts image base64 into ESC/POS GS v 0 raster bit image base64 using Android native module
 */
export const convertImageBase64ToEscPosRaster = async (
  base64Image: string,
  paperWidthDots: number = 384
): Promise<string> => {
  if (!base64Image || typeof base64Image !== 'string') {
    return '';
  }

  if (Platform.OS === 'android' && NativeModules.BluetoothScanner?.convertImageToEscPosRaster) {
    try {
      const rasterBase64 = await NativeModules.BluetoothScanner.convertImageToEscPosRaster(
        base64Image,
        paperWidthDots
      );
      return rasterBase64 || '';
    } catch (e) {
      console.warn('[ReceiptBrandingService] Native image rasterization failed:', e);
      return '';
    }
  }

  return '';
};

export interface OptimizedLogoResult {
  dataUri: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  sizeBytes: number;
}

/**
 * Automatically fits, scales, and binarizes an uploaded logo image to perfectly match
 * the printable area and resolution of 58mm (384 dots) or 80mm (576 dots) thermal rolls.
 */
export const fitAndOptimizeLogoImage = async (
  base64Image: string,
  paperWidth: '58mm' | '80mm' | number = '58mm'
): Promise<OptimizedLogoResult | null> => {
  if (!base64Image || typeof base64Image !== 'string') {
    return null;
  }

  const paperDots =
    typeof paperWidth === 'number'
      ? paperWidth
      : paperWidth === '80mm'
      ? 576
      : 384;

  if (Platform.OS === 'android' && NativeModules.BluetoothScanner?.fitAndOptimizeLogo) {
    try {
      const res = await NativeModules.BluetoothScanner.fitAndOptimizeLogo(base64Image, paperDots);
      if (res && res.dataUri) {
        return {
          dataUri: res.dataUri,
          width: res.width || (paperDots >= 576 ? 520 : 360),
          height: res.height || (paperDots >= 576 ? 230 : 160),
          originalWidth: res.originalWidth || 0,
          originalHeight: res.originalHeight || 0,
          sizeBytes: res.sizeBytes || 0,
        };
      }
    } catch (e) {
      console.warn('[ReceiptBrandingService] fitAndOptimizeLogo native error:', e);
    }
  }

  // Fallback for iOS / simulator / tests
  const targetW = paperDots >= 576 ? 520 : 360;
  const targetH = paperDots >= 576 ? 230 : 160;
  const cleanUri = base64Image.startsWith('data:')
    ? base64Image
    : `data:image/png;base64,${base64Image}`;

  return {
    dataUri: cleanUri,
    width: targetW,
    height: targetH,
    originalWidth: targetW,
    originalHeight: targetH,
    sizeBytes: cleanUri.length,
  };
};

/**
 * Converts a Uint8Array into a Base64 string for transmission via printRawData
 */
export const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const g = globalThis as any;
  if (typeof g.btoa === 'function') {
    return g.btoa(binary);
  }
  const Buffer = require('buffer').Buffer;
  return Buffer.from(binary, 'binary').toString('base64');
};

/**
 * Converts a base64 string into a Uint8Array
 */
export const base64ToUint8Array = (base64Str: string): Uint8Array => {
  const clean = (base64Str || '').replace(/\s/g, '');
  const g = globalThis as any;
  if (typeof g.atob === 'function') {
    const binary = g.atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const Buffer = require('buffer').Buffer;
  return new Uint8Array(Buffer.from(clean, 'base64'));
};

/**
 * Converts a Latin1/ASCII text string into a Uint8Array
 */
export const textToBytes = (str: string): Uint8Array => {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
};

/**
 * Concatenates multiple Uint8Array chunks into a single Uint8Array
 */
export const concatUint8Arrays = (arrays: Uint8Array[]): Uint8Array => {
  const totalLength = arrays.reduce((acc, val) => acc + val.length, 0);
  const result = new Uint8Array(totalLength);
  let length = 0;
  for (const array of arrays) {
    result.set(array, length);
    length += array.length;
  }
  return result;
};

export interface ReceiptBrandingOptions {
  logoRasterBase64?: string;
  qrRasterBase64?: string;
  titleLineCount?: number;
}

/**
 * Compiles formatted receipt text, optional Logo raster bitmap, and optional Dynamic UPI QR bitmap
 * into a single unified binary ESC/POS stream and returns base64 string for printRawData.
 */
export const buildThermalReceiptRawPayload = (
  payloadText: string,
  options?: ReceiptBrandingOptions
): string => {
  const is80mm = payloadText.includes('-'.repeat(48));
  const maxNormalCap = is80mm ? 48 : 32;
  const maxDoubleWidthCap = is80mm ? 24 : 16;

  // ESC @ (Initialize printer)
  const initCmd = '\x1B\x40';
  // ESC = 1 (Enable printer)
  const enableCmd = '\x1B\x3D\x01';

  // ESC E 1 (Bold ON) + ESC ! 32 (Double Height & Double Width)
  const boldTitleOn = '\x1B\x45\x01\x1B\x21\x20';
  const boldTitleOff = '\x1B\x45\x00\x1B\x21\x00';
  // ESC E 1 (Bold ON) + ESC ! 16 (Double Height)
  const boldGrandTotalOn = '\x1B\x45\x01\x1B\x21\x10';

  // Process text lines and apply bold/double-height commands
  const lines = payloadText.split('\n');
  const titleCount = Math.max(1, options?.titleLineCount || 1);
  let titleLinesProcessed = 0;

  for (let i = 0; i < lines.length && titleLinesProcessed < titleCount; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('=') || rawLine.startsWith('-')) break;

    if (rawLine.length <= maxDoubleWidthCap) {
      const padLeft = Math.max(0, Math.floor((maxDoubleWidthCap - rawLine.length) / 2));
      lines[i] = boldTitleOn + ' '.repeat(padLeft) + rawLine + boldTitleOff;
    } else if (rawLine.length <= maxNormalCap) {
      const padLeft = Math.max(0, Math.floor((maxNormalCap - rawLine.length) / 2));
      lines[i] = boldGrandTotalOn + ' '.repeat(padLeft) + rawLine + boldTitleOff;
    } else {
      // If a single title line exceeds printable width, break it down into new lines
      const subLines = wrapText(rawLine, maxNormalCap);
      const formattedSubLines = subLines.map((sub) => {
        const padLeft = Math.max(0, Math.floor((maxNormalCap - sub.length) / 2));
        return boldGrandTotalOn + ' '.repeat(padLeft) + sub + boldTitleOff;
      });
      lines.splice(i, 1, ...formattedSubLines);
      i += formattedSubLines.length - 1;
    }
    titleLinesProcessed++;
  }

  for (let i = titleLinesProcessed; i < lines.length; i++) {
    if (lines[i].includes('GRAND TOTAL') || (i > 0 && lines[i - 1].includes('GRAND TOTAL'))) {
      lines[i] = boldGrandTotalOn + lines[i] + boldTitleOff;
    }
  }

  const chunks: Uint8Array[] = [];

  // 1. Initialize and Enable Printer
  chunks.push(textToBytes(initCmd + enableCmd));

  // 2. Prepend Brand Logo Raster (if enabled and provided)
  if (options?.logoRasterBase64) {
    try {
      const logoBytes = base64ToUint8Array(options.logoRasterBase64);
      if (logoBytes.length > 0) {
        // Left align before full-width centered raster image
        chunks.push(textToBytes('\x1B\x61\x00'));
        chunks.push(logoBytes);
        // Line feed & maintain left alignment
        chunks.push(textToBytes('\n\x1B\x61\x00'));
      }
    } catch (e) {
      console.warn('[ReceiptBrandingService] Error preparing logo bytes:', e);
    }
  }

  // 3. Receipt Body Text with Dynamic UPI QR Code inserted seamlessly
  if (options?.qrRasterBase64) {
    const qrMarker = '[ UPI SCAN & PAY ]';
    const markerIndex = lines.findIndex((l) => l.includes(qrMarker));
    if (markerIndex !== -1) {
      const beforeLines = lines.slice(0, markerIndex).join('\n') + '\n';
      chunks.push(textToBytes(beforeLines));

      // Insert QR code raster image (full-width centered raster)
      try {
        const qrBytes = base64ToUint8Array(options.qrRasterBase64);
        if (qrBytes.length > 0) {
          chunks.push(textToBytes('\x1B\x61\x00'));
          chunks.push(qrBytes);
          chunks.push(textToBytes('\n\x1B\x61\x00'));
        }
      } catch (e) {
        console.warn('[ReceiptBrandingService] Error preparing QR bytes:', e);
      }

      const afterLines = lines.slice(markerIndex + 1).join('\n');
      chunks.push(textToBytes(afterLines + '\n\n\n'));
    } else {
      chunks.push(textToBytes(lines.join('\n') + '\n'));
      try {
        const qrBytes = base64ToUint8Array(options.qrRasterBase64);
        if (qrBytes.length > 0) {
          chunks.push(textToBytes('\x1B\x61\x00'));
          chunks.push(qrBytes);
          chunks.push(textToBytes('\n\x1B\x61\x00'));
        }
      } catch {}
      chunks.push(textToBytes('\n\n\n'));
    }
  } else {
    chunks.push(textToBytes(lines.join('\n') + '\n\n\n'));
  }

  const combined = concatUint8Arrays(chunks);
  return uint8ArrayToBase64(combined);
};
