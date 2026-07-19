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

/**
 * Connects to a selected bluetooth printer
 */
export const connectBluetoothPrinter = async (device: BluetoothDevice): Promise<boolean> => {
  if (NativeBLEPrinter) {
    try {
      await NativeBLEPrinter.init();
      await NativeBLEPrinter.connectPrinter(device.address);
      mockConnectedDevice = { ...device, connected: true };
      isPrinterConnectedSession = true;
      return true;
    } catch (e) {
      console.warn('[BluetoothPrinterService] Real connection failed:', e);
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

export const printReceiptRaw = async (payloadText: string): Promise<boolean> => {
  // Check if Bluetooth is turned ON in system settings
  const btEnabled = await isBluetoothEnabled();
  if (!btEnabled) {
    console.warn('[BluetoothPrinterService] Print aborted: Bluetooth is turned off.');
    // Request enabling Bluetooth programmatically
    await enableBluetooth();
    return false;
  }

  // If we haven't connected in this session, try to reconnect to the last connected printer
  if (!isPrinterConnectedSession && mockConnectedDevice) {
    console.log('[BluetoothPrinterService] Attempting session auto-reconnect...');
    const connected = await connectBluetoothPrinter(mockConnectedDevice);
    if (!connected) {
      console.warn('[BluetoothPrinterService] Session auto-reconnect failed.');
      return false;
    }
  }

  // Double check session flag to prevent NullPointerException crashes in native module
  if (!isPrinterConnectedSession) {
    console.warn('[BluetoothPrinterService] Print aborted: printer not connected in this session.');
    return false;
  }

  let printSuccess = false;
  if (NativeBLEPrinter) {
    try {
      // Prepend ESC = 1 (enable printer) and append ESC = 0 (disable printer)
      // to shield the printer from OS-level background security handshakes when idle.
      const enableCmd = String.fromCharCode(27, 61, 1);
      const disableCmd = String.fromCharCode(27, 61, 0);
      const hardwareShieldedPayload = enableCmd + payloadText + '\n\n\n' + disableCmd;

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
