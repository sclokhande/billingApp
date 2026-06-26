import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert, Platform, Share, useWindowDimensions } from 'react-native';
import { Text, Button, Card, Portal, Dialog, ActivityIndicator, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getInvoiceById, getInvoiceItems } from '../db/operations';
import { formatThermalReceipt } from '../services/printService';
import { useBilling } from '../context/BillingContext';
import { InvoiceItem } from '../db/types';

export const PrintPreviewScreen = ({ route, navigation }: any) => {
  const { invoiceId } = route.params;
  const theme = useTheme() as any;
  const { organization, customers } = useBilling();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiptText, setReceiptText] = useState('');

  // Print simulation states
  const [printStatus, setPrintStatus] = useState<'idle' | 'connecting' | 'printing' | 'success'>('idle');

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const inv = await getInvoiceById(invoiceId);
      const invoiceItems = await getInvoiceItems(invoiceId);
      setInvoice(inv);
      setItems(invoiceItems);

      if (inv) {
        const cust = customers.find((c) => c.id === inv.customerId) || null;
        const formatted = formatThermalReceipt(organization, cust, inv, invoiceItems);
        setReceiptText(formatted);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load print preview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [invoiceId]);

  const handlePrint = () => {
    setPrintStatus('connecting');

    // Simulate Bluetooth printing connection & transmission
    setTimeout(() => {
      setPrintStatus('printing');
      
      // Log formatted payload to console for developer integration
      console.log('=== ESC/POS THERMAL PRINTER PAYLOAD ===');
      console.log(receiptText);
      console.log('=======================================');

      setTimeout(() => {
        setPrintStatus('success');
      }, 1500);
    }, 1000);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: receiptText,
        title: `Invoice ${invoice?.invoiceNumber || ''}`,
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to share receipt.');
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const is80mm = organization.printWidth === '80mm';
  const maxPaperWidth = screenWidth - 32; // 16dp padding on both sides
  
  let fontSize = is80mm ? 10 : 12.5;
  let charWidth = fontSize * 0.62; // Monospaced font aspect ratio with safety padding
  let paperWidth = charWidth * (is80mm ? 48 : 32) + 24; // text width + horizontal padding (12 * 2)

  // Scale down receipt preview if it's wider than the screen
  if (paperWidth > maxPaperWidth) {
    const scaleFactor = maxPaperWidth / paperWidth;
    fontSize = fontSize * scaleFactor;
    charWidth = charWidth * scaleFactor;
    paperWidth = charWidth * (is80mm ? 48 : 32) + 24;
  }

  return (
    <View style={[styles.container, { backgroundColor: '#333333' }]}>
      <Text style={styles.titleText}>Receipt Print Preview ({organization.printWidth || '58mm'})</Text>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Realistic receipt paper representation */}
        <View style={[styles.receiptPaper, { width: paperWidth }]}>
          {/* Top Zig Zag tear indicator */}
          <View style={styles.tearIndicator} />
          
          <Text style={[styles.receiptContent, { fontSize }]}>{receiptText}</Text>
          
          {/* Bottom Zig Zag tear indicator */}
          <View style={styles.tearIndicator} />
        </View>
      </ScrollView>

      {/* Control bar */}
      <View
        style={[
          styles.controlBar,
          {
            backgroundColor: theme.colors.surface,
            paddingBottom: Platform.OS === 'ios'
              ? (insets.bottom > 0 ? insets.bottom + 8 : 16)
              : Math.max(insets.bottom + 8, 16),
          },
        ]}
      >
        <Button
          mode="outlined"
          style={styles.controlBtn}
          onPress={() => navigation.goBack()}
        >
          Close
        </Button>
        <Button
          mode="contained-tonal"
          icon="share-variant"
          style={styles.controlBtn}
          onPress={handleShare}
        >
          Share
        </Button>
        <Button
          mode="contained"
          icon="printer"
          style={[styles.controlBtn, { flex: 1.2 }]}
          onPress={handlePrint}
        >
          Print
        </Button>
      </View>

      {/* Print Simulation Dialog */}
      <Portal>
        <Dialog visible={printStatus !== 'idle'} dismissable={printStatus === 'success'} onDismiss={() => setPrintStatus('idle')}>
          <Dialog.Title>
            {printStatus === 'connecting' && 'Connecting to Printer...'}
            {printStatus === 'printing' && 'Sending Print Command...'}
            {printStatus === 'success' && 'Print Complete'}
          </Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            {printStatus === 'connecting' && (
              <>
                <ActivityIndicator size="large" style={{ marginVertical: 12 }} />
                <Text variant="bodyMedium">Searching for paired Bluetooth thermal printers...</Text>
              </>
            )}
            {printStatus === 'printing' && (
              <>
                <ActivityIndicator size="large" style={{ marginVertical: 12 }} color={theme.colors.secondary} />
                <Text variant="bodyMedium">Formatting ESC/POS command sequences...</Text>
              </>
            )}
            {printStatus === 'success' && (
              <View style={styles.centerAlign}>
                <Text variant="headlineSmall" style={{ color: theme.colors.success, fontWeight: 'bold', marginVertical: 12 }}>
                  ✓ Success
                </Text>
                <Text variant="bodyMedium" style={{ textAlign: 'center' }}>
                  The receipt details have been sent successfully to the thermal printer.
                </Text>
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            {printStatus === 'success' && (
              <Button onPress={() => setPrintStatus('idle')}>OK</Button>
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    color: '#CCCCCC',
    textAlign: 'center',
    paddingTop: 16,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  scrollContent: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  receiptPaper: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 12,
    elevation: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  tearIndicator: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    marginVertical: 8,
  },
  receiptContent: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    lineHeight: 16,
    color: '#000000',
  },
  controlBar: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 12,
  },
  controlBtn: {
    flex: 1,
    borderRadius: 8,
  },
  dialogContent: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  centerAlign: {
    alignItems: 'center',
  },
});
