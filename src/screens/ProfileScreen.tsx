import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Alert,
  Platform,
  TouchableOpacity,
  KeyboardAvoidingView,
} from 'react-native';
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
  Avatar,
  ActivityIndicator,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useBilling } from '../context/BillingContext';
import { APP_CONFIG } from '../config/app_config';
import { formatTimeRemaining } from '../utils/printerLockManager';
import { formatInvoiceDateTime } from '../utils/dateUtils';

type TabCategory = 'profile' | 'tax' | 'printer' | 'security';

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
  } = useBilling();

  // Active Category Tab
  const [activeTab, setActiveTab] = useState<TabCategory>(
    route?.params?.initialTab || 'profile'
  );

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
      setPrintWidth((organization.printWidth as '58mm' | '80mm') || '58mm');
    }
  }, [organization]);

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
                    onPress={() => setPrintWidth(item.value as '58mm' | '80mm')}
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
              <Text style={styles.receiptPaperPowered}>
                Powered by Parchiwala POS
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

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
          <View style={styles.sectionHeader}>
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
              }}
              color={
                printerLockStatus?.isLocked
                  ? theme.colors.error
                  : '#2E7D32'
              }
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="titleMedium" style={styles.boldText}>
                  Printer Security Lock
                </Text>
                <View
                  style={{
                    backgroundColor: theme.colors.primaryContainer,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 12,
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
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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

          <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
            <Button
              mode="outlined"
              icon="printer-wireless"
              compact
              style={{ flex: 1, borderRadius: 8 }}
              onPress={() => navigation.navigate('PrinterConnect')}
            >
              {connectedPrinter ? 'Manage Printer' : 'Pair & Verify Printer'}
            </Button>
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
                <Text style={{ fontWeight: 'bold' }}>Security PIN Protection:</Text> Prevents unauthorized backup export, database restore, or record wipe.
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
        </View>
      </ScrollView>

      {/* Fixed Bottom Submit Button Container */}
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
    paddingVertical: 4,
  },
  diagLabel: {
    fontSize: 13,
    color: '#576061',
  },
  diagValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#212121',
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
});
