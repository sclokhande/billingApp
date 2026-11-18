import { Platform, PermissionsAndroid, NativeModules, NativeEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authorizedPrintersConfig from '../config/authorized_printers.json';
import { APP_CONFIG } from '../config/app_config';
import {
  buildThermalReceiptRawPayload,
  ReceiptBrandingOptions,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from '../utils/receiptBrandingService';
import { wrapText } from './printService';

export interface BluetoothDevice {
  name: string;
  address: string;
  connected?: boolean;
}

/**
 * Validates whether a Bluetooth device MAC address belongs to authorized Parchiwala brand list in config JSON
 */
export const isParchiwalaPrinterAddress = (address: string): { isAllowed: boolean; message: string } => {
  // Normalize MAC address by converting to uppercase and stripping colons/spaces/dashes
  const cleanAddr = (address || '').replace(/[^A-FA-f0-9]/g, '').toUpperCase();
  const defaultMsg =
    authorizedPrintersConfig.supportMessage ||
    'This printer does not belong to parchiwala brand so could you please connect parchiwala printer or connect with parchiwala support team';

  if (!cleanAddr) {
    return { isAllowed: false, message: defaultMsg };
  }

  // Strict check: Exact MAC address match only (normalized)
  const allowedAddresses = (authorizedPrintersConfig.allowedAddresses || []).map((a) =>
    a.replace(/[^A-FA-f0-9]/g, '').toUpperCase()
  );

  if (allowedAddresses.includes(cleanAddr)) {
    return { isAllowed: true, message: '' };
  }

  return { isAllowed: false, message: defaultMsg };
};

const { BluetoothScanner } = NativeModules;

const getScannerEventEmitter = () => {
  const scanner = NativeModules.BluetoothScanner;
  if (!scanner) return null;
  try {
    return new NativeEventEmitter(scanner);
  } catch {
    return null;
  }
};

// Global flag to track connection in mock/active state
let mockConnectedDevice: BluetoothDevice | null = null;
let isPrinterConnectedSession = false;
let lastVerifiedSocketTimestamp = 0;

// Dynamic try-catch to attempt using native receipt printer module if available
let NativeBLEPrinter: any = null;
try {
  // Try importing the actual receipt printer module
  const PrinterModule = require('react-native-thermal-receipt-printer');
  if (PrinterModule && PrinterModule.BLEPrinter) {
    NativeBLEPrinter = PrinterModule.BLEPrinter;
  }
} catch {
  console.log('[BluetoothPrinterService] Native module not loaded, operating in simulator/mock mode.');
}

/**
 * Checks and requests appropriate Bluetooth and Location permissions (especially for Android 12+)
 */
export const requestBluetoothPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'ios') {
    // iOS handles permissions via Info.plist dialogs automatically on access
    return true;
  }

  if (Platform.OS === 'android') {
    try {
      // Request Bluetooth & Location permissions directly across all Android devices without version checks
      const permissionsToRequest = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];

      const granted = await PermissionsAndroid.requestMultiple(permissionsToRequest);

      const scanGranted =
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
      const connectGranted =
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
      const locationGranted =
        granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

      return locationGranted || scanGranted || connectGranted;
    } catch (err) {
      console.warn('[BluetoothPrinterService] Permission request error:', err);
      return false;
    }
  }

  return false;
};

/**
 * Scans for nearby bluetooth printers
 */
export const scanBluetoothPrinters = async (): Promise<BluetoothDevice[]> => {
  const hasPermission = await requestBluetoothPermissions();
  if (!hasPermission) {
    throw new Error('Bluetooth permissions not granted.');
  }

  // Check if Bluetooth is turned ON in system settings
  const btEnabled = await isBluetoothEnabled();
  if (!btEnabled) {
    // Request enabling Bluetooth programmatically directly inside the app
    await enableBluetooth();
    throw new Error('Bluetooth is turned off. Please enable Bluetooth to search for printers.');
  }

  // Use raw native discovery on Android for unbonded/unpaired devices
  if (Platform.OS === 'android' && NativeModules.BluetoothScanner) {
    return new Promise((resolve) => {
      const discoveredDevices = new Map<string, BluetoothDevice>();
      const scannerEventEmitter = getScannerEventEmitter();
      
      const onDeviceFoundListener = scannerEventEmitter?.addListener('onDeviceFound', (device: { name: string; address: string }) => {
        if (device.address) {
          discoveredDevices.set(device.address, {
            name: device.name || 'Thermal Printer',
            address: device.address,
            connected: false,
          });
        }
      });

      const cleanUp = () => {
        onDeviceFoundListener?.remove();
        onDiscoveryFinishedListener?.remove();
        BluetoothScanner.stopScan().catch(() => {});
      };

      const onDiscoveryFinishedListener = scannerEventEmitter?.addListener('onDiscoveryFinished', () => {
        cleanUp();
        resolve(Array.from(discoveredDevices.values()));
      });

      BluetoothScanner.startScan()
        .then(() => {
          // Stop scanning after 6 seconds to give quick user response
          setTimeout(() => {
            cleanUp();
            resolve(Array.from(discoveredDevices.values()));
          }, 6000);
        })
        .catch((e: any) => {
          console.warn('[BluetoothPrinterService] Native scan start failed:', e);
          cleanUp();
          resolve([]);
        });
    });
  }

  if (NativeBLEPrinter) {
    try {
      await NativeBLEPrinter.init();
      const devices = await NativeBLEPrinter.getDeviceList();
      if (devices && Array.isArray(devices)) {
        return devices.map((d: any) => ({
          name: d.device_name || 'Thermal Printer',
          address: d.inner_mac_address || d.mac_address || d.uuid,
          connected: false,
        }));
      }
    } catch (e) {
      console.warn('[BluetoothPrinterService] Real scan failed:', e);
    }
  }

  return [];
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number = 4000, timeoutMsg: string = 'Connection timeout'): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMsg));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

export const LAST_ACTIVE_PRINTER_KEY = '@parchiwala_last_active_printer_addr';

/**
 * Connects to a selected bluetooth printer with timeout safety
 */
export const connectBluetoothPrinter = async (
  device: BluetoothDevice,
  timeoutMs: number = 6000
): Promise<boolean> => {
  const brandCheck = isParchiwalaPrinterAddress(device.address);
  if (!brandCheck.isAllowed) {
    throw new Error(brandCheck.message);
  }

  // If already connected to this device, avoid duplicate socket initialization
  if (isPrinterConnectedSession && mockConnectedDevice?.address === device.address) {
    return true;
  }

  if (NativeBLEPrinter) {
    try {
      // Ensure any ongoing native discovery is stopped before opening RFCOMM socket
      if (Platform.OS === 'android' && NativeModules.BluetoothScanner) {
        await NativeModules.BluetoothScanner.stopScan().catch(() => {});
        await new Promise<void>((resolve) => setTimeout(resolve, 150));
      }
      await NativeBLEPrinter.init();
      await withTimeout(NativeBLEPrinter.connectPrinter(device.address), timeoutMs, 'Printer connection timeout');
      mockConnectedDevice = { ...device, connected: true };
      isPrinterConnectedSession = true;
      lastVerifiedSocketTimestamp = Date.now();
      AsyncStorage.setItem(LAST_ACTIVE_PRINTER_KEY, device.address).catch(() => {});
      return true;
    } catch (e) {
      console.warn('[BluetoothPrinterService] Real connection failed or timed out:', e);
      isPrinterConnectedSession = false;
      lastVerifiedSocketTimestamp = 0;
      throw e;
    }
  } else {
    // Simulator / Mock fallback
    mockConnectedDevice = { ...device, connected: true };
    isPrinterConnectedSession = true;
    lastVerifiedSocketTimestamp = Date.now();
    AsyncStorage.setItem(LAST_ACTIVE_PRINTER_KEY, device.address).catch(() => {});
    return true;
  }
};

/**
 * Disconnects the currently connected printer
 */
export const disconnectBluetoothPrinter = async (): Promise<void> => {
  if (NativeBLEPrinter) {
    try {
      await NativeBLEPrinter.closeConn();
    } catch (e) {
      console.warn('[BluetoothPrinterService] Real disconnect failed:', e);
    }
  }
  mockConnectedDevice = null;
  isPrinterConnectedSession = false;
  lastVerifiedSocketTimestamp = 0;
};

/**
 * Probes the Bluetooth socket with an ESC/POS non-printing command (ESC @: Initialize Printer).
 * If the printer is powered off or disconnected, the socket write/flush will fail immediately.
 * If the printer is on and connected, ESC @ clears the printer buffer without printing any paper.
 */
export const pingPrinterSocket = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    const { RNBLEPrinter } = NativeModules;
    if (RNBLEPrinter && typeof RNBLEPrinter.printRawData === 'function') {
      return new Promise<boolean>((resolve) => {
        let finished = false;
        const timer = setTimeout(() => {
          if (!finished) {
            finished = true;
            resolve(true); // Write succeeded without error callback
          }
        }, 600);

        try {
          // ESC @ (0x1b, 0x40) in Base64 is "G0A="
          RNBLEPrinter.printRawData('G0A=', (err: any) => {
            if (!finished) {
              finished = true;
              clearTimeout(timer);
              console.warn('[BluetoothPrinterService] Live ping probe failed:', err);
              resolve(false);
            }
          });
        } catch {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            resolve(false);
          }
        }
      });
    }
  }
  return true;
};

/**
 * Verifies system Bluetooth state and physical socket connection.
 * Probes active socket with non-printing ping; automatically attempts background re-connection if disconnected.
 */
export const ensureBluetoothConnected = async (
  device: BluetoothDevice | null
): Promise<{ ok: boolean; reason?: 'BT_OFF' | 'NO_DEVICE' | 'FAILED' }> => {
  if (!device) {
    return { ok: false, reason: 'NO_DEVICE' };
  }

  // 1. Check if Bluetooth is ON in system settings
  const btEnabled = await isBluetoothEnabled();
  if (!btEnabled) {
    console.warn('[BluetoothPrinterService] Bluetooth is OFF.');
    return { ok: false, reason: 'BT_OFF' };
  }

  // 2. If already marked connected, probe physical connection first
  if (isPrinterConnectedSession && mockConnectedDevice?.address === device.address) {
    if (Date.now() - lastVerifiedSocketTimestamp < 8000) {
      return { ok: true };
    }

    if (NativeBLEPrinter) {
      console.log('[BluetoothPrinterService] Probing active printer socket for:', device.name);
      const isAlive = await pingPrinterSocket();
      if (isAlive) {
        lastVerifiedSocketTimestamp = Date.now();
        console.log('[BluetoothPrinterService] Active printer socket responded OK!');
        mockConnectedDevice = { ...device, connected: true };
        return { ok: true };
      }
      console.warn('[BluetoothPrinterService] Active socket probe failed. Clearing stale socket...');
      await disconnectBluetoothPrinter();
    } else {
      lastVerifiedSocketTimestamp = Date.now();
      return { ok: true };
    }
  }

  // 3. Connect / reconnect fresh physical socket with fast 3.5s timeout
  console.log('[BluetoothPrinterService] Establishing connection to:', device.name, device.address);
  try {
    const isAlive = await connectBluetoothPrinter(device, 3500);
    if (isAlive) {
      if (NativeBLEPrinter) {
        const pingOk = await pingPrinterSocket();
        if (pingOk) {
          lastVerifiedSocketTimestamp = Date.now();
          console.log('[BluetoothPrinterService] Physical connection and socket ping verified successfully!');
          return { ok: true };
        }
      } else {
        lastVerifiedSocketTimestamp = Date.now();
        return { ok: true };
      }
    }
  } catch (e) {
    console.warn('[BluetoothPrinterService] Live connection check failed:', e);
  }

  isPrinterConnectedSession = false;
  mockConnectedDevice = null;
  lastVerifiedSocketTimestamp = 0;
  console.warn('[BluetoothPrinterService] Printer is OFF, out of range, or unresponsive.');
  return { ok: false, reason: 'FAILED' };
};

/**
 * Sends ESC/POS raw base64 data to RNBLEPrinter in paced chunks (512 bytes per chunk with 25ms delay).
 * This prevents the hardware UART FIFO serial buffer on 58mm thermal printers from overflowing
 * when printing large graphic payloads (Logos and UPI QR code raster images).
 */
export const sendChunkedRawPayload = async (
  rawBase64: string,
  chunkSize: number = 512,
  delayMs: number = 25
): Promise<void> => {
  const { RNBLEPrinter } = NativeModules;
  if (!RNBLEPrinter || typeof RNBLEPrinter.printRawData !== 'function') {
    return;
  }

  const rawBytes = base64ToUint8Array(rawBase64);
  const totalLength = rawBytes.length;

  // For small text-only receipts (<= 1024 bytes), send in a single packet for instant printing
  if (totalLength <= 1024) {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      try {
        RNBLEPrinter.printRawData(rawBase64, (err: any) => {
          if (!settled) {
            settled = true;
            if (err) reject(new Error(err));
            else resolve();
          }
        });
      } catch (e) {
        if (!settled) {
          settled = true;
          reject(e);
        }
      }
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, 300);
    });
  }

  // For larger graphic payloads (Logo / QR code), transmit in paced 512-byte chunks
  let socketError: any = null;
  const errorHandler = (err: any) => {
    if (err) {
      socketError = err;
      console.warn('[BluetoothPrinterService] Chunked printRawData error callback:', err);
    }
  };

  for (let offset = 0; offset < totalLength; offset += chunkSize) {
    if (socketError) {
      throw new Error(socketError);
    }

    const chunkEnd = Math.min(offset + chunkSize, totalLength);
    const chunkBytes = rawBytes.subarray(offset, chunkEnd);
    const chunkBase64 = uint8ArrayToBase64(chunkBytes);

    RNBLEPrinter.printRawData(chunkBase64, errorHandler);

    // Give thermal printer hardware microcontroller time to burn raster dots
    if (chunkEnd < totalLength) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Small drain pause after final chunk to ensure all printhead lines finish burning
  await new Promise((resolve) => setTimeout(resolve, 80));
};

export const printReceiptRaw = async (
  payloadText: string,
  brandingOptions?: ReceiptBrandingOptions
): Promise<boolean> => {
  if (!mockConnectedDevice) {
    console.warn('[BluetoothPrinterService] Print aborted: No printer saved.');
    return false;
  }

  // 1. Telemetry safety pre-check for physical paper and buffer readiness
  try {
    const telemetry = await queryPrinterTelemetry(mockConnectedDevice);
    if (telemetry && telemetry.online && !telemetry.hasPaper) {
      console.warn('[BluetoothPrinterService] Print aborted: Thermal paper out detected!');
      throw new Error('PRINTER_PAPER_OUT: Thermal printer is out of paper. Please reload paper roll.');
    }
  } catch (err: any) {
    if (err && err.message && err.message.includes('PRINTER_PAPER_OUT')) {
      throw err;
    }
    // Non-blocking telemetry fallback
  }

  // 2. Ensure background physical connection is alive before writing print bytes
  // If session is already confirmed connected, avoid redundant reconnect cycles
  if (!isPrinterConnectedSession) {
    const connCheck = await ensureBluetoothConnected(mockConnectedDevice);
    if (!connCheck.ok) {
      console.warn('[BluetoothPrinterService] Print aborted: Physical connection check failed:', connCheck.reason);
      return false;
    }
  }

  let printSuccess = false;
  if (NativeBLEPrinter) {
    try {
      const { RNBLEPrinter } = NativeModules;
      // If RNBLEPrinter.printRawData is available, send paced chunked byte stream
      if (RNBLEPrinter && typeof RNBLEPrinter.printRawData === 'function') {
        const rawBase64 = buildThermalReceiptRawPayload(payloadText, brandingOptions);
        await sendChunkedRawPayload(rawBase64, 512, 25);
        printSuccess = true;
      } else {
        const enableCmd = String.fromCharCode(27, 61, 1);

        // Detect 80mm vs 58mm line capacity
        const is80mm = payloadText.includes('-'.repeat(48));
        const maxNormalCap = is80mm ? 48 : 32;
        const maxDoubleWidthCap = is80mm ? 24 : 16;

        // ESC E 1 (Bold ON) + ESC ! 32 (Double Height & Double Width Title Size)
        const boldTitleOn = String.fromCharCode(27, 69, 1) + String.fromCharCode(27, 33, 32);
        const boldTitleOff = String.fromCharCode(27, 69, 0) + String.fromCharCode(27, 33, 0);

        // ESC E 1 (Bold ON) + ESC ! 16 (Double Height for Grand Total or long titles)
        const boldGrandTotalOn = String.fromCharCode(27, 69, 1) + String.fromCharCode(27, 33, 16);

        const lines = payloadText.split('\n');
        const titleCount = Math.max(1, brandingOptions?.titleLineCount || 1);
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
        const formattedPayload = lines.join('\n');

        const cleanPayload = enableCmd + formattedPayload + '\n\n\n';

        // Use the library's standard native printText method with CP437 single-byte encoding
        await NativeBLEPrinter.printText(cleanPayload, { encoding: 'CP437' });
        printSuccess = true;
      }
    } catch (e) {
      console.warn('[BluetoothPrinterService] Real print failed:', e);
      // Clear session flag on failure to force reconnect on next print
      isPrinterConnectedSession = false;
    }
  } else {
    // Simulator or test mock mode
    printSuccess = true;
  }
  return printSuccess;
};

export interface ReceiptImagePrintOptions extends ReceiptBrandingOptions {
  qrMatrix?: boolean[][];
}

/**
 * Prints the entire receipt as an exact 1-bit visual monochrome raster image.
 * Renders logo, bold store headers, line items table, Rupee symbol (₹), grand total,
 * dynamic UPI QR code, and footer notes onto a single continuous canvas bitmap,
 * converts to ESC/POS GS v 0 raster bytes, and sends via paced chunked Bluetooth streaming.
 */
export const printReceiptAsImageRaw = async (
  payloadText: string,
  options?: ReceiptImagePrintOptions
): Promise<boolean> => {
  if (!mockConnectedDevice) {
    console.warn('[BluetoothPrinterService] Print aborted: No printer saved.');
    return false;
  }

  // 1. Telemetry safety pre-check for physical paper and buffer readiness
  try {
    const telemetry = await queryPrinterTelemetry(mockConnectedDevice);
    if (telemetry && telemetry.online && !telemetry.hasPaper) {
      console.warn('[BluetoothPrinterService] Print aborted: Thermal paper out detected!');
      throw new Error('PRINTER_PAPER_OUT: Thermal printer is out of paper. Please reload paper roll.');
    }
  } catch (err: any) {
    if (err && err.message && err.message.includes('PRINTER_PAPER_OUT')) {
      throw err;
    }
  }

  // 2. Ensure background physical connection is alive before writing print bytes
  if (!isPrinterConnectedSession) {
    const connCheck = await ensureBluetoothConnected(mockConnectedDevice);
    if (!connCheck.ok) {
      console.warn('[BluetoothPrinterService] Print aborted: Physical connection check failed:', connCheck.reason);
      return false;
    }
  }

  const is80mm = payloadText.includes('-'.repeat(48));
  const targetWidthDots = is80mm ? 576 : 384;
  const titleCount = Math.max(1, options?.titleLineCount || 1);

  if (Platform.OS === 'android' && NativeModules.BluetoothScanner?.renderReceiptToRaster) {
    try {
      const res = await NativeModules.BluetoothScanner.renderReceiptToRaster(
        payloadText,
        options?.logoRasterBase64 || '',
        options?.qrMatrix || null,
        targetWidthDots,
        titleCount
      );

      if (res && res.rasterBase64) {
        // Send the complete visual receipt raster payload via paced Bluetooth chunking
        await sendChunkedRawPayload(res.rasterBase64, 512, 25);
        return true;
      }
    } catch (renderErr) {
      console.warn('[BluetoothPrinterService] renderReceiptToRaster error, falling back to standard print:', renderErr);
    }
  }

  // Fallback: If native rendering not available (e.g. simulator/iOS), use standard printRaw
  return await printReceiptRaw(payloadText, options);
};

/**
 * Gets currently connected device info
 */
export const getConnectedPrinter = (): BluetoothDevice | null => {
  return mockConnectedDevice;
};

/**
 * Sets current connected printer state (used for loading from storage)
 */
export const setConnectedPrinterState = (device: BluetoothDevice | null) => {
  mockConnectedDevice = device;
};

export interface PrinterTelemetryResult {
  online: boolean;
  hasPaper: boolean;
  paperNearEnd?: boolean;
  batteryLevel?: number | null; // 0-100 percentage
  isCharging?: boolean;
  status: 'OK' | 'PAPER_OUT' | 'PAPER_NEAR_END' | 'OFFLINE' | 'NO_PRINTER' | 'ERROR' | string;
  error?: string;
}

/**
 * Queries real-time hardware status and paper telemetry from the thermal printer using ESC/POS DLE EOT protocol
 */
export const queryPrinterTelemetry = async (
  device?: BluetoothDevice | null
): Promise<PrinterTelemetryResult> => {
  const target = device || mockConnectedDevice;
  if (!target || !target.address) {
    return { online: false, hasPaper: false, batteryLevel: null, isCharging: false, status: 'NO_PRINTER' };
  }

  if (Platform.OS === 'android' && NativeModules.BluetoothScanner?.checkPrinterTelemetry) {
    try {
      const res = await NativeModules.BluetoothScanner.checkPrinterTelemetry(target.address);
      if (res) {
        const isOnline = !!res.online || isPrinterConnectedSession;
        const hasPaper = res.status === 'PAPER_OUT' ? false : (res.hasPaper ?? true);
        const batteryLevel = typeof res.batteryLevel === 'number' ? res.batteryLevel : null;
        return {
          online: isOnline,
          hasPaper: hasPaper,
          paperNearEnd: !!res.paperNearEnd,
          batteryLevel: batteryLevel,
          isCharging: !!res.isCharging,
          status: res.status || (hasPaper ? 'OK' : 'PAPER_OUT'),
          error: res.error,
        };
      }
    } catch (e: any) {
      console.warn('[BluetoothPrinterService] checkPrinterTelemetry error:', e);
    }
  }

  // Simulator / mock fallback or when socket is held by printing library
  return {
    online: isPrinterConnectedSession,
    hasPaper: true,
    paperNearEnd: false,
    batteryLevel: isPrinterConnectedSession ? 85 : null,
    isCharging: false,
    status: isPrinterConnectedSession ? 'OK' : 'OFFLINE',
  };
};

/**
 * Checks whether Android Doze mode / battery optimization is disabled for Parchiwala
 */
export const isBatteryOptimizationIgnored = async (): Promise<boolean> => {
  if (Platform.OS === 'android' && NativeModules.BluetoothScanner?.isIgnoringBatteryOptimizations) {
    try {
      return await NativeModules.BluetoothScanner.isIgnoringBatteryOptimizations();
    } catch (e) {
      console.warn('[BluetoothPrinterService] Error checking battery optimization:', e);
      return false;
    }
  }
  return true; // Default true on iOS or desktop
};

/**
 * Prompts user to disable Android battery optimization for seamless background printer auto-reconnects
 */
export const requestDisableBatteryOptimization = async (): Promise<boolean> => {
  if (Platform.OS === 'android' && NativeModules.BluetoothScanner?.requestIgnoreBatteryOptimizations) {
    try {
      return await NativeModules.BluetoothScanner.requestIgnoreBatteryOptimizations();
    } catch (e) {
      console.warn('[BluetoothPrinterService] Error requesting battery optimization disable:', e);
      return false;
    }
  }
  return true;
};

export const isBluetoothEnabled = async (): Promise<boolean> => {
  if (Platform.OS === 'android' && BluetoothScanner) {
    try {
      return await BluetoothScanner.isBluetoothEnabled();
    } catch (e) {
      console.warn('[BluetoothPrinterService] Error checking Bluetooth status:', e);
    }
  }
  return true; // default to true on iOS / simulator
};

export const enableBluetooth = async (): Promise<boolean> => {
  if (Platform.OS === 'android' && BluetoothScanner) {
    try {
      return await BluetoothScanner.enableBluetooth();
    } catch (e) {
      console.warn('[BluetoothPrinterService] Error enabling Bluetooth:', e);
    }
  }
  return false;
};

export const pairBluetoothDevice = async (address: string): Promise<boolean> => {
  const brandCheck = isParchiwalaPrinterAddress(address);
  if (!brandCheck.isAllowed) {
    throw new Error(brandCheck.message);
  }

  if (Platform.OS === 'android' && BluetoothScanner) {
    try {
      return await BluetoothScanner.pairDevice(address);
    } catch (e) {
      console.warn('[BluetoothPrinterService] Pairing failed:', e);
      throw e;
    }
  }
  return true; // default to true on iOS / simulator
};

export const isDeviceBonded = async (address: string): Promise<boolean> => {
  if (Platform.OS === 'android' && BluetoothScanner) {
    try {
      return await BluetoothScanner.isDeviceBonded(address);
    } catch (e) {
      console.warn('[BluetoothPrinterService] Error checking bond state:', e);
    }
  }
  return true; // default to true on iOS / simulator
};

export const isLocationEnabled = async (): Promise<boolean> => {
  if (Platform.OS === 'android' && BluetoothScanner) {
    try {
      return await BluetoothScanner.isLocationEnabled();
    } catch (e) {
      console.warn('[BluetoothPrinterService] Error checking Location status:', e);
    }
  }
  return true; // default to true on iOS / simulator
};

export const openLocationSettings = async (): Promise<boolean> => {
  if (Platform.OS === 'android' && BluetoothScanner) {
    try {
      return await BluetoothScanner.openLocationSettings();
    } catch (e) {
      console.warn('[BluetoothPrinterService] Error opening location settings:', e);
    }
  }
  return false;
};

export const checkSystemServices = async (): Promise<{ bluetoothEnabled: boolean; locationEnabled: boolean }> => {
  const bluetoothEnabled = await isBluetoothEnabled();
  const locationEnabled = await isLocationEnabled();
  return { bluetoothEnabled, locationEnabled };
};

/**
 * Searches bonded devices on the device to match any of authorized Parchiwala printer MAC addresses.
 * Uses ultra-fast single-call native filter (0.1ms) when available, falling back to per-address checks.
 */
export const findBondedAuthorizedPrinter = async (): Promise<string | null> => {
  const allowed = authorizedPrintersConfig.allowedAddresses || [];
  if (Platform.OS === 'android' && NativeModules.BluetoothScanner) {
    if (typeof NativeModules.BluetoothScanner.getBondedAuthorizedPrinter === 'function') {
      try {
        const result = await NativeModules.BluetoothScanner.getBondedAuthorizedPrinter(allowed);
        if (result && result.address) {
          console.log('[BluetoothPrinterService] Found bonded authorized printer via fast-filter:', result.address);
          return result.address;
        }
        return null;
      } catch (err) {
        console.warn('[BluetoothPrinterService] getBondedAuthorizedPrinter error, falling back:', err);
      }
    }

    for (const addr of allowed) {
      try {
        const bonded = await NativeModules.BluetoothScanner.isDeviceBonded(addr);
        if (bonded) {
          console.log('[BluetoothPrinterService] Found bonded authorized printer:', addr);
          return addr;
        }
      } catch {
        // Continue checking
      }
    }
  }
  return null;
};

/**
 * Approach C (Smart 3-Stage Auto-Detect):
 * Stage 1: Checks cached last active address and system bonded devices (0ms, 0 battery).
 * Stage 2: If not found, runs a targeted scan (up to 10s) that terminates the moment an authorized MAC is spotted.
 */
export const findNearbyAuthorizedPrinter = async (
  options?: { skipBonded?: boolean; timeoutMs?: number }
): Promise<BluetoothDevice | null> => {
  const rawAllowed: string[] = authorizedPrintersConfig.allowedAddresses || [];
  const brandName = authorizedPrintersConfig.brandName || 'Parchiwala';
  const defaultName = `${brandName} 58mm Thermal Printer`;

  if (rawAllowed.length === 0) {
    return null;
  }

  // --- STAGE 1: Check Last Active and Bonded Devices (0ms, zero battery) ---
  if (!options?.skipBonded) {
    try {
      const lastActive = await AsyncStorage.getItem(LAST_ACTIVE_PRINTER_KEY);
      if (lastActive) {
        const cleanLast = lastActive.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
        const isAllowed = rawAllowed.some(
          (a) => a.replace(/[^A-Fa-f0-9]/g, '').toUpperCase() === cleanLast
        );
        if (isAllowed) {
          if (Platform.OS === 'android' && NativeModules.BluetoothScanner) {
            const bonded = await NativeModules.BluetoothScanner.isDeviceBonded(lastActive);
            if (bonded) {
              console.log('[BluetoothPrinterService] Stage 1: Last active printer is bonded:', lastActive);
              return { name: defaultName, address: lastActive };
            }
          } else {
            return { name: defaultName, address: lastActive };
          }
        }
      }
    } catch (err) {
      console.warn('[BluetoothPrinterService] Error checking last active printer:', err);
    }

    // Check any other bonded authorized printer
    const bondedAddr = await findBondedAuthorizedPrinter();
    if (bondedAddr) {
      console.log('[BluetoothPrinterService] Stage 1: Bonded authorized printer detected:', bondedAddr);
      return { name: defaultName, address: bondedAddr };
    }
  }

  // --- STAGE 2: Targeted Quick Scan (Up to 10 seconds, stops immediately on match) ---
  const btEnabled = await isBluetoothEnabled();
  if (!btEnabled) {
    return null;
  }

  const hasPerm = await requestBluetoothPermissions();
  if (!hasPerm) {
    return null;
  }

  const scanDuration = options?.timeoutMs || 10000;

  if (Platform.OS === 'android' && NativeModules.BluetoothScanner) {
    return new Promise<BluetoothDevice | null>((resolve) => {
      let resolved = false;
      let scanTimer: any = null;

      const cleanUp = () => {
        if (scanTimer) clearTimeout(scanTimer);
        try {
          onFoundListener?.remove();
          onFinishedListener?.remove();
          NativeModules.BluetoothScanner.stopScan().catch(() => {});
        } catch {}
      };

      const handleFound = (deviceAddress: string, deviceName?: string) => {
        if (resolved) return;
        resolved = true;
        cleanUp();

        const cleanFound = deviceAddress.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
        const matchedOrig =
          rawAllowed.find(
            (a) => a.replace(/[^A-Fa-f0-9]/g, '').toUpperCase() === cleanFound
          ) || deviceAddress;

        console.log('[BluetoothPrinterService] Stage 2: Found nearby authorized printer:', matchedOrig);
        resolve({
          name: deviceName || defaultName,
          address: matchedOrig,
          connected: false,
        });
      };

      const scannerEventEmitter = getScannerEventEmitter();
      const onFoundListener = scannerEventEmitter?.addListener(
        'onDeviceFound',
        (dev: { name: string; address: string }) => {
          if (!dev || !dev.address) return;
          const cleanDev = dev.address.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
          const match = rawAllowed.some(
            (a) => a.replace(/[^A-Fa-f0-9]/g, '').toUpperCase() === cleanDev
          );
          if (match) {
            handleFound(dev.address, dev.name);
          }
        }
      );

      const onFinishedListener = scannerEventEmitter?.addListener('onDiscoveryFinished', () => {
        if (!resolved) {
          resolved = true;
          cleanUp();
          resolve(null);
        }
      });

      NativeModules.BluetoothScanner.startScan()
        .then(() => {
          // Hard safety timeout of up to 10 seconds for thorough baseband channel hopping
          scanTimer = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              cleanUp();
              resolve(null);
            }
          }, scanDuration);
        })
        .catch((err: any) => {
          console.warn('[BluetoothPrinterService] Auto-detect scan start failed:', err);
          cleanUp();
          resolve(null);
        });
    });
  }

  // Fallback for NativeBLEPrinter or Simulator
  if (NativeBLEPrinter) {
    try {
      await NativeBLEPrinter.init();
      const devices = await NativeBLEPrinter.getDeviceList();
      if (devices && Array.isArray(devices)) {
        for (const d of devices) {
          const addr = d.inner_mac_address || d.mac_address || d.uuid;
          if (addr) {
            const cleanD = addr.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
            const match = rawAllowed.some(
              (a) => a.replace(/[^A-Fa-f0-9]/g, '').toUpperCase() === cleanD
            );
            if (match) {
              return {
                name: d.device_name || defaultName,
                address: addr,
              };
            }
          }
        }
      }
    } catch (e) {
      console.warn('[BluetoothPrinterService] NativeBLE fallback scan failed:', e);
    }
  } else {
    // Simulator mock fallback
    return {
      name: defaultName,
      address: rawAllowed[0] || '00:1B:10:73:05:19',
    };
  }

  return null;
};

// Guard to prevent concurrent overlapping auto-detect sweeps from colliding
let activeAutoDetectPromise: Promise<{ success: boolean; device?: BluetoothDevice; error?: string }> | null = null;

/**
 * Stage 3 Auto-Connect Orchestrator:
 * Automatically discovers nearby authorized Parchiwala printer and connects.
 * Gracefully attempts bonded device first; if offline/unreachable, falls back to live scan.
 */
export const autoDetectAndConnectAuthorizedPrinter = async (
  onProgress?: (status: string) => void
): Promise<{ success: boolean; device?: BluetoothDevice; error?: string }> => {
  if (activeAutoDetectPromise) {
    return activeAutoDetectPromise;
  }

  activeAutoDetectPromise = (async () => {
    try {
      // Guard: On First-Time App Activation page, strictly do not run scan or connect functionality
      try {
        const isActivated = await AsyncStorage.getItem(APP_CONFIG.ACTIVATION_STORAGE_KEY);
        if (APP_CONFIG.REQUIRE_ACTIVATION_PIN ? isActivated !== 'true' : isActivated === 'false') {
          console.log('[BluetoothPrinterService] App not activated. Bluetooth scan/connect disabled on Activation page.');
          return {
            success: false,
            error: 'App activation required before connecting printer.',
          };
        }
      } catch {}

      onProgress?.('Checking Bluetooth service...');
      const btEnabled = await isBluetoothEnabled();
      if (!btEnabled) {
        return {
          success: false,
          error: 'Bluetooth is turned OFF. Please turn ON Bluetooth in system settings.',
        };
      }

      // Step 1: Check if a paired/bonded printer candidate is readily available
      onProgress?.('Checking paired printers...');
      const bondedCandidate = await findNearbyAuthorizedPrinter();
      if (bondedCandidate) {
        onProgress?.(`Connecting to paired printer (${bondedCandidate.name})...`);
        try {
          // Fast-fail probe: If paired printer is on, it connects within 300-800ms.
          // If it doesn't connect within 2200ms, it is powered OFF or out of range.
          const success = await connectBluetoothPrinter(bondedCandidate, 2200);
          if (success) {
            await AsyncStorage.setItem(LAST_ACTIVE_PRINTER_KEY, bondedCandidate.address);
            return { success: true, device: { ...bondedCandidate, connected: true } };
          }
        } catch (connErr) {
          console.warn('[BluetoothPrinterService] Paired printer unreachable/offline. Falling back to live scan...', connErr);
        }
      }

      // Step 2: Fallback to live radio scan if paired printer is offline or not found
      onProgress?.('Scanning for nearby Parchiwala printer...');
      const liveDetected = await findNearbyAuthorizedPrinter({ skipBonded: true, timeoutMs: 8000 });
      if (!liveDetected) {
        return {
          success: false,
          error:
            'No authorized Parchiwala thermal printer found nearby.\n\nPlease ensure your thermal printer is powered ON, charged, and within Bluetooth range.',
        };
      }

      onProgress?.(`Connecting to ${liveDetected.name}...`);
      const success = await connectBluetoothPrinter(liveDetected, 6000);
      if (success) {
        await AsyncStorage.setItem(LAST_ACTIVE_PRINTER_KEY, liveDetected.address);
        return { success: true, device: { ...liveDetected, connected: true } };
      }

      return {
        success: false,
        error: `Failed to open Bluetooth connection with ${liveDetected.name}.`,
      };
    } catch (err: any) {
      console.warn('[BluetoothPrinterService] autoDetectAndConnectAuthorizedPrinter error:', err);
      return {
        success: false,
        error: err?.message || 'Error occurred while connecting to Parchiwala printer.',
      };
    } finally {
      activeAutoDetectPromise = null;
    }
  })();

  return activeAutoDetectPromise;
};


