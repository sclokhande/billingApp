import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Alert,
  Platform,
  TouchableOpacity,
  KeyboardAvoidingView,
  NativeModules,
  TurboModuleRegistry,
  Image,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Checkbox,
  Switch,
  useTheme,
  Snackbar,
  Divider,
  Portal,
  Avatar,
  ActivityIndicator,
  Dialog,
  Chip,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useBilling } from '../context/BillingContext';
import { APP_CONFIG } from '../config/app_config';
import { MasterUnlockDialog } from '../components/MasterUnlockDialog';
import { formatTimeRemaining } from '../utils/printerLockManager';
import { formatInvoiceDateTime } from '../utils/dateUtils';
import {
  generateStoreTransferPackage,
  validateAndParseTransferPackage,
  saveRollbackSnapshot,
  getRollbackSnapshot,
  clearRollbackSnapshot,
  calculateInvoiceSequences,
  StoreTransferSummary,
  ValidationResult,
} from '../services/storeTransferService';
import {
  isValidUpiId,
  buildUpiPaymentUri,
  getQrMatrix,
  fitAndOptimizeLogoImage,
} from '../utils/receiptBrandingService';

type TabCategory = 'profile' | 'tax' | 'printer' | 'security' | 'transfer';

interface TabItem {
  id: TabCategory;
  label: string;
  icon: string;
  subtitle: string;
}

const TABS: TabItem[] = [
  {
    id: 'profile',
    label: 'Store Info',
    icon: 'storefront-outline',
    subtitle: 'Name, address & contacts',
  },
  {
    id: 'tax',
    label: 'Taxes & GST',
    icon: 'file-percent-outline',
    subtitle: 'GSTIN & tax calculation',
  },
  {
    id: 'printer',
    label: 'Bill & Printer',
    icon: 'printer-outline',
    subtitle: 'Paper width & Bluetooth',
  },
  {
    id: 'security',
    label: 'Security & Data',
    icon: 'shield-account-outline',
    subtitle: 'PIN & database backups',
  },
  {
    id: 'transfer',
    label: 'Store Transfer',
    icon: 'swap-horizontal-bold',
    subtitle: 'Device Switch & Handoff',
  },
];

export const ProfileScreen = ({ navigation, route }: any) => {
  const theme = useTheme() as any;
  const insets = useSafeAreaInsets();
  const {
    organization,
    updateOrgProfile,
    isLoading,
    connectedPrinter,
    isDemoMode,
    invoices,
    products,
    customers,
    printerLockStatus,
    checkPrinterLock,
    getAllInvoiceItems,
    importData,
    isBatteryOptimized,
    checkBatteryOptimizationStatus,
    requestDisableBatteryOptimization,
    printerTelemetry,
    checkPrinterTelemetry,
  } = useBilling();

  const [checkingTelemetry, setCheckingTelemetry] = useState(false);

  // Active Category Tab
  const [activeTab, setActiveTab] = useState<TabCategory>(
    route?.params?.initialTab || 'profile'
  );

  // Master key unlock modal state
  const [masterUnlockVisible, setMasterUnlockVisible] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [showGstOnBill, setShowGstOnBill] = useState(false);
  const [currency, setCurrency] = useState('Rs.');
  const [slogan, setSlogan] = useState('Thank You Visit again');
  const [showFooterTextOnBill, setShowFooterTextOnBill] = useState(true);
  const FIXED_FOOTER_TEXT = 'Print by Parchiwala';
  const [printWidth, setPrintWidth] = useState<'58mm' | '80mm'>('58mm');
  const [logoBase64, setLogoBase64] = useState('');
  const [rawOriginalLogoUri, setRawOriginalLogoUri] = useState('');
  const [logoMetadata, setLogoMetadata] = useState<{
    width?: number;
    height?: number;
    sizeBytes?: number;
    originalWidth?: number;
    originalHeight?: number;
  } | null>(null);
  const [logoPreviewMode, setLogoPreviewMode] = useState<'thermal' | 'original'>('thermal');
  const [isOptimizingLogo, setIsOptimizingLogo] = useState(false);
  const [showLogoOnBill, setShowLogoOnBill] = useState(true);
  const [upiId, setUpiId] = useState('');
  const [upiPayeeName, setUpiPayeeName] = useState('');
  const [showUpiQrOnBill, setShowUpiQrOnBill] = useState(true);
  const [testQrDialogVisible, setTestQrDialogVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      setShowFooterTextOnBill(organization.showFooterTextOnBill !== false);
      setPrintWidth((organization.printWidth as '58mm' | '80mm') || '58mm');
      setLogoBase64(organization.logoBase64 || '');
      setRawOriginalLogoUri(organization.logoBase64 || '');
      setShowLogoOnBill(organization.showLogoOnBill !== false);
      setUpiId(organization.upiId || '');
      setUpiPayeeName(organization.upiPayeeName || '');
      setShowUpiQrOnBill(organization.showUpiQrOnBill !== false);
    }
  }, [organization]);

  // Store Transfer States (Direct 1-Click, No PIN Verification Required)
  const [transferExportDialogVisible, setTransferExportDialogVisible] = useState(false);
  const [transferImportDialogVisible, setTransferImportDialogVisible] = useState(false);
  const [transferHelpDialogVisible, setTransferHelpDialogVisible] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferImportJson, setTransferImportJson] = useState('');
  const [transferImportFile, setTransferImportFile] = useState<{
    name: string;
    size: number;
    isValid: boolean;
    errorMsg?: string;
  } | null>(null);
  const [transferParsedPackage, setTransferParsedPackage] = useState<ValidationResult | null>(null);
  const [rollbackSnapshot, setRollbackSnapshot] = useState<{
    savedAt: string;
    summary?: any;
    data: any;
  } | null>(null);

  // Load existing safety rollback snapshot on mount
  useEffect(() => {
    const loadRollback = async () => {
      try {
        const snapshot = await getRollbackSnapshot();
        if (snapshot.exists && snapshot.data) {
          setRollbackSnapshot({
            savedAt: snapshot.savedAt || '',
            summary: snapshot.summary,
            data: snapshot.data,
          });
        } else {
          setRollbackSnapshot(null);
        }
      } catch {
        // silent
      }
    };
    loadRollback();
  }, []);

  const handleOpenTransferExportDialog = () => {
    setTransferExportDialogVisible(true);
  };

  const handleExecuteTransferExportAndShare = async () => {
    try {
      setIsTransferring(true);
      let items: any[] = [];
      try {
        items = await getAllInvoiceItems();
      } catch {
        items = [];
      }

      const transferPackage = generateStoreTransferPackage({
        organization,
        products: products || [],
        customers: customers || [],
        invoices: invoices || [],
        invoiceItems: items,
      });

      const jsonStr = transferPackage.content;
      const sanitizedOrgName = (organization?.name || 'store')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 15);
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = transferPackage.filename || `store_transfer_${sanitizedOrgName}_${dateStr}.json`;

      const RNFS = require('react-native-fs');
      const filePath = `${RNFS.CachesDirectoryPath}/${filename}`;
      await RNFS.writeFile(filePath, jsonStr, 'utf8');

      const RNShare = require('react-native-share').default;
      await RNShare.open({
        url: `file://${filePath}`,
        type: 'application/json',
        filename,
        title: `Transfer Store: ${organization?.name || 'My Store'}`,
        failOnCancel: false,
      });

      setTransferExportDialogVisible(false);
      showToast('Store transfer package created and shared!', 'success');
    } catch (e: any) {
      console.warn('[StoreTransfer] Export error:', e);
      if (e && e.message && !e.message.includes('User did not share') && !e.message.includes('CANCELLED')) {
        Alert.alert('Transfer Export Error', e?.message || 'Failed to export store data.');
      }
    } finally {
      setIsTransferring(false);
    }
  };

  const handleOpenTransferImportDialog = () => {
    setTransferImportFile(null);
    setTransferImportJson('');
    setTransferParsedPackage(null);
    setTransferImportDialogVisible(true);
  };

  const handlePickTransferDocument = async () => {
    const isNativePickerAvailable =
      !!NativeModules.RNDocumentPicker ||
      !!NativeModules.RNDocumentsPicker ||
      !!(
        TurboModuleRegistry &&
        typeof TurboModuleRegistry.get === 'function' &&
        (TurboModuleRegistry.get('RNDocumentPicker') || TurboModuleRegistry.get('RNDocumentsPicker'))
      );

    if (!isNativePickerAvailable) {
      Alert.alert(
        'Native File Picker Unavailable',
        'Please paste the JSON text directly below into the manual input box.',
        [{ text: 'OK' }]
      );
      return;
    }

    let pick: any;
    let types: any;
    try {
      const RNDocuments = require('@react-native-documents/picker');
      pick = RNDocuments.pick;
      types = RNDocuments.types;
    } catch {
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
        const fileName = file.name || 'store_transfer.json';
        const fileSize = file.size || 0;

        let text = '';
        try {
          const RNFS = require('react-native-fs');
          text = await RNFS.readFile(fileUri, 'utf8');
        } catch {
          try {
            const RNFS = require('react-native-fs');
            text = await RNFS.readFile(decodeURIComponent(fileUri), 'utf8');
          } catch {
            try {
              const response = await fetch(fileUri);
              text = await response.text();
            } catch (fetchErr) {
              console.warn('[StoreTransfer] Failed to read file:', fetchErr);
            }
          }
        }

        if (!text || !text.trim()) {
          setTransferImportFile({
            name: fileName,
            size: fileSize,
            isValid: false,
            errorMsg: 'Could not read file content from selected document.',
          });
          setTransferParsedPackage(null);
          return;
        }

        const validation = validateAndParseTransferPackage(text);
        if (validation.isValid) {
          setTransferImportFile({
            name: fileName,
            size: fileSize,
            isValid: true,
          });
          setTransferParsedPackage(validation);
          setTransferImportJson(text);
        } else {
          setTransferImportFile({
            name: fileName,
            size: fileSize,
            isValid: false,
            errorMsg: validation.error || 'Invalid store transfer file format.',
          });
          setTransferParsedPackage(null);
        }
      }
    } catch (e: any) {
      try {
        const RNDocuments = require('@react-native-documents/picker');
        if (!RNDocuments.isCancel || !RNDocuments.isCancel(e)) {
          Alert.alert('File Picker Error', e?.message || 'Could not read selected file.');
        }
      } catch {
        // ignore
      }
    }
  };

  const handleManualTransferJsonChange = (text: string) => {
    setTransferImportJson(text);
    if (!text.trim()) {
      setTransferParsedPackage(null);
      setTransferImportFile(null);
      return;
    }
    const validation = validateAndParseTransferPackage(text);
    if (validation.isValid) {
      setTransferImportFile({
        name: 'Manual JSON Input',
        size: text.length,
        isValid: true,
      });
      setTransferParsedPackage(validation);
    } else {
      setTransferImportFile({
        name: 'Manual JSON Input',
        size: text.length,
        isValid: false,
        errorMsg: validation.error || 'Invalid store transfer JSON format.',
      });
      setTransferParsedPackage(null);
    }
  };

  const handleExecuteTransferImport = async () => {
    const pkgData = transferParsedPackage?.packageData || transferParsedPackage?.data;
    if (!transferParsedPackage || !transferParsedPackage.isValid || !pkgData) {
      Alert.alert('Invalid Package', 'Please select or paste a valid store transfer package.');
      return;
    }

    const { summary } = transferParsedPackage;
    Alert.alert(
      'Confirm Store Takeover',
      `You are taking over "${summary?.storeName || 'the store'}" with ${summary?.totalProducts || 0} products, ${summary?.totalCustomers || 0} customer accounts, and ${summary?.totalInvoices || 0} historical invoices.\n\nNext bill will continue from ${summary?.nextSuggestedInvoiceNumber}.\n\nAn automatic safety backup of this phone will be created before proceeding. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Take Over Store',
          style: 'default',
          onPress: async () => {
            try {
              setIsTransferring(true);

              // 1. Create safety rollback snapshot of current device state
              let currentItems: any[] = [];
              try {
                currentItems = await getAllInvoiceItems();
              } catch {
                currentItems = [];
              }
              await saveRollbackSnapshot({
                organization,
                products: products || [],
                customers: customers || [],
                invoices: invoices || [],
                invoiceItems: currentItems,
              });

              // 2. Import transfer package data
              await importData(typeof pkgData === 'string' ? pkgData : JSON.stringify(pkgData));

              // 3. Refresh rollback snapshot state
              const updatedRollback = await getRollbackSnapshot();
              if (updatedRollback.exists && updatedRollback.data) {
                setRollbackSnapshot({
                  savedAt: updatedRollback.savedAt || '',
                  summary: updatedRollback.summary,
                  data: updatedRollback.data,
                });
              } else {
                setRollbackSnapshot(null);
              }

              setTransferImportDialogVisible(false);
              showToast(`Store takeover complete! Billing starts at ${summary?.nextSuggestedInvoiceNumber}`, 'success');
            } catch (err: any) {
              console.warn('[StoreTransfer] Import error:', err);
              Alert.alert('Takeover Error', err?.message || 'Failed to import store data.');
            } finally {
              setIsTransferring(false);
            }
          },
        },
      ]
    );
  };

  const handleRollbackTransfer = () => {
    if (!rollbackSnapshot || !rollbackSnapshot.data) return;

    Alert.alert(
      'Rollback Store Transfer',
      `Are you sure you want to restore this device to the state saved on ${formatInvoiceDateTime(rollbackSnapshot.savedAt)}?\n\nThis will undo the imported store data and return this phone to its previous state.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore Previous State',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsTransferring(true);
              const payload =
                typeof rollbackSnapshot.data === 'string'
                  ? rollbackSnapshot.data
                  : JSON.stringify(rollbackSnapshot.data);
              await importData(payload);
              await clearRollbackSnapshot();
              setRollbackSnapshot(null);
              showToast('Device restored to pre-transfer state successfully!', 'success');
            } catch (err: any) {
              Alert.alert('Rollback Error', err?.message || 'Failed to rollback data.');
            } finally {
              setIsTransferring(false);
            }
          },
        },
      ]
    );
  };

  const handleDismissRollback = () => {
    Alert.alert(
      'Dismiss Rollback Snapshot',
      'Are you sure you want to dismiss the rollback snapshot? You will not be able to undo the transfer after this.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          style: 'destructive',
          onPress: async () => {
            await clearRollbackSnapshot();
            setRollbackSnapshot(null);
            showToast('Rollback snapshot cleared.', 'info');
          },
        },
      ]
    );
  };

  const testQrUri = useMemo(() => {
    const trimmedUpi = upiId.trim();
    if (!trimmedUpi) return '';
    return buildUpiPaymentUri({
      upiId: trimmedUpi,
      payeeName: upiPayeeName.trim() || name.trim() || 'Store',
      amount: 10,
      invoiceNumber: 'TEST01',
    });
  }, [upiId, upiPayeeName, name]);

  const testQrMatrix = useMemo(() => {
    if (!testQrUri) return [];
    return getQrMatrix(testQrUri);
  }, [testQrUri]);

  const handlePickLogo = async () => {
    try {
      const RNDocuments = require('@react-native-documents/picker');
      const pick = RNDocuments.pick;
      const types = RNDocuments.types;
      const pickerResult = await pick({
        type: [types.images || 'image/*'],
      });

      if (pickerResult && pickerResult.length > 0) {
        setIsOptimizingLogo(true);
        const file = pickerResult[0];
        const RNFS = require('react-native-fs');
        const base64Data = await RNFS.readFile(file.uri, 'base64');
        const mimeType = file.type || 'image/png';
        const rawDataUri = `data:${mimeType};base64,${base64Data}`;
        setRawOriginalLogoUri(rawDataUri);

        // Auto-fit logo to store's receipt page size (58mm or 80mm)
        const optimized = await fitAndOptimizeLogoImage(rawDataUri, printWidth);
        if (optimized && optimized.dataUri) {
          setLogoBase64(optimized.dataUri);
          setLogoMetadata({
            width: optimized.width,
            height: optimized.height,
            sizeBytes: optimized.sizeBytes,
            originalWidth: optimized.originalWidth,
            originalHeight: optimized.originalHeight,
          });
          showToast(`Logo auto-fitted for ${printWidth} receipt! Click "Save Settings" to apply.`, 'success');
        } else {
          setLogoBase64(rawDataUri);
          showToast('Store logo selected! Click "Save Settings" below to apply.', 'success');
        }
        setIsOptimizingLogo(false);
      }
    } catch (err: any) {
      setIsOptimizingLogo(false);
      if (!err?.message?.includes('cancelled') && !err?.message?.includes('User canceled')) {
        Alert.alert('Image Selection Error', err?.message || 'Could not select logo image.');
      }
    }
  };

  const handleRemoveLogo = () => {
    Alert.alert('Remove Logo', 'Are you sure you want to remove the store logo from printed bills?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setLogoBase64('');
          setRawOriginalLogoUri('');
          setLogoMetadata(null);
          showToast('Store logo removed! Click "Save Settings" to apply.', 'info');
        },
      },
    ]);
  };

  const handleSelectPrintWidth = async (newWidth: '58mm' | '80mm') => {
    setPrintWidth(newWidth);
    const sourceImage = rawOriginalLogoUri || logoBase64;
    if (sourceImage) {
      setIsOptimizingLogo(true);
      try {
        const reOptimized = await fitAndOptimizeLogoImage(sourceImage, newWidth);
        if (reOptimized && reOptimized.dataUri) {
          setLogoBase64(reOptimized.dataUri);
          setLogoMetadata({
            width: reOptimized.width,
            height: reOptimized.height,
            sizeBytes: reOptimized.sizeBytes,
            originalWidth: reOptimized.originalWidth,
            originalHeight: reOptimized.originalHeight,
          });
        }
      } catch {}
      setIsOptimizingLogo(false);
    }
  };

  const handleOpenTestQr = () => {
    const trimmedUpi = upiId.trim();
    if (!trimmedUpi) {
      Alert.alert('UPI ID Required', 'Please enter your merchant UPI ID (VPA) before testing the QR code.');
      return;
    }
    if (!isValidUpiId(trimmedUpi)) {
      Alert.alert(
        'Invalid UPI ID Format',
        'Please enter a valid UPI address (e.g. storename@okhdfcbank or 9876543210@paytm).'
      );
      return;
    }
    setTestQrDialogVisible(true);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Validation Error', 'Store / Business Name is required.');
      setActiveTab('profile');
      return;
    }
    if (trimmedName.length < 2) {
      Alert.alert('Validation Error', 'Store / Business Name must be at least 2 characters.');
      setActiveTab('profile');
      return;
    }

    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      Alert.alert('Validation Error', 'Store Address is required.');
      setActiveTab('profile');
      return;
    }

    const trimmedMobile = mobile.trim();
    if (trimmedMobile) {
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(trimmedMobile)) {
        Alert.alert('Validation Error', 'Please enter a valid 10-digit mobile number.');
        setActiveTab('profile');
        return;
      }
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        Alert.alert('Validation Error', 'Please enter a valid email address.');
        setActiveTab('profile');
        return;
      }
    }

    const trimmedGst = gstNumber.trim().toUpperCase();
    if (showGstOnBill && trimmedGst) {
      if (trimmedGst.length !== 15 || !/^[A-Z0-9]{15}$/i.test(trimmedGst)) {
        Alert.alert('Validation Error', 'Please enter a valid 15-character GSTIN number (e.g. 27AAAAA1111A1Z1).');
        setActiveTab('tax');
        return;
      }
    }

    const trimmedUpi = upiId.trim();
    if (showUpiQrOnBill && trimmedUpi && !isValidUpiId(trimmedUpi)) {
      Alert.alert(
        'Invalid UPI ID Format',
        'Please enter a valid UPI ID (e.g. storename@okhdfcbank or 9876543210@paytm) or disable the UPI QR toggle.'
      );
      setActiveTab('printer');
      return;
    }

    setIsSaving(true);
    try {
      await updateOrgProfile({
        id: organization.id || 'default_org',
        name: trimmedName,
        address: trimmedAddress,
        phone: trimmedMobile,
        mobile: trimmedMobile,
        email: trimmedEmail,
        gstNumber: trimmedGst,
        showGstOnBill,
        currency: organization.currency || 'Rs.',
        slogan: slogan.trim(),
        printWidth,
        securityPin: organization.securityPin || '1234',
        showFooterTextOnBill,
        footerText: FIXED_FOOTER_TEXT,
        logoBase64,
        showLogoOnBill,
        upiId: trimmedUpi,
        upiPayeeName: upiPayeeName.trim(),
        showUpiQrOnBill,
      });

      showToast('Store settings saved successfully!', 'success');
    } catch {
      showToast('Failed to save store settings. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Render Category Tab 1: Store Info
  const renderProfileTab = () => (
    <Card style={styles.card} mode="outlined">
      <Card.Content style={styles.cardContent}>
        <View style={styles.sectionHeader}>
          <Avatar.Icon
            size={40}
            icon="store"
            style={{ backgroundColor: theme.colors.primaryContainer }}
            color={theme.colors.primary}
          />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text variant="titleMedium" style={styles.boldText}>
              Store & Business Profile
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Printed at the top of every bill and tax invoice
            </Text>
          </View>
        </View>

        <Divider style={{ marginVertical: 4 }} />

        <TextInput
          label="Organization / Store Name *"
          value={name}
          onChangeText={setName}
          disabled={isDemoMode}
          mode="outlined"
          style={styles.input}
          placeholder="e.g. My Super Store"
          left={<TextInput.Icon icon="office-building" />}
        />

        <TextInput
          label="Billing / Shop Address *"
          value={address}
          onChangeText={setAddress}
          disabled={isDemoMode}
          mode="outlined"
          multiline
          numberOfLines={3}
          style={styles.input}
          placeholder="e.g. Shop No. 4, Market Road, Pune"
          left={<TextInput.Icon icon="map-marker-outline" />}
        />

        <TextInput
          label="Mobile / Phone Number"
          value={mobile}
          onChangeText={setMobile}
          disabled={isDemoMode}
          keyboardType="phone-pad"
          maxLength={10}
          mode="outlined"
          style={styles.input}
          placeholder="e.g. 9876543210"
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
          placeholder="e.g. store@example.com"
          left={<TextInput.Icon icon="email-outline" />}
        />

        {/* Live Thermal Receipt Header Simulation */}
        <View style={styles.receiptPreviewBox}>
          <View style={styles.receiptPreviewHeader}>
            <MaterialCommunityIcons name="receipt-text-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.receiptPreviewTitle}>Thermal Receipt Header Preview</Text>
          </View>
          <View style={styles.receiptPaper}>
            <Text style={styles.receiptPaperStoreName}>
              {name.trim() || 'STORE / BUSINESS NAME'}
            </Text>
            <Text style={styles.receiptPaperAddress}>
              {address.trim() || 'Store Billing Address, City, State'}
            </Text>
            {mobile.trim() ? (
              <Text style={styles.receiptPaperContact}>Ph: +91 {mobile.trim()}</Text>
            ) : null}
            {email.trim() ? (
              <Text style={styles.receiptPaperContact}>{email.trim()}</Text>
            ) : null}
            <View style={styles.receiptDashedLine} />
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  // Render Category Tab 2: Taxes & GST
  const renderTaxTab = () => (
    <Card style={styles.card} mode="outlined">
      <Card.Content style={styles.cardContent}>
        <View style={styles.sectionHeader}>
          <Avatar.Icon
            size={40}
            icon="file-percent-outline"
            style={{ backgroundColor: theme.colors.primaryContainer }}
            color={theme.colors.primary}
          />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text variant="titleMedium" style={styles.boldText}>
              Taxation & GST Settings
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Configure your GSTIN and enable automated GST calculation
            </Text>
          </View>
        </View>

        <Divider style={{ marginVertical: 4 }} />

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
        <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: -4 }}>
          Standard 15-character Goods & Services Tax Identification Number.
        </Text>

        {/* GST Billing Toggle Item */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => !isDemoMode && setShowGstOnBill(!showGstOnBill)}
          style={[
            styles.toggleCard,
            {
              borderColor: showGstOnBill ? theme.colors.primary : '#D0D7DE',
              backgroundColor: showGstOnBill ? theme.colors.primaryContainer : '#F8FAFB',
            },
          ]}
        >
          <Checkbox.Android
            status={showGstOnBill ? 'checked' : 'unchecked'}
            onPress={() => !isDemoMode && setShowGstOnBill(!showGstOnBill)}
            disabled={isDemoMode}
            color={theme.colors.primary}
          />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#212121' }}>
              Use GSTIN & Tax Calculations on Bills
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              When enabled, invoices show your GSTIN, calculate item tax, and split into CGST & SGST.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Status Banner */}
        <View
          style={[
            styles.infoBanner,
            {
              backgroundColor: showGstOnBill ? '#E8F5E9' : '#ECEFF1',
              borderColor: showGstOnBill ? '#A5D6A7' : '#CFD8DC',
            },
          ]}
        >
          <MaterialCommunityIcons
            name={showGstOnBill ? 'check-circle' : 'information'}
            size={20}
            color={showGstOnBill ? '#2E7D32' : '#546E7A'}
          />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 13, color: showGstOnBill ? '#1B5E20' : '#37474F' }}>
              {showGstOnBill ? 'GST Invoicing Mode Active' : 'Standard Non-Tax Invoicing Mode'}
            </Text>
            <Text style={{ fontSize: 12, color: showGstOnBill ? '#2E7D32' : '#546E7A', marginTop: 2 }}>
              {showGstOnBill
                ? 'Product tax rates (0%, 5%, 12%, 18%, 28%) are automatically split into 50% CGST + 50% SGST on receipts.'
                : 'Invoices will be printed without tax split columns for simplified billing.'}
            </Text>
          </View>
        </View>

        {/* GST Slab Guide */}
        <View style={styles.slabGuideBox}>
          <Text variant="labelMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
            SUPPORTED GST RATES PER ITEM:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[
              { rate: '0%', note: 'Exempt' },
              { rate: '5%', note: '2.5% + 2.5%' },
              { rate: '12%', note: '6% + 6%' },
              { rate: '18%', note: '9% + 9%' },
              { rate: '28%', note: '14% + 14%' },
            ].map((item) => (
              <View key={item.rate} style={styles.slabChip}>
                <Text style={styles.slabRateText}>{item.rate}</Text>
                <Text style={styles.slabNoteText}>{item.note}</Text>
              </View>
            ))}
          </View>
          <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: 8 }}>
            Tax rates can be configured per individual product in the Products Inventory screen.
          </Text>
        </View>
      </Card.Content>
    </Card>
  );

  // Render Category Tab 3: Bill & Printer
  const renderPrinterTab = () => (
    <View style={{ gap: 16 }}>
      {/* Bluetooth Printer Card */}
      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.cardContent}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
              <Avatar.Icon
                size={40}
                icon="bluetooth"
                style={{
                  backgroundColor: connectedPrinter ? '#E8F5E9' : theme.colors.surfaceVariant,
                }}
                color={connectedPrinter ? '#2E7D32' : theme.colors.onSurfaceVariant}
              />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text variant="titleMedium" style={styles.boldText}>
                  Bluetooth Printer
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: connectedPrinter ? '#4CAF50' : '#B0BEC5',
                      marginRight: 6,
                    }}
                  />
                  <Text
                    variant="bodySmall"
                    style={{
                      color: connectedPrinter ? '#2E7D32' : theme.colors.outline,
                      fontWeight: connectedPrinter ? 'bold' : 'normal',
                    }}
                  >
                    {connectedPrinter ? `Connected: ${connectedPrinter.name}` : 'No printer connected'}
                  </Text>
                </View>
              </View>
            </View>

            <Button
              mode={connectedPrinter ? 'outlined' : 'contained'}
              icon="bluetooth"
              onPress={() => navigation.navigate('PrinterConnect')}
              compact
            >
              {connectedPrinter ? 'Manage Printer' : 'Setup Printer'}
            </Button>
          </View>
        </Card.Content>
      </Card>

      {/* Printer Paper & Hardware Telemetry Card */}
      {connectedPrinter && (
        <Card style={styles.card} mode="outlined">
          <Card.Content style={styles.cardContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <Avatar.Icon
                  size={36}
                  icon={printerTelemetry?.hasPaper === false ? 'alert-circle-outline' : 'check-circle-outline'}
                  style={{
                    backgroundColor: printerTelemetry?.hasPaper === false ? '#FFEBEE' : '#E8F5E9',
                  }}
                  color={printerTelemetry?.hasPaper === false ? '#D32F2F' : '#2E7D32'}
                />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text variant="titleSmall" style={styles.boldText}>
                    Thermal Paper Telemetry
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {printerTelemetry?.hasPaper === false
                      ? '⚠️ Out of paper - Reload roll'
                      : printerTelemetry?.paperNearEnd
                      ? '⚠️ Paper roll near end'
                      : '✅ Paper roll loaded & ready'}
                  </Text>
                </View>
              </View>

              <Button
                mode="contained-tonal"
                compact
                loading={checkingTelemetry}
                icon="refresh"
                onPress={async () => {
                  setCheckingTelemetry(true);
                  try {
                    const res = await checkPrinterTelemetry();
                    if (!res.hasPaper) {
                      Alert.alert('Paper Out Alert', 'Printer indicates thermal roll is empty or cover is open.');
                    } else {
                      Alert.alert('Paper Status OK', 'Thermal paper roll is properly loaded and ready for printing.');
                    }
                  } catch {
                    Alert.alert('Telemetry Check', 'Unable to poll printer status byte.');
                  } finally {
                    setCheckingTelemetry(false);
                  }
                }}
              >
                Check Paper
              </Button>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Background Bluetooth & Battery Optimization Card */}
      <Card
        style={[
          styles.card,
          isBatteryOptimized && { borderColor: '#FFA000', borderWidth: 1 },
        ]}
        mode="outlined"
      >
        <Card.Content style={styles.cardContent}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
              <Avatar.Icon
                size={36}
                icon={isBatteryOptimized ? 'battery-alert' : 'battery-check'}
                style={{
                  backgroundColor: isBatteryOptimized ? '#FFF8E1' : '#E8F5E9',
                }}
                color={isBatteryOptimized ? '#F57F17' : '#2E7D32'}
              />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text variant="titleSmall" style={styles.boldText}>
                  Background Bluetooth Mode
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {isBatteryOptimized
                    ? 'Battery Saver active (may delay reconnects)'
                    : 'Unrestricted (Seamless background auto-connect)'}
                </Text>
              </View>
            </View>

            {isBatteryOptimized && (
              <Button
                mode="contained"
                buttonColor="#FFA000"
                compact
                onPress={async () => {
                  try {
                    await requestDisableBatteryOptimization();
                    await checkBatteryOptimizationStatus();
                  } catch (e: any) {
                    Alert.alert('Settings Error', e?.message || 'Could not open battery settings.');
                  }
                }}
              >
                Allow Unrestricted
              </Button>
            )}
          </View>
        </Card.Content>
      </Card>

      {/* 1. Store Brand Logo Card */}
      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.cardContent}>
          <View style={styles.sectionHeader}>
            <Avatar.Icon
              size={40}
              icon="image-outline"
              style={{ backgroundColor: theme.colors.primaryContainer }}
              color={theme.colors.primary}
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text variant="titleMedium" style={styles.boldText}>
                Store Brand Logo
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Printed at the top of thermal receipts and invoice PDFs
              </Text>
            </View>
          </View>

          {/* Toggle Switch */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text variant="bodyMedium" style={styles.boldText}>
                Print Store Logo on Receipts
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: 2 }}>
                Enable to show your business emblem/logo on printed bills
              </Text>
            </View>
            <Switch
              value={showLogoOnBill}
              onValueChange={(val) => {
                if (!isDemoMode) setShowLogoOnBill(val);
              }}
              disabled={isDemoMode}
              color={theme.colors.primary}
            />
          </View>

          <Divider style={{ marginVertical: 14 }} />

          {/* Logo Preview & Actions */}
          {isOptimizingLogo ? (
            <View style={{ paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.outline }}>
                Auto-fitting logo to {printWidth} receipt paper...
              </Text>
            </View>
          ) : logoBase64 ? (
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              {/* Preview Mode Switcher */}
              <View style={{ flexDirection: 'row', width: '100%', marginBottom: 10, gap: 8 }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setLogoPreviewMode('thermal')}
                  style={{
                    flex: 1,
                    paddingVertical: 7,
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    alignItems: 'center',
                    backgroundColor: logoPreviewMode === 'thermal' ? theme.colors.primaryContainer : '#F1F5F9',
                    borderWidth: 1,
                    borderColor: logoPreviewMode === 'thermal' ? theme.colors.primary : '#E2E8F0',
                  }}
                >
                  <Text
                    variant="labelMedium"
                    style={{
                      fontWeight: logoPreviewMode === 'thermal' ? 'bold' : 'normal',
                      color: logoPreviewMode === 'thermal' ? theme.colors.primary : '#64748B',
                    }}
                  >
                    Thermal Receipt Fit ({printWidth})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setLogoPreviewMode('original')}
                  style={{
                    flex: 1,
                    paddingVertical: 7,
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    alignItems: 'center',
                    backgroundColor: logoPreviewMode === 'original' ? theme.colors.primaryContainer : '#F1F5F9',
                    borderWidth: 1,
                    borderColor: logoPreviewMode === 'original' ? theme.colors.primary : '#E2E8F0',
                  }}
                >
                  <Text
                    variant="labelMedium"
                    style={{
                      fontWeight: logoPreviewMode === 'original' ? 'bold' : 'normal',
                      color: logoPreviewMode === 'original' ? theme.colors.primary : '#64748B',
                    }}
                  >
                    Original Upload
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Realistic Receipt Paper Strip Container */}
              <View
                style={{
                  width: '100%',
                  backgroundColor: logoPreviewMode === 'thermal' ? '#FFFFFF' : '#FAFAFA',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: logoPreviewMode === 'thermal' ? '#D1D5DB' : '#E0E0E0',
                  borderStyle: logoPreviewMode === 'thermal' ? 'dashed' : 'solid',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  marginBottom: 8,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                  elevation: 1,
                }}
              >
                {logoPreviewMode === 'thermal' ? (
                  <View style={{ width: '100%', alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, color: '#9CA3AF', letterSpacing: 1, marginBottom: 6 }}>
                      - - - - - - - - STORE HEADER - - - - - - - -
                    </Text>
                    <Image
                      source={{
                        uri: logoBase64.startsWith('data:') ? logoBase64 : `data:image/png;base64,${logoBase64}`,
                      }}
                      style={{
                        width: printWidth === '80mm' ? 270 : 210,
                        height: printWidth === '80mm' ? 95 : 80,
                      }}
                      resizeMode="contain"
                    />
                    <Text style={{ fontSize: 9, color: '#9CA3AF', letterSpacing: 1, marginTop: 6 }}>
                      - - - - - - - - - - - - - - - - - - - - - - -
                    </Text>
                  </View>
                ) : (
                  <Image
                    source={{
                      uri: (rawOriginalLogoUri || logoBase64).startsWith('data:')
                        ? (rawOriginalLogoUri || logoBase64)
                        : `data:image/png;base64,${rawOriginalLogoUri || logoBase64}`,
                    }}
                    style={{ width: '85%', height: 95 }}
                    resizeMode="contain"
                  />
                )}
              </View>

              {/* Status and Specs Badge */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#F0FDF4',
                  borderColor: '#BBF7D0',
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  marginBottom: 12,
                  width: '100%',
                }}
              >
                <MaterialCommunityIcons name="check-decagram" size={16} color="#16A34A" style={{ marginRight: 6 }} />
                <Text variant="bodySmall" style={{ color: '#166534', flex: 1, fontSize: 11 }}>
                  Auto-fitted for {printWidth} roll
                  {logoMetadata?.width ? ` (${logoMetadata.width}×${logoMetadata.height}px)` : ''}
                  {' • '}Crisp thermal monochrome ready
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <Button
                  mode="outlined"
                  icon="image-edit-outline"
                  onPress={handlePickLogo}
                  disabled={isDemoMode}
                  style={{ flex: 1 }}
                >
                  Change Logo
                </Button>
                <Button
                  mode="outlined"
                  textColor="#D32F2F"
                  icon="trash-can-outline"
                  onPress={handleRemoveLogo}
                  disabled={isDemoMode}
                  style={{ flex: 1, borderColor: '#FFCDD2' }}
                >
                  Remove
                </Button>
              </View>
            </View>
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: '#B0BEC5',
                borderRadius: 8,
                padding: 20,
                alignItems: 'center',
                backgroundColor: '#F8FAFC',
              }}
            >
              <Avatar.Icon
                size={48}
                icon="cloud-upload-outline"
                style={{ backgroundColor: '#ECEFF1', marginBottom: 10 }}
                color="#546E7A"
              />
              <Text variant="titleSmall" style={{ fontWeight: 'bold', color: '#334155' }}>
                No Logo Selected
              </Text>
              <Text variant="bodySmall" style={{ color: '#64748B', textAlign: 'center', marginTop: 4, marginBottom: 14 }}>
                Supports PNG, JPG, and WEBP. We automatically resize and optimize your logo to perfectly fit your receipt!
              </Text>
              <Button
                mode="contained-tonal"
                icon="file-image-outline"
                onPress={handlePickLogo}
                disabled={isDemoMode}
              >
                Select Logo Image
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* 2. Dynamic UPI QR Payments Card */}
      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.cardContent}>
          <View style={styles.sectionHeader}>
            <Avatar.Icon
              size={40}
              icon="qrcode-scan"
              style={{ backgroundColor: theme.colors.primaryContainer }}
              color={theme.colors.primary}
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text variant="titleMedium" style={styles.boldText}>
                Dynamic UPI QR Payments
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Print scannable amount QR on receipts for instant payment
              </Text>
            </View>
          </View>

          {/* Toggle Switch */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text variant="bodyMedium" style={styles.boldText}>
                Print Dynamic UPI QR on Receipts
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: 2 }}>
                Pre-fills your merchant UPI ID and exact bill amount when scanned
              </Text>
            </View>
            <Switch
              value={showUpiQrOnBill}
              onValueChange={(val) => {
                if (!isDemoMode) setShowUpiQrOnBill(val);
              }}
              disabled={isDemoMode}
              color={theme.colors.primary}
            />
          </View>

          <Divider style={{ marginVertical: 14 }} />

          <TextInput
            label="Merchant UPI ID (VPA) *"
            value={upiId}
            onChangeText={setUpiId}
            disabled={isDemoMode}
            mode="outlined"
            placeholder="e.g. yourstore@okhdfcbank or 9876543210@paytm"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            left={<TextInput.Icon icon="at" />}
            right={
              upiId.trim() ? (
                <TextInput.Icon
                  icon={isValidUpiId(upiId.trim()) ? 'check-circle' : 'alert-circle'}
                  color={isValidUpiId(upiId.trim()) ? '#2E7D32' : '#D32F2F'}
                />
              ) : undefined
            }
          />
          {upiId.trim() && !isValidUpiId(upiId.trim()) ? (
            <Text variant="bodySmall" style={{ color: '#D32F2F', marginTop: -4, marginBottom: 8 }}>
              Please enter a valid UPI address format (e.g. username@bank).
            </Text>
          ) : (
            <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: -4, marginBottom: 8 }}>
              Compatible with PhonePe, Google Pay, Paytm, BHIM, Cred, and all bank apps.
            </Text>
          )}

          <TextInput
            label="UPI Payee Display Name (Optional)"
            value={upiPayeeName}
            onChangeText={setUpiPayeeName}
            disabled={isDemoMode}
            mode="outlined"
            placeholder={`e.g. ${name.trim() || 'Store Name'}`}
            style={styles.input}
            left={<TextInput.Icon icon="store-outline" />}
          />
          <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: -4, marginBottom: 14 }}>
            Business or shop name displayed to customers in their UPI app when paying.
          </Text>

          <Button
            mode="contained-tonal"
            icon="qrcode"
            onPress={handleOpenTestQr}
            style={{ alignSelf: 'flex-start' }}
          >
            Preview & Test Scan QR
          </Button>
        </Card.Content>
      </Card>

      {/* Print Preferences Card */}
      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.cardContent}>
          <View style={styles.sectionHeader}>
            <Avatar.Icon
              size={40}
              icon="printer-outline"
              style={{ backgroundColor: theme.colors.primaryContainer }}
              color={theme.colors.primary}
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text variant="titleMedium" style={styles.boldText}>
                Thermal Receipt Preferences
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Adjust receipt width and footer slogan note
              </Text>
            </View>
          </View>

          <TextInput
            label="Invoice Slogan"
            value={slogan}
            onChangeText={setSlogan}
            disabled={isDemoMode}
            mode="outlined"
            multiline
            numberOfLines={2}
            placeholder="e.g. Thank You Visit again"
            style={[styles.input, styles.sloganInput]}
            contentStyle={styles.sloganContent}
            left={<TextInput.Icon icon="format-quote-open" />}
          />
          <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: -4 }}>
            Printed at the bottom of thermal receipts. Supports multiline text.
          </Text>

          {/* Footer Note / Branding Toggle */}
          <Divider style={{ marginVertical: 14 }} />

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text variant="bodyMedium" style={styles.boldText}>
                  Display Footer on Receipt
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: 2 }}>
                  Show or hide the bottom branding footer line on thermal bills
                </Text>
              </View>
              <Switch
                value={showFooterTextOnBill}
                onValueChange={(val) => {
                  if (!isDemoMode) setShowFooterTextOnBill(val);
                }}
                disabled={isDemoMode}
                color={theme.colors.primary}
              />
            </View>

            {/* Fixed Label Display */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: showFooterTextOnBill ? theme.colors.primaryContainer + '30' : '#F1F5F9',
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: showFooterTextOnBill ? theme.colors.primary + '40' : '#E2E8F0',
                gap: 8,
              }}
            >
              <MaterialCommunityIcons
                name="label-outline"
                size={16}
                color={showFooterTextOnBill ? theme.colors.primary : '#94A3B8'}
              />
              <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '500' }}>
                Footer Text:{' '}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: showFooterTextOnBill ? theme.colors.primary : '#94A3B8',
                }}
              >
                "{FIXED_FOOTER_TEXT}"
              </Text>
            </View>
          </View>

          <Divider style={{ marginVertical: 14 }} />

          <View style={{ marginTop: 4 }}>
            <Text variant="bodyMedium" style={styles.boldText}>
              Receipt Paper Width
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.outline, marginBottom: 10 }}>
              Select the paper width matching your thermal POS receipt printer.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                {
                  value: '58mm',
                  title: '58mm Standard',
                  sub: 'Pocket Printer (32 Chars)',
                  icon: 'printer-outline',
                },
                {
                  value: '80mm',
                  title: '80mm Wide',
                  sub: 'Desktop Printer (48 Chars)',
                  icon: 'printer-pos',
                },
              ].map((item) => {
                const selected = printWidth === item.value;
                return (
                  <TouchableOpacity
                    key={item.value}
                    activeOpacity={0.8}
                    disabled={isDemoMode}
                    onPress={() => handleSelectPrintWidth(item.value as '58mm' | '80mm')}
                    style={[
                      styles.printerWidthCard,
                      {
                        borderColor: selected ? theme.colors.primary : '#D0D7DE',
                        backgroundColor: selected ? theme.colors.primaryContainer : '#FFFFFF',
                        borderWidth: selected ? 2 : 1,
                        opacity: isDemoMode ? 0.6 : 1,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <MaterialCommunityIcons
                        name={selected ? 'check-circle' : item.icon}
                        size={20}
                        color={selected ? theme.colors.primary : theme.colors.outline}
                      />
                      <Text
                        style={{
                          fontWeight: 'bold',
                          fontSize: 14,
                          color: selected ? theme.colors.primary : '#333333',
                        }}
                      >
                        {item.title}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 11,
                        color: selected ? theme.colors.onPrimaryContainer : theme.colors.outline,
                      }}
                    >
                      {item.sub}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Receipt Footer Preview */}
          <View style={styles.receiptPreviewBox}>
            <View style={styles.receiptPreviewHeader}>
              <MaterialCommunityIcons name="format-quote-close" size={16} color={theme.colors.primary} />
              <Text style={styles.receiptPreviewTitle}>Thermal Receipt Footer Preview</Text>
            </View>
            <View style={styles.receiptPaper}>
              <View style={styles.receiptDashedLine} />
              <Text style={styles.receiptPaperSlogan}>
                {slogan.trim() || 'Thank You Visit again'}
              </Text>
              {showFooterTextOnBill && (
                <Text style={styles.receiptPaperPowered}>
                  {FIXED_FOOTER_TEXT}
                </Text>
              )}
            </View>
          </View>
        </Card.Content>
      </Card>
    </View>
  );

  // Render Category Tab 4: Security & Data
  const renderSecurityTab = () => (
    <View style={{ gap: 16 }}>
      {/* Database Statistics Card */}
      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.cardContent}>
          <View style={styles.sectionHeader}>
            <Avatar.Icon
              size={40}
              icon="database-outline"
              style={{ backgroundColor: theme.colors.primaryContainer }}
              color={theme.colors.primary}
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text variant="titleMedium" style={styles.boldText}>
                Database & Records Overview
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Stored locally and offline on this device
              </Text>
            </View>
          </View>

          <Divider style={{ marginVertical: 4 }} />

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{invoices?.length || 0}</Text>
              <Text style={styles.statLabel}>Invoices</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{products?.length || 0}</Text>
              <Text style={styles.statLabel}>Products</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{customers?.length || 0}</Text>
              <Text style={styles.statLabel}>Customers</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Printer Security Lock Card (Enforced System Policy) */}
      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.cardContent}>
          <View style={[styles.sectionHeader, { alignItems: 'flex-start' }]}>
            <Avatar.Icon
              size={40}
              icon={
                printerLockStatus?.isLocked
                  ? 'printer-alert'
                  : 'shield-check-outline'
              }
              style={{
                backgroundColor: printerLockStatus?.isLocked
                  ? theme.colors.errorContainer || '#FFEBEE'
                  : '#E8F5E9',
                marginTop: 2,
              }}
              color={
                printerLockStatus?.isLocked
                  ? theme.colors.error
                  : '#2E7D32'
              }
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text variant="titleMedium" style={styles.boldText}>
                Printer Security Lock
              </Text>
              {/* SYSTEM ENFORCED Status Badge displayed on a new line */}
              <View style={{ flexDirection: 'row', marginTop: 4, marginBottom: 4 }}>
                <View
                  style={{
                    backgroundColor: theme.colors.primaryContainer,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 12,
                    alignSelf: 'flex-start',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: 'bold',
                      color: theme.colors.primary,
                      letterSpacing: 0.5,
                    }}
                  >
                    SYSTEM ENFORCED
                  </Text>
                </View>
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 16 }}>
                Locks terminal if printer is not connected for {APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS} hours ({Math.round(APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS / 24)} days)
              </Text>
            </View>
          </View>

          <Divider style={{ marginVertical: 8 }} />

          {/* Status Badge & Summary */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              backgroundColor: printerLockStatus?.isLocked
                ? '#FFEBEE'
                : printerLockStatus?.unlockedViaMaster
                ? '#FFF8E1'
                : '#E8F5E9',
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: printerLockStatus?.isLocked
                ? '#FFCDD2'
                : printerLockStatus?.unlockedViaMaster
                ? '#FFE082'
                : '#C8E6C9',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <MaterialCommunityIcons
                name={
                  printerLockStatus?.isLocked
                    ? 'alert-circle'
                    : printerLockStatus?.unlockedViaMaster
                    ? 'clock-alert-outline'
                    : 'check-circle'
                }
                size={18}
                color={
                  printerLockStatus?.isLocked
                    ? '#C62828'
                    : printerLockStatus?.unlockedViaMaster
                    ? '#E65100'
                    : '#2E7D32'
                }
              />
              <Text
                variant="labelMedium"
                style={{
                  fontWeight: 'bold',
                  flexShrink: 1,
                  color: printerLockStatus?.isLocked
                    ? '#C62828'
                    : printerLockStatus?.unlockedViaMaster
                    ? '#E65100'
                    : '#2E7D32',
                }}
              >
                {printerLockStatus?.isLocked
                  ? 'TERMINAL LOCKED'
                  : printerLockStatus?.unlockedViaMaster
                  ? 'MASTER GRACE ACTIVE'
                  : 'ACTIVE (Protected)'}
              </Text>
            </View>

            {!printerLockStatus?.isLocked && (
              <Text
                variant="labelSmall"
                style={{
                  color: printerLockStatus?.unlockedViaMaster ? '#E65100' : '#2E7D32',
                  fontWeight: '600',
                }}
              >
                {formatTimeRemaining(printerLockStatus?.timeRemainingMs || 0)} left
              </Text>
            )}
          </View>

          {/* Details Table */}
          <View style={{ marginTop: 10, gap: 6 }}>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Inactivity Timeout:</Text>
              <Text style={styles.diagValue}>
                {APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS} Hours ({Math.round(APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS / 24)} Days)
              </Text>
            </View>

            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Registered Printer:</Text>
              <Text style={[styles.diagValue, { color: theme.colors.primary }]}>
                {printerLockStatus?.registeredDevice?.name ||
                  (connectedPrinter?.name ? `${connectedPrinter.name} (Active)` : 'Not registered yet')}
              </Text>
            </View>

            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Last Verified Connection:</Text>
              <Text style={styles.diagValue}>
                {printerLockStatus?.lastConnectedDate
                  ? formatInvoiceDateTime(printerLockStatus.lastConnectedDate)
                  : connectedPrinter
                  ? 'Connected right now'
                  : 'No connection recorded'}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 12, flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Button
              mode="outlined"
              icon="printer-wireless"
              compact
              style={{ flex: 1, minWidth: 140, borderRadius: 8 }}
              onPress={() => navigation.navigate('PrinterConnect')}
            >
              {connectedPrinter ? 'Manage Printer' : 'Pair & Verify Printer'}
            </Button>
            {printerLockStatus?.isLocked && (
              <Button
                mode="contained"
                icon="key-outline"
                compact
                buttonColor="#C62828"
                style={{ borderRadius: 8 }}
                onPress={() => setMasterUnlockVisible(true)}
              >
                Unlock with Master Key
              </Button>
            )}
            <Button
              mode="text"
              icon="refresh"
              compact
              onPress={async () => {
                await checkPrinterLock();
                showToast('Security status refreshed.', 'info');
              }}
            >
              Refresh
            </Button>
          </View>
        </Card.Content>
      </Card>


      {/* Security PIN & Backup Hub Card */}
      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.cardContent}>
          <View style={styles.sectionHeader}>
            <Avatar.Icon
              size={40}
              icon="shield-lock-outline"
              style={{ backgroundColor: theme.colors.primaryContainer }}
              color={theme.colors.primary}
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text variant="titleMedium" style={styles.boldText}>
                Security & Data Management
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Manage Security PIN, Export/Import Backups, and Reset Data
              </Text>
            </View>
          </View>

          <Divider style={{ marginVertical: 4 }} />

          <View style={styles.securityBulletList}>
            <View style={styles.securityBulletItem}>
              <MaterialCommunityIcons name="lock-check" size={18} color={theme.colors.primary} />
              <Text style={styles.securityBulletText}>
                <Text style={{ fontWeight: 'bold' }}>Security PIN Protection:</Text> Prevents unauthorized backup export, data import, or record wipe.
              </Text>
            </View>
            <View style={styles.securityBulletItem}>
              <MaterialCommunityIcons name="cloud-upload-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.securityBulletText}>
                <Text style={{ fontWeight: 'bold' }}>JSON Backups:</Text> Export encrypted database files to share via WhatsApp, Drive, or Email.
              </Text>
            </View>
            <View style={styles.securityBulletItem}>
              <MaterialCommunityIcons name="delete-restore" size={18} color={theme.colors.primary} />
              <Text style={styles.securityBulletText}>
                <Text style={{ fontWeight: 'bold' }}>Data Maintenance:</Text> Clear historical test invoices or perform factory resets.
              </Text>
            </View>
          </View>

          <Button
            mode="contained-tonal"
            icon="shield-key-outline"
            onPress={() => navigation.navigate('SecurityBackup')}
            style={styles.hubBtn}
            contentStyle={{ height: 46 }}
          >
            Open Security & Backup Hub
          </Button>
        </Card.Content>
      </Card>

      {/* Diagnostics / Environment Card */}
      <Card style={styles.card} mode="outlined">
        <Card.Content style={{ gap: 8 }}>
          <Text variant="labelLarge" style={styles.boldText}>
            System Diagnostics
          </Text>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>App Mode:</Text>
            <Text style={styles.diagValue}>{isDemoMode ? 'Demo Locked' : 'Production Active'}</Text>
          </View>
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>Default Currency:</Text>
            <Text style={styles.diagValue}>{currency} (INR)</Text>
          </View>
        </Card.Content>
      </Card>
    </View>
  );

  // Render Category Tab 5: Device Switch & Store Transfer (No PIN Verification)
  const renderTransferTab = () => {
    const sequences = calculateInvoiceSequences(invoices || []);
    return (
      <View style={{ gap: 16 }}>
        {/* Banner Card */}
        <Card style={[styles.card, { borderColor: theme.colors.primary, borderWidth: 1 }]} mode="outlined">
          <Card.Content style={styles.cardContent}>
            <View style={styles.sectionHeader}>
              <Avatar.Icon
                size={42}
                icon="swap-horizontal-bold"
                style={{ backgroundColor: theme.colors.primaryContainer }}
                color={theme.colors.primary}
              />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                  <Text variant="titleMedium" style={styles.boldText}>
                    Device Switch & Store Transfer
                  </Text>
                  <Chip compact style={{ backgroundColor: '#E8F5E9' }} textStyle={{ color: '#2E7D32', fontSize: 10, fontWeight: 'bold' }}>
                    100% OFFLINE P2P
                  </Chip>
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  Direct device-to-device handoff for vacations or phone upgrades
                </Text>
              </View>
            </View>

            <Divider style={{ marginVertical: 4 }} />

            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
              Going on vacation or switching devices? Transfer your entire store catalog, active stock, customer balances, and invoice sequences directly to your colleague's phone via WhatsApp or Drive — with zero server fees and no PIN required.
            </Text>

            <Button
              mode="text"
              icon="help-circle-outline"
              compact
              style={{ alignSelf: 'flex-start', marginTop: 2 }}
              onPress={() => setTransferHelpDialogVisible(true)}
            >
              How Store Transfer Works (3 Steps)
            </Button>
          </Card.Content>
        </Card>

        {/* Step 1: Export Store to Colleague Phone Card (With Complete Responsive Store Info & Details) */}
        <Card style={[styles.card, { borderColor: theme.colors.primary, borderWidth: 1.2 }]} mode="outlined">
          <Card.Content style={styles.cardContent}>
            <View style={[styles.sectionHeader, { alignItems: 'flex-start' }]}>
              <Avatar.Icon
                size={40}
                icon="export-variant"
                style={{ backgroundColor: '#E3F2FD', marginTop: 2 }}
                color="#1976D2"
              />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <Text variant="titleMedium" style={[styles.boldText, { flexShrink: 1 }]}>
                    Export Store to Colleague Phone
                  </Text>
                  <Chip compact style={{ backgroundColor: '#E3F2FD' }} textStyle={{ color: '#1565C0', fontSize: 10, fontWeight: 'bold' }}>
                    STEP 1 • READY
                  </Chip>
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  Shop Owner before leaving for vacation
                </Text>
              </View>
            </View>

            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
              Packages your entire business into a verified, self-contained transfer file with real-time sequence continuity:
            </Text>

            {/* Responsive Store Info & Transfer Metrics Container */}
            <View style={styles.transferDetailsBox}>
              <View style={styles.transferInfoRow}>
                <Text style={styles.transferInfoLabel}>🏪 Store Name:</Text>
                <Text style={[styles.transferInfoValue, { fontWeight: 'bold', color: theme.colors.primary }]}>
                  {organization?.name || 'My Store'}
                </Text>
              </View>

              {organization?.gstNumber ? (
                <View style={styles.transferInfoRow}>
                  <Text style={styles.transferInfoLabel}>🏷️ GSTIN:</Text>
                  <Text style={styles.transferInfoValue}>{organization.gstNumber}</Text>
                </View>
              ) : null}

              {(organization?.mobile || organization?.phone) ? (
                <View style={styles.transferInfoRow}>
                  <Text style={styles.transferInfoLabel}>📞 Store Mobile:</Text>
                  <Text style={styles.transferInfoValue}>{organization.mobile || organization.phone}</Text>
                </View>
              ) : null}

              <View style={styles.transferInfoRow}>
                <Text style={styles.transferInfoLabel}>📱 Source Phone:</Text>
                <Text style={styles.transferInfoValue}>
                  {Platform.OS === 'android' ? 'Android Device' : 'iOS Device'}
                </Text>
              </View>

              <Divider style={{ marginVertical: 2, backgroundColor: '#CBD5E1' }} />

              {/* Metric Chips with Responsive Wrapping */}
              <View style={styles.transferMetricsRow}>
                <View style={styles.transferMetricChip}>
                  <Text style={styles.transferMetricChipText}>
                    📦 {products?.length || 0} Products
                  </Text>
                </View>
                <View style={styles.transferMetricChip}>
                  <Text style={styles.transferMetricChipText}>
                    👥 {customers?.length || 0} Customers
                  </Text>
                </View>
                <View style={styles.transferMetricChip}>
                  <Text style={styles.transferMetricChipText}>
                    🧾 {invoices?.length || 0} Bills
                  </Text>
                </View>
              </View>

              {/* Highlighted Next Bill Sequence Continuity */}
              <View style={styles.transferSequenceBanner}>
                <View style={styles.transferSequenceRow}>
                  <Text style={styles.transferSequenceLabel}>
                    🔢 Next Bill on Colleague Phone:
                  </Text>
                  <Text style={styles.transferSequenceValue}>
                    {sequences.nextSuggestedInvoiceNumber}
                  </Text>
                </View>
                <Text style={styles.transferSequenceCaption}>
                  Invoice numbering continues seamlessly from this number without duplicates.
                </Text>
              </View>
            </View>

            <Button
              mode="contained"
              icon="share-variant"
              style={styles.hubBtn}
              contentStyle={{ height: 48 }}
              onPress={handleOpenTransferExportDialog}
              disabled={isTransferring}
            >
              Export & Share Store Package
            </Button>
          </Card.Content>
        </Card>

        {/* Step 2: Receive Store on this Phone Card */}
        <Card style={styles.card} mode="outlined">
          <Card.Content style={styles.cardContent}>
            <View style={[styles.sectionHeader, { alignItems: 'flex-start' }]}>
              <Avatar.Icon
                size={40}
                icon="import"
                style={{ backgroundColor: '#E8F5E9', marginTop: 2 }}
                color="#2E7D32"
              />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <Text variant="titleMedium" style={[styles.boldText, { flexShrink: 1 }]}>
                    Receive Store on this Phone
                  </Text>
                  <Chip compact style={{ backgroundColor: '#E8F5E9' }} textStyle={{ color: '#2E7D32', fontSize: 10, fontWeight: 'bold' }}>
                    STEP 2 • TAKEOVER
                  </Chip>
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  Colleague taking over counter, or Owner on return
                </Text>
              </View>
            </View>

            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
              Select the transfer file received via WhatsApp or Drive. The app verifies all data and enables counter billing immediately without missing bill numbers.
            </Text>

            <View style={styles.transferMetricsRow}>
              <View style={[styles.transferMetricChip, { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' }]}>
                <Text style={[styles.transferMetricChipText, { color: '#1B5E20' }]}>
                  🛡️ Auto-Safety Snapshot
                </Text>
              </View>
              <View style={[styles.transferMetricChip, { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' }]}>
                <Text style={[styles.transferMetricChipText, { color: '#1B5E20' }]}>
                  ⚡ 1-Click Takeover
                </Text>
              </View>
              <View style={[styles.transferMetricChip, { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' }]}>
                <Text style={[styles.transferMetricChipText, { color: '#1B5E20' }]}>
                  🔄 Undo Anytime
                </Text>
              </View>
            </View>

            <Button
              mode="contained-tonal"
              icon="cellphone-arrow-down"
              style={styles.hubBtn}
              contentStyle={{ height: 48 }}
              onPress={handleOpenTransferImportDialog}
              disabled={isTransferring}
            >
              Receive & Take Over Store
            </Button>
          </Card.Content>
        </Card>

        {/* Step 3: Safety Rollback (Displayed if snapshot exists) */}
        {rollbackSnapshot && (
          <Card style={[styles.card, { borderColor: '#FFA000', borderWidth: 1.2 }]} mode="outlined">
            <Card.Content style={styles.cardContent}>
              <View style={[styles.sectionHeader, { alignItems: 'flex-start' }]}>
                <Avatar.Icon
                  size={40}
                  icon="history"
                  style={{ backgroundColor: '#FFF8E1', marginTop: 2 }}
                  color="#F57C00"
                />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text variant="titleMedium" style={[styles.boldText, { color: '#E65100' }]}>
                    Safety Undo / Rollback Available
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#F57C00' }}>
                    Saved on {formatInvoiceDateTime(rollbackSnapshot.savedAt)}
                  </Text>
                </View>
              </View>

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
                Before the last store takeover, a complete safety snapshot of this phone's data was saved. If you want to undo the transfer and restore the previous state:
              </Text>

              {rollbackSnapshot.summary?.storeName ? (
                <View style={[styles.transferDetailsBox, { borderColor: '#FFE082', backgroundColor: '#FFFDE7' }]}>
                  <View style={styles.transferInfoRow}>
                    <Text style={styles.transferInfoLabel}>Previous Store:</Text>
                    <Text style={[styles.transferInfoValue, { fontWeight: 'bold' }]}>
                      {rollbackSnapshot.summary.storeName}
                    </Text>
                  </View>
                  <View style={styles.transferInfoRow}>
                    <Text style={styles.transferInfoLabel}>Saved Data:</Text>
                    <Text style={styles.transferInfoValue}>
                      {rollbackSnapshot.summary.totalProducts ?? 0} items • {rollbackSnapshot.summary.totalCustomers ?? 0} customers • {rollbackSnapshot.summary.totalInvoices ?? 0} bills
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                <Button
                  mode="contained"
                  buttonColor="#E65100"
                  textColor="#FFFFFF"
                  icon="restore"
                  style={{ flex: 1, minWidth: 160, borderRadius: 10 }}
                  contentStyle={{ height: 46 }}
                  onPress={handleRollbackTransfer}
                  disabled={isTransferring}
                >
                  Restore Previous State
                </Button>
                <Button
                  mode="outlined"
                  textColor="#757575"
                  style={{ borderRadius: 10, minWidth: 90 }}
                  contentStyle={{ height: 46 }}
                  onPress={handleDismissRollback}
                >
                  Dismiss
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Top Fixed Category Tab Bar */}
      <View style={[styles.tabBarWrapper, { backgroundColor: theme.colors.surface }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarScroll}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                activeOpacity={0.75}
                onPress={() => setActiveTab(tab.id)}
                style={[
                  styles.tabButton,
                  isActive
                    ? {
                        backgroundColor: theme.colors.primary,
                        borderColor: theme.colors.primary,
                      }
                    : {
                        backgroundColor: theme.colors.surface,
                        borderColor: '#D0D7DE',
                      },
                ]}
              >
                <MaterialCommunityIcons
                  name={tab.icon}
                  size={18}
                  color={isActive ? '#FFFFFF' : theme.colors.onSurfaceVariant}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    {
                      color: isActive ? '#FFFFFF' : theme.colors.onSurfaceVariant,
                      fontWeight: isActive ? '700' : '500',
                    },
                  ]}
                >
                  {tab.label}
                </Text>

                {/* Status Dot / Badge indicators */}
                {tab.id === 'tax' && showGstOnBill && (
                  <View
                    style={[
                      styles.tabBadge,
                      { backgroundColor: isActive ? '#FFFFFF' : theme.colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabBadgeText,
                        { color: isActive ? theme.colors.primary : '#FFFFFF' },
                      ]}
                    >
                      GST
                    </Text>
                  </View>
                )}

                {tab.id === 'printer' && connectedPrinter && (
                  <View
                    style={[
                      styles.connectedDot,
                      { backgroundColor: isActive ? '#A7F3D0' : '#10B981' },
                    ]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Scrollable Categorized Content */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.centerContainer}>
          {/* Demo Mode Notice */}
          {isDemoMode && (
            <Card style={styles.demoCard} mode="outlined">
              <Card.Content style={styles.demoContent}>
                <Avatar.Icon size={36} icon="lock" style={{ backgroundColor: '#FFE0B2' }} color="#E65100" />
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall" style={{ fontWeight: 'bold', color: '#E65100' }}>
                    Demo Version Locked
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#EF6C00' }}>
                    Organization profile details are default dummy data and cannot be modified in Demo Mode.
                  </Text>
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Active Tab Screen */}
          {activeTab === 'profile' && renderProfileTab()}
          {activeTab === 'tax' && renderTaxTab()}
          {activeTab === 'printer' && renderPrinterTab()}
          {activeTab === 'security' && renderSecurityTab()}
          {activeTab === 'transfer' && renderTransferTab()}
        </View>
      </ScrollView>

      {/* Fixed Bottom Submit Button Container (Hidden on Transfer Tab) */}
      {activeTab !== 'transfer' && (
        <View
          style={[
            styles.fixedBottomContainer,
            {
              backgroundColor: theme.colors.surface,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.fixedBottomInner}>
            <Button
              mode="contained"
              icon="content-save-outline"
              style={styles.saveBtn}
              contentStyle={styles.saveBtnContent}
              labelStyle={styles.saveBtnLabel}
              onPress={handleSave}
              disabled={isDemoMode || isSaving}
              loading={isSaving}
            >
              {isDemoMode ? 'Store Settings Locked (Demo)' : 'Save Store Settings'}
            </Button>
            <Text style={styles.fixedBottomHint}>
              Settings apply instantly to all generated bills & thermal prints
            </Text>
          </View>
        </View>
      )}

      {/* Feedback Toast */}
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

        {/* Device Switch & Store Transfer: Export Dialog */}
        <Dialog
          visible={transferExportDialogVisible}
          onDismiss={() => {
            if (!isTransferring) setTransferExportDialogVisible(false);
          }}
          style={styles.dialog}
        >
          <Dialog.Title style={{ fontSize: 18, fontWeight: 'bold' }}>
            Export Store to Colleague Phone
          </Dialog.Title>
          <Dialog.Content style={{ gap: 14 }}>
            <Text variant="bodyMedium">
              This will create a verified Store Transfer package containing your entire business data:
            </Text>

            <Card style={{ backgroundColor: theme.colors.primaryContainer, borderRadius: 12, borderWidth: 1, borderColor: '#B2DFDB' }}>
              <Card.Content style={{ gap: 8, paddingVertical: 12, paddingHorizontal: 14 }}>
                <View style={styles.dialogInfoRow}>
                  <Text style={styles.dialogInfoLabel}>🏪 Store Name:</Text>
                  <Text style={[styles.dialogInfoValue, { fontWeight: 'bold' }]}>
                    {organization?.name || 'My Store'}
                  </Text>
                </View>

                {organization?.gstNumber ? (
                  <View style={styles.dialogInfoRow}>
                    <Text style={styles.dialogInfoLabel}>🏷️ GSTIN:</Text>
                    <Text style={styles.dialogInfoValue}>{organization.gstNumber}</Text>
                  </View>
                ) : null}

                <View style={styles.dialogInfoRow}>
                  <Text style={styles.dialogInfoLabel}>📦 Active Products:</Text>
                  <Text style={styles.dialogInfoValue}>{products?.length || 0} items</Text>
                </View>

                <View style={styles.dialogInfoRow}>
                  <Text style={styles.dialogInfoLabel}>👥 Customer Accounts:</Text>
                  <Text style={styles.dialogInfoValue}>{customers?.length || 0} accounts</Text>
                </View>

                <View style={styles.dialogInfoRow}>
                  <Text style={styles.dialogInfoLabel}>🧾 Total Invoices:</Text>
                  <Text style={styles.dialogInfoValue}>{invoices?.length || 0} bills</Text>
                </View>

                <Divider style={{ marginVertical: 2, backgroundColor: '#80CBC4' }} />

                <View style={{ backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <Text style={{ fontWeight: 'bold', color: theme.colors.primary, fontSize: 12 }}>
                      🔢 Next Bill on Colleague Phone:
                    </Text>
                    <Text style={{ fontWeight: 'bold', color: '#1B5E20', fontSize: 13 }}>
                      {calculateInvoiceSequences(invoices || []).nextSuggestedInvoiceNumber}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: '#576061' }}>
                    Numbering seamlessly continues without duplicate bill numbers.
                  </Text>
                </View>
              </Card.Content>
            </Card>

            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              • Share the file with your colleague via WhatsApp, Quick Share, or Google Drive.
              {'\n'}• Your colleague can import it with 1-click on their phone to take over counter billing.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setTransferExportDialogVisible(false)}
              disabled={isTransferring}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              icon="share-variant"
              loading={isTransferring}
              disabled={isTransferring}
              onPress={handleExecuteTransferExportAndShare}
            >
              Generate & Share
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Device Switch & Store Transfer: Receive Dialog */}
        <Dialog
          visible={transferImportDialogVisible}
          onDismiss={() => setTransferImportDialogVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={{ fontSize: 18, fontWeight: 'bold' }}>
            Receive Store on this Phone
          </Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 460, paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 10, gap: 14 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Select the Store Transfer JSON file shared by the shop owner via WhatsApp or Drive.
              </Text>

              <Button
                mode="contained"
                icon="file-document-outline"
                onPress={handlePickTransferDocument}
              >
                Select Store Transfer File
              </Button>

              {/* File / Validation Status Box */}
              {transferImportFile && !transferImportFile.isValid && (
                <View style={{ padding: 10, borderRadius: 8, backgroundColor: '#FFEBEE', gap: 4 }}>
                  <Text style={{ fontWeight: 'bold', color: '#C62828', fontSize: 13 }} numberOfLines={2}>
                    {transferImportFile.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#C62828' }}>
                    {transferImportFile.errorMsg || 'Invalid store transfer file.'}
                  </Text>
                </View>
              )}

              {/* Pre-Import Preview Card when valid package detected */}
              {transferParsedPackage?.isValid && transferParsedPackage.summary && (
                <Card style={{ backgroundColor: '#E8F5E9', borderRadius: 12, borderWidth: 1, borderColor: '#A5D6A7' }}>
                  <Card.Content style={{ gap: 8, paddingVertical: 12, paddingHorizontal: 14 }}>
                    <Text variant="labelMedium" style={{ fontWeight: 'bold', color: '#1B5E20' }}>
                      ✓ VERIFIED STORE TRANSFER PACKAGE
                    </Text>

                    <View style={styles.dialogInfoRow}>
                      <Text style={[styles.dialogInfoLabel, { color: '#2E7D32' }]}>🏪 Store Name:</Text>
                      <Text style={[styles.dialogInfoValue, { fontWeight: 'bold', color: '#1B5E20' }]}>
                        {transferParsedPackage.summary.storeName}
                      </Text>
                    </View>

                    {transferParsedPackage.summary.storeGstNumber ? (
                      <View style={styles.dialogInfoRow}>
                        <Text style={[styles.dialogInfoLabel, { color: '#2E7D32' }]}>🏷️ GSTIN:</Text>
                        <Text style={[styles.dialogInfoValue, { color: '#1B5E20' }]}>
                          {transferParsedPackage.summary.storeGstNumber}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.dialogInfoRow}>
                      <Text style={[styles.dialogInfoLabel, { color: '#2E7D32' }]}>📦 Products to Import:</Text>
                      <Text style={[styles.dialogInfoValue, { fontWeight: 'bold', color: '#1B5E20' }]}>
                        {transferParsedPackage.summary.totalProducts} items
                      </Text>
                    </View>

                    <View style={styles.dialogInfoRow}>
                      <Text style={[styles.dialogInfoLabel, { color: '#2E7D32' }]}>👥 Customers to Import:</Text>
                      <Text style={[styles.dialogInfoValue, { fontWeight: 'bold', color: '#1B5E20' }]}>
                        {transferParsedPackage.summary.totalCustomers} accounts
                      </Text>
                    </View>

                    <View style={styles.dialogInfoRow}>
                      <Text style={[styles.dialogInfoLabel, { color: '#2E7D32' }]}>🧾 Historical Invoices:</Text>
                      <Text style={[styles.dialogInfoValue, { fontWeight: 'bold', color: '#1B5E20' }]}>
                        {transferParsedPackage.summary.totalInvoices} bills
                      </Text>
                    </View>

                    <Divider style={{ marginVertical: 2, backgroundColor: '#A5D6A7' }} />

                    <View style={{ backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8, gap: 2 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <Text style={{ fontWeight: 'bold', color: '#1B5E20', fontSize: 12 }}>
                          Next Bill Starts At:
                        </Text>
                        <Text style={{ fontWeight: 'bold', color: '#1B5E20', fontSize: 13 }}>
                          {transferParsedPackage.summary.nextSuggestedInvoiceNumber}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 10, color: '#388E3C' }}>
                        Transferred from {transferParsedPackage.summary.sourceDevice} on{' '}
                        {formatInvoiceDateTime(transferParsedPackage.summary.transferredAt)}
                      </Text>
                    </View>
                  </Card.Content>
                </Card>
              )}

              <TextInput
                label="Or Paste JSON Content Directly"
                value={transferImportJson}
                onChangeText={handleManualTransferJsonChange}
                multiline
                numberOfLines={3}
                mode="outlined"
              />

              <View style={{ backgroundColor: '#F5F5F5', padding: 8, borderRadius: 8 }}>
                <Text style={{ fontSize: 11, color: '#616161' }}>
                  🛡️ Auto-Safety: A backup of this phone's current data will be saved locally so you can undo at any time.
                </Text>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setTransferImportDialogVisible(false)}>Cancel</Button>
            <Button
              mode="contained"
              icon="check-circle"
              disabled={!transferParsedPackage?.isValid}
              onPress={handleExecuteTransferImport}
            >
              Take Over Store
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Device Switch & Store Transfer: Help Dialog */}
        <Dialog
          visible={transferHelpDialogVisible}
          onDismiss={() => setTransferHelpDialogVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={{ fontSize: 18, fontWeight: 'bold' }}>
            Store Transfer: How it Works
          </Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 420, paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 10, gap: 14 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Avatar.Icon size={36} icon="airplane-takeoff" style={{ backgroundColor: '#E3F2FD' }} color="#1976D2" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#1976D2' }}>
                    1. Before Leaving (Owner Device)
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant }}>
                    Tap "Export Store to Colleague Phone". Send the package to your colleague via WhatsApp, Bluetooth, or Google Drive.
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Avatar.Icon size={36} icon="storefront" style={{ backgroundColor: '#E8F5E9' }} color="#2E7D32" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#2E7D32' }}>
                    2. During Vacation (Colleague Device)
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant }}>
                    Colleague taps "Receive Store on this Phone" and selects the file. They can create bills, manage stock, and collect payments. Invoice numbering seamlessly continues from where you left off!
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Avatar.Icon size={36} icon="airplane-landing" style={{ backgroundColor: '#FFF3E0' }} color="#E65100" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#E65100' }}>
                    3. Vacation Over (Return Handoff)
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant }}>
                    When you return, colleague taps "Export Store to Colleague Phone" and sends the file back to you. You tap "Receive Store on this Phone" to load all vacation bills and payments back into your phone!
                  </Text>
                </View>
              </View>

              <Divider style={{ marginVertical: 4 }} />

              <View style={{ backgroundColor: '#EDE7F6', padding: 10, borderRadius: 8 }}>
                <Text style={{ fontSize: 11, color: '#512DA8', fontWeight: '500' }}>
                  💡 Zero Server Cost: Entire transfer happens device-to-device. No cloud accounts, databases, PINs, or subscriptions required.
                </Text>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button mode="contained" onPress={() => setTransferHelpDialogVisible(false)}>
              Got It
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Test UPI Payment QR Dialog */}
        <Dialog visible={testQrDialogVisible} onDismiss={() => setTestQrDialogVisible(false)}>
          <Dialog.Title style={{ textAlign: 'center' }}>Test UPI Payment QR</Dialog.Title>
          <Dialog.Content style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text variant="bodySmall" style={{ color: theme.colors.outline, marginBottom: 12, textAlign: 'center' }}>
              Scan with Google Pay, PhonePe, Paytm, or BHIM to verify your merchant UPI ID.
            </Text>
            {testQrMatrix.length > 0 ? (
              <View style={styles.testQrBox}>
                {testQrMatrix.map((row, rIdx) => (
                  <View key={rIdx} style={{ flexDirection: 'row', height: 4.5 }}>
                    {row.map((isDark, cIdx) => (
                      <View
                        key={cIdx}
                        style={{
                          width: 4.5,
                          height: 4.5,
                          backgroundColor: isDark ? '#000000' : '#ffffff',
                        }}
                      />
                    ))}
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={{ fontWeight: 'bold', fontSize: 18, marginTop: 12, color: theme.colors.primary }}>
              ₹ 10.00
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '600', marginTop: 4 }}>
              {upiPayeeName.trim() || name.trim() || 'Store'}
            </Text>
            <Text style={{ fontSize: 12, color: '#666666', marginTop: 2 }}>
              {upiId.trim()}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setTestQrDialogVisible(false)}>Done</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Loading Overlay */}
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

      {/* Master Password Unlock Modal */}
      <MasterUnlockDialog
        visible={masterUnlockVisible}
        onDismiss={() => setMasterUnlockVisible(false)}
        onSuccess={() => checkPrinterLock()}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBarWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#E0EAEB',
    paddingVertical: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    zIndex: 10,
  },
  tabBarScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabButtonText: {
    fontSize: 13,
  },
  tabBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  centerContainer: {
    width: '100%',
    maxWidth: 650,
    alignSelf: 'center',
  },
  demoCard: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FFE0B2',
    marginBottom: 12,
    borderRadius: 12,
  },
  demoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0EAEB',
  },
  cardContent: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  boldText: {
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#FFFFFF',
  },
  sloganInput: {
    minHeight: 64,
  },
  sloganContent: {
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  slabGuideBox: {
    backgroundColor: '#F8FAFB',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0EAEB',
    marginTop: 4,
  },
  slabChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D7DE',
    alignItems: 'center',
  },
  slabRateText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#212121',
  },
  slabNoteText: {
    fontSize: 9,
    color: '#666666',
  },
  printerWidthCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  receiptPreviewBox: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0EAEB',
    backgroundColor: '#F8FAFB',
    padding: 12,
  },
  receiptPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  receiptPreviewTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#576061',
    letterSpacing: 0.3,
  },
  receiptPaper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    alignItems: 'center',
  },
  receiptPaperStoreName: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  receiptPaperAddress: {
    fontSize: 12,
    color: '#4B5563',
    textAlign: 'center',
    marginTop: 2,
  },
  receiptPaperContact: {
    fontSize: 11,
    color: '#4B5563',
    textAlign: 'center',
    marginTop: 1,
  },
  receiptPaperSlogan: {
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
    color: '#374151',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
    lineHeight: 18,
  },
  receiptPaperPowered: {
    fontSize: 10,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 2,
  },
  receiptDashedLine: {
    width: '100%',
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    borderStyle: 'dashed',
    marginVertical: 6,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F8FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0EAEB',
    paddingVertical: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#157F92',
  },
  statLabel: {
    fontSize: 12,
    color: '#576061',
    marginTop: 2,
    fontWeight: '500',
  },
  securityBulletList: {
    gap: 10,
    marginVertical: 4,
  },
  securityBulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  securityBulletText: {
    fontSize: 13,
    color: '#424242',
    flex: 1,
    lineHeight: 18,
  },
  hubBtn: {
    borderRadius: 12,
    marginTop: 6,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
    gap: 8,
  },
  diagLabel: {
    fontSize: 13,
    color: '#576061',
    flexShrink: 0,
  },
  diagValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
    textAlign: 'right',
  },
  fixedBottomContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E0EAEB',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  fixedBottomInner: {
    width: '100%',
    maxWidth: 650,
    alignSelf: 'center',
  },
  saveBtn: {
    borderRadius: 12,
  },
  saveBtnContent: {
    height: 48,
  },
  saveBtnLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  fixedBottomHint: {
    fontSize: 11,
    color: '#78909C',
    textAlign: 'center',
    marginTop: 6,
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
  dialog: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    maxWidth: 500,
    width: '92%',
    alignSelf: 'center',
  },
  transferDetailsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 8,
  },
  transferInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 3,
  },
  transferInfoLabel: {
    fontSize: 13,
    color: '#576061',
    flexShrink: 0,
    maxWidth: '45%',
  },
  transferInfoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    textAlign: 'right',
  },
  transferMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 2,
  },
  transferMetricChip: {
    backgroundColor: '#EDF2F7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  transferMetricChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  transferSequenceBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A5D6A7',
    padding: 10,
    gap: 4,
    marginTop: 2,
  },
  transferSequenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  transferSequenceLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1B5E20',
    flexShrink: 0,
  },
  transferSequenceValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  transferSequenceCaption: {
    fontSize: 10,
    color: '#2E7D32',
  },
  dialogInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 3,
  },
  dialogInfoLabel: {
    fontSize: 13,
    color: '#455A64',
    fontWeight: '600',
    flexShrink: 0,
    maxWidth: '45%',
  },
  dialogInfoValue: {
    fontSize: 13,
    color: '#263238',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  testQrBox: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});
