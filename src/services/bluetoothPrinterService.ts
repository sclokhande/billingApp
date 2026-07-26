import { Platform, PermissionsAndroid, NativeModules, NativeEventEmitter } from 'react-native';

export interface BluetoothDevice {
  name: string;
  address: string;
  connected?: boolean;
}

const { BluetoothScanner } = NativeModules;
const scannerEventEmitter = BluetoothScanner ? new NativeEventEmitter(BluetoothScanner) : null;

// Global flag to track connection in mock/active state
let mockConnectedDevice: BluetoothDevice | null = null;
let isPrinterConnectedSession = false;

// Dynamic try-catch to attempt using native receipt printer module if available
let NativeBLEPrinter: any = null;
try {
  // Try importing the actual receipt printer module
  const PrinterModule = require('react-native-thermal-receipt-printer');
  if (PrinterModule && PrinterModule.BLEPrinter) {
    NativeBLEPrinter = PrinterModule.BLEPrinter;
  }
} catch (e) {
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
      const apiLevel = Platform.Version as number;
      
      if (apiLevel >= 31) {
        // Android 12+ requires BLUETOOTH_SCAN, BLUETOOTH_CONNECT, and location permissions to scan unbonded devices
        const scanGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          {
            title: 'Bluetooth Scan Permission',
            message: 'Parchiwala needs access to scan for nearby thermal printers.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        const connectGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          {
            title: 'Bluetooth Connect Permission',
            message: 'Parchiwala needs access to connect to your thermal printer.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        const locationGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission for Bluetooth',
            message: 'Parchiwala needs location access to discover nearby Bluetooth devices.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        return (
          scanGranted === PermissionsAndroid.RESULTS.GRANTED &&
          connectGranted === PermissionsAndroid.RESULTS.GRANTED &&
          locationGranted === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        // Android 11 and below requires ACCESS_FINE_LOCATION to scan for BLE devices
        const locationGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission for Bluetooth',
            message: 'Parchiwala needs location access to scan for nearby Bluetooth printers.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return locationGranted === PermissionsAndroid.RESULTS.GRANTED;
      }
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
  if (Platform.OS === 'android' && BluetoothScanner) {
    return new Promise((resolve) => {
      const discoveredDevices = new Map<string, BluetoothDevice>();
      
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

/**
 * Connects to a selected bluetooth printer with timeout safety
 */
export const connectBluetoothPrinter = async (device: BluetoothDevice): Promise<boolean> => {
  if (NativeBLEPrinter) {
    try {
      await NativeBLEPrinter.init();
      await withTimeout(NativeBLEPrinter.connectPrinter(device.address), 2500, 'Printer connection timeout');
      mockConnectedDevice = { ...device, connected: true };
      isPrinterConnectedSession = true;
      return true;
    } catch (e) {
      console.warn('[BluetoothPrinterService] Real connection failed or timed out:', e);
      isPrinterConnectedSession = false;
    }
  }
  return false;
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
};

const encodeBase64 = (str: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      i++;
      const nextCode = str.charCodeAt(i);
      const surrogateCode = 0x10000 + (((code & 0x3ff) << 10) | (nextCode & 0x3ff));
      bytes.push(
        0xf0 | (surrogateCode >> 18),
        0x80 | ((surrogateCode >> 12) & 0x3f),
        0x80 | ((surrogateCode >> 6) & 0x3f),
        0x80 | (surrogateCode & 0x3f)
      );
    }
  }

  let j = 0;
  while (j < bytes.length) {
    const b1 = bytes[j++];
    const b2 = j < bytes.length ? bytes[j++] : NaN;
    const b3 = j < bytes.length ? bytes[j++] : NaN;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    const enc3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
    const enc4 = isNaN(b3) ? 64 : b3 & 63;

    result += chars.charAt(enc1) + chars.charAt(enc2) + 
              (enc3 === 64 ? '=' : chars.charAt(enc3)) + 
              (enc4 === 64 ? '=' : chars.charAt(enc4));
  }
  return result;
};

/**
 * Verifies system Bluetooth state and background socket connection.
 * Automatically attempts background re-connection if disconnected.
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
    await enableBluetooth();
    return { ok: false, reason: 'BT_OFF' };
  }

  // 2. Perform live physical socket connection check (2.5s timeout)
  console.log('[BluetoothPrinterService] Verifying live connection to:', device.name, device.address);
  try {
    const isAlive = await connectBluetoothPrinter(device);
    if (isAlive) {
      console.log('[BluetoothPrinterService] Live connection verified successfully!');
      return { ok: true };
    }
  } catch (e) {
    console.warn('[BluetoothPrinterService] Live connection check failed:', e);
  }

  isPrinterConnectedSession = false;
  console.warn('[BluetoothPrinterService] Printer is OFF or out of range.');
  return { ok: false, reason: 'FAILED' };
};

export const printReceiptRaw = async (payloadText: string): Promise<boolean> => {
  if (!mockConnectedDevice) {
    console.warn('[BluetoothPrinterService] Print aborted: No printer saved.');
    return false;
  }

  // Ensure background physical connection is alive before writing print bytes
  const connCheck = await ensureBluetoothConnected(mockConnectedDevice);
  if (!connCheck.ok) {
    console.warn('[BluetoothPrinterService] Print aborted: Physical connection check failed:', connCheck.reason);
    return false;
  }

  let printSuccess = false;
  if (NativeBLEPrinter) {
    try {
      const enableCmd = String.fromCharCode(27, 61, 1);
      const disableCmd = String.fromCharCode(27, 61, 0);

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
      if (lines.length > 0) {
        const rawOrgName = lines[0].trim();
        if (rawOrgName.length <= maxDoubleWidthCap) {
          // Fits on ONE line in Double-Width mode
          const padLeft = Math.max(0, Math.floor((maxDoubleWidthCap - rawOrgName.length) / 2));
          lines[0] = boldTitleOn + ' '.repeat(padLeft) + rawOrgName + boldTitleOff;
        } else {
          // For longer Org Names (up to 32 chars), use Double-Height + Bold so it fits on 1 line
          const padLeft = Math.max(0, Math.floor((maxNormalCap - rawOrgName.length) / 2));
          lines[0] = boldGrandTotalOn + ' '.repeat(padLeft) + rawOrgName + boldTitleOff;
        }
      }
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].includes('GRAND TOTAL') || (i > 0 && lines[i - 1].includes('GRAND TOTAL'))) {
          lines[i] = boldGrandTotalOn + lines[i] + boldTitleOff;
        }
      }
      const formattedPayload = lines.join('\n');

      const hardwareShieldedPayload = enableCmd + formattedPayload + '\n\n\n' + disableCmd;

      // Use the library's standard native printText method with CP437 single-byte encoding
      await NativeBLEPrinter.printText(hardwareShieldedPayload, { encoding: 'CP437' });
      printSuccess = true;
    } catch (e) {
      console.warn('[BluetoothPrinterService] Real print failed:', e);
      // Clear session flag on failure to force reconnect on next print
      isPrinterConnectedSession = false;
    }
  }
  return printSuccess;
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
