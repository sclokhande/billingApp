jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    BluetoothScanner: {
      isBluetoothEnabled: jest.fn(async () => true),
      checkPrinterTelemetry: jest.fn(async () => ({
        online: true,
        hasPaper: true,
        paperNearEnd: false,
        status: 'OK',
      })),
      convertImageToEscPosRaster: jest.fn().mockImplementation(async () => 'MOCK_RASTER_BASE64'),
      fitAndOptimizeLogo: jest.fn().mockImplementation(async (b64: string, targetWidth: number) => ({
        dataUri: 'data:image/png;base64,OPTIMIZED_MOCK_PNG',
        width: targetWidth <= 384 ? 360 : 520,
        height: targetWidth <= 384 ? 160 : 230,
        originalWidth: 800,
        originalHeight: 600,
        sizeBytes: 15420,
      })),
      renderReceiptToRaster: jest.fn().mockImplementation(async () => ({
        rasterBase64: Buffer.from('MOCK_FULL_RECEIPT_RASTER_BYTES_SAMPLE').toString('base64'),
        widthDots: 384,
        heightDots: 600,
        byteCount: 28800,
      })),
    },
    RNBLEPrinter: {
      connectPrinter: jest.fn((addr: string, cb?: any) => cb && cb(null)),
      printRawData: jest.fn((data: string, cb?: any) => cb && cb(null)),
    },
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async () => {}),
  getItem: jest.fn(async () => null),
  removeItem: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
}));

import {
  isValidUpiId,
  buildUpiPaymentUri,
  getQrMatrix,
  getQrSvgXml,
  convertQrMatrixToEscPosRaster,
  convertImageBase64ToEscPosRaster,
  buildThermalReceiptRawPayload,
  uint8ArrayToBase64,
  fitAndOptimizeLogoImage,
} from '../src/utils/receiptBrandingService';
import { formatThermalReceipt } from '../src/services/printService';
import { sendChunkedRawPayload, printReceiptAsImageRaw, setConnectedPrinterState } from '../src/services/bluetoothPrinterService';
import { Organization, Customer, Invoice, InvoiceItem } from '../src/db/types';
import { DEFAULT_ORG } from '../src/db/operations';

describe('Receipt Branding & Dynamic UPI QR Code Service', () => {
  describe('UPI ID Validation (isValidUpiId)', () => {
    it('accepts valid NPCI UPI Virtual Payment Addresses (VPAs)', () => {
      expect(isValidUpiId('merchant@okaxis')).toBe(true);
      expect(isValidUpiId('kirana.store@upi')).toBe(true);
      expect(isValidUpiId('shop123@icici')).toBe(true);
      expect(isValidUpiId('user_name@paytm')).toBe(true);
      expect(isValidUpiId('test-pay@ybl')).toBe(true);
      expect(isValidUpiId('9876543210@paytm')).toBe(true);
      expect(isValidUpiId('  merchant@okicici  ')).toBe(true); // trims whitespace
    });

    it('rejects invalid UPI IDs', () => {
      expect(isValidUpiId('')).toBe(false);
      expect(isValidUpiId('   ')).toBe(false);
      expect(isValidUpiId('merchant')).toBe(false);
      expect(isValidUpiId('@upi')).toBe(false);
      expect(isValidUpiId('merchant@')).toBe(false);
      expect(isValidUpiId('mer chant@bank')).toBe(false);
      expect(isValidUpiId('merchant@@upi')).toBe(false);
      expect(isValidUpiId('merchant@bank@extra')).toBe(false);
      expect(isValidUpiId(null as any)).toBe(false);
      expect(isValidUpiId(undefined as any)).toBe(false);
    });
  });

  describe('UPI Payment URI Builder (buildUpiPaymentUri)', () => {
    it('constructs a standardized NPCI UPI deep-link URI', () => {
      const uri = buildUpiPaymentUri({
        upiId: 'merchant@okaxis',
        payeeName: 'Parchiwala Store',
        amount: 250,
        invoiceNumber: 'INV-1002',
      });

      expect(uri).toContain('upi://pay?');
      expect(uri).toContain('pa=merchant%40okaxis');
      expect(uri).toContain('pn=Parchiwala%20Store');
      expect(uri).toContain('am=250.00');
      expect(uri).toContain('cu=INR');
      expect(uri).toContain('tn=Bill_INV-1002');
    });

    it('handles decimal amounts with 2 decimal places', () => {
      const uri = buildUpiPaymentUri({
        upiId: 'shop@upi',
        amount: 99.5,
      });

      expect(uri).toContain('am=99.50');
      expect(uri).toContain('cu=INR');
    });

    it('omits zero or negative amounts for open-amount payment scans', () => {
      const uri = buildUpiPaymentUri({
        upiId: 'shop@upi',
        amount: 0,
      });

      expect(uri).not.toContain('&am=');
    });

    it('handles custom transaction note or fallback', () => {
      const uriWithNote = buildUpiPaymentUri({
        upiId: 'shop@upi',
        note: 'Order #554',
      });
      expect(uriWithNote).toContain('tn=Order%20%23554');

      const uriWithInvoice = buildUpiPaymentUri({
        upiId: 'shop@upi',
        invoiceNumber: 'INV-99',
      });
      expect(uriWithInvoice).toContain('tn=Bill_INV-99');
    });
  });

  describe('QR Matrix Generation (getQrMatrix & getQrSvgXml)', () => {
    it('generates a 2D boolean matrix of QR modules', () => {
      const matrix = getQrMatrix('upi://pay?pa=test@upi&pn=Test&am=100.00&cu=INR');
      expect(Array.isArray(matrix)).toBe(true);
      expect(matrix.length).toBeGreaterThan(20);
      expect(matrix[0].length).toBe(matrix.length); // Must be a square

      // Must contain boolean values
      expect(typeof matrix[0][0]).toBe('boolean');

      // Top-left finder pattern must be dark at (0,0)
      expect(matrix[0][0]).toBe(true);
    });

    it('generates clean vector SVG markup for web/preview rendering', () => {
      const svg = getQrSvgXml('https://parchiwala.com', 200);
      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox=');
      expect(svg).toContain('<rect');
      expect(svg).toContain('fill="#000000"');
      expect(svg).toContain('</svg>');
    });
  });

  describe('ESC/POS Raster Conversion (convertQrMatrixToEscPosRaster)', () => {
    it('converts QR matrix into standard ESC/POS GS v 0 raster bytes', () => {
      const matrix = getQrMatrix('upi://pay?pa=test@upi&am=50.00');
      const rasterBytes = convertQrMatrixToEscPosRaster(matrix, '58mm', 6);

      expect(rasterBytes).toBeInstanceOf(Uint8Array);
      expect(rasterBytes.length).toBeGreaterThan(8);

      // Verify ESC/POS GS v 0 header: 0x1D, 0x76, 0x30, 0x00
      expect(rasterBytes[0]).toBe(0x1d); // GS
      expect(rasterBytes[1]).toBe(0x76); // v
      expect(rasterBytes[2]).toBe(0x30); // 0 (normal mode)
      expect(rasterBytes[3]).toBe(0x00);

      // Width in bytes (xL, xH)
      const xL = rasterBytes[4];
      const xH = rasterBytes[5];
      const widthInBytes = xL + xH * 256;
      expect(widthInBytes).toBeGreaterThan(0);

      // Height in dots (yL, yH)
      const yL = rasterBytes[6];
      const yH = rasterBytes[7];
      const heightInDots = yL + yH * 256;
      expect(heightInDots).toBeGreaterThan(0);

      // Total data bytes must equal header (8) + widthInBytes * heightInDots
      expect(rasterBytes.length).toBe(8 + widthInBytes * heightInDots);
    });

    it('fits correctly within 80mm printable width', () => {
      const matrix = getQrMatrix('upi://pay?pa=test@upi&am=50.00');
      const rasterBytes = convertQrMatrixToEscPosRaster(matrix, '80mm', 8);

      const xL = rasterBytes[4];
      const xH = rasterBytes[5];
      const widthInBytes = xL + xH * 256;
      const widthInDots = widthInBytes * 8;

      expect(widthInDots).toBeLessThanOrEqual(576); // Standard 80mm max printable dots
    });
  });

  describe('Raw Thermal Payload Construction (buildThermalReceiptRawPayload)', () => {
    const BufferClass = require('buffer').Buffer;
    const decodeBase64 = (b64: string): string => BufferClass.from(b64, 'base64').toString('binary');
    const encodeBase64 = (str: string): string => BufferClass.from(str, 'binary').toString('base64');

    it('combines text and control bytes into valid base64 payload', () => {
      const text = 'Hello Thermal Printer\nLine 2\n';
      const payloadBase64 = buildThermalReceiptRawPayload(text, {});

      expect(typeof payloadBase64).toBe('string');
      expect(payloadBase64.length).toBeGreaterThan(0);

      // Decode base64 to check ESC/POS init (0x1B, 0x40)
      const binaryString = decodeBase64(payloadBase64);
      expect(binaryString.charCodeAt(0)).toBe(0x1b);
      expect(binaryString.charCodeAt(1)).toBe(0x40); // ESC @
      expect(binaryString).toContain('Hello Thermal Printer');
    });

    it('includes logo raster when provided', () => {
      // Create a dummy 8-byte raster
      const dummyRaster = new Uint8Array([0x1d, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0xff]);
      const dummyBase64 = encodeBase64(String.fromCharCode(...dummyRaster));

      const payloadBase64 = buildThermalReceiptRawPayload('Receipt body', {
        logoRasterBase64: dummyBase64,
      });

      const binaryString = decodeBase64(payloadBase64);
      // Logo raster should appear before receipt text
      const logoIndex = binaryString.indexOf(String.fromCharCode(0x1d, 0x76, 0x30, 0x00));
      const textIndex = binaryString.indexOf('Receipt body');

      expect(logoIndex).toBeGreaterThan(-1);
      expect(textIndex).toBeGreaterThan(logoIndex);
    });

    it('includes QR raster when provided', () => {
      const dummyQrRaster = new Uint8Array([0x1d, 0x76, 0x30, 0x00, 0x02, 0x00, 0x02, 0x00, 0xff, 0xff, 0xff, 0xff]);
      const dummyBase64 = encodeBase64(String.fromCharCode(...dummyQrRaster));

      const payloadBase64 = buildThermalReceiptRawPayload('Receipt body', {
        qrRasterBase64: dummyBase64,
      });

      const binaryString = decodeBase64(payloadBase64);
      const textIndex = binaryString.indexOf('Receipt body');
      const qrIndex = binaryString.indexOf(String.fromCharCode(0x1d, 0x76, 0x30, 0x00));

      expect(qrIndex).toBeGreaterThan(textIndex);
    });

    it('formats multi-line store titles across separate centered ESC/POS lines when titleLineCount > 1', () => {
      const payloadText = 'SHREE GANESH GENERAL AND\nGROCERY STORE\n--------------------------------\nBill No: INV-1\n';
      const payloadBase64 = buildThermalReceiptRawPayload(payloadText, { titleLineCount: 2 });
      const binaryString = decodeBase64(payloadBase64);

      // Both lines should be present in binary payload
      expect(binaryString).toContain('SHREE GANESH GENERAL AND');
      expect(binaryString).toContain('GROCERY STORE');

      // Double-width bold command is ESC E 1 + ESC ! 32 (\x1B\x45\x01\x1B\x21\x20)
      // Double-height bold command is ESC E 1 + ESC ! 16 (\x1B\x45\x01\x1B\x21\x10)
      const boldCmd1 = String.fromCharCode(0x1b, 0x45, 0x01, 0x1b, 0x21);
      expect(binaryString).toContain(boldCmd1);
    });
  });

  describe('Thermal Receipt Text Formatting with UPI QR Section', () => {
    const baseOrg: Organization = {
      ...DEFAULT_ORG,
      name: 'Super Market',
      address: 'Main Road',
      mobile: '9876543210',
      currency: 'Rs.',
      printWidth: '58mm',
      showUpiQrOnBill: true,
      upiId: 'supermarket@okaxis',
      upiPayeeName: 'Super Market Store',
      showLogoOnBill: false,
    };

    const baseCustomer: Customer = {
      id: 'c1',
      name: 'Walk-in',
      phone: '9999999999',
      email: '',
      address: '',
    };

    const baseInvoice: Invoice = {
      id: 'inv_101',
      invoiceNumber: 'INV-101',
      customerId: 'c1',
      date: '2026-11-03T10:00:00.000Z',
      subtotal: 350,
      taxTotal: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      discount: 0,
      grandTotal: 350,
      paymentStatus: 'Unpaid',
      paymentMethod: 'UPI',
    };

    const items: InvoiceItem[] = [
      {
        id: 'i1',
        invoiceId: 'inv_101',
        productId: 'p1',
        name: 'Oil 1L',
        price: 175,
        quantity: 2,
        taxRate: 0,
        total: 350,
        unit: 'LTR',
      },
    ];

    it('renders UPI Scan & Pay marker without plaintext UPI ID or payee name when showUpiQrOnBill is true and upiId is set', () => {
      const receipt = formatThermalReceipt(baseOrg, baseCustomer, baseInvoice, items);

      expect(receipt).toContain('[ UPI SCAN & PAY ]');
      expect(receipt).not.toContain('supermarket@okaxis');
      expect(receipt).not.toContain('Super Market Store');
      expect(receipt).not.toContain('Scan & Pay Exact:');
    });

    it('omits UPI QR section completely when showUpiQrOnBill is false', () => {
      const disabledOrg: Organization = {
        ...baseOrg,
        showUpiQrOnBill: false,
      };

      const receipt = formatThermalReceipt(disabledOrg, baseCustomer, baseInvoice, items);

      expect(receipt).not.toContain('[ UPI SCAN & PAY ]');
      expect(receipt).not.toContain('supermarket@okaxis');
    });

    it('omits UPI QR section if upiId is blank or invalid even if toggle is true', () => {
      const blankUpiOrg: Organization = {
        ...baseOrg,
        showUpiQrOnBill: true,
        upiId: '   ',
      };

      const receipt = formatThermalReceipt(blankUpiOrg, baseCustomer, baseInvoice, items);

      expect(receipt).not.toContain('[ UPI SCAN & PAY ]');
      expect(receipt).not.toContain('supermarket@okaxis');
    });
  });

  describe('Native Logo Rasterizer Bridge (convertImageBase64ToEscPosRaster)', () => {
    it('calls native module for valid base64 image on Android', async () => {
      const result = await convertImageBase64ToEscPosRaster('data:image/png;base64,abc1234');
      expect(result).toBe('MOCK_RASTER_BASE64');
    });

    it('returns empty string gracefully for empty or invalid input', async () => {
      const result = await convertImageBase64ToEscPosRaster('');
      expect(result).toBe('');
    });
  });

  describe('In-App Logo Auto-Fitting & Thermal Optimizer (fitAndOptimizeLogoImage)', () => {
    it('converts and scales logo image to fit 58mm thermal roll', async () => {
      const result = await fitAndOptimizeLogoImage('data:image/png;base64,RAW_IMG', '58mm');
      expect(result).not.toBeNull();
      expect(result?.dataUri).toBe('data:image/png;base64,OPTIMIZED_MOCK_PNG');
      expect(result?.width).toBe(360);
      expect(result?.height).toBe(160);
    });

    it('converts and scales logo image to fit 80mm wide thermal roll', async () => {
      const result = await fitAndOptimizeLogoImage('data:image/png;base64,RAW_IMG', '80mm');
      expect(result).not.toBeNull();
      expect(result?.dataUri).toBe('data:image/png;base64,OPTIMIZED_MOCK_PNG');
      expect(result?.width).toBe(520);
      expect(result?.height).toBe(230);
    });

    it('returns null gracefully for empty or invalid input', async () => {
      const result = await fitAndOptimizeLogoImage('');
      expect(result).toBeNull();
    });
  });

  describe('Organization Default Configuration', () => {
    it('initializes default branding and UPI QR properties in DEFAULT_ORG', () => {
      expect(DEFAULT_ORG.showLogoOnBill).toBe(true);
      expect(DEFAULT_ORG.logoBase64).toBe('');
      expect(DEFAULT_ORG.showUpiQrOnBill).toBe(true);
      expect(DEFAULT_ORG.upiId).toBe('');
      expect(DEFAULT_ORG.upiPayeeName).toBe('');
    });
  });

  describe('Paced Bluetooth Chunking Transmission (sendChunkedRawPayload)', () => {
    const { NativeModules } = require('react-native');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('sends small text payloads (<= 1024 bytes) in a single fast write call', async () => {
      const smallBytes = new Uint8Array(400).fill(65); // 400 bytes
      const smallBase64 = uint8ArrayToBase64(smallBytes);

      await sendChunkedRawPayload(smallBase64, 512, 10);

      expect(NativeModules.RNBLEPrinter.printRawData).toHaveBeenCalledTimes(1);
    });

    it('chunks large graphics payloads (> 1024 bytes) into 512-byte paced slices to prevent hardware FIFO overflow', async () => {
      const largeBytes = new Uint8Array(1536).fill(0x55); // 1536 bytes = 3 chunks of 512 bytes
      const largeBase64 = uint8ArrayToBase64(largeBytes);

      await sendChunkedRawPayload(largeBase64, 512, 10);

      // 1536 / 512 = exactly 3 calls
      expect(NativeModules.RNBLEPrinter.printRawData).toHaveBeenCalledTimes(3);
    });
  });

  describe('Receipt Image Mode Printing (printReceiptAsImageRaw)', () => {
    const { NativeModules } = require('react-native');

    beforeEach(() => {
      jest.clearAllMocks();
      setConnectedPrinterState({
        name: 'MOCK_PRINTER',
        address: '00:1B:10:73:D2:28',
        connected: true,
      });
    });

    it('invokes native Canvas rasterizer and streams complete raster image payload', async () => {
      const success = await printReceiptAsImageRaw('STORE NAME\n--------------------------------\nGRAND TOTAL  Rs. 100\n', {
        titleLineCount: 1,
        logoRasterBase64: 'MOCK_LOGO_RASTER',
        qrMatrix: [[true, false], [false, true]],
      });

      expect(success).toBe(true);
      expect(NativeModules.BluetoothScanner.renderReceiptToRaster).toHaveBeenCalledWith(
        expect.stringContaining('STORE NAME'),
        'MOCK_LOGO_RASTER',
        [[true, false], [false, true]],
        384,
        1
      );
      expect(NativeModules.RNBLEPrinter.printRawData).toHaveBeenCalled();
    });

    it('adapts target raster width to 576 dots when receipt text format is 80mm', async () => {
      const receipt80 = 'BIG SUPERMARKET\n' + '-'.repeat(48) + '\nGRAND TOTAL  Rs. 500\n';
      const success = await printReceiptAsImageRaw(receipt80, {
        titleLineCount: 1,
      });

      expect(success).toBe(true);
      expect(NativeModules.BluetoothScanner.renderReceiptToRaster).toHaveBeenCalledWith(
        expect.stringContaining('BIG SUPERMARKET'),
        '',
        null,
        576,
        1
      );
    });

    it('returns false gracefully when no printer is connected', async () => {
      setConnectedPrinterState(null);
      const success = await printReceiptAsImageRaw('SOME TEXT');
      expect(success).toBe(false);
    });
  });
});
