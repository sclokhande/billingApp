import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Alert,
  Platform,
  Linking,
  BackHandler,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Avatar,
  useTheme,
  Divider,
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useBilling } from '../context/BillingContext';
import { formatInvoiceDateTime } from '../utils/dateUtils';
import { APP_CONFIG } from '../config/app_config';

export const PrinterLockScreen = ({ navigation }: any) => {
  const theme = useTheme() as any;
  const { width } = useWindowDimensions();
  const {
    printerLockStatus,
    checkPrinterLock,
    unlockViaMasterPassword,
    reconnectRegisteredPrinter,
  } = useBilling();

  const [masterPassword, setMasterPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Lock hardware back button on Android so user cannot bypass lock screen
  useEffect(() => {
    const onBackPress = () => true;
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  // Periodic check if printer was connected in background
  useEffect(() => {
    const interval = setInterval(async () => {
      const status = await checkPrinterLock();
      if (!status.isLocked) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainTabs' }],
        });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [checkPrinterLock, navigation]);

  const handleReconnectPrinter = async () => {
    try {
      setIsReconnecting(true);
      setErrorMessage('');
      const res = await reconnectRegisteredPrinter();
      if (res.success) {
        Alert.alert('Terminal Unlocked', res.message, [
          {
            text: 'Continue',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'MainTabs' }],
              });
            },
          },
        ]);
      } else {
        Alert.alert(
          'Printer Reconnect Failed',
          res.message + '\n\nPlease turn ON your thermal printer, make sure Bluetooth is enabled, and try again.'
        );
      }
    } catch {
      Alert.alert('Error', 'An error occurred while connecting to printer.');
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleMasterUnlock = async () => {
    if (!masterPassword.trim()) {
      setErrorMessage('Please enter the Master Password.');
      return;
    }
    try {
      setIsUnlocking(true);
      setErrorMessage('');
      const res = await unlockViaMasterPassword(masterPassword.trim());
      if (res.success) {
        Alert.alert('Unlocked Successfully', res.message, [
          {
            text: 'Open Billing Terminal',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'MainTabs' }],
              });
            },
          },
        ]);
      } else {
        setErrorMessage(res.message);
      }
    } catch {
      setErrorMessage('Verification failed. Please try again.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleCallSupport = () => {
    const phoneNumber = '+918551010291';
    const url = Platform.OS === 'android' ? `tel:${phoneNumber}` : `telprompt:${phoneNumber}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Unable to open phone dialer.'));
  };

  const handleWhatsAppSupport = () => {
    const url = 'whatsapp://send?phone=+918551010291&text=Hello%20Parchiwala%20Support,%20my%20billing%20app%20is%20locked%20due%20to%20printer%20inactivity.';
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Linking.openURL('https://wa.me/918551010291');
        }
      })
      .catch(() => Linking.openURL('https://wa.me/918551010291'));
  };

  const registeredName = printerLockStatus?.registeredDevice?.name || 'Registered Thermal Printer';
  const lastConnectedStr = printerLockStatus?.lastConnectedDate
    ? formatInvoiceDateTime(printerLockStatus.lastConnectedDate)
    : 'Not recently connected';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.cardWrapper, { maxWidth: width > 520 ? 480 : '100%' }]}>
          {/* Header Lock Icon & Title */}
          <View style={styles.header}>
            <Avatar.Icon
              size={68}
              icon="lock-alert"
              color={theme.colors.error}
              style={[styles.avatar, { backgroundColor: theme.colors.errorContainer || '#FFEBEE' }]}
            />
            <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.error }]}>
              Terminal Locked
            </Text>
            <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
              Your registered Bluetooth printer has not been connected for over {APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS} hours.
            </Text>
          </View>

          {/* Device & Inactivity Card */}
          <Card style={[styles.infoCard, { borderColor: theme.colors.outlineVariant }]} mode="outlined">
            <Card.Content style={styles.infoContent}>
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="printer-outline" size={22} color={theme.colors.primary} />
                <View style={styles.infoTextContainer}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    REGISTERED PRINTER
                  </Text>
                  <Text variant="titleSmall" style={styles.boldText} numberOfLines={1}>
                    {registeredName}
                  </Text>
                </View>
              </View>

              <Divider style={styles.divider} />

              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="clock-outline" size={22} color={theme.colors.outline} />
                <View style={styles.infoTextContainer}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    LAST CONNECTED
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {lastConnectedStr}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          {/* Option 1: Reconnect Registered Printer */}
          <Card style={[styles.actionCard, { borderColor: theme.colors.primary + '40' }]} mode="outlined">
            <Card.Content>
              <Text variant="titleSmall" style={[styles.boldText, { color: theme.colors.primary, marginBottom: 4 }]}>
                OPTION 1: AUTOMATIC RECONNECT
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 14 }}>
                Turn ON your registered printer and ensure Bluetooth is enabled on your device.
              </Text>

              <Button
                mode="contained"
                icon="printer-wireless"
                loading={isReconnecting}
                disabled={isReconnecting || isUnlocking}
                onPress={handleReconnectPrinter}
                style={styles.actionBtn}
              >
                Reconnect Registered Printer
              </Button>
            </Card.Content>
          </Card>

          {/* Option 2: Master Password Override */}
          <Card style={[styles.actionCard, { borderColor: theme.colors.outlineVariant }]} mode="outlined">
            <Card.Content>
              <Text variant="titleSmall" style={[styles.boldText, { marginBottom: 4 }]}>
                OPTION 2: MASTER PASSWORD
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                Enter the administrative Master Password to grant a temporary {APP_CONFIG.PRINTER_SECURITY_LOCK.MASTER_UNLOCK_GRACE_HOURS}-hour operational extension.
              </Text>

              <TextInput
                mode="outlined"
                label="Master Password"
                value={masterPassword}
                onChangeText={(t) => {
                  setMasterPassword(t);
                  setErrorMessage('');
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="characters"
                right={
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off' : 'eye'}
                    onPress={() => setShowPassword(!showPassword)}
                  />
                }
                style={styles.input}
              />

              {errorMessage ? (
                <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
                  {errorMessage}
                </Text>
              ) : null}

              <Button
                mode="contained-tonal"
                icon="lock-open-outline"
                loading={isUnlocking}
                disabled={isUnlocking || isReconnecting}
                onPress={handleMasterUnlock}
                style={[styles.actionBtn, { marginTop: 10 }]}
              >
                Unlock with Master Password
              </Button>
            </Card.Content>
          </Card>

          {/* Support Section */}
          <View style={styles.supportContainer}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
              Need urgent help or printer support?
            </Text>
            <View style={styles.supportButtonsRow}>
              <Button
                mode="outlined"
                icon="phone"
                onPress={handleCallSupport}
                style={styles.supportBtn}
                compact
              >
                Call Support
              </Button>
              <Button
                mode="outlined"
                icon="whatsapp"
                onPress={handleWhatsAppSupport}
                style={styles.supportBtn}
                compact
              >
                WhatsApp
              </Button>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardWrapper: {
    width: '100%',
    gap: 14,
  },
  header: {
    alignItems: 'center',
    marginBottom: 6,
  },
  avatar: {
    marginBottom: 12,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  infoCard: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  infoContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  divider: {
    marginVertical: 2,
  },
  boldText: {
    fontWeight: '700',
  },
  actionCard: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  actionBtn: {
    borderRadius: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
  },
  errorText: {
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '500',
  },
  supportContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  supportButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  supportBtn: {
    borderRadius: 8,
  },
});
