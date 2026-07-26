import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, ScrollView, FlatList, Alert, useWindowDimensions, Platform } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  IconButton,
  Portal,
  Dialog,
  RadioButton,
  List,
  Divider,
  useTheme,
  HelperText,
  SegmentedButtons,
  ActivityIndicator,
  Snackbar,
  Menu,
  Chip,
  FAB,
} from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { Invoice, InvoiceItem, Customer, Product } from '../db/types';
import { generateInvoicesPdfReport, shareInvoicesPdfReport } from '../services/pdfReportService';

const getDeltaForUnit = (unitName: string, isDecrement: boolean) => {
  const u = (unitName || '').toLowerCase();
  const delta = (u === 'gm' || u === 'ml') ? 100 : (u === 'kg' || u === 'ltr' || u === 'litre' || u === 'meter' || u === 'yard') ? 0.5 : 1;
  return isDecrement ? -delta : delta;
};

const getPriceForUnit = (basePrice: number, baseUnit: string, targetUnit: string): number => {
  const bu = (baseUnit || 'Pcs').toLowerCase();
  const tu = (targetUnit || 'Pcs').toLowerCase();
  
  if (bu === tu) {
    return basePrice;
  }
  
  // KG to GM conversion
  if (bu === 'kg' && tu === 'gm') {
    return basePrice / 1000;
  }
  // GM to KG conversion
  if (bu === 'gm' && tu === 'kg') {
    return basePrice * 1000;
  }
  
  // Ltr to ML conversion
  if ((bu === 'ltr' || bu === 'litre') && tu === 'ml') {
    return basePrice / 1000;
  }
  // ML to Ltr conversion
  if (bu === 'ml' && (tu === 'ltr' || tu === 'litre')) {
    return basePrice * 1000;
  }
  
  return basePrice;
};

export const InvoiceBuilderScreen = ({ navigation }: any) => {
  const theme = useTheme() as any;
  const {
    customers,
    products,
    organization,
    createInvoice,
    invoices,
    isLoading,
    verifyPrinterConnectionOrRedirect,
  } = useBilling();

  // Selected customer & Items
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cart, setCart] = useState<Array<{
    product: Product;
    quantity: number;
    unit: string;
    price: number;
  }>>([]);
  const [discount, setDiscount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('UPI');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Unpaid'>('Paid');

  // Billing mode tab state: 'builder' (New Invoice) or 'history' (All Invoices History)
  const [activeTab, setActiveTab] = useState<'builder' | 'history'>('builder');

  // History Search & Filter states
  const historyScrollViewRef = useRef<ScrollView>(null);
  const [showGoToTop, setShowGoToTop] = useState(false);

  const handleHistoryScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    if (offsetY > 150) {
      setShowGoToTop(true);
    } else {
      setShowGoToTop(false);
    }
  };

  const scrollToTop = () => {
    historyScrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [historyCustomerFilter, setHistoryCustomerFilter] = useState<string>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'Paid' | 'Unpaid'>('all');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const hasActiveFilters = historyDateFilter !== 'all' || historyStatusFilter !== 'all';

  // Filtered invoices logic
  const filteredInvoices = invoices.filter((inv) => {
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
      const invDate = new Date(inv.date);
      const today = new Date();
      if (historyDateFilter === 'today') {
        const isSameDay =
          invDate.getFullYear() === today.getFullYear() &&
          invDate.getMonth() === today.getMonth() &&
          invDate.getDate() === today.getDate();
        if (!isSameDay) return false;
      } else if (historyDateFilter === 'week') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);
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

    return true;
  });

  const filteredTotalRevenue = filteredInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);



  const handleSharePdfReport = async (reportType: 'summary' | 'detailed' = 'summary') => {
    if (filteredInvoices.length === 0) {
      Alert.alert('Report Warning', 'No invoices available to share PDF report.');
      return;
    }
    try {
      const filterTitle = `Invoices Sales Report (${historyDateFilter.toUpperCase()} - ${historyStatusFilter.toUpperCase()})`;
      await shareInvoicesPdfReport(organization, filteredInvoices, filterTitle, reportType);
    } catch (e: any) {
      console.warn('[InvoiceBuilder] PDF Share error:', e);
      Alert.alert('Error', e?.message || 'Failed to share PDF report.');
    }
  };

  // Dialog Toggles
  const [customerDialogVisible, setCustomerDialogVisible] = useState(false);
  const [productDialogVisible, setProductDialogVisible] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');

  // Cart Item Edit Dialog States
  const [editItemDialogVisible, setEditItemDialogVisible] = useState(false);
  const [editingCartItem, setEditingCartItem] = useState<{
    productId: string;
    name: string;
    basePrice: number;
    baseUnit: string;
    quantity: string;
    unit: string;
  } | null>(null);

  // Auto-select Walk-in Customer on load
  useEffect(() => {
    const walkIn = customers.find((c) => 
      c.name.toLowerCase().includes('walk-in') || 
      c.name.toLowerCase().includes('walkin')
    );
    if (walkIn) {
      setSelectedCustomerId(walkIn.id);
    } else if (customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  // Cart operations
  const addToCart = (product: Product) => {
    const existing = cart.find((item) => item.product.id === product.id);
    const defaultUnit = product.unit || 'Pcs';
    const activeUnit = existing ? existing.unit : defaultUnit;
    const delta = existing ? getDeltaForUnit(activeUnit, false) : 1;
    const currentQty = existing ? existing.quantity : 0;
    const nextQty = currentQty + delta;

    const performAdd = () => {
      if (existing) {
        setCart(
          cart.map((item) =>
            item.product.id === product.id ? { ...item, quantity: nextQty } : item
          )
        );
      } else {
        setCart([...cart, {
          product,
          quantity: 1,
          unit: defaultUnit,
          price: product.price,
        }]);
      }
      setProductDialogVisible(false);
    };

    // Convert stock to active cart unit for warning alert
    const baseUnit = (product.unit || 'Pcs').toLowerCase();
    const targetUnit = activeUnit.toLowerCase();
    let stockInActiveUnit = product.stockQuantity ?? 0;
    if (baseUnit === 'kg' && targetUnit === 'gm') {
      stockInActiveUnit = (product.stockQuantity ?? 0) * 1000;
    } else if (baseUnit === 'gm' && targetUnit === 'kg') {
      stockInActiveUnit = (product.stockQuantity ?? 0) / 1000;
    } else if ((baseUnit === 'ltr' || baseUnit === 'litre') && targetUnit === 'ml') {
      stockInActiveUnit = (product.stockQuantity ?? 0) * 1000;
    } else if (baseUnit === 'ml' && (targetUnit === 'ltr' || targetUnit === 'litre')) {
      stockInActiveUnit = (product.stockQuantity ?? 0) / 1000;
    }

    if (nextQty > stockInActiveUnit) {
      Alert.alert(
        'Stock Alert',
        `The requested quantity (${nextQty} ${activeUnit}) exceeds the available stock quantity (${stockInActiveUnit.toFixed(1)} ${activeUnit} remaining). Do you want to proceed?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Proceed', onPress: performAdd }
        ]
      );
    } else {
      performAdd();
    }
  };

  const updateQuantity = (productId: string, isDecrement: boolean) => {
    const cartItem = cart.find((item) => item.product.id === productId);
    if (!cartItem) return;

    const delta = getDeltaForUnit(cartItem.unit, isDecrement);
    const nextQty = Math.max(0, cartItem.quantity + delta);

    if (nextQty === 0) {
      setCart(cart.filter((item) => item.product.id !== productId));
      return;
    }

    // Convert stock to item unit for warning alert
    const baseUnit = (cartItem.product.unit || 'Pcs').toLowerCase();
    const targetUnit = cartItem.unit.toLowerCase();
    let stockInItemUnit = cartItem.product.stockQuantity ?? 0;
    if (baseUnit === 'kg' && targetUnit === 'gm') {
      stockInItemUnit = (cartItem.product.stockQuantity ?? 0) * 1000;
    } else if (baseUnit === 'gm' && targetUnit === 'kg') {
      stockInItemUnit = (cartItem.product.stockQuantity ?? 0) / 1000;
    } else if ((baseUnit === 'ltr' || baseUnit === 'litre') && targetUnit === 'ml') {
      stockInItemUnit = (cartItem.product.stockQuantity ?? 0) * 1000;
    } else if (baseUnit === 'ml' && (targetUnit === 'ltr' || targetUnit === 'litre')) {
      stockInItemUnit = (cartItem.product.stockQuantity ?? 0) / 1000;
    }

    if (!isDecrement && nextQty > stockInItemUnit) {
      Alert.alert(
        'Stock Alert',
        `Increasing quantity to ${nextQty} ${cartItem.unit} exceeds the available stock (${stockInItemUnit.toFixed(1)} ${cartItem.unit} remaining). Do you want to proceed?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Proceed',
            onPress: () => {
              setCart(
                cart.map((item) =>
                  item.product.id === productId ? { ...item, quantity: nextQty } : item
                )
              );
            },
          },
        ]
      );
    } else {
      setCart(
        cart.map((item) =>
          item.product.id === productId ? { ...item, quantity: nextQty } : item
        )
      );
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  const handleUnitChange = (newUnit: string) => {
    if (!editingCartItem) return;
    const oldUnit = editingCartItem.unit;
    const qtyVal = parseFloat(editingCartItem.quantity) || 0;
    let nextQty = qtyVal;

    const ou = oldUnit.toLowerCase();
    const nu = newUnit.toLowerCase();

    if (ou === 'kg' && nu === 'gm') {
      nextQty = qtyVal * 1000;
    } else if (ou === 'gm' && nu === 'kg') {
      nextQty = qtyVal / 1000;
    } else if ((ou === 'ltr' || ou === 'litre') && nu === 'ml') {
      nextQty = qtyVal * 1000;
    } else if (ou === 'ml' && (nu === 'ltr' || nu === 'litre')) {
      nextQty = qtyVal / 1000;
    }

    const qtyStr = nextQty % 1 === 0 ? nextQty.toString() : nextQty.toFixed(3);

    setEditingCartItem({
      ...editingCartItem,
      unit: newUnit,
      quantity: qtyStr,
    });
  };

  const getCalculatedItemPrice = (basePrice: number, baseUnit: string, targetUnit: string) => {
    return getPriceForUnit(basePrice, baseUnit, targetUnit);
  };

  // Calculations
  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const calculateTax = () => {
    if (!organization.showGstOnBill || !organization.gstNumber) {
      return { totalTax: 0, cgst: 0, sgst: 0 };
    }
    const totalTax = cart.reduce((sum, item) => {
      const itemSubtotal = item.price * item.quantity;
      return sum + itemSubtotal * (item.product.taxRate / 100);
    }, 0);
    
    // Indian GST Split (CGST + SGST)
    const cgst = totalTax / 2;
    const sgst = totalTax / 2;
    return { totalTax, cgst, sgst };
  };

  const subtotal = calculateSubtotal();
  const { totalTax, cgst, sgst } = calculateTax();
  const discountVal = subtotal * ((parseFloat(discount) || 0) / 100);
  const grandTotal = Math.max(0, subtotal + totalTax - discountVal);

  const handleSaveInvoice = async () => {
    if (cart.length === 0) {
      Alert.alert('Error', 'Please add at least one product to the invoice.');
      return;
    }
    if (!selectedCustomerId) {
      Alert.alert('Error', 'Please select a customer.');
      return;
    }

    try {
      // Auto-generate invoice number: INV-YEAR-XXXX
      const year = new Date().getFullYear();
      const count = invoices.length + 1;
      const invoiceNumber = `INV-${year}-${String(count).padStart(4, '0')}`;
      const invoiceId = Math.random().toString(36).substring(2, 15);

      const invoiceData: Invoice = {
        id: invoiceId,
        invoiceNumber,
        customerId: selectedCustomerId,
        date: new Date().toISOString(),
        subtotal,
        taxTotal: totalTax,
        cgstTotal: cgst,
        sgstTotal: sgst,
        discount: discountVal,
        grandTotal,
        paymentStatus,
        paymentMethod,
      };

      const invoiceItems: InvoiceItem[] = cart.map((item) => ({
        id: Math.random().toString(36).substring(2, 15),
        invoiceId,
        productId: item.product.id,
        name: item.product.name,
        price: item.price,
        quantity: item.quantity,
        taxRate: item.product.taxRate,
        total: item.price * item.quantity * (1 + item.product.taxRate / 100),
        unit: item.unit,
      }));

      await createInvoice(invoiceData, invoiceItems);

      // Reset Form
      setCart([]);
      setDiscount('');
      setPaymentMethod('UPI');
      setPaymentStatus('Paid');

      // Navigate to Print Preview for direct print option
      navigation.navigate('PrintPreview', { invoiceId, invoice: invoiceData, items: invoiceItems });
    } catch (e) {
      Alert.alert('Error', 'Failed to generate invoice. Please try again.');
    }
  };

  const { width } = useWindowDimensions();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        ref={historyScrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: width > 700 ? 24 : 16 }}
        onScroll={handleHistoryScroll}
        scrollEventThrottle={16}
      >
        <View style={{ width: '100%', maxWidth: 700, alignSelf: 'center' }}>
          {/* Top Mode Switcher: New Bill vs All Invoices History */}
          <SegmentedButtons
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as 'builder' | 'history')}
            buttons={[
              {
                value: 'builder',
                label: 'New Invoice',
                icon: 'plus-circle-outline',
              },
              {
                value: 'history',
                label: `All Invoices (${invoices.length})`,
                icon: 'history',
              },
            ]}
            style={{ marginBottom: 16 }}
          />

          {activeTab === 'history' ? (
            <View style={{ gap: 12 }}>
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
                  icon={hasActiveFilters ? "filter-check" : "filter-variant"}
                  mode={hasActiveFilters ? "contained" : "outlined"}
                  iconColor={hasActiveFilters ? "#FFFFFF" : theme.colors.primary}
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
                  <Button compact mode="text" onPress={() => { setHistoryDateFilter('all'); setHistoryStatusFilter('all'); }}>
                    Clear Filters
                  </Button>
                </View>
              )}

              {/* Compact Summary Bar */}
              <Card style={{ backgroundColor: theme.colors.primaryContainer, marginVertical: 2 }}>
                <Card.Content style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 }}>
                  <Text variant="titleSmall" style={{ color: theme.colors.onPrimaryContainer, fontWeight: 'bold' }}>
                    Matching: {filteredInvoices.length} Invoices
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
                      Try adjusting your search terms or date filter options.
                    </Text>
                  </Card.Content>
                </Card>
              ) : (
                filteredInvoices.map((inv) => {
                  const isPaid = inv.paymentStatus === 'Paid';
                  const dateStr = new Date(inv.date).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

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
          ) : (
            <View>
              {/* Customer Selection Card */}
              <Card style={styles.card} mode="outlined">
                <Card.Content style={styles.customerSelector}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      BILLING CUSTOMER
                    </Text>
                    <Text variant="titleMedium" style={styles.boldText}>
                      {selectedCustomer ? selectedCustomer.name : 'Select Customer'}
                    </Text>
                    {selectedCustomer && selectedCustomer.phone !== '0000000000' && (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {selectedCustomer.phone}
                      </Text>
                    )}
                  </View>
                  <Button mode="outlined" onPress={() => setCustomerDialogVisible(true)} compact>
                    Change
                  </Button>
                </Card.Content>
              </Card>

        {/* Cart Listing Header */}
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={styles.boldText}>
            Billing Items
          </Text>
          <Button mode="contained" icon="plus" onPress={() => { setProductSearchQuery(''); setProductDialogVisible(true); }} compact>
            Add Item
          </Button>
        </View>

        {/* Cart Items List */}
        {cart.length === 0 ? (
          <Card style={styles.emptyCard} mode="outlined">
            <Card.Content style={styles.centerAlign}>
              <IconButton icon="cart-plus" size={32} iconColor={theme.colors.outline} />
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                No items added to invoice yet
              </Text>
            </Card.Content>
          </Card>
        ) : (
          cart.map((item) => (
            <Card
              key={item.product.id}
              style={styles.cartCard}
              mode="outlined"
              onPress={() => {
                setEditingCartItem({
                  productId: item.product.id,
                  name: item.product.name,
                  basePrice: item.product.price,
                  baseUnit: item.product.unit || 'Pcs',
                  quantity: item.quantity.toString(),
                  unit: item.unit,
                });
                setEditItemDialogVisible(true);
              }}
            >
              <Card.Content style={styles.cartCardContent}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Text variant="titleMedium" style={[styles.boldText, { flexShrink: 1 }]} numberOfLines={1}>
                      {item.product.name}
                    </Text>
                    <IconButton
                      icon="pencil-outline"
                      size={14}
                      style={{ margin: 0, marginLeft: 2, padding: 0, width: 20, height: 20 }}
                      iconColor={theme.colors.primary}
                    />
                  </View>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {organization.currency} {item.price.toFixed(2)} / {item.unit}
                    {item.unit.toLowerCase() !== (item.product.unit || 'pcs').toLowerCase() && (
                      <Text style={{ fontStyle: 'italic', fontSize: 11 }}>
                        {` (Base: ${organization.currency}${item.product.price.toFixed(2)}/${item.product.unit || 'Pcs'})`}
                      </Text>
                    )}
                  </Text>
                </View>
                <View style={styles.cartActions}>
                  <IconButton
                    icon="minus"
                    size={20}
                    mode="outlined"
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(item.product.id, true)}
                  />
                  <Text variant="titleMedium" style={[styles.boldText, styles.qtyText]}>
                    {item.quantity}
                  </Text>
                  <IconButton
                    icon="plus"
                    size={20}
                    mode="outlined"
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(item.product.id, false)}
                  />
                  <IconButton
                    icon="trash-can-outline"
                    size={20}
                    iconColor={theme.colors.error}
                    onPress={() => removeFromCart(item.product.id)}
                  />
                </View>
              </Card.Content>
            </Card>
          ))
        )}

        {/* Invoice configuration details */}
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={styles.boldText}>
            Bill Summary & Payment
          </Text>
        </View>

        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ gap: 12 }}>
            {/* Discount Input */}
            <TextInput
              label="Discount (%)"
              value={discount}
              onChangeText={(text) => {
                const sanitized = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
                if (sanitized === '') {
                  setDiscount('');
                  return;
                }
                const val = parseFloat(sanitized) || 0;
                if (val > 100) {
                  setDiscount('100');
                } else {
                  setDiscount(sanitized);
                }
              }}
              keyboardType={Platform.OS === 'ios' && __DEV__ ? 'default' : 'decimal-pad'}
              mode="outlined"
              style={{ backgroundColor: '#FFF' }}
              left={<TextInput.Icon icon="percent" />}
              right={discount ? <TextInput.Icon icon="close" onPress={() => setDiscount('')} /> : null}
            />
            {parseFloat(discount) > 0 ? (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: -4, marginLeft: 4 }}>
                {`Calculated Discount: ${organization.currency} ${discountVal.toFixed(2)} (${discount}%)`}
              </Text>
            ) : null}

            {/* Calculations Breakdown */}
            <View style={styles.calcRow}>
              <Text variant="bodyLarge">Subtotal</Text>
              <Text variant="bodyLarge" numberOfLines={1} adjustsFontSizeToFit>{organization.currency} {subtotal.toFixed(2)}</Text>
            </View>

            {organization.showGstOnBill && organization.gstNumber && totalTax > 0 ? (
              <>
                <View style={styles.calcRow}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    CGST (Central GST)
                  </Text>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1} adjustsFontSizeToFit>
                    {organization.currency} {cgst.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.calcRow}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    SGST (State GST)
                  </Text>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1} adjustsFontSizeToFit>
                    {organization.currency} {sgst.toFixed(2)}
                  </Text>
                </View>
              </>
            ) : null}

            {discountVal > 0 ? (
              <View style={styles.calcRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.error }}>Discount</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.error }} numberOfLines={1} adjustsFontSizeToFit>
                  -{organization.currency} {discountVal.toFixed(2)}
                </Text>
              </View>
            ) : null}

            <Divider />

            <View style={styles.calcRow}>
              <Text variant="titleLarge" style={styles.boldText}>Grand Total</Text>
              <Text variant="titleLarge" style={[styles.boldText, { color: theme.colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                {organization.currency} {grandTotal.toFixed(2)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Payment Methods */}
        <Card style={[styles.card, { marginTop: 12 }]} mode="outlined">
          <Card.Content>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
              PAYMENT METHOD
            </Text>
            <View style={styles.paymentMethodsRow}>
              {['UPI', 'Cash', 'Card'].map((method) => (
                <Button
                  key={method}
                  mode={paymentMethod === method ? 'contained' : 'outlined'}
                  onPress={() => setPaymentMethod(method)}
                  style={styles.paymentBtn}
                  compact
                >
                  {method}
                </Button>
              ))}
            </View>

            <Divider style={{ marginVertical: 12 }} />

            <View style={styles.paymentStatusRow}>
              <Text variant="titleMedium" style={styles.boldText}>Payment Status</Text>
              <View style={styles.statusButtons}>
                <Button
                  mode={paymentStatus === 'Paid' ? 'contained' : 'outlined'}
                  buttonColor={paymentStatus === 'Paid' ? theme.colors.success : undefined}
                  textColor={paymentStatus === 'Paid' ? '#FFF' : undefined}
                  onPress={() => setPaymentStatus('Paid')}
                  compact
                >
                  Paid
                </Button>
                <Button
                  mode={paymentStatus === 'Unpaid' ? 'contained' : 'outlined'}
                  buttonColor={paymentStatus === 'Unpaid' ? theme.colors.warning : undefined}
                  textColor={paymentStatus === 'Unpaid' ? '#FFF' : undefined}
                  onPress={() => setPaymentStatus('Unpaid')}
                  compact
                  style={{ marginLeft: 8 }}
                >
                  Unpaid
                </Button>
              </View>
            </View>
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          icon="check-circle"
          style={styles.saveBtn}
          onPress={handleSaveInvoice}
        >
          Generate Invoice & Preview
        </Button>
        <View style={{ height: 40 }} />
        </View>
        )}
        </View>
      </ScrollView>

      {/* PORTALS FOR DIALOG SELECTORS */}
      <Portal>
        {/* Edit Quantity & Unit Dialog */}
        <Dialog visible={editItemDialogVisible} onDismiss={() => setEditItemDialogVisible(false)}>
          <Dialog.Title>Edit Quantity & Unit</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12 }}>
              {editingCartItem && (
                <View style={{ gap: 12 }}>
                  <Text variant="titleMedium" style={styles.boldText}>
                    {editingCartItem.name}
                  </Text>
                  
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Base Price: {organization.currency}{editingCartItem.basePrice.toFixed(2)} / {editingCartItem.baseUnit}
                  </Text>

                  {/* Unit Presets Selector */}
                  {['kg', 'gm', 'ltr', 'ml', 'litre'].includes(editingCartItem.baseUnit.toLowerCase()) && (
                    <View style={{ marginBottom: 8 }}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                        SELECT UNIT
                      </Text>
                      <SegmentedButtons
                        value={editingCartItem.unit}
                        onValueChange={handleUnitChange}
                        buttons={
                          ['kg', 'gm'].includes(editingCartItem.baseUnit.toLowerCase())
                            ? [
                                { value: 'Kg', label: 'Kg' },
                                { value: 'Gm', label: 'Gm' },
                              ]
                            : [
                                { value: 'Ltr', label: 'Ltr' },
                                { value: 'Ml', label: 'Ml' },
                              ]
                        }
                      />
                    </View>
                  )}

                  <TextInput
                    label={`Quantity (${editingCartItem.unit})`}
                    value={editingCartItem.quantity}
                    onChangeText={(text) => {
                      let sanitized = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
                      const u = (editingCartItem.unit || '').toLowerCase();
                      if (['pcs', 'nos', 'no', 'numbers', 'number', 'pack', 'box', 'strip', 'tablet'].includes(u)) {
                        sanitized = sanitized.replace(/\./g, '');
                      } else {
                        const parts = sanitized.split('.');
                        if (parts.length > 1) {
                          sanitized = parts[0] + '.' + parts[1].slice(0, 3);
                        }
                      }
                      setEditingCartItem({
                        ...editingCartItem,
                        quantity: sanitized,
                      });
                    }}
                    keyboardType={Platform.OS === 'ios' && __DEV__ ? 'default' : 'decimal-pad'}
                    mode="outlined"
                    style={{ backgroundColor: '#FFF' }}
                  />

                  {/* Rate & Total Preview */}
                  <View style={{ marginTop: 8, padding: 12, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8 }}>
                    <View style={styles.calcRow}>
                      <Text variant="bodyMedium">Rate per {editingCartItem.unit}:</Text>
                      <Text variant="bodyMedium" style={styles.boldText}>
                        {organization.currency}
                        {getCalculatedItemPrice(
                          editingCartItem.basePrice,
                          editingCartItem.baseUnit,
                          editingCartItem.unit
                        ).toFixed(4)}
                      </Text>
                    </View>
                    <View style={[styles.calcRow, { marginTop: 4 }]}>
                      <Text variant="bodyMedium">Item Total:</Text>
                      <Text variant="titleMedium" style={[styles.boldText, { color: theme.colors.primary }]}>
                        {organization.currency}
                        {(
                          (parseFloat(editingCartItem.quantity) || 0) *
                          getCalculatedItemPrice(
                            editingCartItem.basePrice,
                            editingCartItem.baseUnit,
                            editingCartItem.unit
                          )
                        ).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setEditItemDialogVisible(false)}>Cancel</Button>
            <Button
              onPress={() => {
                if (editingCartItem) {
                  const qty = parseFloat(editingCartItem.quantity) || 0;
                  if (qty <= 0) {
                    removeFromCart(editingCartItem.productId);
                    setEditItemDialogVisible(false);
                    return;
                  }
                  
                  const targetProd = products.find((p: Product) => p.id === editingCartItem.productId);
                  const availableStock = targetProd ? (targetProd.stockQuantity ?? 0) : 0;
                  
                  // Convert quantity if units differ (e.g. if stock is in KG but selected unit is GM)
                  const baseUnit = editingCartItem.baseUnit.toLowerCase();
                  const targetUnit = editingCartItem.unit.toLowerCase();
                  let stockInTargetUnit = availableStock;
                  if (baseUnit === 'kg' && targetUnit === 'gm') {
                    stockInTargetUnit = availableStock * 1000;
                  } else if (baseUnit === 'gm' && targetUnit === 'kg') {
                    stockInTargetUnit = availableStock / 1000;
                  } else if ((baseUnit === 'ltr' || baseUnit === 'litre') && targetUnit === 'ml') {
                    stockInTargetUnit = availableStock * 1000;
                  } else if (baseUnit === 'ml' && (targetUnit === 'ltr' || targetUnit === 'litre')) {
                    stockInTargetUnit = availableStock / 1000;
                  }

                  const applyChanges = () => {
                    const pricePerUnit = getCalculatedItemPrice(
                      editingCartItem.basePrice,
                      editingCartItem.baseUnit,
                      editingCartItem.unit
                    );
                    setCart(
                      cart.map((item) =>
                        item.product.id === editingCartItem.productId
                          ? {
                              ...item,
                              quantity: qty,
                              unit: editingCartItem.unit,
                              price: pricePerUnit,
                            }
                          : item
                      )
                    );
                    setEditItemDialogVisible(false);
                  };

                  if (qty > stockInTargetUnit) {
                    Alert.alert(
                      'Stock Alert',
                      `The specified quantity (${qty} ${editingCartItem.unit}) exceeds the available stock (${stockInTargetUnit.toFixed(1)} ${editingCartItem.unit} remaining). Do you want to proceed?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Proceed', onPress: applyChanges }
                      ]
                    );
                  } else {
                    applyChanges();
                  }
                }
              }}
            >
              Apply
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Customer Selector Dialog */}
        <Dialog visible={customerDialogVisible} onDismiss={() => setCustomerDialogVisible(false)}>
          <Dialog.Title>Select Customer</Dialog.Title>
          <Dialog.ScrollArea>
            <FlatList
              data={customers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <List.Item
                  title={item.name}
                  description={item.phone === '0000000000' ? 'Walk-in Customer' : item.phone}
                  onPress={() => {
                    setSelectedCustomerId(item.id);
                    setCustomerDialogVisible(false);
                  }}
                  left={(props) => <List.Icon {...props} icon="account" />}
                  right={() =>
                    selectedCustomerId === item.id ? (
                      <List.Icon icon="check" color={theme.colors.primary} />
                    ) : null
                  }
                />
              )}
              style={{ maxHeight: 300 }}
            />
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setCustomerDialogVisible(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Product Selector Dialog */}
        <Dialog visible={productDialogVisible} onDismiss={() => setProductDialogVisible(false)}>
          <Dialog.Title>Add Product to Bill</Dialog.Title>
          
          {products.length > 0 && (
            <TextInput
              placeholder="Search products by name..."
              value={productSearchQuery}
              onChangeText={setProductSearchQuery}
              mode="outlined"
              dense
              style={{ marginHorizontal: 24, marginBottom: 8, backgroundColor: '#FFFFFF' }}
              left={<TextInput.Icon icon="magnify" />}
              right={productSearchQuery ? <TextInput.Icon icon="close" onPress={() => setProductSearchQuery('')} /> : null}
            />
          )}

          <Dialog.ScrollArea>
            {products.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text>No products in inventory.</Text>
                <Button
                  onPress={() => {
                    setProductDialogVisible(false);
                    navigation.navigate('Inventory');
                  }}
                >
                  Add Product to Inventory
                </Button>
              </View>
            ) : (
              <FlatList
                data={products.filter(p => 
                  p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
                  (p.description && p.description.toLowerCase().includes(productSearchQuery.toLowerCase()))
                )}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const stockText = item.stockQuantity <= 0 
                    ? 'Out of Stock' 
                    : `Stock: ${item.stockQuantity} ${item.unit || 'Pcs'}`;
                  return (
                    <List.Item
                      title={item.name}
                      description={`Price: ${organization.currency}${item.price.toFixed(2)} / ${item.unit || 'Pcs'} • GST: ${item.taxRate}%\n${stockText}`}
                      descriptionNumberOfLines={2}
                      onPress={() => addToCart(item)}
                      left={(props) => <List.Icon {...props} icon="package-variant-closed" />}
                    />
                  );
                }}
                style={{ maxHeight: 300 }}
                ListEmptyComponent={() => (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: theme.colors.onSurfaceVariant }}>No products match your search.</Text>
                  </View>
                )}
              />
            )}
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setProductDialogVisible(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>

        {/* All Invoices Filter & PDF Reports Modal */}
        <Dialog visible={filterModalVisible} onDismiss={() => setFilterModalVisible(false)} style={styles.dialog}>
          <Dialog.Title style={styles.boldText}>Filter Invoices & PDF Reports</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 460, paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12, gap: 16 }}>
              {/* Filter by Date - Responsive Flex Wrap Chips */}
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

              {/* Filter by Status - Responsive Flex Wrap Chips */}
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

              {/* PDF Reports Options */}
              <View style={{ gap: 10 }}>
                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                  EXPORT & SHARE PDF SALES REPORTS
                </Text>

                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Share PDF sales reports according to your selected date and payment status filters.
                </Text>

                {/* Responsive Share Buttons Layout */}
                <View style={{ flexDirection: width < 420 ? 'column' : 'row', gap: 8 }}>
                  <Button
                    mode="contained"
                    icon="share-variant-outline"
                    onPress={() => { setFilterModalVisible(false); handleSharePdfReport('summary'); }}
                    style={{ flex: width < 420 ? undefined : 1, borderRadius: 8 }}
                    labelStyle={{ fontSize: 12, marginVertical: 6 }}
                    compact
                  >
                    Share Summary PDF
                  </Button>
                  <Button
                    mode="contained"
                    icon="file-table-outline"
                    onPress={() => { setFilterModalVisible(false); handleSharePdfReport('detailed'); }}
                    style={{ flex: width < 420 ? undefined : 1, borderRadius: 8 }}
                    labelStyle={{ fontSize: 12, marginVertical: 6 }}
                    compact
                  >
                    Share Itemized PDF
                  </Button>
                </View>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => { setHistoryDateFilter('all'); setHistoryStatusFilter('all'); }}>Clear Filters</Button>
            <Button mode="contained" onPress={() => setFilterModalVisible(false)}>Done</Button>
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
                  Saving invoice details...
                </Text>
              </Card.Content>
            </Card>
          </View>
        </Portal>
      )}

      {/* Floating Go To Top Button for All Invoices */}
      {activeTab === 'history' && showGoToTop && (
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
  goToTopFab: {
    position: 'absolute',
    margin: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#1976D2',
    borderRadius: 28,
  },
  boldText: {
    fontWeight: 'bold',
  },
  card: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  customerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyCard: {
    borderRadius: 12,
    borderStyle: 'dashed',
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  centerAlign: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCard: {
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  cartCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cartActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyBtn: {
    margin: 0,
  },
  qtyText: {
    paddingHorizontal: 8,
    minWidth: 24,
    textAlign: 'center',
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentMethodsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentBtn: {
    flex: 1,
  },
  paymentStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusButtons: {
    flexDirection: 'row',
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 6,
    marginTop: 16,
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
  },
});
