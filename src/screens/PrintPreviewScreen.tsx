import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, ScrollView, Alert, Platform, useWindowDimensions, Image } from 'react-native';
import { Text, Button, Card, Portal, Dialog, ActivityIndicator, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getInvoiceById, getInvoiceItems } from '../db/operations';
import { formatThermalReceipt, wrapText } from '../services/printService';
import { useBilling } from '../context/BillingContext';
import { InvoiceItem } from '../db/types';
import {
  buildUpiPaymentUri,
  getQrMatrix,
  convertQrMatrixToEscPosRaster,
  convertImageBase64ToEscPosRaster,
  uint8ArrayToBase64,
} from '../utils/receiptBrandingService';

export const PrintPreviewScreen = ({ route, navigation }: any) => {
  const { invoiceId, invoice: paramInvoice, items: paramItems } = route.params || {};
  const theme = useTheme() as any;
  const { organization, customers, connectedPrinter, printReceipt, printReceiptAsImage } = useBilling();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [invoice, setInvoice] = useState<any>(paramInvoice || null);
  const [items, setItems] = useState<InvoiceItem[]>(paramItems || []);
  const [loading, setLoading] = useState(true);
  const [receiptText, setReceiptText] = useState('');

  // Print simulation states
  const [printStatus, setPrintStatus] = useState<'idle' | 'connecting' | 'printing' | 'success'>('idle');

  const upiUri = useMemo(() => {
    if (!organization?.showUpiQrOnBill || !organization?.upiId || !invoice) return '';
    return buildUpiPaymentUri({
      upiId: organization.upiId,
      payeeName: organization.upiPayeeName || organization.name,
      amount: invoice.grandTotal || 0,
      invoiceNumber: invoice.invoiceNumber,
    });
  }, [organization?.showUpiQrOnBill, organization?.upiId, organization?.upiPayeeName, organization?.name, invoice]);

  const qrMatrix = useMemo(() => {
    if (!upiUri) return [];
    return getQrMatrix(upiUri);
  }, [upiUri]);

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
      setPrintStatus('printing');
      const is80mm = organization.printWidth === '80mm';
      const paperDots = is80mm ? 576 : 384;
      const width = is80mm ? 48 : 32;
      const orgName = (organization?.name || 'STORE').toUpperCase();
      const orgNameLines = wrapText(orgName, width);
      const orgTitleLineCount = Math.max(1, orgNameLines.length);

      let logoRasterBase64 = '';
      if (organization.showLogoOnBill && organization.logoBase64) {
        logoRasterBase64 = await convertImageBase64ToEscPosRaster(organization.logoBase64, paperDots);
      }

      let qrRasterBase64 = '';
      if (organization.showUpiQrOnBill && organization.upiId && qrMatrix.length > 0) {
        const qrBytes = convertQrMatrixToEscPosRaster(qrMatrix, paperDots);
        qrRasterBase64 = uint8ArrayToBase64(qrBytes);
      }

      const success = await printReceipt(receiptText, navigation, {
        logoRasterBase64,
        qrRasterBase64,
        titleLineCount: orgTitleLineCount,
      });

      if (success) {
        setPrintStatus('success');
      } else {
        setPrintStatus('idle');
      }
    } catch (e) {
      setPrintStatus('idle');
    }
  };

  const handlePrintAsImage = async () => {
    try {
      setPrintStatus('printing');
      const is80mm = organization.printWidth === '80mm';
      const paperDots = is80mm ? 576 : 384;
      const width = is80mm ? 48 : 32;
      const orgName = (organization?.name || 'STORE').toUpperCase();
      const orgNameLines = wrapText(orgName, width);
      const orgTitleLineCount = Math.max(1, orgNameLines.length);

      let logoRasterBase64 = '';
      if (organization.showLogoOnBill && organization.logoBase64) {
        logoRasterBase64 = await convertImageBase64ToEscPosRaster(organization.logoBase64, paperDots);
      }

      const success = await printReceiptAsImage(receiptText, navigation, {
        logoRasterBase64,
        qrMatrix: organization.showUpiQrOnBill && organization.upiId && qrMatrix.length > 0 ? qrMatrix : undefined,
        titleLineCount: orgTitleLineCount,
      });

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
  const is80mmWidth = organization.printWidth === '80mm' ? 48 : 32;
  const currentOrgName = (organization?.name || 'STORE').toUpperCase();
  const currentOrgNameLines = wrapText(currentOrgName, is80mmWidth);
  const previewTitleLineCount = Math.max(1, currentOrgNameLines.length);

  const receiptLines = sanitizedReceiptText.split('\n');
  const orgTitleLines = receiptLines.slice(0, previewTitleLineCount);
  const remainingLines = receiptLines.slice(previewTitleLineCount);
  const titleFontSize = Math.max(18, Math.round(fontSize * 1.75));

  return (
    <View style={[styles.container, { backgroundColor: '#333333' }]}>
      <Text style={styles.titleText}>Receipt Print Preview ({organization.printWidth || '58mm'})</Text>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Realistic receipt paper representation */}
        <View style={[styles.receiptPaper, { width: paperWidth }]}>
          {/* Top Zig Zag tear indicator */}
          <View style={styles.tearIndicator} />

          {/* Organization Logo (if enabled and set) */}
          {organization.showLogoOnBill && organization.logoBase64 ? (
            <View style={styles.logoContainer}>
              <Image
                source={{
                  uri: organization.logoBase64.startsWith('data:')
                    ? organization.logoBase64
                    : `data:image/png;base64,${organization.logoBase64}`,
                }}
                style={[
                  styles.logoImage,
                  { width: is80mm ? 270 : 210, height: is80mm ? 95 : 80 },
                ]}
                resizeMode="contain"
              />
            </View>
          ) : null}

          {/* Prominent Extra Bold Title Organization Header */}
          <View style={styles.orgTitleContainer}>
            {orgTitleLines.map((tLine, tIdx) => (
              <Text
                key={tIdx}
                style={[
                  styles.orgTitleHeader,
                  {
                    fontSize: titleFontSize,
                    lineHeight: Math.round(titleFontSize * 1.25),
                  },
                ]}
              >
                {tLine.trim()}
              </Text>
            ))}
          </View>

          {/* Remaining structured receipt content with bold highlights & QR code */}
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

            // Replace plain text QR marker with visual scannable QR Code block
            if (line.includes('[ UPI SCAN & PAY ]')) {
              return (
                <View key={index} style={styles.qrContainer}>
                  {qrMatrix.length > 0 ? (
                    <View style={styles.qrBox}>
                      {qrMatrix.map((row, rIdx) => (
                        <View key={rIdx} style={{ flexDirection: 'row', height: 3.5 }}>
                          {row.map((isDark, cIdx) => (
                            <View
                              key={cIdx}
                              style={{
                                width: 3.5,
                                height: 3.5,
                                backgroundColor: isDark ? '#000000' : '#ffffff',
                              }}
                            />
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            }

            // Omit redundant lines that are already handled or shouldn't be printed as text
            if (
              organization.showUpiQrOnBill &&
              (line.includes('Scan & Pay Exact:') ||
                line.includes('UPI ID:') ||
                (organization.upiPayeeName && line.trim() === organization.upiPayeeName.trim()))
            ) {
              return null;
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
          compact
          style={styles.closeBtn}
          contentStyle={styles.closeBtnContent}
          labelStyle={styles.closeBtnLabel}
          onPress={() => navigation.goBack()}
        >
          Close
        </Button>
        <Button
          mode="outlined"
          icon="printer"
          compact
          style={styles.printBtn}
          contentStyle={styles.actionBtnContent}
          labelStyle={styles.actionBtnLabel}
          onPress={handlePrint}
        >
          Print
        </Button>
        <Button
          mode="contained"
          icon="image"
          compact
          style={styles.printImageBtn}
          contentStyle={styles.actionBtnContent}
          labelStyle={styles.actionBtnLabel}
          onPress={handlePrintAsImage}
        >
          Print as Image
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
  orgTitleContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  orgTitleHeader: {
    fontFamily: Platform.OS === 'ios' ? 'Courier-Bold' : 'monospace',
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#000000',
    letterSpacing: 1,
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 8,
  },
  closeBtn: {
    minWidth: 56,
    borderRadius: 8,
    borderWidth: 1,
  },
  closeBtnContent: {
    height: 40,
    paddingHorizontal: 4,
  },
  closeBtnLabel: {
    fontSize: 12,
    marginHorizontal: 2,
  },
  printBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
  },
  printImageBtn: {
    flex: 1.35,
    borderRadius: 8,
  },
  actionBtnContent: {
    height: 40,
    paddingHorizontal: 0,
  },
  actionBtnLabel: {
    fontSize: 12,
    marginHorizontal: 2,
  },
  dialogContent: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  centerAlign: {
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  logoImage: {
    width: 210,
    height: 80,
  },
  qrContainer: {
    alignItems: 'center',
    marginVertical: 6,
  },
  qrHeaderTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#555555',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: 2,
  },
  qrAmountText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#111111',
    marginTop: 6,
  },
  qrUpiIdText: {
    fontSize: 11,
    color: '#555555',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
