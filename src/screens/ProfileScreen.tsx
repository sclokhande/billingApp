import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert, Share, useWindowDimensions } from 'react-native';
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
  RadioButton,
} from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { seedDatabase } from '../db/operations';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

export const ProfileScreen = () => {
  const theme = useTheme() as any;
  const { organization, updateOrgProfile, clearAllData, clearInvoicesOnly, dbMode, exportData, importData, isLoading } = useBilling();
  const { width } = useWindowDimensions();

  // Form states
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [showGstOnBill, setShowGstOnBill] = useState(false);
  const [currency, setCurrency] = useState('₹');
  const [slogan, setSlogan] = useState('Thank You Visit again');
  const [printWidth, setPrintWidth] = useState<'58mm' | '80mm'>('58mm');

  // Export/Import states
  const [exportDialogVisible, setExportDialogVisible] = useState(false);
  const [importDialogVisible, setImportDialogVisible] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [importJson, setImportJson] = useState('');

  // Wipe Data states
  const [wipeDialogVisible, setWipeDialogVisible] = useState(false);
  const [wipeOption, setWipeOption] = useState<'invoices' | 'all'>('invoices');

  // Snackbar feedback
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Sync form states with database values on mount or organization update
  useEffect(() => {
    if (organization) {
      setName(organization.name || '');
      setAddress(organization.address || '');
      setPhone(organization.phone || '');
      setMobile(organization.mobile || '');
      setEmail(organization.email || '');
      setGstNumber(organization.gstNumber || '');
      setShowGstOnBill(!!organization.showGstOnBill);
      setCurrency(organization.currency || '₹');
      setSlogan(organization.slogan || 'Thank You Visit again');
      setPrintWidth((organization.printWidth as '58mm' | '80mm') || '58mm');
    }
  }, [organization]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Organization Name is required.');
      return;
    }
    if (!address.trim()) {
      Alert.alert('Validation Error', 'Organization Address is required.');
      return;
    }

    try {
      await updateOrgProfile({
        id: organization.id || 'default_org',
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
        gstNumber: gstNumber.trim(),
        showGstOnBill,
        currency: currency.trim() || '₹',
        slogan: slogan.trim(),
        printWidth,
      });
      
      setSnackbarMessage('Store profile updated successfully!');
      setSnackbarVisible(true);
    } catch (e) {
      Alert.alert('Error', 'Failed to update organization profile.');
    }
  };

  const handleExport = async () => {
    try {
      const dataStr = await exportData();
      setExportJson(dataStr);
      setExportDialogVisible(true);
    } catch (e) {
      Alert.alert('Error', 'Failed to export database.');
    }
  };

  const handleShareBackup = async () => {
    try {
      await Share.share({
        message: exportJson,
        title: 'Store Database Backup',
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to share backup file.');
    }
  };

  const handleImportSubmit = async () => {
    if (!importJson.trim()) {
      Alert.alert('Validation Error', 'Please paste the backup text.');
      return;
    }
    Alert.alert(
      'Confirm Import',
      'Importing this backup will overwrite your current database (products, customers, invoices). This cannot be undone. Do you want to proceed?',
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
              setSnackbarMessage('Database restored successfully!');
              setSnackbarVisible(true);
            } catch (e) {
              Alert.alert('Error', 'Failed to import backup. Please ensure the backup text is valid JSON.');
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
          <Text variant="titleMedium" style={styles.boldText}>
            Organization Details
          </Text>
          
          <TextInput
            label="Organization Name *"
            value={name}
            onChangeText={setName}
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="office-building" />}
          />

          <TextInput
            label="Billing Address *"
            value={address}
            onChangeText={setAddress}
            mode="outlined"
            multiline
            numberOfLines={2}
            style={styles.input}
            left={<TextInput.Icon icon="map-marker-outline" />}
          />

          <View style={styles.row}>
            <TextInput
              label="Landline Number"
              value={phone}
              onChangeText={setPhone}
              mode="outlined"
              style={[styles.input, { flex: 1 }]}
              left={<TextInput.Icon icon="phone" />}
            />
            <TextInput
              label="Mobile Number"
              value={mobile}
              onChangeText={setMobile}
              mode="outlined"
              style={[styles.input, { flex: 1, marginLeft: 8 }]}
              left={<TextInput.Icon icon="cellphone" />}
            />
          </View>

          <TextInput
            label="Email Address"
            value={email}
            onChangeText={setEmail}
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
            onPress={() => setShowGstOnBill(!showGstOnBill)}
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
            label="Preferred Currency Symbol"
            value={currency}
            editable={false}
            mode="outlined"
            style={styles.input}
            maxLength={3}
            left={<TextInput.Icon icon="currency-inr" />}
          />

          <TextInput
            label="Invoice Slogan"
            value={slogan}
            onChangeText={setSlogan}
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
          <SegmentedButtons
            value={printWidth}
            onValueChange={(val) => setPrintWidth(val as '58mm' | '80mm')}
            buttons={[
              {
                value: '58mm',
                label: '58mm (32 Chars)',
                style: styles.segmentedBtn,
              },
              {
                value: '80mm',
                label: '80mm (48 Chars)',
                style: styles.segmentedBtn,
              },
            ]}
          />

          <Button
            mode="contained"
            icon="content-save-outline"
            style={styles.saveBtn}
            onPress={handleSave}
          >
            Save Store Settings
          </Button>
        </Card.Content>
      </Card>

      {/* Database Backup & Restore Card */}
      <Card style={styles.card} mode="outlined">
        <Card.Content style={{ gap: 12 }}>
          <Text variant="titleMedium" style={styles.boldText}>
            Database Backup & Restore
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
            Export your entire database (products, customers, invoices) as a backup, or restore from a previously exported backup string.
          </Text>
          
          <View style={styles.row}>
            <Button
              mode="contained-tonal"
              icon="export"
              style={{ flex: 1 }}
              onPress={handleExport}
            >
              Export Data
            </Button>
            <Button
              mode="contained-tonal"
              icon="import"
              style={{ flex: 1, marginLeft: 8 }}
              onPress={() => setImportDialogVisible(true)}
            >
              Import Data
            </Button>
          </View>
        </Card.Content>
      </Card>

      <Button
        mode="outlined"
        icon="trash-can-outline"
        textColor={theme.colors.error}
        style={[styles.resetBtn, { borderColor: theme.colors.error, marginTop: 8 }]}
        onPress={handleResetData}
      >
        Wipe Database Records
      </Button>

      {/* Developer Attribution Footer */}
      <View style={styles.footerContainer}>
        <Text variant="labelMedium" style={styles.footerText}>
          App Developed by Sushant Lokhande
        </Text>
      </View>

      </View>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2500}
      >
        {snackbarMessage}
      </Snackbar>

      {/* Export Dialog */}
      <Portal>
        <Dialog visible={exportDialogVisible} onDismiss={() => setExportDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title>Database Export</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <Text variant="bodyMedium">
              Copy the backup string below or share it. You can paste this text to restore the database later.
            </Text>
            <TextInput
              value={exportJson}
              editable={false}
              multiline
              numberOfLines={6}
              selectTextOnFocus
              mode="outlined"
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handleShareBackup} icon="share-variant">
              Share Backup
            </Button>
            <Button onPress={() => setExportDialogVisible(false)}>
              Close
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Import Dialog */}
      <Portal>
        <Dialog visible={importDialogVisible} onDismiss={() => setImportDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title>Database Import</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <Text variant="bodyMedium">
              Paste your exported JSON database backup string below to restore all products, customers, and invoices.
            </Text>
            <TextInput
              placeholder="Paste backup JSON here..."
              value={importJson}
              onChangeText={setImportJson}
              multiline
              numberOfLines={6}
              mode="outlined"
              style={styles.dialogInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => { setImportDialogVisible(false); setImportJson(''); }}>
              Cancel
            </Button>
            <Button onPress={handleImportSubmit} icon="import" mode="contained">
              Restore Data
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Wipe Data Dialog */}
      <Portal>
        <Dialog visible={wipeDialogVisible} onDismiss={() => setWipeDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title style={{ color: theme.colors.error }}>Wipe Data Options</Dialog.Title>
          <Dialog.Content style={{ gap: 8 }}>
            <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
              Select which records to wipe from your device:
            </Text>
            
            <RadioButton.Group onValueChange={(value) => setWipeOption(value as 'invoices' | 'all')} value={wipeOption}>
              <View style={styles.radioRow}>
                <RadioButton value="invoices" color={theme.colors.error} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text variant="labelLarge" style={styles.boldText}>Only Invoices</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
                    Delete billing invoice and transaction history. Organization settings, products, and customers catalog are kept.
                  </Text>
                </View>
              </View>

              <Divider style={{ marginVertical: 12 }} />

              <View style={styles.radioRow}>
                <RadioButton value="all" color={theme.colors.error} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text variant="labelLarge" style={styles.boldText}>All (Wipe All Data)</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
                    Completely resets the application databases. Deletes invoices, products inventory, customer accounts, and settings.
                  </Text>
                </View>
              </View>
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setWipeDialogVisible(false)}>Cancel</Button>
            <Button 
              onPress={handleWipeProceed} 
              textColor={theme.colors.error} 
              mode="contained-tonal"
              style={{ borderRadius: 8 }}
            >
              Wipe Data
            </Button>
          </Dialog.Actions>
        </Dialog>
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
