import React, { useState } from 'react';
import { StyleSheet, View, ScrollView, FlatList, TouchableOpacity, useWindowDimensions, Platform, Linking, Alert } from 'react-native';
import { Text, Card, Button, useTheme, Chip, Divider, Avatar, IconButton, Portal, Dialog, FAB } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { generateInvoicesPdfReport, shareInvoicesPdfReport } from '../services/pdfReportService';

export const DashboardScreen = ({ navigation }: any) => {
  const theme = useTheme() as any;
  const { invoices, organization, dbMode, verifyPrinterConnectionOrRedirect } = useBilling();
  const { width } = useWindowDimensions();

  const isSmallScreen = width < 360;

  // Help & Support dialog state
  const [helpVisible, setHelpVisible] = useState(false);

  // Set Help Icon in Header Right Dynamically
  React.useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="help-circle-outline"
          iconColor={theme.colors.onPrimary}
          size={24}
          onPress={() => setHelpVisible(true)}
          style={{ marginRight: 8 }}
        />
      ),
    });
  }, [navigation, theme]);

  const handleCallSupport = () => {
    const phoneNumber = '+918149730773';
    const url = Platform.OS === 'android' ? `tel:${phoneNumber}` : `telprompt:${phoneNumber}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('Error', 'Phone dialer is not supported on this device.');
        }
      })
      .catch(() => Alert.alert('Error', 'An error occurred while calling.'));
  };

  const handleEmailSupport = () => {
    const email = 'support@parchiwala.com';
    const subject = encodeURIComponent('Parchiwala App Query');
    const url = `mailto:${email}?subject=${subject}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('Error', 'Email app is not supported on this device.');
        }
      })
      .catch(() => Alert.alert('Error', 'An error occurred while opening email.'));
  };

  // Helper to check if date matches today
  const isToday = (dateStr: string) => {
    if (!dateStr) return false;
    const invDate = new Date(dateStr);
    const today = new Date();
    return (
      invDate.getFullYear() === today.getFullYear() &&
      invDate.getMonth() === today.getMonth() &&
      invDate.getDate() === today.getDate()
    );
  };

  // Calculations for Today's Invoices ONLY
  const todayInvoices = invoices.filter((inv) => isToday(inv.date));
  const totalTodayInvoices = todayInvoices.length;
  const todaySales = todayInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const todayCollected = todayInvoices
    .filter((inv) => inv.paymentStatus === 'Paid')
    .reduce((sum, inv) => sum + inv.grandTotal, 0);
  const todayPending = todayInvoices
    .filter((inv) => inv.paymentStatus === 'Unpaid')
    .reduce((sum, inv) => sum + inv.grandTotal, 0);

  // Calculations for ALL-TIME Total Metrics
  const totalSalesAllTime = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalCollectedAllTime = invoices
    .filter((inv) => inv.paymentStatus === 'Paid')
    .reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalPendingAllTime = invoices
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
      <Card
        key={item.id}
        style={[styles.invoiceCard, { marginBottom: 8 }]}
        mode="outlined"
        onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: item.id })}
      >
        <Card.Content style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 4 }}>
          {/* Row 1: Bill # + Customer Name | Amount */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 }}>
              <Text variant="titleSmall" style={styles.boldText} numberOfLines={1}>
                {item.invoiceNumber}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                • {item.customerName || 'Walk-in'}
              </Text>
            </View>
            <Text variant="titleMedium" style={[styles.boldText, { color: theme.colors.primary }]} numberOfLines={1}>
              {organization.currency} {item.grandTotal.toFixed(2)}
            </Text>
          </View>

          {/* Row 2: Date + Status Badge | Icon Buttons */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.outline, fontSize: 11 }}>
                {invoiceDate}
              </Text>
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 8,
                  backgroundColor: isPaid ? theme.colors.success + '20' : theme.colors.warning + '20',
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: isPaid ? theme.colors.success : theme.colors.warning }}>
                  {item.paymentStatus} ({item.paymentMethod})
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: -8, marginRight: -8 }}>
              <IconButton
                icon="eye-outline"
                size={20}
                iconColor={theme.colors.primary}
                onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: item.id })}
              />
              <IconButton
                icon="printer-outline"
                size={20}
                iconColor={theme.colors.secondary || theme.colors.primary}
                onPress={async () => {
                  const isReady = await verifyPrinterConnectionOrRedirect(navigation);
                  if (isReady) {
                    navigation.navigate('PrintPreview', { invoiceId: item.id, invoice: item });
                  }
                }}
              />
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  // Scroll to top states and ref
  const scrollViewRef = React.useRef<ScrollView>(null);
  const [showGoToTop, setShowGoToTop] = useState(false);

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    if (offsetY > 150) {
      if (!showGoToTop) setShowGoToTop(true);
    } else {
      if (showGoToTop) setShowGoToTop(false);
    }
  };

  const cardWidth = Math.min(width - 32, 700);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        ref={scrollViewRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.container}
      >
      <View style={{ width: '100%', maxWidth: 750, alignSelf: 'center' }}>
        {/* Metrics Section (Horizontal Scroll for Today vs All-Time Total) */}
        <View style={styles.metricsContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 16 }}>
            <Text variant="labelMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
              Overview Metrics
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
              Swipe for Total 👉
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={cardWidth + 16}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}
          >
            {/* Card Block 1: Today's Metrics */}
            <View style={{ width: cardWidth }}>
              {/* Revenue Header Banner */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primaryContainer, padding: 12, borderRadius: 12, marginBottom: 10 }}>
                <Avatar.Icon
                  size={40}
                  icon="cash-multiple"
                  style={{ backgroundColor: theme.colors.primary }}
                  color={theme.colors.onPrimary}
                />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: 'bold', letterSpacing: 0.5 }}>
                    TODAY'S SALES REVENUE
                  </Text>
                  <Text
                    variant="headlineSmall"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={[styles.boldText, { color: theme.colors.onPrimaryContainer, marginTop: 2 }]}
                  >
                    {organization.currency} {todaySales.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Sub Metrics Row */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, backgroundColor: theme.colors.success + '15', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.success + '30' }}>
                  <View style={styles.row}>
                    <MaterialCommunityIcons name="check-circle" color={theme.colors.success} size={18} />
                    <Text variant="labelMedium" style={{ marginLeft: 6, color: theme.colors.success, fontWeight: 'bold' }}>
                      Collected
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 22, fontWeight: 'bold', color: theme.colors.success, marginTop: 4 }}
                  >
                    {organization.currency} {todayCollected.toFixed(2)}
                  </Text>
                </View>

                <View style={{ flex: 1, backgroundColor: theme.colors.warning + '15', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.warning + '30' }}>
                  <View style={styles.row}>
                    <MaterialCommunityIcons name="clock-outline" color={theme.colors.warning} size={18} />
                    <Text variant="labelMedium" style={{ marginLeft: 6, color: theme.colors.warning, fontWeight: 'bold' }}>
                      Outstanding
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 22, fontWeight: 'bold', color: theme.colors.warning, marginTop: 4 }}
                  >
                    {organization.currency} {todayPending.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Card Block 2: All-Time Total Metrics */}
            <View style={{ width: cardWidth }}>
              {/* Revenue Header Banner */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.secondaryContainer, padding: 12, borderRadius: 12, marginBottom: 10 }}>
                <Avatar.Icon
                  size={40}
                  icon="finance"
                  style={{ backgroundColor: theme.colors.secondary }}
                  color={theme.colors.onSecondary}
                />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.secondary, fontWeight: 'bold', letterSpacing: 0.5 }}>
                    TOTAL REVENUE (ALL-TIME)
                  </Text>
                  <Text
                    variant="headlineSmall"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={[styles.boldText, { color: theme.colors.onSecondaryContainer, marginTop: 2 }]}
                  >
                    {organization.currency} {totalSalesAllTime.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Sub Metrics Row */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, backgroundColor: theme.colors.success + '15', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.success + '30' }}>
                  <View style={styles.row}>
                    <MaterialCommunityIcons name="check-circle" color={theme.colors.success} size={18} />
                    <Text variant="labelMedium" style={{ marginLeft: 6, color: theme.colors.success, fontWeight: 'bold' }}>
                      Total Collected
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 22, fontWeight: 'bold', color: theme.colors.success, marginTop: 4 }}
                  >
                    {organization.currency} {totalCollectedAllTime.toFixed(2)}
                  </Text>
                </View>

                <View style={{ flex: 1, backgroundColor: theme.colors.warning + '15', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.warning + '30' }}>
                  <View style={styles.row}>
                    <MaterialCommunityIcons name="clock-outline" color={theme.colors.warning} size={18} />
                    <Text variant="labelMedium" style={{ marginLeft: 6, color: theme.colors.warning, fontWeight: 'bold' }}>
                      Total Outstanding
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 22, fontWeight: 'bold', color: theme.colors.warning, marginTop: 4 }}
                  >
                    {organization.currency} {totalPendingAllTime.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
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

        {/* Today's Invoices List */}
        <View style={styles.recentInvoicesContainer}>
          <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
            <Text variant="titleMedium" style={[styles.boldText]}>
              Today's Invoices ({totalTodayInvoices})
            </Text>
            {totalTodayInvoices > 0 && (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.primary, fontWeight: 'bold' }}
                onPress={() => navigation.navigate('Billing')}
              >
                Create New
              </Text>
            )}
          </View>

          {totalTodayInvoices === 0 ? (
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyCardContent}>
                <MaterialCommunityIcons name="receipt" size={48} color={theme.colors.outline} />
                <Text variant="titleMedium" style={{ marginTop: 12, color: theme.colors.onSurfaceVariant }}>
                  No invoices created today
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
              data={todayInvoices} // Render all invoices created today to match count exactly
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

      {/* Help & Support Dialog */}
      <Portal>
        <Dialog visible={helpVisible} onDismiss={() => setHelpVisible(false)} style={styles.dialog}>
          <Dialog.Title style={styles.boldText}>Need Help?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: 16, color: theme.colors.onSurfaceVariant }}>
              If you have any queries, issues, or custom feature requests, please contact our support team.
            </Text>

            <TouchableOpacity
              style={[styles.contactRow, { backgroundColor: theme.colors.primaryContainer }]}
              onPress={handleCallSupport}
            >
              <Avatar.Icon size={36} icon="phone" style={{ backgroundColor: theme.colors.primary }} color={theme.colors.onPrimary} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer }}>Call Support</Text>
                <Text variant="titleMedium" style={[styles.boldText, { color: theme.colors.onPrimaryContainer }]}>+91 8149730773</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.contactRow, { backgroundColor: theme.colors.secondaryContainer, marginTop: 12 }]}
              onPress={handleEmailSupport}
            >
              <Avatar.Icon size={36} icon="email" style={{ backgroundColor: theme.colors.secondary }} color={theme.colors.onSecondary} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSecondaryContainer }}>Email Support</Text>
                <Text variant="titleMedium" style={[styles.boldText, { color: theme.colors.onSecondaryContainer }]}>support@parchiwala.com</Text>
              </View>
            </TouchableOpacity>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setHelpVisible(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Floating Go to Top Button */}
      {showGoToTop && (
        <FAB
          icon="arrow-up"
          label="Top"
          size="medium"
          onPress={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
          style={[styles.goToTopFab, { backgroundColor: theme.colors.primary }]}
          color={theme.colors.onPrimary}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  goToTopFab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    borderRadius: 28,
    elevation: 6,
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
    paddingVertical: 8,
  },
  mainMetricCard: {
    borderRadius: 14,
    marginBottom: 8,
  },
  mainMetricContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
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
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  dialog: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
});
