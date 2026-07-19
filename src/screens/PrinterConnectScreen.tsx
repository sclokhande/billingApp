import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Text, Card, Button, List, Divider, useTheme, Avatar, IconButton } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { BluetoothDevice, scanBluetoothPrinters } from '../services/bluetoothPrinterService';

export const PrinterConnectScreen = ({ navigation }: any) => {
  const theme = useTheme() as any;
  const { connectedPrinter, connectPrinter, disconnectPrinter, printReceipt } = useBilling();

  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null); // address of device connecting

  const startScan = async () => {
    try {
      setScanning(true);
      setDevices([]);
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
        Alert.alert('Connection Failed', `Could not connect to ${device.name}. Ensure the printer is powered on and within range.`);
      }
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred during connection.');
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
    // Scan automatically on mount
    startScan();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Status Card */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.boldText}>Printer Status</Text>
            <Divider style={{ marginVertical: 12 }} />
            
            {connectedPrinter ? (
              <View style={styles.connectedBox}>
                <View style={styles.statusRow}>
                  <Avatar.Icon size={44} icon="check-circle" style={{ backgroundColor: '#E8F5E9' }} color="#4CAF50" />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text variant="titleMedium" style={styles.boldText}>{connectedPrinter.name}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.outline }}>{connectedPrinter.address}</Text>
                    <Text variant="labelMedium" style={{ color: '#4CAF50', fontWeight: 'bold', marginTop: 2 }}>Connected</Text>
                  </View>
                </View>
                
                <View style={styles.btnRow}>
                  <Button 
                    mode="contained" 
                    icon="printer" 
                    onPress={handleTestPrint}
                    style={{ flex: 1, marginRight: 8 }}
                  >
                    Test Print
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
                  <View style={{ marginLeft: 12 }}>
                    <Text variant="titleMedium" style={styles.boldText}>No Printer Connected</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.outline }}>Parchiwala requires a Bluetooth printer to print physical bills.</Text>
                  </View>
                </View>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Helper Note for modern Android 10+ / Security Handshakes */}
        <Card style={[styles.card, { backgroundColor: '#FFF9C4', borderColor: '#FBC02D' }]} mode="outlined">
          <Card.Content style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Avatar.Icon size={28} icon="information-outline" style={{ backgroundColor: 'transparent' }} color="#F57F17" />
              <Text variant="bodySmall" style={{ marginLeft: 6, flex: 1, color: '#5D4037', fontSize: 11, lineHeight: 15 }}>
                <Text style={{ fontWeight: 'bold' }}>Important for Android 10+:</Text> If your printer automatically prints a long <Text style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>"BEGIN PUBLIC KEY"</Text> block, please <Text style={{ fontWeight: 'bold' }}>Unpair (Forget)</Text> the printer in your phone's system Bluetooth settings, then search and connect to it directly from the list below.
              </Text>
            </View>
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
              <Text variant="bodySmall" style={{ marginTop: 16, color: theme.colors.outline, textAlign: 'center', fontSize: 11, lineHeight: 16 }}>
                Note: On Android 11+, both Bluetooth and Location (GPS) Services must be turned ON in your phone's pull-down quick settings menu to discover unbonded printers.
              </Text>
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
