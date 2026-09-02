import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert, Platform, useWindowDimensions } from 'react-native';
import { Text, Button, Card, Portal, Dialog, ActivityIndicator, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getInvoiceById, getInvoiceItems } from '../db/operations';
import { formatThermalReceipt } from '../services/printService';
import { useBilling } from '../context/BillingContext';
import { InvoiceItem } from '../db/types';

export const PrintPreviewScreen = ({ route, navigation }: any) => {
  const { invoiceId, invoice: paramInvoice, items: paramItems } = route.params || {};
  const theme = useTheme() as any;
  const { organization, customers, connectedPrinter, printReceipt, isDemoMode } = useBilling();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [invoice, setInvoice] = useState<any>(paramInvoice || null);
  const [items, setItems] = useState<InvoiceItem[]>(paramItems || []);
  const [loading, setLoading] = useState(true);
  const [receiptText, setReceiptText] = useState('');

  // Print simulation states
  const [printStatus, setPrintStatus] = useState<'idle' | 'connecting' | 'printing' | 'success'>('idle');

  const fetchDetails = async () => {
    try {
      setLoading(true);
      let inv = paramInvoice || null;
      let invoiceItems = Array.isArray(paramItems) && paramItems.length > 0 ? paramItems : [];

      if (!inv && invoiceId) {
        inv = await getInvoiceById(invoiceId);
      }

      if ((!Array.isArray(invoiceItems) || invoiceItems.length === 0) && invoiceId) {
        invoiceItems = await getInvoiceItems(invoiceId);
      }

      setInvoice(inv);
      setItems(invoiceItems || []);

      if (inv) {
        const cust = customers.find((c) => c.id === inv.customerId) || null;
        const formatted = formatThermalReceipt(organization, cust, inv, invoiceItems || []);
        setReceiptText(formatted);
      }
    } catch (e) {
      console.error('[PrintPreviewScreen] Failed to load details:', e);
      Alert.alert('Error', 'Failed to load print preview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [invoiceId]);

  const handlePrint = async () => {
    try {
      const success = await printReceipt(receiptText, navigation);
      if (success) {
        setPrintStatus('success');
      } else {
        setPrintStatus('idle');
      }
    } catch (e) {
      setPrintStatus('idle');
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

  // Ensure currency displays as "Rs." in print preview
  const sanitizedReceiptText = (receiptText || '').replace(/₹/g, 'Rs.');

  // Separate top Org Name for bold title header rendering
  const receiptLines = sanitizedReceiptText.split('\n');
  const orgNameHeader = receiptLines.length > 0 ? receiptLines[0].trim() : (organization?.name || 'STORE').toUpperCase();
  const remainingLines = receiptLines.length > 1 ? receiptLines.slice(1) : [];
  const titleFontSize = Math.max(18, Math.round(fontSize * 1.75));

  return (
    <View style={[styles.container, { backgroundColor: '#333333' }]}>
      <Text style={styles.titleText}>Receipt Print Preview ({organization.printWidth || '58mm'})</Text>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Realistic receipt paper representation */}
        <View style={[styles.receiptPaper, { width: paperWidth }]}>
          {/* Top Zig Zag tear indicator */}
          <View style={styles.tearIndicator} />

          {/* Prominent Extra Bold Title Organization Header */}
          <Text
            style={[
              styles.orgTitleHeader,
              {
                fontSize: titleFontSize,
                lineHeight: Math.round(titleFontSize * 1.25),
              },
            ]}
          >
            {orgNameHeader}
          </Text>

          {/* Remaining structured receipt content with bold highlights */}
          {remainingLines.map((line, index) => {
            const isGrandTotal = line.includes('GRAND TOTAL') || (index > 0 && remainingLines[index - 1].includes('GRAND TOTAL'));
            if (isGrandTotal) {
              return (
                <Text
                  key={index}
                  style={[
                    styles.boldReceiptContent,
                    {
                      fontSize: Math.round(fontSize * 1.4),
                      lineHeight: Math.round(fontSize * 1.6),
                      letterSpacing: 0.5,
                    },
                  ]}
                >
                  {line}
                </Text>
              );
            }
            return (
              <Text key={index} style={[styles.receiptContent, { fontSize }]}>
                {line}
              </Text>
            );
          })}

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
          mode="contained"
          icon="printer"
          style={[styles.controlBtn, { flex: 1.5 }]}
          onPress={handlePrint}
          disabled={isDemoMode}
        >
          {isDemoMode ? 'Print (Disabled)' : 'Print'}
        </Button>
      </View>

      {/* Print Simulation Dialog */}
      <Portal>
        <Dialog visible={printStatus !== 'idle'} dismissable={true} onDismiss={() => setPrintStatus('idle')}>
          <Dialog.Title>
            {printStatus === 'connecting' && 'Connecting to Printer...'}
            {printStatus === 'printing' && 'Sending Print Command...'}
            {printStatus === 'success' && 'Print Complete'}
          </Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            {printStatus === 'connecting' && (
              <>
                <ActivityIndicator size="large" style={{ marginVertical: 12 }} color={theme.colors.primary} />
                <Text variant="bodyMedium">Connecting to Bluetooth thermal printer...</Text>
              </>
            )}
            {printStatus === 'printing' && (
              <>
                <ActivityIndicator size="large" style={{ marginVertical: 12 }} color={theme.colors.primary} />
                <Text variant="bodyMedium">Sending ESC/POS print payload...</Text>
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
            {printStatus !== 'success' && (
              <Button onPress={() => setPrintStatus('idle')}>Cancel</Button>
            )}
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
  boldReceiptContent: {
    fontFamily: Platform.OS === 'ios' ? 'Courier-Bold' : 'monospace',
    fontWeight: 'bold',
    lineHeight: 18,
    color: '#000000',
  },
  orgTitleHeader: {
    fontFamily: Platform.OS === 'ios' ? 'Courier-Bold' : 'monospace',
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#000000',
    marginBottom: 8,
    letterSpacing: 1,
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
