import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Text, Card, Button, List, Divider, useTheme, Avatar, IconButton, Chip } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { 
  BluetoothDevice, 
  scanBluetoothPrinters, 
  ensureBluetoothConnected, 
  enableBluetooth, 
  openLocationSettings 
} from '../services/bluetoothPrinterService';

export const PrinterConnectScreen = ({ navigation }: any) => {
  const theme = useTheme() as any;
  const { connectedPrinter, connectPrinter, disconnectPrinter, printReceipt, checkServicesStatus, isDemoMode } = useBilling();

  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null); // address of device connecting
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

  const startScan = async () => {
    try {
      setScanning(true);
      setDevices([]);
      const status = await checkServices();
      if (!status.bluetoothEnabled || !status.locationEnabled) {
        Alert.alert(
          'Services Disabled',
          'Bluetooth connection and Location services must be enabled to scan for nearby thermal printers.',
          [
            { text: 'Cancel', style: 'cancel' },
            ...(!status.bluetoothEnabled ? [{ text: 'Turn On Bluetooth', onPress: async () => { await enableBluetooth(); checkServices(); } }] : []),
            ...(!status.locationEnabled ? [{ text: 'Location Settings', onPress: async () => { await openLocationSettings(); checkServices(); } }] : []),
          ]
        );
        return;
      }
      const found = await scanBluetoothPrinters();
      setDevices(found);
    } catch (e: any) {
      Alert.alert('Permission Error', e.message || 'Failed to scan Bluetooth devices. Ensure Bluetooth and Location services are enabled.');
    } finally {
      setScanning(false);
    }
  };

  const handleConnect = async (device: BluetoothDevice) => {
    try {
      setConnecting(device.address);
      const success = await connectPrinter(device);
      if (success) {
        Alert.alert('Success', `Successfully connected to ${device.name}`);
      } else {
        Alert.alert('Connection Failed', `Unable to connect to ${device.name}. Please verify that your Parchiwala printer is powered on and within range.`);
      }
    } catch (e: any) {
      Alert.alert(
        'Printer Brand Error',
        e.message || 'This printer does not belong to parchiwala brand so could you please connect parchiwala printer or connect with parchiwala support team'
      );
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect Printer',
      'Are you sure you want to disconnect the printer?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: async () => await disconnectPrinter() }
      ]
    );
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
      '\n\n\n'
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
      // Background live socket health check when opening Bluetooth Printer screen
      if (connectedPrinter) {
        if (!status.bluetoothEnabled || !status.locationEnabled) {
          Alert.alert(
            'Printer Service Required',
            `Connected printer '${connectedPrinter.name}' requires Bluetooth and Location services. Please turn ON missing services to print receipts.`,
            [
              { text: 'Cancel', style: 'cancel' },
              ...(!status.bluetoothEnabled ? [{ text: 'Turn On Bluetooth', onPress: async () => { await enableBluetooth(); checkServices(); } }] : []),
              ...(!status.locationEnabled ? [{ text: 'Location Settings', onPress: async () => { await openLocationSettings(); checkServices(); } }] : []),
            ]
          );
        } else {
          const connCheck = await ensureBluetoothConnected(connectedPrinter);
          if (!connCheck.ok) {
            await disconnectPrinter();
            Alert.alert(
              'Printer Disconnected',
              `Printer '${connectedPrinter.name}' is turned off or unreachable. Automatically disconnected so you can pair or reconnect.`,
              [{ text: 'OK' }]
            );
          }
        }
      }
      startScan();
    };

    initScreen();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Service Status Header Card */}
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="titleSmall" style={styles.boldText}>Required System Services</Text>
              <Button mode="text" compact onPress={checkServices} icon="refresh">Check</Button>
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

        {/* Status Card */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.boldText}>Printer Status</Text>
            <Divider style={{ marginVertical: 12 }} />
            
            {connectedPrinter ? (
              <View style={styles.connectedBox}>
                <View style={styles.statusRow}>
                  <Avatar.Icon size={44} icon={servicesState.bluetoothEnabled && servicesState.locationEnabled ? "check-circle" : "alert-circle"} style={{ backgroundColor: servicesState.bluetoothEnabled && servicesState.locationEnabled ? '#E8F5E9' : '#FFF3E0' }} color={servicesState.bluetoothEnabled && servicesState.locationEnabled ? "#4CAF50" : "#EF6C00"} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text variant="titleMedium" style={styles.boldText}>{connectedPrinter.name}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.outline }}>{connectedPrinter.address}</Text>
                    <Text variant="labelMedium" style={{ color: servicesState.bluetoothEnabled && servicesState.locationEnabled ? '#4CAF50' : '#EF6C00', fontWeight: 'bold', marginTop: 2 }}>
                      {servicesState.bluetoothEnabled && servicesState.locationEnabled ? 'Connected' : 'Services Disabled'}
                    </Text>
                  </View>
                </View>
                
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
                    textColor={theme.colors.error}
                    style={{ borderColor: theme.colors.error }}
                    onPress={handleDisconnect}
                  >
                    Disconnect
                  </Button>
                </View>
              </View>
            ) : (
              <View style={styles.disconnectedBox}>
                <View style={styles.statusRow}>
                  <Avatar.Icon size={44} icon="close-circle" style={{ backgroundColor: '#FFEBEE' }} color="#F44336" />
                  <View style={{ marginLeft: 12, flex: 1, flexShrink: 1 }}>
                    <Text variant="titleMedium" style={styles.boldText}>No Printer Connected</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.outline, flexWrap: 'wrap', marginTop: 2 }}>
                      Parchiwala requires a Bluetooth printer to print physical bills.
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </Card.Content>
        </Card>


        {/* Scan / Discovered List */}
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={styles.boldText}>Available Printers</Text>
          <Button 
            mode="text" 
            icon="cached" 
            onPress={startScan}
            loading={scanning}
            disabled={scanning}
            compact
          >
            Rescan
          </Button>
        </View>

        <Card style={styles.card} mode="outlined">
          {scanning ? (
            <View style={styles.listCenter}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text variant="bodyMedium" style={{ marginTop: 12, color: theme.colors.outline }}>
                Scanning for nearby Bluetooth devices...
              </Text>
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.listCenter}>
              <Avatar.Icon size={48} icon="bluetooth-off" style={{ backgroundColor: '#ECEFF1' }} color="#78909C" />
              <Text variant="bodyMedium" style={{ marginTop: 12, color: theme.colors.outline, textAlign: 'center' }}>
                No nearby Bluetooth printers found.
              </Text>
              <Button mode="outlined" style={{ marginTop: 16 }} onPress={startScan}>
                Scan Again
              </Button>
            </View>
          ) : (
            devices.map((device, index) => {
              const isCurrentConnecting = connecting === device.address;
              const isConnected = connectedPrinter?.address === device.address;

              return (
                <View key={device.address}>
                  <List.Item
                    title={device.name}
                    description={device.address}
                    left={(props) => (
                      <List.Icon 
                        {...props} 
                        icon="printer" 
                        color={isConnected ? '#4CAF50' : theme.colors.onSurfaceVariant} 
                      />
                    )}
                    right={() => {
                      if (isCurrentConnecting) {
                        return <ActivityIndicator size="small" color={theme.colors.primary} style={{ alignSelf: 'center' }} />;
                      }
                      if (isConnected) {
                        return (
                          <IconButton 
                            icon="check" 
                            iconColor="#4CAF50" 
                            style={{ margin: 0, alignSelf: 'center' }} 
                          />
                        );
                      }
                      return (
                        <Button 
                          mode="outlined" 
                          onPress={() => handleConnect(device)} 
                          disabled={connecting !== null}
                          style={styles.connectBtn}
                          labelStyle={{ fontSize: 11 }}
                          compact
                        >
                          Connect
                        </Button>
                      );
                    }}
                  />
                  {index < devices.length - 1 && <Divider />}
                </View>
              );
            })
          )}
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
    borderRadius: 12,
  },
  boldText: {
    fontWeight: 'bold',
  },
  connectedBox: {
    marginTop: 4,
  },
  disconnectedBox: {
    marginTop: 4,
    paddingVertical: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    marginTop: 16,
    justifyContent: 'space-between',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  listCenter: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectBtn: {
    alignSelf: 'center',
    marginRight: 4,
  },
});
