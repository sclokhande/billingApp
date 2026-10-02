import React, { useState } from 'react';
import { StyleSheet, View, ScrollView, Alert, NativeModules, TurboModuleRegistry } from 'react-native';
import {
  Text,
  Card,
  Button,
  Divider,
  useTheme,
  Avatar,
  IconButton,
  Portal,
  Dialog,
  TextInput,
  Snackbar,
  SegmentedButtons,
  Chip,
} from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { APP_CONFIG } from '../config/app_config';
import {
  executeDataExport,
  ExportTarget,
  InvoiceGstFilter,
  ExportFormat,
} from '../services/exportService';

export const SecurityBackupScreen = ({ navigation }: any) => {
  const theme = useTheme() as any;
  const {
    organization,
    updateOrgProfile,
    products,
    customers,
    invoices,
    getAllInvoiceItems,
    exportData,
    importData,
    clearAllData,
    clearInvoicesOnly,
    isDemoMode,
  } = useBilling();

  // Master Admin Recovery Key
  const MASTER_ADMIN_PIN = 'SAR773355291';

  // PIN Auth States
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [showPinSecret, setShowPinSecret] = useState(false);
  const [pinActionPending, setPinActionPending] = useState<'export' | 'import' | 'wipe' | 'update_pin' | null>(null);

  // Set / Change PIN states
  const [setPinDialogVisible, setSetPinDialogVisible] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPinInput, setConfirmNewPinInput] = useState('');
  const [showNewPinSecret, setShowNewPinSecret] = useState(false);

  // Forgot PIN / Reset states
  const [forgotPinDialogVisible, setForgotPinDialogVisible] = useState(false);
  const [masterAdminInput, setMasterAdminInput] = useState('');
  const [showMasterAdminSecret, setShowMasterAdminSecret] = useState(false);

  // Export states
  const [exportDialogVisible, setExportDialogVisible] = useState(false);
  const [exportTarget, setExportTarget] = useState<ExportTarget>('invoices');
  const [invoiceGstFilter, setInvoiceGstFilter] = useState<InvoiceGstFilter>('all');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [isExporting, setIsExporting] = useState(false);

  // Import states
  const [importDialogVisible, setImportDialogVisible] = useState(false);
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

  // Snackbar Toast
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<'success' | 'error' | 'info'>('success');

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setSnackbarMessage(msg);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  // Intercept Action with PIN Auth (Mandatory PIN Verification)
  const requestPinAuth = (action: 'export' | 'import' | 'wipe' | 'update_pin') => {
    setEnteredPin('');
    setShowPinSecret(false);
    setPinActionPending(action);
    setPinModalVisible(true);
  };

  const executeAction = (action: 'export' | 'import' | 'wipe' | 'update_pin') => {
    if (action === 'export') {
      handleExport();
    } else if (action === 'import') {
      openImportDialog();
    } else if (action === 'wipe') {
      setWipeDialogVisible(true);
    } else if (action === 'update_pin') {
      setNewPinInput('');
      setConfirmNewPinInput('');
      setSetPinDialogVisible(true);
    }
  };

  const verifyPinAndExecute = () => {
    const activePin = (organization?.securityPin || '').trim();
    const trimmedInput = enteredPin.trim();
    if (!trimmedInput) {
      Alert.alert('PIN Required', 'Please enter your Security PIN or Activation Key.');
      return;
    }

    const isValid =
      (activePin && trimmedInput === activePin) ||
      trimmedInput.toUpperCase() === MASTER_ADMIN_PIN.toUpperCase() ||
      trimmedInput.toUpperCase() === (APP_CONFIG.ACTIVATION_PIN || '').toUpperCase();

    if (isValid) {
      setPinModalVisible(false);
      setEnteredPin('');
      const action = pinActionPending;
      setPinActionPending(null);
      if (action) {
        executeAction(action);
      }
    } else {
      showToast('Invalid Security PIN or Activation Key.', 'error');
    }
  };

  const handleSaveNewPin = async () => {
    const trimmedNewPin = newPinInput.trim();
    if (!trimmedNewPin || trimmedNewPin.length < 4 || trimmedNewPin.length > 8) {
      Alert.alert('Invalid PIN', 'Security PIN must be between 4 and 8 digits.');
      return;
    }

    if (trimmedNewPin !== confirmNewPinInput.trim()) {
      Alert.alert('Mismatch', 'Security PIN and Confirm PIN do not match.');
      return;
    }

    try {
      await updateOrgProfile({
        ...organization,
        securityPin: trimmedNewPin,
      });
      setSetPinDialogVisible(false);
      setNewPinInput('');
      setConfirmNewPinInput('');
      showToast('Security PIN updated successfully!', 'success');
    } catch (e) {
      showToast('Failed to update Security PIN.', 'error');
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

  const totalInvoicesCount = (invoices || []).length;
  const gstInvoicesCount = (invoices || []).filter((inv) => {
    const tax = typeof inv.taxTotal === 'number' ? inv.taxTotal : parseFloat(inv.taxTotal as any) || 0;
    const cgst = typeof inv.cgstTotal === 'number' ? inv.cgstTotal : parseFloat(inv.cgstTotal as any) || 0;
    const sgst = typeof inv.sgstTotal === 'number' ? inv.sgstTotal : parseFloat(inv.sgstTotal as any) || 0;
    return tax > 0 || (cgst + sgst) > 0;
  }).length;
  const nonGstInvoicesCount = totalInvoicesCount - gstInvoicesCount;

  const currentExportCount =
    exportTarget === 'invoices'
      ? invoiceGstFilter === 'all'
        ? totalInvoicesCount
        : invoiceGstFilter === 'gst'
        ? gstInvoicesCount
        : nonGstInvoicesCount
      : exportTarget === 'products'
      ? (products || []).length
      : exportTarget === 'customers'
      ? (customers || []).length
      : totalInvoicesCount + (products || []).length + (customers || []).length;

  const handleExport = () => {
    setExportDialogVisible(true);
  };

  const handleExecuteExportAndShare = async () => {
    if (isDemoMode) {
      Alert.alert('Demo Version', APP_CONFIG.DEMO_MESSAGES.EXPORT_IMPORT_DISABLED);
      return;
    }

    try {
      setIsExporting(true);

      // Fetch line items if exporting invoices or full backup
      let items: any[] = [];
      if (exportTarget === 'invoices' || exportTarget === 'full') {
        try {
          items = await getAllInvoiceItems();
        } catch (itemErr) {
          console.warn('[Export] Error getting invoice items, falling back to empty list:', itemErr);
          items = [];
        }
      }

      const result = executeDataExport(
        {
          target: exportTarget,
          gstFilter: exportTarget === 'invoices' ? invoiceGstFilter : undefined,
          format: exportTarget === 'full' ? 'json' : exportFormat,
        },
        {
          invoices: invoices || [],
          invoiceItems: items,
          products: products || [],
          customers: customers || [],
          organization,
        }
      );

      const RNFS = require('react-native-fs');
      const filePath = `${RNFS.CachesDirectoryPath}/${result.filename}`;
      await RNFS.writeFile(filePath, result.content, 'utf8');

      const RNShare = require('react-native-share').default;
      await RNShare.open({
        url: `file://${filePath}`,
        type: result.mimeType,
        filename: result.filename,
        title: result.filename,
        failOnCancel: false,
      });

      setExportDialogVisible(false);
      showToast(`Exported ${result.recordCount} records (${result.filename}) successfully!`, 'success');
    } catch (e: any) {
      console.warn('[Export] Share/Save error:', e);
      if (e && e.message && !e.message.includes('User did not share') && !e.message.includes('CANCELLED')) {
        Alert.alert('Export Error', e?.message || 'Failed to export and share file.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const openImportDialog = () => {
    setSelectedFile(null);
    setImportJson('');
    setImportDialogVisible(true);
  };

  const handlePickDocument = async () => {
    const isNativePickerAvailable =
      !!NativeModules.RNDocumentPicker ||
      !!NativeModules.RNDocumentsPicker ||
      !!(TurboModuleRegistry && typeof TurboModuleRegistry.get === 'function' && (TurboModuleRegistry.get('RNDocumentPicker') || TurboModuleRegistry.get('RNDocumentsPicker')));

    if (!isNativePickerAvailable) {
      Alert.alert(
        'Native File Picker Unavailable',
        'Please rebuild your app or paste the JSON text directly below.',
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
      Alert.alert('Error', 'Document picker module unavailable. You can paste JSON content manually below.');
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

        const response = await fetch(fileUri);
        const text = await response.text();

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
      if (isCancel && isCancel(err)) return;
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
          text: 'Import Data',
          style: 'destructive',
          onPress: async () => {
            try {
              await importData(importJson.trim());
              setImportDialogVisible(false);
              setImportJson('');
              setSelectedFile(null);
              showToast('Database imported successfully from JSON file!', 'success');
            } catch (e) {
              Alert.alert('Error', 'Failed to import backup file.');
            }
          },
        },
      ]
    );
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
                showToast('All database records cleared successfully!', 'success');
              } else {
                await clearInvoicesOnly();
                showToast('All invoice records deleted successfully!', 'success');
              }
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
      <View style={{ width: '100%', maxWidth: 650, alignSelf: 'center', padding: 16, gap: 16 }}>

        {/* Overview Banner */}
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Avatar.Icon size={44} icon="shield-account" style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.primary} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text variant="titleMedium" style={styles.boldText}>Security & Data Management</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Configure Security PIN, Export/Import database backups, and clean up database records.
                </Text>
              </View>
            </View>
            {isDemoMode && (
              <View style={{ backgroundColor: '#FFF3E0', borderRadius: 8, padding: 10, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Avatar.Icon size={24} icon="information-outline" style={{ backgroundColor: '#FFE0B2' }} color="#E65100" />
                <Text style={{ fontSize: 12, color: '#E65100', flex: 1, fontWeight: '500' }}>
                  Demo Version: Database Export and Import features are disabled in this build.
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Section 1: Security PIN Protection */}
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="titleMedium" style={styles.boldText}>Security PIN Protection</Text>
              <View style={{ backgroundColor: organization?.securityPin ? theme.colors.success + '20' : theme.colors.error + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: organization?.securityPin ? theme.colors.success : theme.colors.error }}>
                  {organization?.securityPin ? 'PIN ACTIVE' : 'NO PIN SET'}
                </Text>
              </View>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Require a 4 to 8-digit PIN before exporting database backups, restoring data, or performing database wipes.
            </Text>
            <Divider style={{ marginVertical: 4 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                mode="contained"
                icon="lock-reset"
                onPress={() => requestPinAuth('update_pin')}
                disabled={isDemoMode}
                style={{ flex: 1 }}
              >
                {organization?.securityPin ? 'Update PIN' : 'Set Security PIN'}
              </Button>
              {organization?.securityPin && (
                <Button
                  mode="outlined"
                  icon="key-variant"
                  onPress={() => {
                    setMasterAdminInput('');
                    setNewPinInput('');
                    setConfirmNewPinInput('');
                    setForgotPinDialogVisible(true);
                  }}
                  disabled={isDemoMode}
                  style={{ flex: 1 }}
                >
                  Forgot PIN
                </Button>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Section 2: Backup & Import Data */}
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ gap: 12 }}>
            <Text variant="titleMedium" style={styles.boldText}>Backup & Import Data</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Export Invoices (GST / Non-GST / All), Products, and Customers in CSV or JSON format, or create and import complete database backups.
            </Text>
            <Divider style={{ marginVertical: 4 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                mode="contained-tonal"
                icon="export-variant"
                onPress={() => requestPinAuth('export')}
                disabled={isDemoMode}
                style={{ flex: 1 }}
              >
                {isDemoMode ? 'Export Disabled (Demo)' : 'Export Data (CSV / JSON)'}
              </Button>
              <Button
                mode="outlined"
                icon="import"
                onPress={() => requestPinAuth('import')}
                disabled={isDemoMode}
                style={{ flex: 1 }}
              >
                {isDemoMode ? 'Import Disabled (Demo)' : 'Import Data'}
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* Section 3: Data Cleanup & Wipe */}
        <Card style={[styles.card, { borderColor: theme.colors.error + '40' }]} mode="outlined">
          <Card.Content style={{ gap: 12 }}>
            <Text variant="titleMedium" style={[styles.boldText, { color: theme.colors.error }]}>Database Reset & Cleanup</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Permanently delete invoice history or perform a full application factory data reset.
            </Text>
            <Divider style={{ marginVertical: 4 }} />
            <Button
              mode="contained"
              buttonColor={theme.colors.error}
              textColor="#FFFFFF"
              icon="delete-sweep"
              onPress={() => requestPinAuth('wipe')}
            >
              Data Cleanup / Wipe
            </Button>
          </Card.Content>
        </Card>

        <View style={{ height: 40 }} />
      </View>

      {/* Snackbar Toast */}
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

        {/* PIN Prompt Modal */}
        <Dialog visible={pinModalVisible} onDismiss={() => setPinModalVisible(false)} style={styles.dialog}>
          <Dialog.Title>Security PIN Authentication</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <Text variant="bodyMedium">Please enter your Security PIN to perform this operation.</Text>
            <TextInput
              label="Enter Security PIN or Activation Key"
              value={enteredPin}
              onChangeText={(text) => setEnteredPin(text.toUpperCase())}
              secureTextEntry={!showPinSecret}
              autoCapitalize="characters"
              maxLength={20}
              mode="outlined"
              right={
                <TextInput.Icon
                  icon={showPinSecret ? 'eye-off' : 'eye'}
                  onPress={() => setShowPinSecret(!showPinSecret)}
                />
              }
            />
          </Dialog.Content>
          <Dialog.Actions style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Button
              onPress={() => {
                setPinModalVisible(false);
                setMasterAdminInput('');
                setNewPinInput('');
                setConfirmNewPinInput('');
                setForgotPinDialogVisible(true);
              }}
              textColor={theme.colors.primary}
            >
              Forgot PIN?
            </Button>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button onPress={() => setPinModalVisible(false)}>Cancel</Button>
              <Button mode="contained" onPress={verifyPinAndExecute}>Verify</Button>
            </View>
          </Dialog.Actions>
        </Dialog>

        {/* Set / Change PIN Dialog */}
        <Dialog visible={setPinDialogVisible} onDismiss={() => setSetPinDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title>{organization?.securityPin ? 'Update Security PIN' : 'Set Security PIN'}</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <TextInput
              label="New Security PIN (4-8 digits)"
              value={newPinInput}
              onChangeText={setNewPinInput}
              secureTextEntry={!showNewPinSecret}
              keyboardType="numeric"
              maxLength={8}
              mode="outlined"
            />
            <TextInput
              label="Confirm New Security PIN"
              value={confirmNewPinInput}
              onChangeText={setConfirmNewPinInput}
              secureTextEntry={!showNewPinSecret}
              keyboardType="numeric"
              maxLength={8}
              mode="outlined"
              right={
                <TextInput.Icon
                  icon={showNewPinSecret ? 'eye-off' : 'eye'}
                  onPress={() => setShowNewPinSecret(!showNewPinSecret)}
                />
              }
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSetPinDialogVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleSaveNewPin}>Save PIN</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Reset PIN via Master Admin Key Dialog */}
        <Dialog visible={forgotPinDialogVisible} onDismiss={() => setForgotPinDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title>Reset PIN via Master Key</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Enter the Master Admin Recovery Key to reset your Security PIN.
            </Text>
            <TextInput
              label="Enter Admin Recovery Key"
              value={masterAdminInput}
              onChangeText={setMasterAdminInput}
              secureTextEntry={!showMasterAdminSecret}
              mode="outlined"
              right={
                <TextInput.Icon
                  icon={showMasterAdminSecret ? 'eye-off' : 'eye'}
                  onPress={() => setShowMasterAdminSecret(!showMasterAdminSecret)}
                />
              }
            />
            <TextInput
              label="New Security PIN (4-8 digits)"
              value={newPinInput}
              onChangeText={setNewPinInput}
              secureTextEntry={!showNewPinSecret}
              keyboardType="numeric"
              maxLength={8}
              mode="outlined"
            />
            <TextInput
              label="Confirm New Security PIN"
              value={confirmNewPinInput}
              onChangeText={setConfirmNewPinInput}
              secureTextEntry={!showNewPinSecret}
              keyboardType="numeric"
              maxLength={8}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setForgotPinDialogVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleResetPinWithMasterKey}>Reset PIN</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Export Data Dialog */}
        <Dialog
          visible={exportDialogVisible}
          onDismiss={() => {
            if (!isExporting) setExportDialogVisible(false);
          }}
          style={styles.dialog}
        >
          <Dialog.Title style={{ fontSize: 18, fontWeight: 'bold' }}>
            Export Data
          </Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 440, paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 10, gap: 14 }}>
              
              {/* Step 1: Select Target */}
              <View style={{ gap: 6 }}>
                <Text variant="labelMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                  1. SELECT DATA TO EXPORT
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Chip
                    selected={exportTarget === 'invoices'}
                    onPress={() => setExportTarget('invoices')}
                    icon="receipt"
                    style={{ backgroundColor: exportTarget === 'invoices' ? theme.colors.primaryContainer : theme.colors.surfaceVariant }}
                    textStyle={{ fontWeight: exportTarget === 'invoices' ? 'bold' : 'normal', color: exportTarget === 'invoices' ? theme.colors.primary : theme.colors.onSurfaceVariant }}
                  >
                    Invoices ({totalInvoicesCount})
                  </Chip>
                  <Chip
                    selected={exportTarget === 'products'}
                    onPress={() => setExportTarget('products')}
                    icon="package-variant-closed"
                    style={{ backgroundColor: exportTarget === 'products' ? theme.colors.primaryContainer : theme.colors.surfaceVariant }}
                    textStyle={{ fontWeight: exportTarget === 'products' ? 'bold' : 'normal', color: exportTarget === 'products' ? theme.colors.primary : theme.colors.onSurfaceVariant }}
                  >
                    Products ({products?.length || 0})
                  </Chip>
                  <Chip
                    selected={exportTarget === 'customers'}
                    onPress={() => setExportTarget('customers')}
                    icon="account-group"
                    style={{ backgroundColor: exportTarget === 'customers' ? theme.colors.primaryContainer : theme.colors.surfaceVariant }}
                    textStyle={{ fontWeight: exportTarget === 'customers' ? 'bold' : 'normal', color: exportTarget === 'customers' ? theme.colors.primary : theme.colors.onSurfaceVariant }}
                  >
                    Customers ({customers?.length || 0})
                  </Chip>
                  <Chip
                    selected={exportTarget === 'full'}
                    onPress={() => setExportTarget('full')}
                    icon="database-export"
                    style={{ backgroundColor: exportTarget === 'full' ? theme.colors.primaryContainer : theme.colors.surfaceVariant }}
                    textStyle={{ fontWeight: exportTarget === 'full' ? 'bold' : 'normal', color: exportTarget === 'full' ? theme.colors.primary : theme.colors.onSurfaceVariant }}
                  >
                    Full Backup
                  </Chip>
                </View>
              </View>

              {/* Step 2: Invoices GST Filter (Only when Target is Invoices) */}
              {exportTarget === 'invoices' && (
                <View style={{ gap: 6 }}>
                  <Text variant="labelMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                    2. FILTER INVOICES (GST / NON-GST)
                  </Text>
                  <SegmentedButtons
                    value={invoiceGstFilter}
                    onValueChange={(val) => setInvoiceGstFilter(val as InvoiceGstFilter)}
                    buttons={[
                      {
                        value: 'all',
                        label: `All (${totalInvoicesCount})`,
                      },
                      {
                        value: 'gst',
                        label: `GST (${gstInvoicesCount})`,
                      },
                      {
                        value: 'nongst',
                        label: `Non-GST (${nonGstInvoicesCount})`,
                      },
                    ]}
                  />
                </View>
              )}

              {/* Step 3: Format Selection (CSV or JSON) */}
              <View style={{ gap: 6 }}>
                <Text variant="labelMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                  {exportTarget === 'invoices' ? '3. CHOOSE FILE FORMAT' : '2. CHOOSE FILE FORMAT'}
                </Text>
                {exportTarget === 'full' ? (
                  <View style={{ backgroundColor: theme.colors.surfaceVariant, padding: 10, borderRadius: 8 }}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Full database backup exports all organization profile, items, products, customers, and invoice records as structured JSON for complete data backup & restore compatibility.
                    </Text>
                  </View>
                ) : (
                  <SegmentedButtons
                    value={exportFormat}
                    onValueChange={(val) => setExportFormat(val as ExportFormat)}
                    buttons={[
                      {
                        value: 'csv',
                        label: 'CSV (.csv)',
                        icon: 'file-delimited',
                      },
                      {
                        value: 'json',
                        label: 'JSON (.json)',
                        icon: 'code-json',
                      },
                    ]}
                  />
                )}
              </View>

              {/* Summary Card */}
              <Card style={{ backgroundColor: theme.colors.primaryContainer, borderRadius: 10 }}>
                <Card.Content style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, gap: 12 }}>
                  <Avatar.Icon
                    size={38}
                    icon={exportFormat === 'csv' && exportTarget !== 'full' ? 'file-delimited' : 'code-json'}
                    style={{ backgroundColor: theme.colors.primary }}
                    color="#FFFFFF"
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                      {exportTarget === 'invoices'
                        ? `Invoices (${invoiceGstFilter === 'all' ? 'All' : invoiceGstFilter === 'gst' ? 'GST Only' : 'Non-GST Only'})`
                        : exportTarget === 'products'
                        ? 'Products Catalog'
                        : exportTarget === 'customers'
                        ? 'Customers Directory'
                        : 'Full Database Backup'}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.85 }}>
                      {currentExportCount} {currentExportCount === 1 ? 'record' : 'records'} ready to export as {exportTarget === 'full' ? 'JSON' : exportFormat.toUpperCase()}
                    </Text>
                  </View>
                </Card.Content>
              </Card>

            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <Button onPress={() => setExportDialogVisible(false)} disabled={isExporting}>
              Cancel
            </Button>
            <Button
              mode="contained"
              icon="share-variant"
              loading={isExporting}
              disabled={isExporting}
              onPress={handleExecuteExportAndShare}
            >
              Export & Share File
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Import Dialog */}
        <Dialog visible={importDialogVisible} onDismiss={() => setImportDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title>Import Data</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <Button mode="contained" icon="file-document-outline" onPress={handlePickDocument}>
              Select JSON Backup File
            </Button>
            {selectedFile && (
              <View style={{ padding: 10, borderRadius: 8, backgroundColor: selectedFile.isValid ? '#E8F5E9' : '#FFEBEE' }}>
                <Text style={{ fontWeight: 'bold', color: selectedFile.isValid ? '#2E7D32' : '#C62828' }}>
                  {selectedFile.name}
                </Text>
                {selectedFile.errorMsg && (
                  <Text style={{ fontSize: 11, color: '#C62828', marginTop: 4 }}>{selectedFile.errorMsg}</Text>
                )}
              </View>
            )}
            <TextInput
              label="Or Paste Backup JSON Text"
              value={importJson}
              onChangeText={setImportJson}
              multiline
              numberOfLines={4}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setImportDialogVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleImportSubmit} disabled={!importJson.trim()}>
              Import Data
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Wipe Data Dialog */}
        <Dialog visible={wipeDialogVisible} onDismiss={() => setWipeDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title>Database Reset Options</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <Button
              mode={wipeOption === 'invoices' ? 'contained' : 'outlined'}
              onPress={() => setWipeOption('invoices')}
            >
              Clear Invoice History Only
            </Button>
            <Button
              mode={wipeOption === 'all' ? 'contained' : 'outlined'}
              buttonColor={wipeOption === 'all' ? theme.colors.error : undefined}
              textColor={wipeOption === 'all' ? '#FFF' : theme.colors.error}
              onPress={() => setWipeOption('all')}
            >
              Wipe All Application Data
            </Button>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setWipeDialogVisible(false)}>Cancel</Button>
            <Button mode="contained" buttonColor={theme.colors.error} onPress={handleWipeProceed}>
              Proceed
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  boldText: {
    fontWeight: 'bold',
  },
  dialog: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
});
