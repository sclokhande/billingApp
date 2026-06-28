import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { Text, Card, Button, Divider, ActivityIndicator, useTheme } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { getInvoiceById, getInvoiceItems } from '../db/operations';
import { InvoiceItem } from '../db/types';

export const InvoiceDetailScreen = ({ route, navigation }: any) => {
  const { invoiceId } = route.params;
  const theme = useTheme() as any;
  const { organization, deleteInvoice, updateInvoicePaymentStatus } = useBilling();
  const { width } = useWindowDimensions();

  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const inv = await getInvoiceById(invoiceId);
      const invoiceItems = await getInvoiceItems(invoiceId);
      setInvoice(inv);
      setItems(invoiceItems);
    } catch (e) {
      Alert.alert('Error', 'Failed to load invoice details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [invoiceId]);

  const handleDelete = () => {
    Alert.alert(
      'Delete Invoice',
      'Are you sure you want to permanently delete this invoice? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInvoice(invoiceId);
              navigation.goBack();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete invoice.');
            }
          },
        },
      ]
    );
  };

  const handleMarkAsPaid = () => {
    Alert.alert(
      'Mark as Paid',
      'Are you sure you want to update this invoice status to Paid?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Paid',
          onPress: async () => {
            try {
              await updateInvoicePaymentStatus(invoiceId, 'Paid');
              await fetchDetails();
            } catch (e) {
              Alert.alert('Error', 'Failed to update payment status.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text>Invoice not found.</Text>
      </View>
    );
  }

  const invoiceDate = new Date(invoice.date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={{ width: '100%', maxWidth: 650, alignSelf: 'center', padding: width > 650 ? 8 : 0 }}>
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            {/* Header Row */}
            <View style={styles.headerRow}>
              <View>
                <Text variant="headlineSmall" style={styles.boldText}>
                  {invoice.invoiceNumber}
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {invoiceDate}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: invoice.paymentStatus === 'Paid' ? theme.colors.success + '20' : theme.colors.warning + '20' }]}>
                <Text style={[styles.badgeText, { color: invoice.paymentStatus === 'Paid' ? theme.colors.success : theme.colors.warning }]}>
                  {invoice.paymentStatus.toUpperCase()}
                </Text>
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Org & Customer Details */}
            <View style={styles.metaRow}>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  BILLED BY
                </Text>
                <Text variant="bodyLarge" style={styles.boldText}>
                  {organization.name}
                </Text>
                {organization.gstNumber && organization.showGstOnBill && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    GSTIN: {organization.gstNumber}
                  </Text>
                )}
              </View>

              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  BILLED TO
                </Text>
                <Text variant="bodyLarge" style={styles.boldText}>
                  {invoice.customerName || 'Walk-in Customer'}
                </Text>
                {invoice.customerPhone && invoice.customerPhone !== '0000000000' && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {invoice.customerPhone}
                  </Text>
                )}
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Items Header */}
            <View style={[styles.row, { marginBottom: 8 }]}>
              <Text variant="titleMedium" style={styles.boldText}>Items List</Text>
            </View>

            {/* Items Map */}
            {items.map((item, index) => (
              <View key={item.id || index} style={styles.itemRow}>
                <View style={{ flex: 2 }}>
                  <Text variant="bodyLarge" style={styles.boldText}>
                    {item.name}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {item.quantity} {item.unit || 'Pcs'} @ {organization.currency}{item.price.toFixed(2)}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text variant="bodyLarge" style={styles.boldText}>
                    {organization.currency}{(item.price * item.quantity).toFixed(2)}
                  </Text>
                  {organization.showGstOnBill && item.taxRate > 0 && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      +{item.taxRate}% GST
                    </Text>
                  )}
                </View>
              </View>
            ))}

            <Divider style={styles.divider} />

            {/* Calculations */}
            <View style={styles.calcRow}>
              <Text variant="bodyMedium">Subtotal</Text>
              <Text variant="bodyMedium" numberOfLines={1} adjustsFontSizeToFit>{organization.currency}{invoice.subtotal.toFixed(2)}</Text>
            </View>

            {organization.showGstOnBill && invoice.taxTotal > 0 && (
              <>
                <View style={styles.calcRow}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    CGST (Central GST)
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1} adjustsFontSizeToFit>
                    {organization.currency}{invoice.cgstTotal.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.calcRow}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    SGST (State GST)
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1} adjustsFontSizeToFit>
                    {organization.currency}{invoice.sgstTotal.toFixed(2)}
                  </Text>
                </View>
              </>
            )}

            {invoice.discount > 0 && (
              <View style={styles.calcRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.error }}>Discount</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.error }} numberOfLines={1} adjustsFontSizeToFit>
                  -{organization.currency}{invoice.discount.toFixed(2)}
                </Text>
              </View>
            )}

            <Divider style={styles.divider} />

            <View style={styles.calcRow}>
              <Text variant="titleLarge" style={styles.boldText}>Grand Total</Text>
              <Text variant="titleLarge" style={[styles.boldText, { color: theme.colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                {organization.currency}{invoice.grandTotal.toFixed(2)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Buttons */}
        <View style={styles.actions}>
          {invoice.paymentStatus === 'Unpaid' && (
            <Button
              mode="contained"
              icon="cash-check"
              buttonColor={theme.colors.success}
              textColor="#FFF"
              onPress={handleMarkAsPaid}
              style={styles.btn}
            >
              Mark as Paid
            </Button>
          )}
          <Button
            mode="contained"
            icon="printer"
            onPress={() => navigation.navigate('PrintPreview', { invoiceId })}
            style={styles.btn}
          >
            Print
          </Button>
          <Button
            mode="outlined"
            icon="trash-can-outline"
            textColor={theme.colors.error}
            style={[styles.btn, { borderColor: theme.colors.error }]}
            onPress={handleDelete}
          >
            Delete Invoice
          </Button>
        </View>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boldText: {
    fontWeight: 'bold',
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeText: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  divider: {
    marginVertical: 14,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 6,
  },
  calcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  actions: {
    gap: 12,
    marginBottom: 20,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 6,
  },
});
