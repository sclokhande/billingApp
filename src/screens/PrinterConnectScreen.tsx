import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Text, Card, Button, Divider, useTheme, Avatar, Chip } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useBilling } from '../context/BillingContext';
import { 
  BluetoothDevice, 
  ensureBluetoothConnected, 
  enableBluetooth, 
  openLocationSettings,
  autoDetectAndConnectAuthorizedPrinter,
  disconnectBluetoothPrinter
} from '../services/bluetoothPrinterService';
import authorizedPrintersConfig from '../config/authorized_printers.json';
import { PrinterBatteryIndicator } from '../components/PrinterBatteryIndicator';

const PRECONFIGURED_BRAND = authorizedPrintersConfig.brandName || 'Parchiwala';
const PRECONFIGURED_NAME = `${PRECONFIGURED_BRAND} 58mm Thermal Printer`;

export const PrinterConnectScreen = ({ navigation }: any) => {
  const theme = useTheme() as any;
  const { 
    connectedPrinter, 
    connectPrinter, 
    disconnectPrinter, 
    printReceipt, 
    checkServicesStatus, 
    printerTelemetry,
    checkPrinterTelemetry,
  } = useBilling();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallScreen = screenWidth < 380;

  const [connecting, setConnecting] = useState(false);
  const [checkingLive, setCheckingLive] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState<string>('');
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

  const handleConnect = async () => {
    try {
      setConnecting(true);
      setScanStatusMessage('Checking Bluetooth service...');
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

      setScanStatusMessage('Detecting nearby Parchiwala printer...');
      const result = await autoDetectAndConnectAuthorizedPrinter((msg) => setScanStatusMessage(msg));
      if (result.success && result.device) {
        await connectPrinter(result.device);
        Alert.alert('Success', `Connected to ${result.device.name} successfully!`);
      } else {
        Alert.alert(
          'Printer Not Found',
          result.error ||
            'No authorized Parchiwala thermal printer was found nearby.\n\nPlease verify:\n1. Your printer is powered ON.\n2. Bluetooth is enabled.\n3. The printer is charged and within range.'
        );
      }
    } catch (e: any) {
      Alert.alert(
        'Printer Connection Error',
        e.message || 'Failed to establish connection with Parchiwala printer.'
      );
    } finally {
      setConnecting(false);
      setScanStatusMessage('');
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
    setCheckingLive(true);
    try {
      // 1. Verify Bluetooth service
      const status = await checkServices();
      if (!status.bluetoothEnabled) {
        Alert.alert(
          'Bluetooth is Disabled',
          'Bluetooth is currently turned off on your device. Please turn ON Bluetooth to verify your printer connection.',
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

      if (connectedPrinter) {
        const connCheck = await ensureBluetoothConnected(connectedPrinter);
        if (connCheck.ok) {
          const telemetry = await checkPrinterTelemetry();
          const battInfo = typeof telemetry?.batteryLevel === 'number'
            ? `\n🔋 Battery Level: ${telemetry.batteryLevel}%${telemetry.isCharging ? ' (Charging)' : ''}`
            : '';
          Alert.alert(
            'Printer Online & Healthy',
            `✅ Printer '${connectedPrinter.name}' is actively connected, responsive, and ready to print.${battInfo}`
          );
          return;
        } else {
          await disconnectBluetoothPrinter();
          await disconnectPrinter();
        }
      }

      // If disconnected or probe failed: automatically detect and connect
      const result = await autoDetectAndConnectAuthorizedPrinter((msg) => setScanStatusMessage(msg));
      if (result.success && result.device) {
        await connectPrinter(result.device);
        Alert.alert(
          'Printer Reconnected & Ready',
          `✅ Found and connected to ${result.device.name}.`
        );
      } else {
        Alert.alert(
          'Printer Offline / Not Found',
          '❌ Unable to communicate with any nearby Parchiwala printer.\n\nPlease check:\n1. Printer power switch is turned ON.\n2. Thermal printer is charged and within Bluetooth range.\n\nTap "Connect Printer" to retry establishing connection.'
        );
      }
    } catch (err: any) {
      Alert.alert('Status Check Error', err.message || 'Failed to verify live connection.');
    } finally {
      setCheckingLive(false);
      setScanStatusMessage('');
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
    let isMounted = true;
    const initScreen = async () => {
      const status = await checkServices();

      if (connectedPrinter) {
        if (!status.bluetoothEnabled) {
          // Bluetooth off
        } else {
          // Probe existing connection without wiping user configuration
          const connCheck = await ensureBluetoothConnected(connectedPrinter);
          if (!connCheck.ok) {
            await disconnectBluetoothPrinter();
            await disconnectPrinter();
          }
        }
      } else {
        // Auto-detect and connect if Bluetooth is active
        if (status.bluetoothEnabled) {
          try {
            setConnecting(true);
            setScanStatusMessage('Checking paired Parchiwala printer...');
            const result = await autoDetectAndConnectAuthorizedPrinter((msg) => {
              if (isMounted) setScanStatusMessage(msg);
            });
            if (isMounted && result.success && result.device) {
              await connectPrinter(result.device);
            }
          } catch {
            // Ignore background error on mount
          } finally {
            if (isMounted) {
              setConnecting(false);
              setScanStatusMessage('');
            }
          }
        }
      }
    };

    initScreen();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(28, insets.bottom + 16) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.responsiveWrapper}>
          {/* Required System Services Header Card */}
          <Card style={styles.card} mode="outlined">
            <Card.Content style={styles.cardContent}>
              <View style={styles.serviceHeaderRow}>
                <View style={styles.serviceHeaderTitleCol}>
                  <MaterialCommunityIcons
                    name="cog-outline"
                    size={18}
                    color={theme.colors.primary}
                    style={{ marginRight: 6 }}
                  />
                  <Text variant="titleSmall" style={styles.boldText}>
                    Required System Services
                  </Text>
                </View>
                <Button
                  mode="text"
                  compact
                  onPress={checkServices}
                  icon="refresh"
                  contentStyle={styles.checkBtnContent}
                  labelStyle={styles.checkBtnLabel}
                >
                  Check
                </Button>
              </View>

              <View style={[styles.chipsRow, isSmallScreen && styles.chipsRowStacked]}>
                <Chip
                  icon={servicesState.bluetoothEnabled ? 'bluetooth' : 'bluetooth-off'}
                  style={[
                    styles.serviceChip,
                    { backgroundColor: servicesState.bluetoothEnabled ? '#E8F5E9' : '#FFEBEE' },
                  ]}
                  textStyle={[
                    styles.serviceChipText,
                    { color: servicesState.bluetoothEnabled ? '#2E7D32' : '#C62828' },
                  ]}
                  onPress={!servicesState.bluetoothEnabled ? () => enableBluetooth().then(checkServices) : undefined}
                >
                  {servicesState.bluetoothEnabled ? 'Bluetooth ON' : 'Bluetooth OFF'}
                </Chip>
                <Chip
                  icon={servicesState.locationEnabled ? 'map-marker-check' : 'map-marker-off'}
                  style={[
                    styles.serviceChip,
                    { backgroundColor: servicesState.locationEnabled ? '#E8F5E9' : '#FFEBEE' },
                  ]}
                  textStyle={[
                    styles.serviceChipText,
                    { color: servicesState.locationEnabled ? '#2E7D32' : '#C62828' },
                  ]}
                  onPress={!servicesState.locationEnabled ? () => openLocationSettings().then(checkServices) : undefined}
                >
                  {servicesState.locationEnabled ? 'Location ON' : 'Location OFF'}
                </Chip>
              </View>
            </Card.Content>
          </Card>

          {/* Pre-Configured Printer Card */}
          <Card style={[styles.card, styles.printerMainCard]} mode="outlined">
            <Card.Content style={styles.cardContent}>
              <View style={styles.printerCardHeader}>
                <View style={styles.printerCardTitleCol}>
                  <MaterialCommunityIcons
                    name="printer-pos-outline"
                    size={20}
                    color={theme.colors.primary}
                    style={{ marginRight: 6 }}
                  />
                  <Text variant="titleMedium" style={[styles.boldText, styles.cardTitleText]} numberOfLines={1}>
                    Pre-Configured Printer
                  </Text>
                </View>
                <Chip
                  compact
                  style={styles.brandChip}
                  textStyle={styles.brandChipText}
                >
                  {PRECONFIGURED_BRAND}
                </Chip>
              </View>

              <Divider style={styles.divider} />

              <View style={styles.printerInfoRow}>
                <Avatar.Icon
                  size={isSmallScreen ? 48 : 54}
                  icon={isConnected ? 'printer-check' : 'printer-off'}
                  style={[
                    styles.printerAvatar,
                    { backgroundColor: isConnected ? '#E8F5E9' : '#FFEBEE' },
                  ]}
                  color={isConnected ? '#2E7D32' : '#C62828'}
                />
                <View style={styles.printerDetailsCol}>
                  <Text variant="titleMedium" style={[styles.boldText, styles.printerNameText]} numberOfLines={2}>
                    {displayPrinterName}
                  </Text>

                  <Text variant="bodySmall" style={styles.printerSubText}>
                    Wireless Thermal Printer (58mm)
                  </Text>

                  {/* Connection Status Badge & Battery Indicator */}
                  <View style={styles.statusPillRow}>
                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor: connecting
                            ? '#E3F2FD'
                            : isConnected
                            ? '#E8F5E9'
                            : '#FFEBEE',
                          borderColor: connecting
                            ? '#90CAF9'
                            : isConnected
                            ? '#A5D6A7'
                            : '#FFCDD2',
                        },
                      ]}
                    >
                      {connecting ? (
                        <ActivityIndicator size={11} color="#1565C0" style={{ marginRight: 6 }} />
                      ) : (
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: isConnected ? '#2E7D32' : '#C62828' },
                          ]}
                        />
                      )}
                      <Text
                        style={[
                          styles.statusPillText,
                          {
                            color: connecting
                              ? '#1565C0'
                              : isConnected
                              ? '#1B5E20'
                              : '#B71C1C',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {connecting ? 'Connecting...' : isConnected ? 'Connected' : 'Disconnected'}
                      </Text>
                    </View>
                    <PrinterBatteryIndicator />
                  </View>
                </View>
              </View>

              {/* Live Scan Status Message (Visible during connecting) */}
              {connecting && Boolean(scanStatusMessage) && (
                <View style={styles.scanProgressBanner}>
                  <ActivityIndicator size={13} color="#1565C0" style={{ marginRight: 8 }} />
                  <Text style={styles.scanProgressText} numberOfLines={2}>
                    {scanStatusMessage}
                  </Text>
                </View>
              )}

              {/* Technical Specifications & Description */}
              <View
                style={[
                  styles.specBox,
                  {
                    backgroundColor: isConnected ? '#F1F8E9' : '#F8F9FA',
                    borderColor: isConnected ? '#C5E1A5' : '#EEEEEE',
                  },
                ]}
              >
                <View style={styles.specHeaderRow}>
                  <MaterialCommunityIcons
                    name={isConnected ? 'check-decagram' : 'radar'}
                    size={17}
                    color={isConnected ? '#2E7D32' : '#616161'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.specTitleText,
                      { color: isConnected ? '#2E7D32' : '#424242' },
                    ]}
                  >
                    {isConnected
                      ? 'Printer Ready to Print'
                      : connecting
                      ? 'Auto-Detecting Printer'
                      : 'Auto-Connect Ready'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.specBodyText,
                    { color: isConnected ? '#33691E' : '#616161' },
                  ]}
                >
                  {isConnected
                    ? 'Bluetooth connection is active and responsive. Customer receipts will automatically print to this 58mm thermal printer.'
                    : connecting
                    ? 'Searching for nearby authorized Parchiwala printer and establishing physical Bluetooth connection...'
                    : 'Turn ON your Parchiwala thermal printer. Tap Connect Printer below to automatically search and connect.'}
                </Text>

                {isConnected && (
                  <View style={styles.specBatteryRow}>
                    <MaterialCommunityIcons
                      name={
                        printerTelemetry?.isCharging
                          ? 'battery-charging'
                          : (printerTelemetry?.batteryLevel ?? 100) < 20
                          ? 'battery-alert'
                          : 'battery-check'
                      }
                      size={16}
                      color={
                        printerTelemetry?.isCharging
                          ? '#1976D2'
                          : (printerTelemetry?.batteryLevel ?? 100) < 20
                          ? '#C62828'
                          : '#2E7D32'
                      }
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.specBatteryText,
                        {
                          color: printerTelemetry?.isCharging
                            ? '#1565C0'
                            : (printerTelemetry?.batteryLevel ?? 100) < 20
                            ? '#C62828'
                            : '#2E7D32',
                        },
                      ]}
                    >
                      Battery Status:{' '}
                      {printerTelemetry?.batteryLevel != null
                        ? `${printerTelemetry.batteryLevel}%`
                        : '100%'}{' '}
                      {printerTelemetry?.isCharging
                        ? '(Charging)'
                        : (printerTelemetry?.batteryLevel ?? 100) < 20
                        ? '(Low Battery - Connect Charger)'
                        : '(Optimal)'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Actions for Pre-configured Printer */}
              <View style={styles.actionSection}>
                {isConnected ? (
                  <View style={[styles.btnRow, isSmallScreen && styles.btnRowStacked]}>
                    <Button
                      mode="contained"
                      icon="printer"
                      onPress={handleTestPrint}
                      style={[styles.actionBtn, isSmallScreen ? styles.btnFullWidth : styles.btnFlexTest]}
                      contentStyle={styles.btnContent}
                      labelStyle={styles.btnLabel}
                    >
                      Test Print
                    </Button>
                    <Button
                      mode="outlined"
                      icon="bluetooth-off"
                      textColor={theme.colors.error}
                      style={[
                        styles.actionBtn,
                        { borderColor: theme.colors.error },
                        isSmallScreen ? styles.btnFullWidth : styles.btnFlexDisconnect,
                      ]}
                      contentStyle={styles.btnContent}
                      labelStyle={styles.btnLabel}
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
                    contentStyle={styles.primaryBtnContent}
                    labelStyle={styles.primaryBtnLabel}
                  >
                    {connecting ? 'Searching & Connecting...' : 'Connect Printer'}
                  </Button>
                )}

                {/* Status Verification Refresh Button - Always accessible */}
                <Button
                  mode="text"
                  icon="refresh"
                  onPress={handleCheckLiveStatus}
                  loading={checkingLive}
                  disabled={checkingLive || connecting}
                  style={styles.verifyHealthBtn}
                  contentStyle={styles.verifyHealthBtnContent}
                  labelStyle={styles.verifyHealthLabel}
                >
                  Verify Connection Health
                </Button>
              </View>
            </Card.Content>
          </Card>
        </View>
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
    flexGrow: 1,
  },
  responsiveWrapper: {
    width: '100%',
    maxWidth: 580,
    alignSelf: 'center',
    gap: 16,
  },
  card: {
    borderRadius: 16,
    elevation: 1,
  },
  cardContent: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  printerMainCard: {
    paddingVertical: 2,
  },
  boldText: {
    fontWeight: 'bold',
  },
  serviceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceHeaderTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkBtnContent: {
    height: 32,
  },
  checkBtnLabel: {
    fontSize: 12,
    marginHorizontal: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  chipsRowStacked: {
    flexDirection: 'column',
    gap: 8,
  },
  serviceChip: {
    flex: 1,
    minWidth: 130,
    borderRadius: 8,
  },
  serviceChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  printerCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  printerCardTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  cardTitleText: {
    fontSize: 16,
  },
  brandChip: {
    backgroundColor: '#EDE7F6',
    borderRadius: 8,
  },
  brandChipText: {
    color: '#4527A0',
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    marginBottom: 16,
  },
  printerInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  printerAvatar: {
    marginTop: 2,
  },
  printerDetailsCol: {
    marginLeft: 14,
    flex: 1,
  },
  printerNameText: {
    fontSize: 16,
    lineHeight: 22,
  },
  printerSubText: {
    color: '#757575',
    marginTop: 2,
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: '100%',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scanProgressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderColor: '#BBDEFB',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  scanProgressText: {
    fontSize: 12,
    color: '#1565C0',
    flex: 1,
    fontWeight: '500',
  },
  specBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  specHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  specTitleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  specBodyText: {
    fontSize: 12,
    lineHeight: 17,
  },
  specBatteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#C5E1A5',
  },
  specBatteryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionSection: {
    marginTop: 4,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  btnRowStacked: {
    flexDirection: 'column',
    gap: 10,
  },
  actionBtn: {
    borderRadius: 10,
  },
  btnFlexTest: {
    flex: 1.2,
  },
  btnFlexDisconnect: {
    flex: 1,
  },
  btnFullWidth: {
    width: '100%',
  },
  btnContent: {
    height: 46,
  },
  btnLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  connectPrimaryBtn: {
    borderRadius: 10,
  },
  primaryBtnContent: {
    height: 48,
  },
  primaryBtnLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  verifyHealthBtn: {
    marginTop: 10,
    borderRadius: 8,
  },
  verifyHealthBtnContent: {
    height: 42,
  },
  verifyHealthLabel: {
    fontSize: 13,
  },
});
