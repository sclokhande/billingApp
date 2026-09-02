import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert, Share, useWindowDimensions, NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Checkbox,
  useTheme,
  Snackbar,
  Divider,
  Portal,
  Dialog,
  SegmentedButtons,
  ActivityIndicator,
  Avatar,
  RadioButton,
} from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { seedDatabase } from '../db/operations';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

export const ProfileScreen = ({ navigation }: any) => {
  const theme = useTheme() as any;
  const { organization, updateOrgProfile, clearAllData, clearInvoicesOnly, dbMode, exportData, importData, isLoading, connectedPrinter, isDemoMode } = useBilling();
  const { width } = useWindowDimensions();

  // Form states
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [showGstOnBill, setShowGstOnBill] = useState(false);
  const [currency, setCurrency] = useState('Rs.');
  const [slogan, setSlogan] = useState('Thank You Visit again');
  const [printWidth, setPrintWidth] = useState<'58mm' | '80mm'>('58mm');

  // Export/Import states
  const [exportDialogVisible, setExportDialogVisible] = useState(false);
  const [importDialogVisible, setImportDialogVisible] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [exportFilename, setExportFilename] = useState('');
  const [importJson, setImportJson] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size?: number;
    jsonStr: string;
    isValid: boolean;
    errorMsg?: string;
  } | null>(null);

  // Wipe Data states
  const [wipeDialogVisible, setWipeDialogVisible] = useState(false);
  const [wipeOption, setWipeOption] = useState<'invoices' | 'all'>('invoices');

  // Master Admin Recovery PIN
  const MASTER_ADMIN_PIN = 'SAR773355291';

  // PIN Authentication & Recovery states
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [showPinSecret, setShowPinSecret] = useState(false);
  const [pinActionPending, setPinActionPending] = useState<'export' | 'import' | 'wipe' | null>(null);

  // Forgot PIN / Reset states
  const [forgotPinDialogVisible, setForgotPinDialogVisible] = useState(false);
  const [masterAdminInput, setMasterAdminInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPinInput, setConfirmNewPinInput] = useState('');
  const [showMasterAdminSecret, setShowMasterAdminSecret] = useState(false);
  const [showNewPinSecret, setShowNewPinSecret] = useState(false);

  // Intercept Action with PIN Auth
  const requestPinAuth = (action: 'export' | 'import' | 'wipe') => {
    setEnteredPin('');
    setShowPinSecret(false);
    setPinActionPending(action);
    setPinModalVisible(true);
  };

  const verifyPinAndExecute = () => {
    const activePin = organization?.securityPin || '1234';
    const trimmedInput = enteredPin.trim();
    if (!trimmedInput) {
      Alert.alert('PIN Required', 'Please enter your Security PIN.');
      return;
    }

    if (trimmedInput === activePin || trimmedInput === MASTER_ADMIN_PIN) {
      setPinModalVisible(false);
      setEnteredPin('');
      const action = pinActionPending;
      setPinActionPending(null);

      if (action === 'export') {
        handleExport();
      } else if (action === 'import') {
        openImportDialog();
      } else if (action === 'wipe') {
        setWipeDialogVisible(true);
      }
    } else {
      showToast('Invalid Security PIN. Please try again or tap Forgot PIN.', 'error');
    }
  };

  const handleResetPinWithMasterKey = async () => {
    if (masterAdminInput.trim() !== MASTER_ADMIN_PIN) {
      Alert.alert('Authentication Failed', 'Invalid Master Admin Recovery Key.');
      return;
    }

    const trimmedNewPin = newPinInput.trim();
    if (!trimmedNewPin || trimmedNewPin.length < 4 || trimmedNewPin.length > 8) {
      Alert.alert('Invalid PIN', 'New Security PIN must be between 4 and 8 digits.');
      return;
    }

    if (trimmedNewPin !== confirmNewPinInput.trim()) {
      Alert.alert('Mismatch', 'New Security PIN and Confirm PIN do not match.');
      return;
    }

    try {
      await updateOrgProfile({
        ...organization,
        securityPin: trimmedNewPin,
      });
      setForgotPinDialogVisible(false);
      setMasterAdminInput('');
      setNewPinInput('');
      setConfirmNewPinInput('');
      showToast('Security PIN reset successfully!', 'success');
    } catch (e) {
      showToast('Failed to reset Security PIN.', 'error');
    }
  };

  // Snackbar feedback
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<'success' | 'error' | 'info'>('success');

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setSnackbarMessage(msg);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  // Sync form states with database values on mount or organization update
  useEffect(() => {
    if (organization) {
      setName(organization.name || '');
      setAddress(organization.address || '');
      setMobile(organization.mobile || organization.phone || '');
      setEmail(organization.email || '');
      setGstNumber(organization.gstNumber || '');
      setShowGstOnBill(!!organization.showGstOnBill);
      setCurrency(organization.currency || 'Rs.');
      setSlogan(organization.slogan || 'Thank You Visit again');
      setPrintWidth((organization.printWidth as '58mm' | '80mm') || '58mm');
    }
  }, [organization]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Validation Error', 'Store / Business Name is required.');
      return;
    }
    if (trimmedName.length < 2) {
      Alert.alert('Validation Error', 'Store / Business Name must be at least 2 characters.');
      return;
    }

    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      Alert.alert('Validation Error', 'Store Address is required.');
      return;
    }

    const trimmedMobile = mobile.trim();
    if (trimmedMobile) {
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(trimmedMobile)) {
        Alert.alert('Validation Error', 'Please enter a valid 10-digit mobile number.');
        return;
      }
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        Alert.alert('Validation Error', 'Please enter a valid email address.');
        return;
      }
    }

    const trimmedGst = gstNumber.trim().toUpperCase();
    if (showGstOnBill && trimmedGst) {
      if (trimmedGst.length !== 15 || !/^[A-Z0-9]{15}$/i.test(trimmedGst)) {
        Alert.alert('Validation Error', 'Please enter a valid 15-character GSTIN number (e.g. 27AAAAA1111A1Z1).');
        return;
      }
    }

    try {
      await updateOrgProfile({
        id: organization.id || 'default_org',
        name: name.trim(),
        address: address.trim(),
        phone: mobile.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
        gstNumber: gstNumber.trim(),
        showGstOnBill,
        currency: 'Rs.',
        slogan: slogan.trim(),
        printWidth,
      });

      showToast('Store profile updated successfully!', 'success');
    } catch (e) {
      showToast('Failed to update store profile. Please try again.', 'error');
    }
  };

  const handleExport = async () => {
    try {
      const { jsonStr, filename } = await exportData();
      setExportJson(jsonStr);
      setExportFilename(filename);
      setExportDialogVisible(true);
    } catch (e) {
      Alert.alert('Error', 'Failed to export database.');
    }
  };

  const handleShareBackup = async () => {
    try {
      const filename = exportFilename || 'parchiwala_backup.json';
      const RNFS = require('react-native-fs');
      const filePath = `${RNFS.CachesDirectoryPath}/${filename}`;

      // 1. Create and write physical .json file to app cache disk
      await RNFS.writeFile(filePath, exportJson, 'utf8');

      // 2. Open system share sheet with actual .json FILE document attachment
      const RNShare = require('react-native-share').default;
      await RNShare.open({
        url: `file://${filePath}`,
        type: 'application/json',
        filename: filename,
        title: filename,
        failOnCancel: false,
      });
    } catch (e: any) {
      console.warn('[BackupShare] File share error:', e);
      if (e && e.message && !e.message.includes('User did not share') && !e.message.includes('CANCELLED')) {
        Alert.alert('Error', 'Failed to share backup JSON file.');
      }
    }
  };

  const openImportDialog = () => {
    setSelectedFile(null);
    setImportJson('');
    setImportDialogVisible(true);
  };

  const handlePickDocument = async () => {
    // Check if the native binary has the RNDocumentPicker TurboModule compiled in
    const isNativePickerAvailable =
      !!NativeModules.RNDocumentPicker ||
      !!NativeModules.RNDocumentsPicker ||
      !!(TurboModuleRegistry && typeof TurboModuleRegistry.get === 'function' && (TurboModuleRegistry.get('RNDocumentPicker') || TurboModuleRegistry.get('RNDocumentsPicker')));

    if (!isNativePickerAvailable) {
      Alert.alert(
        'Native File Picker Unavailable',
        'The document picker native module is not compiled into your running app binary yet. Please rebuild your app (npx react-native run-ios / run-android), or paste the JSON text directly below.',
        [{ text: 'OK' }]
      );
      return;
    }

    let pick: any;
    let types: any;
    let isCancel: any;

    try {
      const RNDocuments = require('@react-native-documents/picker');
      pick = RNDocuments.pick;
      types = RNDocuments.types;
      isCancel = RNDocuments.isCancel;
    } catch (e) {
      Alert.alert(
        'Native Document Picker Unavailable',
        'The document picker module requires rebuilding the native binary. You can paste the JSON backup file content manually in the text input below to restore your database.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      const pickerResult = await pick({
        type: [types.json || 'application/json', types.allFiles || '*/*'],
      });

      if (pickerResult && pickerResult.length > 0) {
        const file = pickerResult[0];
        const fileUri = file.uri;
        const fileName = file.name || 'backup.json';
        const fileSize = file.size || 0;

        // Read file content
        const response = await fetch(fileUri);
        const text = await response.text();

        // Validate JSON content
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.organization && Array.isArray(parsed.products) && Array.isArray(parsed.customers) && Array.isArray(parsed.invoices)) {
            setSelectedFile({
              name: fileName,
              size: fileSize,
              jsonStr: text,
              isValid: true,
            });
            setImportJson(text);
          } else {
            setSelectedFile({
              name: fileName,
              size: fileSize,
              jsonStr: text,
              isValid: false,
              errorMsg: 'File is not a valid Parchiwala JSON database backup.',
            });
            setImportJson('');
          }
        } catch (jsonErr) {
          setSelectedFile({
            name: fileName,
            size: fileSize,
            jsonStr: text,
            isValid: false,
            errorMsg: 'Selected file is not valid JSON format.',
          });
          setImportJson('');
        }
      }
    } catch (err: any) {
      if (isCancel && isCancel(err)) {
        // User cancelled file selection
        return;
      }
      if (err && err.message && (err.message.includes('RNDocumentPicker') || err.message.includes('TurboModuleRegistry') || err.message.includes('registered in the native binary'))) {
        Alert.alert(
          'Native Binary Rebuild Required',
          'The document picker native binary is not linked in your running app build yet. Please run `npx pod-install` (for iOS) and rebuild your app, or paste the JSON text directly below.',
          [{ text: 'OK' }]
        );
        return;
      }
      console.error('File pick error:', err);
      Alert.alert('File Error', 'Failed to read selected file. You can paste the JSON content manually below.');
    }
  };

  const handleImportSubmit = async () => {
    if (!importJson.trim()) {
      Alert.alert('Validation Error', 'Please select or upload a valid backup JSON file.');
      return;
    }
    Alert.alert(
      'Confirm Import',
      'Importing this backup file will overwrite your current database (products, customers, invoices). This cannot be undone. Do you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore Backup',
          style: 'destructive',
          onPress: async () => {
            try {
              await importData(importJson.trim());
              setImportDialogVisible(false);
              setImportJson('');
              setSelectedFile(null);
              setSnackbarMessage('Database restored successfully from JSON file!');
              setSnackbarVisible(true);
            } catch (e) {
              Alert.alert('Error', 'Failed to import backup file. Please ensure the backup file is valid.');
            }
          },
        },
      ]
    );
  };

  const handleResetData = () => {
    setWipeOption('invoices');
    setWipeDialogVisible(true);
  };

  const handleWipeProceed = () => {
    setWipeDialogVisible(false);
    const isAll = wipeOption === 'all';
    const title = isAll ? 'Wipe All Data' : 'Delete Invoice History';
    const message = isAll
      ? 'This will permanently delete ALL invoices, items, products, and customers, and reset your store profile. This cannot be undone. Are you sure?'
      : 'This will permanently delete ALL invoice transactions. Your products, customers, and store profile settings will remain intact. This cannot be undone. Are you sure?';

    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Proceed Wiping',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isAll) {
                await clearAllData();
                setSnackbarMessage('All database records cleared successfully!');
              } else {
                await clearInvoicesOnly();
                setSnackbarMessage('All invoice records deleted successfully!');
              }
              setSnackbarVisible(true);
            } catch (e) {
              Alert.alert('Error', 'Failed to wipe requested data.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={{ width: '100%', maxWidth: 650, alignSelf: 'center' }}>
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ gap: 12 }}>
            {isDemoMode && (
              <Card style={{ backgroundColor: '#FFF3E0', borderColor: '#FFE0B2', marginBottom: 4 }} mode="outlined">
                <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                  <Avatar.Icon size={36} icon="lock" style={{ backgroundColor: '#FFE0B2' }} color="#E65100" />
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: 'bold', color: '#E65100' }}>Demo Version Locked</Text>
                    <Text variant="bodySmall" style={{ color: '#EF6C00' }}>Organization profile details are default dummy data and cannot be edited in Demo Mode.</Text>
                  </View>
                </Card.Content>
              </Card>
            )}

            <Text variant="titleMedium" style={styles.boldText}>
              Organization Details
            </Text>

            <TextInput
              label="Organization Name *"
              value={name}
              onChangeText={setName}
              disabled={isDemoMode}
              mode="outlined"
              style={styles.input}
              left={<TextInput.Icon icon="office-building" />}
            />

            <TextInput
              label="Billing Address *"
              value={address}
              onChangeText={setAddress}
              disabled={isDemoMode}
              mode="outlined"
              multiline
              numberOfLines={2}
              style={styles.input}
              left={<TextInput.Icon icon="map-marker-outline" />}
            />

            <TextInput
              label="Mobile Number"
              value={mobile}
              onChangeText={setMobile}
              disabled={isDemoMode}
              keyboardType="phone-pad"
              mode="outlined"
              style={styles.input}
              left={<TextInput.Icon icon="cellphone" />}
            />

            <TextInput
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              disabled={isDemoMode}
              keyboardType="email-address"
              autoCapitalize="none"
              mode="outlined"
              style={styles.input}
              left={<TextInput.Icon icon="email-outline" />}
            />

            <Divider style={{ marginVertical: 8 }} />

            <Text variant="titleMedium" style={styles.boldText}>
              Taxation Settings (GST)
            </Text>

            <TextInput
              label="GSTIN Number (Optional)"
              value={gstNumber}
              onChangeText={(text) => setGstNumber(text.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              disabled={isDemoMode}
              maxLength={15}
              mode="outlined"
              placeholder="e.g. 27AAAAA1111A1Z1"
              style={styles.input}
              left={<TextInput.Icon icon="file-document-outline" />}
            />

            {/* Non-mandatory Checkbox Toggle */}
            <Checkbox.Item
              label="Use GSTIN and Tax calculations on bills"
              status={showGstOnBill ? 'checked' : 'unchecked'}
              onPress={() => !isDemoMode && setShowGstOnBill(!showGstOnBill)}
              disabled={isDemoMode}
              mode="android"
              position="leading"
              labelStyle={styles.checkboxLabel}
              style={styles.checkboxItem}
              color={theme.colors.primary}
            />

            <Divider style={{ marginVertical: 8 }} />

            <Text variant="titleMedium" style={styles.boldText}>
              Print Formatting Preferences
            </Text>

            <TextInput
              label="Invoice Slogan"
              value={slogan}
              onChangeText={setSlogan}
              disabled={isDemoMode}
              mode="outlined"
              placeholder="e.g. Thank You Visit again"
              style={styles.input}
              left={<TextInput.Icon icon="format-quote-open" />}
            />

            <Text variant="bodyMedium" style={[styles.boldText, { marginTop: 8 }]}>
              Receipt Print Width
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.outline, marginBottom: 8 }}>
              Set the default layout width for thermal prints. 58mm is standard for pocket printers, 80mm is standard for desktop printers.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              {[
                { value: '58mm', title: '58mm Standard', sub: 'Pocket Printer (32 Chars)', icon: 'printer-pos-outline' },
                { value: '80mm', title: '80mm Wide', sub: 'Desktop Printer (48 Chars)', icon: 'printer-pos' },
              ].map((item) => {
                const selected = printWidth === item.value;
                return (
                  <Card
                    key={item.value}
                    mode="outlined"
                    onPress={() => !isDemoMode && setPrintWidth(item.value as '58mm' | '80mm')}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected ? theme.colors.primary : '#D0D7DE',
                      backgroundColor: selected ? theme.colors.primaryContainer : '#FFFFFF',
                      opacity: isDemoMode ? 0.6 : 1,
                    }}
                  >
                    <Card.Content style={{ paddingVertical: 12, paddingHorizontal: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <MaterialCommunityIcons
                          name={selected ? 'check-circle' : item.icon}
                          size={20}
                          color={selected ? theme.colors.primary : theme.colors.outline}
                        />
                        <Text style={{ fontWeight: 'bold', fontSize: 14, color: selected ? theme.colors.primary : '#333333' }}>
                          {item.title}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: selected ? theme.colors.onPrimaryContainer : theme.colors.outline }}>
                        {item.sub}
                      </Text>
                    </Card.Content>
                  </Card>
                );
              })}
            </View>

            <Divider style={{ marginVertical: 12 }} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text variant="titleMedium" style={styles.boldText}>
                  Bluetooth Printer
                </Text>
                <Text variant="bodySmall" style={{ color: connectedPrinter ? '#4CAF50' : theme.colors.outline, fontWeight: connectedPrinter ? 'bold' : 'normal' }}>
                  {connectedPrinter ? `Connected: ${connectedPrinter.name}` : 'No printer connected'}
                </Text>
              </View>
              <Button 
                mode="outlined" 
                icon="bluetooth" 
                onPress={() => navigation.navigate('PrinterConnect')}
                compact
              >
                {connectedPrinter ? 'Manage Printer' : 'Setup Printer'}
              </Button>
            </View>

            <Button
              mode="contained"
              icon="content-save-outline"
              style={styles.saveBtn}
              onPress={handleSave}
              disabled={isDemoMode}
            >
              {isDemoMode ? 'Store Settings Locked (Demo)' : 'Save Store Settings'}
            </Button>
          </Card.Content>
        </Card>

        {/* Security & Data Management Card */}
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Avatar.Icon size={44} icon="shield-account" style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.primary} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text variant="titleMedium" style={styles.boldText}>Security & Data Management</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Manage Security PIN, Database Backups, and Data Cleanup
                </Text>
              </View>
            </View>
            <Divider style={{ marginVertical: 4 }} />
            <Button
              mode="contained-tonal"
              icon="shield-key-outline"
              onPress={() => navigation.navigate('SecurityBackup')}
              style={styles.saveBtn}
            >
              Manage Security & Data
            </Button>
          </Card.Content>
        </Card>

      </View>

      <Portal>
        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={2500}
          style={{
            backgroundColor:
              snackbarType === 'error'
                ? '#D32F2F'
                : snackbarType === 'info'
                ? '#0288D1'
                : '#2E7D32',
            borderRadius: 8,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>{snackbarMessage}</Text>
        </Snackbar>
      </Portal>

      {/* Loading Overlay Spinner */}
      {isLoading && (
        <Portal>
          <View style={styles.loadingOverlay}>
            <Card style={styles.loadingCard} mode="elevated">
              <Card.Content style={styles.loadingContent}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={{ marginTop: 12, fontWeight: '500' }} variant="bodyMedium">
                  Processing database...
                </Text>
              </Card.Content>
            </Card>
          </View>
        </Portal>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  boldText: {
    fontWeight: 'bold',
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
  },
  checkboxItem: {
    paddingLeft: 0,
    marginVertical: 4,
  },
  checkboxLabel: {
    textAlign: 'left',
    fontSize: 14,
    color: '#333333',
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 6,
    marginTop: 8,
  },
  resetBtn: {
    borderRadius: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  segmentedBtn: {
    backgroundColor: '#FFFFFF',
  },
  dialog: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  dialogInput: {
    backgroundColor: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'CourierNewPSMT',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 8,
  },
  loadingContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  footerContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    color: '#999999',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
