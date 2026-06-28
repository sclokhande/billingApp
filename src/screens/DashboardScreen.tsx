import React from 'react';
import { StyleSheet, View, ScrollView, FlatList, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Text, Card, Button, useTheme, Chip, Divider, Avatar } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

export const DashboardScreen = ({ navigation }: any) => {
  const theme = useTheme() as any;
  const { invoices, organization, dbMode } = useBilling();
  const { width } = useWindowDimensions();

  const isSmallScreen = width < 360;

  // Calculations
  const totalInvoices = invoices.length;
  const totalSales = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const collectedAmount = invoices
    .filter((inv) => inv.paymentStatus === 'Paid')
    .reduce((sum, inv) => sum + inv.grandTotal, 0);
  const pendingAmount = invoices
    .filter((inv) => inv.paymentStatus === 'Unpaid')
    .reduce((sum, inv) => sum + inv.grandTotal, 0);

  const renderInvoiceItem = ({ item }: { item: any }) => {
    const isPaid = item.paymentStatus === 'Paid';
    const invoiceDate = new Date(item.date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: item.id })}
      >
        <Card style={styles.invoiceCard} mode="outlined">
          <Card.Content style={styles.invoiceCardContent}>
            <View style={styles.invoiceHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text variant="titleMedium" style={styles.boldText} numberOfLines={1}>
                  {item.invoiceNumber}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {invoiceDate} • {item.paymentMethod}
                </Text>
              </View>
              <Text variant="titleMedium" style={[styles.boldText, { color: theme.colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                {organization.currency} {item.grandTotal.toFixed(2)}
              </Text>
            </View>

            <Divider style={styles.cardDivider} />

            <View style={styles.invoiceFooter}>
              <Text variant="bodyMedium" numberOfLines={1} style={styles.customerText}>
                {item.customerName || 'Walk-in Customer'}
              </Text>
              <View
                style={{
                  height: 24,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isPaid ? theme.colors.success + '20' : theme.colors.warning + '20',
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: 'bold',
                    color: isPaid ? theme.colors.success : theme.colors.warning,
                  }}
                >
                  {item.paymentStatus}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={{ width: '100%', maxWidth: 750, alignSelf: 'center', paddingHorizontal: width > 750 ? 16 : 0 }}>
        {/* Metrics Section */}
        <View style={styles.metricsContainer}>
          <Card style={[styles.mainMetricCard, { backgroundColor: theme.colors.primaryContainer }]}>
            <Card.Content style={styles.mainMetricContent}>
              <Avatar.Icon
                size={44}
                icon="cash-multiple"
                style={{ backgroundColor: theme.colors.primary }}
                color={theme.colors.onPrimary}
              />
              <View style={{ marginLeft: 16, flex: 1 }}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onPrimaryContainer }}>
                  Total Sales Revenue
                </Text>
                <Text
                  variant="headlineMedium"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.boldText, { color: theme.colors.onPrimaryContainer }]}
                >
                  {organization.currency} {totalSales.toFixed(2)}
                </Text>
              </View>
            </Card.Content>
          </Card>

          <View style={[styles.splitMetrics, { flexDirection: isSmallScreen ? 'column' : 'row' }]}>
            <Card style={[styles.subMetricCard, { flex: isSmallScreen ? undefined : 1, marginBottom: isSmallScreen ? 12 : 0 }]}>
              <Card.Content>
                <View style={styles.row}>
                  <MaterialCommunityIcons name="check-circle" color={theme.colors.success} size={20} />
                  <Text variant="bodySmall" style={{ marginLeft: 6, color: theme.colors.onSurfaceVariant }}>
                    Collected
                  </Text>
                </View>
                <Text
                  variant="titleLarge"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.boldText, { color: theme.colors.success, marginTop: 8 }]}
                >
                  {organization.currency} {collectedAmount.toFixed(2)}
                </Text>
              </Card.Content>
            </Card>

            <Card style={[styles.subMetricCard, { flex: isSmallScreen ? undefined : 1, marginLeft: isSmallScreen ? 0 : 12 }]}>
              <Card.Content>
                <View style={styles.row}>
                  <MaterialCommunityIcons name="clock-outline" color={theme.colors.warning} size={20} />
                  <Text variant="bodySmall" style={{ marginLeft: 6, color: theme.colors.onSurfaceVariant }}>
                    Outstanding
                  </Text>
                </View>
                <Text
                  variant="titleLarge"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.boldText, { color: theme.colors.warning, marginTop: 8 }]}
                >
                  {organization.currency} {pendingAmount.toFixed(2)}
                </Text>
              </Card.Content>
            </Card>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <Text variant="titleMedium" style={[styles.sectionTitle, styles.boldText]}>
            Quick Actions
          </Text>
          <View style={styles.actionsRow}>
            <Button
              mode="contained"
              icon="receipt"
              style={styles.actionBtn}
              onPress={() => navigation.navigate('Billing')}
            >
              New Invoice
            </Button>
            <Button
              mode="outlined"
              icon="package-variant-closed"
              style={styles.actionBtn}
              onPress={() => navigation.navigate('Inventory')}
            >
              Inventory
            </Button>
          </View>
        </View>

        {/* Recent Invoices List */}
        <View style={styles.recentInvoicesContainer}>
          <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
            <Text variant="titleMedium" style={[styles.boldText]}>
              Recent Invoices ({totalInvoices})
            </Text>
            {totalInvoices > 0 && (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.primary, fontWeight: 'bold' }}
                onPress={() => navigation.navigate('Billing')}
              >
                Create New
              </Text>
            )}
          </View>

          {totalInvoices === 0 ? (
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyCardContent}>
                <MaterialCommunityIcons name="receipt" size={48} color={theme.colors.outline} />
                <Text variant="titleMedium" style={{ marginTop: 12, color: theme.colors.onSurfaceVariant }}>
                  No invoices found
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 4 }}>
                  Get started by creating your first bill invoice today.
                </Text>
                <Button
                  mode="contained"
                  style={{ marginTop: 16 }}
                  onPress={() => navigation.navigate('Billing')}
                >
                  Create Invoice
                </Button>
              </Card.Content>
            </Card>
          ) : (
            <FlatList
              data={invoices.slice(0, 5)} // Show top 5 recent invoices
              renderItem={renderInvoiceItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false} // Since we are nested in ScrollView
              ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
            />
          )}
        </View>

        {/* Developer Attribution Footer */}
        <View style={styles.footerContainer}>
          <Text variant="labelMedium" style={styles.footerText}>
            Developed by Sushant Lokhande
          </Text>
        </View>
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  boldText: {
    fontWeight: 'bold',
  },
  dbIndicatorContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    alignItems: 'center',
  },
  dbChip: {
    borderRadius: 8,
  },
  metricsContainer: {
    padding: 16,
  },
  mainMetricCard: {
    borderRadius: 16,
    marginBottom: 12,
  },
  mainMetricContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  splitMetrics: {
    flexDirection: 'row',
  },
  subMetricCard: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  actionsContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 8,
  },
  recentInvoicesContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  invoiceCard: {
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  invoiceCardContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDivider: {
    marginVertical: 10,
  },
  invoiceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerText: {
    flex: 1,
    marginRight: 16,
    fontWeight: '500',
  },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  emptyCardContent: {
    alignItems: 'center',
    justifyContent: 'center',
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
