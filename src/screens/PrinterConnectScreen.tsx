import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Text, Card, Button, Divider, useTheme, Avatar, Chip } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useBilling } from '../context/BillingContext';
import { 
  BluetoothDevice, 
  ensureBluetoothConnected, 
  enableBluetooth, 
  openLocationSettings 
} from '../services/bluetoothPrinterService';
import authorizedPrintersConfig from '../config/authorized_printers.json';

const PRECONFIGURED_ADDRESS =
  (authorizedPrintersConfig.allowedAddresses && authorizedPrintersConfig.allowedAddresses[0]) ||
  '00:1B:10:73:D2:19';
const PRECONFIGURED_BRAND = authorizedPrintersConfig.brandName || 'Parchiwala';
const PRECONFIGURED_NAME = `${PRECONFIGURED_BRAND} 58mm Thermal Printer`;

export const PrinterConnectScreen = ({ navigation }: any) => {
  const theme = useTheme() as any;
  const { connectedPrinter, connectPrinter, disconnectPrinter, printReceipt, checkServicesStatus, isDemoMode } = useBilling();

  const [connecting, setConnecting] = useState(false);
  const [checkingLive, setCheckingLive] = useState(false);
  const [servicesState, setServicesState] = useState<{ bluetoothEnabled: boolean; locationEnabled: boolean }>({
    bluetoothEnabled: true,
    locationEnabled: true,
  });

  const checkServices = async () => {
    try {
      const status = await checkServicesStatus();
      setServicesState(status);
      return status;
    } catch (e) {
      return { bluetoothEnabled: true, locationEnabled: true };
    }
  };

  const isConnected = Boolean(connectedPrinter);
  const displayPrinterName = connectedPrinter?.name || PRECONFIGURED_NAME;
  const displayPrinterAddress = connectedPrinter?.address || PRECONFIGURED_ADDRESS;

  const handleConnect = async () => {
    const targetDevice: BluetoothDevice = {
      name: displayPrinterName,
      address: displayPrinterAddress,
    };

    try {
      setConnecting(true);
      const status = await checkServices();
      if (!status.bluetoothEnabled) {
        Alert.alert(
          'Bluetooth is Disabled',
          'Please turn on Bluetooth to connect to your Parchiwala thermal printer.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Turn On Bluetooth',
              onPress: async () => {
                await enableBluetooth();
                await checkServices();
              },
            },
          ]
        );
        return;
      }

      const success = await connectPrinter(targetDevice);
      if (success) {
        Alert.alert('Success', `Successfully connected to ${targetDevice.name}`);
      } else {
        Alert.alert(
          'Connection Failed',
          `Unable to connect to ${targetDevice.name} (${targetDevice.address}).\n\nPlease verify that your Parchiwala printer is powered on, charged, and within Bluetooth range.`
        );
      }
    } catch (e: any) {
      Alert.alert(
        'Printer Connection Error',
        e.message || 'Failed to establish connection with pre-configured printer.'
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect Printer',
      'Are you sure you want to disconnect from the printer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => await disconnectPrinter(),
        },
      ]
    );
  };

  const handleCheckLiveStatus = async () => {
    if (!connectedPrinter) {
      await handleConnect();
      return;
    }

    setCheckingLive(true);
    try {
      const status = await checkServices();
      if (!status.bluetoothEnabled) {
        Alert.alert('Bluetooth OFF', 'Bluetooth is disabled on your device.');
        return;
      }

      const connCheck = await ensureBluetoothConnected(connectedPrinter);
      if (connCheck.ok) {
        Alert.alert('Printer Online', `Printer '${connectedPrinter.name}' is actively connected and ready.`);
      } else {
        await disconnectPrinter();
        Alert.alert(
          'Printer Disconnected',
          `Printer '${connectedPrinter.name}' is unreachable or turned off. Status updated to Disconnected.`
        );
      }
    } catch (err: any) {
      Alert.alert('Status Check Error', err.message || 'Failed to verify live connection.');
    } finally {
      setCheckingLive(false);
    }
  };

  const handleTestPrint = async () => {
    if (!connectedPrinter) return;

    const testPayload = [
      '================================',
      '     PARCHIWALA TEST SLIP',
      '================================',
      'Date: ' + new Date().toLocaleDateString(),
      'Time: ' + new Date().toLocaleTimeString(),
      'Status: CONNECTED OK',
      'Width: 58mm (32 chars)',
      '--------------------------------',
      'If you can read this text, your',
      'Bluetooth thermal printer is',
      'successfully connected & working.',
      '================================',
      '\n\n\n',
    ].join('\n');

    try {
      const success = await printReceipt(testPayload);
      if (success) {
        Alert.alert('Test Page Sent', 'Test print payload sent to printer.');
      } else {
        Alert.alert('Print Error', 'Failed to send test print. Try reconnecting the printer.');
      }
    } catch (e) {
      Alert.alert('Print Error', 'An unexpected error occurred during print.');
    }
  };

  useEffect(() => {
    const initScreen = async () => {
      const status = await checkServices();
      if (connectedPrinter) {
        if (!status.bluetoothEnabled) {
          // Alert user bluetooth is off
        } else {
          const connCheck = await ensureBluetoothConnected(connectedPrinter);
          if (!connCheck.ok) {
            await disconnectPrinter();
          }
        }
      }
    };

    initScreen();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Required System Services Header Card */}
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="titleSmall" style={styles.boldText}>
                Required System Services
              </Text>
              <Button mode="text" compact onPress={checkServices} icon="refresh">
                Check
              </Button>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Chip
                icon={servicesState.bluetoothEnabled ? 'bluetooth' : 'bluetooth-off'}
                style={{ backgroundColor: servicesState.bluetoothEnabled ? '#E8F5E9' : '#FFEBEE' }}
                textStyle={{ color: servicesState.bluetoothEnabled ? '#2E7D32' : '#C62828', fontSize: 12 }}
                onPress={!servicesState.bluetoothEnabled ? () => enableBluetooth().then(checkServices) : undefined}
              >
                {servicesState.bluetoothEnabled ? 'Bluetooth ON' : 'Bluetooth OFF'}
              </Chip>
              <Chip
                icon={servicesState.locationEnabled ? 'map-marker-check' : 'map-marker-off'}
                style={{ backgroundColor: servicesState.locationEnabled ? '#E8F5E9' : '#FFEBEE' }}
                textStyle={{ color: servicesState.locationEnabled ? '#2E7D32' : '#C62828', fontSize: 12 }}
                onPress={!servicesState.locationEnabled ? () => openLocationSettings().then(checkServices) : undefined}
              >
                {servicesState.locationEnabled ? 'Location ON' : 'Location OFF'}
              </Chip>
            </View>
          </Card.Content>
        </Card>

        {/* Pre-Configured Printer Card */}
        <Card style={[styles.card, styles.printerMainCard]} mode="outlined">
          <Card.Content>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text variant="titleMedium" style={styles.boldText}>
                Pre-Configured Printer
              </Text>
              <Chip
                compact
                style={{ backgroundColor: '#EDE7F6' }}
                textStyle={{ color: '#4527A0', fontSize: 11, fontWeight: '700' }}
              >
                {PRECONFIGURED_BRAND}
              </Chip>
            </View>

            <Divider style={{ marginBottom: 16 }} />

            <View style={styles.printerInfoRow}>
              <Avatar.Icon
                size={54}
                icon={isConnected ? 'printer-check' : 'printer-off'}
                style={{
                  backgroundColor: isConnected ? '#E8F5E9' : '#FFEBEE',
                }}
                color={isConnected ? '#2E7D32' : '#C62828'}
              />
              <View style={{ marginLeft: 14, flex: 1 }}>
                <Text variant="titleMedium" style={[styles.boldText, { fontSize: 16 }]}>
                  {displayPrinterName}
                </Text>

                {/* Connection Status Badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: isConnected ? '#E8F5E9' : '#FFEBEE',
                        borderColor: isConnected ? '#A5D6A7' : '#FFCDD2',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: isConnected ? '#2E7D32' : '#C62828' },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: isConnected ? '#1B5E20' : '#B71C1C' },
                      ]}
                    >
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Technical Specifications & Description */}
            <View
              style={[
                styles.specBox,
                { backgroundColor: isConnected ? '#F1F8E9' : '#FAFAFA' },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <MaterialCommunityIcons
                  name="information-outline"
                  size={16}
                  color={isConnected ? '#33691E' : '#757575'}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: isConnected ? '#33691E' : '#424242',
                  }}
                >
                  {isConnected ? 'Printer Ready' : 'Connection Required'}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 11.5,
                  color: isConnected ? '#558B2F' : '#616161',
                  lineHeight: 16,
                }}
              >
                {isConnected
                  ? 'Bluetooth connection is active. Receipts will automatically print to this 58mm thermal printer.'
                  : 'Turn ON your Parchiwala thermal printer, ensure it is within range, and tap Connect below.'}
              </Text>
            </View>

            {/* Actions for Pre-configured Printer */}
            <View style={styles.actionSection}>
              {isConnected ? (
                <View style={styles.btnRow}>
                  <Button
                    mode="contained"
                    icon="printer"
                    onPress={handleTestPrint}
                    disabled={isDemoMode}
                    style={{ flex: 1, marginRight: 8 }}
                  >
                    {isDemoMode ? 'Test Print (Disabled)' : 'Test Print'}
                  </Button>
                  <Button
                    mode="outlined"
                    icon="bluetooth-off"
                    textColor={theme.colors.error}
                    style={{ borderColor: theme.colors.error }}
                    onPress={handleDisconnect}
                  >
                    Disconnect
                  </Button>
                </View>
              ) : (
                <Button
                  mode="contained"
                  icon={connecting ? undefined : 'bluetooth-connect'}
                  onPress={handleConnect}
                  loading={connecting}
                  disabled={connecting}
                  style={styles.connectPrimaryBtn}
                  contentStyle={{ height: 48 }}
                >
                  {connecting ? 'Connecting to Printer...' : 'Connect Printer'}
                </Button>
              )}

              {/* Status Verification Refresh Button */}
              {isConnected && (
                <Button
                  mode="text"
                  icon="refresh"
                  onPress={handleCheckLiveStatus}
                  loading={checkingLive}
                  disabled={checkingLive}
                  style={{ marginTop: 8 }}
                  labelStyle={{ fontSize: 12 }}
                >
                  Verify Connection Health
                </Button>
              )}
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 14,
  },
  printerMainCard: {
    paddingVertical: 4,
  },
  boldText: {
    fontWeight: 'bold',
  },
  printerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  specBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 16,
  },
  actionSection: {
    marginTop: 4,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  connectPrimaryBtn: {
    borderRadius: 10,
  },
});
