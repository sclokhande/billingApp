import React, { useState, useRef } from 'react';
import { StyleSheet, View, ScrollView, Alert, useWindowDimensions, Platform } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  IconButton,
  Portal,
  Dialog,
  Divider,
  useTheme,
  Chip,
  FAB,
} from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { generateInvoicesPdfReport, shareInvoicesPdfReport } from '../services/pdfReportService';
import { exportInvoicesToCsv, exportInvoicesToJson } from '../services/exportService';
import { parseInvoiceDate, isToday, formatInvoiceDateTime, sortInvoicesLatestFirst } from '../utils/dateUtils';

export const InvoiceHistoryScreen = ({ navigation }: any) => {
  const theme = useTheme() as any;
  const { invoices, customers, organization, getAllInvoiceItems, verifyPrinterConnectionOrRedirect } = useBilling();
  const { width } = useWindowDimensions();

  const scrollViewRef = useRef<ScrollView>(null);
  const [showGoToTop, setShowGoToTop] = useState(false);

  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [historyCustomerFilter, setHistoryCustomerFilter] = useState<string>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'Paid' | 'Unpaid'>('all');
  const [historyGstFilter, setHistoryGstFilter] = useState<'all' | 'gst' | 'nongst'>('all');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowGoToTop(offsetY > 150);
  };

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const hasActiveFilters = historyDateFilter !== 'all' || historyStatusFilter !== 'all' || historyGstFilter !== 'all';

  // Filtered invoices logic - strictly sorted latest first
  const filteredInvoices = React.useMemo(() => {
    const list = invoices.filter((inv) => {
      // 1. Search Query Filter (Invoice Number, Customer Name, Mobile Number)
      const q = historySearch.toLowerCase().trim();
      if (q) {
        const matchNum = (inv.invoiceNumber || '').toLowerCase().includes(q);
        const matchCust = (inv.customerName || '').toLowerCase().includes(q);
        const custObj = customers.find((c) => c.id === inv.customerId);
        const matchPhone = (custObj?.phone || '').includes(q);
        if (!matchNum && !matchCust && !matchPhone) {
          return false;
        }
      }

      // 2. Date Filter
      if (historyDateFilter !== 'all') {
        const invDate = parseInvoiceDate(inv.date);
        const today = new Date();
        if (historyDateFilter === 'today') {
          if (!isToday(inv.date)) return false;
        } else if (historyDateFilter === 'week') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(today.getDate() - 7);
          sevenDaysAgo.setHours(0, 0, 0, 0);
          if (invDate < sevenDaysAgo) return false;
        } else if (historyDateFilter === 'month') {
          const isSameMonth =
            invDate.getFullYear() === today.getFullYear() &&
            invDate.getMonth() === today.getMonth();
          if (!isSameMonth) return false;
        }
      }

      // 3. Customer Filter
      if (historyCustomerFilter !== 'all') {
        if (inv.customerId !== historyCustomerFilter) {
          return false;
        }
      }

      // 4. Payment Status Filter
      if (historyStatusFilter !== 'all') {
        if (inv.paymentStatus !== historyStatusFilter) {
          return false;
        }
      }

      // 5. GST Bill Type Filter ('all' | 'gst' | 'nongst')
      if (historyGstFilter !== 'all') {
        const tax = typeof inv.taxTotal === 'number' ? inv.taxTotal : parseFloat(inv.taxTotal as any) || 0;
        const cgst = typeof inv.cgstTotal === 'number' ? inv.cgstTotal : parseFloat(inv.cgstTotal as any) || 0;
        const sgst = typeof inv.sgstTotal === 'number' ? inv.sgstTotal : parseFloat(inv.sgstTotal as any) || 0;
        const hasTax = tax > 0 || (cgst + sgst) > 0;
        if (historyGstFilter === 'gst' && !hasTax) {
          return false;
        }
        if (historyGstFilter === 'nongst' && hasTax) {
          return false;
        }
      }

      return true;
    });

    return sortInvoicesLatestFirst(list);
  }, [invoices, historySearch, customers, historyDateFilter, historyCustomerFilter, historyStatusFilter, historyGstFilter]);

  const filteredTotalRevenue = filteredInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);

  const handleSharePdfReport = async (reportType: 'summary' | 'detailed' = 'summary') => {
    if (filteredInvoices.length === 0) {
      Alert.alert('Report Warning', 'No invoices available to share PDF report.');
      return;
    }
    try {
      const gstTag = historyGstFilter === 'gst' ? 'GST Bills' : historyGstFilter === 'nongst' ? 'Non-GST Bills' : 'All Bills';
      const dateTag = historyDateFilter === 'all' ? 'All Dates' : historyDateFilter.toUpperCase();
      const statusTag = historyStatusFilter === 'all' ? 'All Status' : historyStatusFilter.toUpperCase();
      const filterTitle = `Sales Report (${gstTag} • ${dateTag} • ${statusTag})`;
      await shareInvoicesPdfReport(organization, filteredInvoices, filterTitle, reportType);
    } catch (e: any) {
      console.warn('[InvoiceHistory] PDF Share error:', e);
      Alert.alert('Error', e?.message || 'Failed to share PDF report.');
    }
  };

  const handleExportInvoicesData = async (format: 'csv' | 'json') => {
    if (filteredInvoices.length === 0) {
      Alert.alert('Export Warning', 'No invoices available to export.');
      return;
    }
    try {
      let items: any[] = [];
      try {
        items = await getAllInvoiceItems();
      } catch (err) {
        items = [];
      }

      const result = format === 'csv'
        ? exportInvoicesToCsv(filteredInvoices, items, customers, historyGstFilter)
        : exportInvoicesToJson(filteredInvoices, items, customers, historyGstFilter);

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
    } catch (e: any) {
      if (e && e.message && !e.message.includes('User did not share') && !e.message.includes('CANCELLED')) {
        Alert.alert('Export Error', e?.message || 'Failed to export invoices.');
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: width > 700 ? 16 : 10, paddingTop: 10, paddingBottom: 80 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={{ width: '100%', maxWidth: 700, alignSelf: 'center', gap: 12 }}>
          {/* Search Bar + Filter Icon Row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              label="Search All Invoices"
              placeholder="Search by bill #, customer name, mobile..."
              value={historySearch}
              onChangeText={setHistorySearch}
              mode="outlined"
              left={<TextInput.Icon icon="magnify" />}
              right={historySearch ? <TextInput.Icon icon="close" onPress={() => setHistorySearch('')} /> : null}
              style={{ flex: 1, backgroundColor: theme.colors.surface }}
            />
            <IconButton
              icon={hasActiveFilters ? 'filter-check' : 'filter-variant'}
              mode={hasActiveFilters ? 'contained' : 'outlined'}
              iconColor={hasActiveFilters ? '#FFFFFF' : theme.colors.primary}
              containerColor={hasActiveFilters ? theme.colors.primary : undefined}
              size={26}
              onPress={() => setFilterModalVisible(true)}
              style={{ marginTop: 6 }}
            />
          </View>

          {/* Active Filter Chips Bar (if any filters active) */}
          {hasActiveFilters && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {historyDateFilter !== 'all' && (
                <Chip
                  icon="calendar"
                  onClose={() => setHistoryDateFilter('all')}
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                  textStyle={{ fontSize: 12, fontWeight: 'bold' }}
                >
                  {historyDateFilter === 'today' ? 'Today' : historyDateFilter === 'week' ? 'Past 7 Days' : 'This Month'}
                </Chip>
              )}
              {historyStatusFilter !== 'all' && (
                <Chip
                  icon="check-circle-outline"
                  onClose={() => setHistoryStatusFilter('all')}
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                  textStyle={{ fontSize: 12, fontWeight: 'bold' }}
                >
                  Status: {historyStatusFilter}
                </Chip>
              )}
              {historyGstFilter !== 'all' && (
                <Chip
                  icon="receipt-text-outline"
                  onClose={() => setHistoryGstFilter('all')}
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                  textStyle={{ fontSize: 12, fontWeight: 'bold' }}
                >
                  {historyGstFilter === 'gst' ? 'GST Bills Only' : 'Non-GST Only'}
                </Chip>
              )}
              <Button
                compact
                mode="text"
                onPress={() => {
                  setHistoryDateFilter('all');
                  setHistoryStatusFilter('all');
                  setHistoryGstFilter('all');
                }}
              >
                Clear Filters
              </Button>
            </View>
          )}

          {/* Compact Summary Bar */}
          <Card style={{ backgroundColor: theme.colors.primaryContainer, marginVertical: 2 }}>
            <Card.Content style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text variant="titleSmall" style={{ color: theme.colors.onPrimaryContainer, fontWeight: 'bold' }}>
                Matching: {filteredInvoices.length} Invoices {historyGstFilter === 'gst' ? '(GST Only)' : historyGstFilter === 'nongst' ? '(Non-GST Only)' : ''}
              </Text>
              <Text variant="titleMedium" style={{ color: theme.colors.onPrimaryContainer, fontWeight: 'bold' }}>
                Total: {organization.currency} {filteredTotalRevenue.toFixed(2)}
              </Text>
            </Card.Content>
          </Card>

          {/* Invoices History List */}
          {filteredInvoices.length === 0 ? (
            <Card style={styles.emptyCard} mode="outlined">
              <Card.Content style={styles.centerAlign}>
                <IconButton icon="file-search-outline" size={40} iconColor={theme.colors.outline} />
                <Text variant="titleMedium" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
                  No matching invoices found
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.outline, textAlign: 'center', marginTop: 4 }}>
                  Try adjusting your search terms or filter options.
                </Text>
              </Card.Content>
            </Card>
          ) : (
            filteredInvoices.map((inv) => {
              const isPaid = inv.paymentStatus === 'Paid';
              const dateStr = formatInvoiceDateTime(inv.date);

              return (
                <Card
                  key={inv.id}
                  style={[styles.card, { marginBottom: 8 }]}
                  mode="outlined"
                  onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: inv.id })}
                >
                  <Card.Content style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 4 }}>
                    {/* Row 1: Bill # + Customer Name | Amount */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 }}>
                        <Text variant="titleSmall" style={styles.boldText} numberOfLines={1}>
                          {inv.invoiceNumber}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                          • {inv.customerName || 'Walk-in'}
                        </Text>
                      </View>
                      <Text variant="titleMedium" style={[styles.boldText, { color: theme.colors.primary }]} numberOfLines={1}>
                        {organization.currency} {inv.grandTotal.toFixed(2)}
                      </Text>
                    </View>

                    {/* Row 2: Date + Status Badge | Icon Buttons */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Text variant="bodySmall" style={{ color: theme.colors.outline, fontSize: 11 }}>
                          {dateStr}
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
                            {inv.paymentStatus} ({inv.paymentMethod})
                          </Text>
                        </View>
                        {((inv.taxTotal || 0) > 0 || ((inv.cgstTotal || 0) + (inv.sgstTotal || 0)) > 0) ? (
                          <View
                            style={{
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                              borderRadius: 8,
                              backgroundColor: '#E8F5E9',
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#2E7D32' }}>
                              GST
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: -8, marginRight: -8 }}>
                        <IconButton
                          icon="eye-outline"
                          size={20}
                          iconColor={theme.colors.primary}
                          onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: inv.id })}
                        />
                        <IconButton
                          icon="printer-outline"
                          size={20}
                          iconColor={theme.colors.secondary || theme.colors.primary}
                          onPress={async () => {
                            const isReady = await verifyPrinterConnectionOrRedirect(navigation);
                            if (isReady) {
                              navigation.navigate('PrintPreview', { invoiceId: inv.id, invoice: inv });
                            }
                          }}
                        />
                      </View>
                    </View>
                  </Card.Content>
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Filter & PDF Reports Modal */}
      <Portal>
        <Dialog visible={filterModalVisible} onDismiss={() => setFilterModalVisible(false)} style={styles.dialog}>
          <Dialog.Title style={styles.boldText}>Filter Invoices & Reports</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 460, paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12, gap: 16 }}>
              {/* Filter by Date */}
              <View style={{ gap: 8 }}>
                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                  FILTER BY DATE
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { value: 'all', label: 'All Dates', icon: 'calendar-multiselect' },
                    { value: 'today', label: 'Today', icon: 'calendar-today' },
                    { value: 'week', label: 'Past 7 Days', icon: 'calendar-week' },
                    { value: 'month', label: 'This Month', icon: 'calendar-month' },
                  ].map((item) => {
                    const selected = historyDateFilter === item.value;
                    return (
                      <Chip
                        key={item.value}
                        selected={selected}
                        onPress={() => setHistoryDateFilter(item.value as any)}
                        icon={selected ? 'check-circle' : item.icon}
                        selectedColor="#FFFFFF"
                        style={{
                          backgroundColor: selected ? theme.colors.primary : '#F0F4F8',
                          borderColor: selected ? theme.colors.primary : '#D0D7DE',
                          borderWidth: selected ? 1.5 : 1,
                        }}
                        textStyle={{
                          fontWeight: 'bold',
                          fontSize: 13,
                          color: selected ? '#FFFFFF' : '#333333',
                        }}
                      >
                        {item.label}
                      </Chip>
                    );
                  })}
                </View>
              </View>

              <Divider />

              {/* Filter by Payment Status */}
              <View style={{ gap: 8 }}>
                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                  FILTER BY PAYMENT STATUS
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { value: 'all', label: 'All Status', icon: 'circle-outline' },
                    { value: 'Paid', label: 'Paid Only', icon: 'check-circle' },
                    { value: 'Unpaid', label: 'Unpaid Only', icon: 'clock-outline' },
                  ].map((item) => {
                    const selected = historyStatusFilter === item.value;
                    return (
                      <Chip
                        key={item.value}
                        selected={selected}
                        onPress={() => setHistoryStatusFilter(item.value as any)}
                        icon={selected ? 'check-circle' : item.icon}
                        selectedColor="#FFFFFF"
                        style={{
                          backgroundColor: selected ? theme.colors.primary : '#F0F4F8',
                          borderColor: selected ? theme.colors.primary : '#D0D7DE',
                          borderWidth: selected ? 1.5 : 1,
                        }}
                        textStyle={{
                          fontWeight: 'bold',
                          fontSize: 13,
                          color: selected ? '#FFFFFF' : '#333333',
                        }}
                      >
                        {item.label}
                      </Chip>
                    );
                  })}
                </View>
              </View>

              <Divider />

              {/* Filter by Bill Type (GST / Non-GST) */}
              <View style={{ gap: 8 }}>
                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                  FILTER BY BILL TYPE (GST / NON-GST)
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { value: 'all', label: 'All Bills', icon: 'file-document-outline' },
                    { value: 'gst', label: 'GST Bills Only', icon: 'receipt-text-check-outline' },
                    { value: 'nongst', label: 'Non-GST Only', icon: 'receipt-text-outline' },
                  ].map((item) => {
                    const selected = historyGstFilter === item.value;
                    return (
                      <Chip
                        key={item.value}
                        selected={selected}
                        onPress={() => setHistoryGstFilter(item.value as any)}
                        icon={selected ? 'check-circle' : item.icon}
                        selectedColor="#FFFFFF"
                        style={{
                          backgroundColor: selected ? theme.colors.primary : '#F0F4F8',
                          borderColor: selected ? theme.colors.primary : '#D0D7DE',
                          borderWidth: selected ? 1.5 : 1,
                        }}
                        textStyle={{
                          fontWeight: 'bold',
                          fontSize: 13,
                          color: selected ? '#FFFFFF' : '#333333',
                        }}
                      >
                        {item.label}
                      </Chip>
                    );
                  })}
                </View>
              </View>

              <Divider />

              {/* PDF Reports Options */}
              <View style={{ gap: 10 }}>
                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                  EXPORT & SHARE PDF SALES REPORTS
                </Text>

                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Share PDF sales reports filtered by date, payment status, and GST type ({filteredInvoices.length} matching invoices).
                </Text>

                <View style={{ flexDirection: width < 420 ? 'column' : 'row', gap: 8 }}>
                  <Button
                    mode="contained"
                    icon="share-variant-outline"
                    onPress={() => {
                      setFilterModalVisible(false);
                      handleSharePdfReport('summary');
                    }}
                    style={{ flex: width < 420 ? undefined : 1, borderRadius: 8 }}
                    labelStyle={{ fontSize: 12, marginVertical: 6 }}
                    compact
                  >
                    Share Summary PDF
                  </Button>
                  <Button
                    mode="contained"
                    icon="file-table-outline"
                    onPress={() => {
                      setFilterModalVisible(false);
                      handleSharePdfReport('detailed');
                    }}
                    style={{ flex: width < 420 ? undefined : 1, borderRadius: 8 }}
                    labelStyle={{ fontSize: 12, marginVertical: 6 }}
                    compact
                  >
                    Share Itemized PDF
                  </Button>
                </View>

                <Divider style={{ marginVertical: 4 }} />

                {/* CSV / JSON Invoices Export */}
                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                  EXPORT INVOICES DATA (CSV / JSON)
                </Text>

                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Export matching {filteredInvoices.length} invoices as spreadsheet-ready CSV or structured JSON.
                </Text>

                <View style={{ flexDirection: width < 420 ? 'column' : 'row', gap: 8 }}>
                  <Button
                    mode="contained-tonal"
                    icon="file-delimited"
                    onPress={() => {
                      setFilterModalVisible(false);
                      handleExportInvoicesData('csv');
                    }}
                    style={{ flex: width < 420 ? undefined : 1, borderRadius: 8 }}
                    labelStyle={{ fontSize: 12, marginVertical: 6 }}
                    compact
                  >
                    Export CSV (.csv)
                  </Button>
                  <Button
                    mode="contained-tonal"
                    icon="code-json"
                    onPress={() => {
                      setFilterModalVisible(false);
                      handleExportInvoicesData('json');
                    }}
                    style={{ flex: width < 420 ? undefined : 1, borderRadius: 8 }}
                    labelStyle={{ fontSize: 12, marginVertical: 6 }}
                    compact
                  >
                    Export JSON (.json)
                  </Button>
                </View>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setHistoryDateFilter('all');
                setHistoryStatusFilter('all');
                setHistoryGstFilter('all');
              }}
            >
              Clear Filters
            </Button>
            <Button mode="contained" onPress={() => setFilterModalVisible(false)}>
              Done
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Floating Go To Top Button */}
      {showGoToTop && (
        <FAB
          icon="arrow-up"
          style={styles.goToTopFab}
          color="#FFFFFF"
          onPress={scrollToTop}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginVertical: 12,
  },
  centerAlign: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  boldText: {
    fontWeight: 'bold',
  },
  dialog: {
    borderRadius: 12,
  },
  goToTopFab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    borderRadius: 28,
  },
});
