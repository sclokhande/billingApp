import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, FlatList, Alert, useWindowDimensions, Platform } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  IconButton,
  Portal,
  Dialog,
  List,
  Divider,
  useTheme,
  SegmentedButtons,
  ActivityIndicator,
  Snackbar,
  Chip,
  Avatar,
  Icon,
} from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { TerminalLockBanner } from '../components/TerminalLockBanner';
import { Invoice, InvoiceItem, Customer, Product } from '../db/types';
import { formatThermalReceipt, wrapText } from '../services/printService';
import {
  buildUpiPaymentUri,
  getQrMatrix,
  convertQrMatrixToEscPosRaster,
  convertImageBase64ToEscPosRaster,
  uint8ArrayToBase64,
} from '../utils/receiptBrandingService';

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

export const InvoiceBuilderScreen = ({ navigation, route }: any) => {
  const theme = useTheme() as any;
  const {
    customers,
    products,
    organization,
    createInvoice,
    saveCustomer,
    invoices,
    isLoading,
    verifyPrinterConnectionOrRedirect,
    printReceipt,
    isDemoMode,
    isPrinterLocked,
  } = useBilling();

  const { width } = useWindowDimensions();

  // Selected customer & Items
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cart, setCart] = useState<Array<{
    product: Product;
    quantity: number;
    unit: string;
    price: number;
  }>>([]);

  // Discount states: dual mode (% vs ₹) and auto cash round-off
  const [discountMode, setDiscountMode] = useState<'percent' | 'flat'>('percent');
  const [discount, setDiscount] = useState<string>('');
  const [enableRoundOff, setEnableRoundOff] = useState<boolean>(true);

  const [paymentMethod, setPaymentMethod] = useState<string>('UPI');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Unpaid'>('Paid');

  // Customer search & quick-add states inside customer picker dialog
  const [customerDialogVisible, setCustomerDialogVisible] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Product selection & editing states
  const [productDialogVisible, setProductDialogVisible] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');

  const [editItemDialogVisible, setEditItemDialogVisible] = useState(false);
  const [editingCartItem, setEditingCartItem] = useState<{
    productId: string;
    name: string;
    basePrice: number;
    baseUnit: string;
    quantity: string;
    unit: string;
  } | null>(null);

  // Snackbar feedback states
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Header Right: Direct Link to All Invoices Screen
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          mode="text"
          textColor={theme.colors.onPrimary}
          icon="history"
          compact
          onPress={() => navigation.navigate('InvoiceHistory')}
          labelStyle={{ fontSize: 13, fontWeight: 'bold', marginHorizontal: 2 }}
          style={{ marginRight: 6 }}
        >
          {`Bills (${invoices.length})`}
        </Button>
      ),
    });
  }, [navigation, theme, invoices.length]);

  // Prefill from AI Order transfer or Inventory route
  useEffect(() => {
    if (route?.params?.prefillItems && route.params.prefillItems.length > 0) {
      const mapped = route.params.prefillItems.map((item: any) => {
        const prod = products.find((p) => p.id === item.productId) || {
          id: item.productId,
          name: item.name,
          price: item.price,
          taxRate: item.taxRate || 0,
          unit: item.unit || 'Pcs',
        };
        return {
          product: prod,
          quantity: item.quantity || 1,
          unit: item.unit || prod.unit || 'Pcs',
          price: item.price,
        };
      });
      setCart(mapped);
      if (route.params.paymentMethod) {
        setPaymentMethod(route.params.paymentMethod);
      }
      if (route.params.paymentStatus) {
        setPaymentStatus(route.params.paymentStatus);
      }
      if (route.params.customerId) {
        setSelectedCustomerId(route.params.customerId);
      }
    } else if (route?.params?.prefillProduct) {
      const p = route.params.prefillProduct;
      const qty = route.params.quantity || 1;
      setCart([
        {
          product: p,
          quantity: qty,
          unit: p.unit || 'Pcs',
          price: p.price,
        },
      ]);
      if (route.params.paymentMethod) {
        setPaymentMethod(route.params.paymentMethod);
      }
      if (route.params.paymentStatus) {
        setPaymentStatus(route.params.paymentStatus);
      }
      if (route.params.customerId) {
        setSelectedCustomerId(route.params.customerId);
      }
    }
  }, [route?.params, products]);

  // Auto-select Walk-in Customer on initial load
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

  // Reset Draft Action
  const handleResetInvoiceData = () => {
    const walkIn = customers.find((c) => 
      c.name.toLowerCase().includes('walk-in') || 
      c.name.toLowerCase().includes('walkin')
    );
    const defaultCustId = walkIn ? walkIn.id : (customers.length > 0 ? customers[0].id : '');
    const isCustomerChanged = selectedCustomerId !== defaultCustId;
    const hasData = cart.length > 0 || isCustomerChanged || !!discount || paymentMethod !== 'UPI' || paymentStatus !== 'Paid';

    const performReset = () => {
      setCart([]);
      setSelectedCustomerId(defaultCustId);
      setDiscount('');
      setPaymentMethod('UPI');
      setPaymentStatus('Paid');
      setProductSearchQuery('');
      setSnackbarMessage('Invoice draft reset. Ready for new bill!');
      setSnackbarVisible(true);
    };

    if (hasData) {
      Alert.alert(
        'Reset Draft',
        'Are you sure you want to clear current invoice draft and start a new invoice?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset Draft',
            style: 'destructive',
            onPress: performReset,
          },
        ]
      );
    } else {
      performReset();
    }
  };

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

  // Dual Mode Discount Calculation
  let discountVal = 0;
  if (discount) {
    const rawDisc = parseFloat(discount) || 0;
    if (discountMode === 'percent') {
      discountVal = subtotal * (Math.min(100, Math.max(0, rawDisc)) / 100);
    } else {
      discountVal = Math.min(subtotal + totalTax, Math.max(0, rawDisc));
    }
  }

  // Cash Round-Off Calculation
  const netBeforeRound = Math.max(0, subtotal + totalTax - discountVal);
  let roundOffDiff = 0;
  let grandTotal = netBeforeRound;

  if (enableRoundOff) {
    grandTotal = Math.round(netBeforeRound);
    roundOffDiff = grandTotal - netBeforeRound;
  }

  // Inline Quick-Add Customer Handler
  const handleQuickAddCustomer = async () => {
    const q = customerSearchQuery.trim();
    if (!q) return;

    const isAllDigits = /^\d{10}$/.test(q);
    const newCust: Customer = {
      id: Math.random().toString(36).substring(2, 15),
      name: isAllDigits ? `Customer ${q.slice(-4)}` : q,
      phone: isAllDigits ? q : '',
      email: '',
      address: '',
    };

    try {
      await saveCustomer(newCust);
      setSelectedCustomerId(newCust.id);
      setCustomerSearchQuery('');
      setCustomerDialogVisible(false);
      setSnackbarMessage(`Customer '${newCust.name}' added & selected!`);
      setSnackbarVisible(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to quickly add customer.');
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.phone && c.phone.includes(customerSearchQuery))
  );

  // Save Invoice & Optionally Print Directly
  const handleSaveInvoice = async (autoPrint: boolean = false) => {
    if (isPrinterLocked) {
      Alert.alert(
        'Terminal Creation Locked',
        'Creating new invoices is locked because your authorized thermal printer has not been connected for over 30 days. Please connect your printer or unlock with the Master Key.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Connect Printer', onPress: () => navigation.navigate('PrinterConnect') },
        ]
      );
      return;
    }

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

      const isGstActive = Boolean(organization.showGstOnBill && organization.gstNumber);

      const invoiceItems: InvoiceItem[] = cart.map((item) => {
        const itemTaxRate = isGstActive ? (item.product.taxRate || 0) : 0;
        const lineTotal = item.price * item.quantity;
        return {
          id: Math.random().toString(36).substring(2, 15),
          invoiceId,
          productId: item.product.id,
          name: item.product.name,
          price: item.price,
          quantity: item.quantity,
          taxRate: itemTaxRate,
          total: lineTotal,
          unit: item.unit,
        };
      });

      await createInvoice(invoiceData, invoiceItems);

      if (autoPrint) {
        // Direct 1-tap counter print to Bluetooth thermal printer
        const isReady = await verifyPrinterConnectionOrRedirect(navigation);
        if (isReady) {
          const is80mm = organization.printWidth === '80mm';
          const paperDots = is80mm ? 576 : 384;
          const w = is80mm ? 48 : 32;
          const orgName = (organization?.name || 'STORE').toUpperCase();
          const orgNameLines = wrapText(orgName, w);
          const orgTitleLineCount = Math.max(1, orgNameLines.length);

          let logoRasterBase64 = '';
          if (organization.showLogoOnBill && organization.logoBase64) {
            logoRasterBase64 = await convertImageBase64ToEscPosRaster(organization.logoBase64, paperDots);
          }

          let qrRasterBase64 = '';
          if (organization.showUpiQrOnBill && organization.upiId) {
            const upiUri = buildUpiPaymentUri({
              upiId: organization.upiId,
              payeeName: organization.upiPayeeName || organization.name,
              amount: invoiceData.grandTotal || 0,
              invoiceNumber: invoiceData.invoiceNumber,
            });
            if (upiUri) {
              const matrix = getQrMatrix(upiUri);
              if (matrix.length > 0) {
                const qrBytes = convertQrMatrixToEscPosRaster(matrix, paperDots);
                qrRasterBase64 = uint8ArrayToBase64(qrBytes);
              }
            }
          }

          const cust = customers.find((c) => c.id === selectedCustomerId) || null;
          const receiptText = formatThermalReceipt(organization, cust, invoiceData, invoiceItems);

          await printReceipt(receiptText, navigation, {
            logoRasterBase64,
            qrRasterBase64,
            titleLineCount: orgTitleLineCount,
          });
        }

        // Reset Form for next customer
        setCart([]);
        setDiscount('');
        setPaymentMethod('UPI');
        setPaymentStatus('Paid');
        setSnackbarMessage(`Invoice ${invoiceNumber} saved & printed!`);
        setSnackbarVisible(true);
      } else {
        // Reset Form & Navigate to Print Preview screen
        setCart([]);
        setDiscount('');
        setPaymentMethod('UPI');
        setPaymentStatus('Paid');
        navigation.navigate('PrintPreview', { invoiceId, invoice: invoiceData, items: invoiceItems });
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to generate invoice. Please try again.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Scrollable Main POS Billing Area: Customer, Cart Items, Bill Breakdown */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: width > 700 ? 16 : 10, paddingTop: 10, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: '100%', maxWidth: 700, alignSelf: 'center' }}>
          {/* Terminal Security Lock Warning Banner */}
          <TerminalLockBanner navigation={navigation} style={{ marginHorizontal: 0, marginBottom: 8 }} />

          {/* Demo Version Mode Warning Banner */}
          {isDemoMode && (
            <Card style={{ backgroundColor: '#FFF3E0', borderColor: '#FFE0B2', marginBottom: 8 }} mode="outlined">
              <Card.Content style={{ paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#E65100' }}>
                  Demo Version Mode ({invoices.length}/3 Invoices Used)
                </Text>
                <Chip compact style={{ backgroundColor: '#FFE0B2' }} textStyle={{ color: '#E65100', fontSize: 10, fontWeight: 'bold' }}>
                  DEMO BUILD
                </Chip>
              </Card.Content>
            </Card>
          )}

          {/* Compact Customer Selection Card */}
          <Card style={[styles.compactCard, { marginBottom: 8 }]} mode="outlined">
            <Card.Content style={styles.compactCustomerContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Avatar.Icon size={30} icon="account" style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.onSurfaceVariant, letterSpacing: 0.5 }}>
                      CUSTOMER
                    </Text>
                    <Text variant="titleSmall" style={[styles.boldText, { color: theme.colors.onSurface }]} numberOfLines={1}>
                      {selectedCustomer ? selectedCustomer.name : 'Walkin-customer'}
                    </Text>
                  </View>
                  {selectedCustomer && selectedCustomer.phone && selectedCustomer.phone !== '0000000000' ? (
                    <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, marginTop: 1 }}>
                      {selectedCustomer.phone}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Button
                mode="outlined"
                onPress={() => setCustomerDialogVisible(true)}
                compact
                labelStyle={{ fontSize: 11, marginVertical: 2, marginHorizontal: 8 }}
                style={{ height: 28, justifyContent: 'center' }}
              >
                Change
              </Button>
            </Card.Content>
          </Card>

          {/* Cart Listing Header */}
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={styles.boldText}>
              Billing Items {cart.length > 0 ? `(${cart.length})` : ''}
            </Text>
            <Button
              mode="contained"
              icon="plus"
              onPress={() => { setProductSearchQuery(''); setProductDialogVisible(true); }}
              compact
            >
              Add Item
            </Button>
          </View>

          {/* Cart Items List */}
          {cart.length === 0 ? (
            <Card style={styles.emptyCard} mode="outlined">
              <Card.Content style={styles.centerAlign}>
                <IconButton icon="cart-plus" size={28} iconColor={theme.colors.outline} style={{ margin: 0 }} />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  No items added to invoice yet. Tap "+ Add Item" to begin billing.
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

          {/* Bill Breakdown Card */}
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={styles.boldText}>
              Bill Breakdown
            </Text>
          </View>

          <Card style={[styles.card, { marginBottom: 12 }]} mode="outlined">
            <Card.Content style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 10 }}>
              {/* Dual Mode Discount Input (% vs ₹) */}
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text variant="labelMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
                    DISCOUNT
                  </Text>
                  <SegmentedButtons
                    value={discountMode}
                    onValueChange={(val) => {
                      setDiscountMode(val as 'percent' | 'flat');
                      setDiscount('');
                    }}
                    density="small"
                    buttons={[
                      { value: 'percent', label: '% Off' },
                      { value: 'flat', label: `${organization.currency || '₹'} Flat` },
                    ]}
                    style={{ maxWidth: 170 }}
                  />
                </View>

                <TextInput
                  label={discountMode === 'percent' ? 'Discount Percentage (%)' : `Discount Amount (${organization.currency || '₹'})`}
                  value={discount}
                  dense={true}
                  onChangeText={(text) => {
                    const sanitized = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
                    if (sanitized === '') {
                      setDiscount('');
                      return;
                    }
                    const val = parseFloat(sanitized) || 0;
                    if (discountMode === 'percent') {
                      if (val > 100) {
                        setDiscount('100');
                      } else {
                        setDiscount(sanitized);
                      }
                    } else {
                      if (val > subtotal + totalTax) {
                        setDiscount((subtotal + totalTax).toFixed(2));
                      } else {
                        setDiscount(sanitized);
                      }
                    }
                  }}
                  keyboardType={Platform.OS === 'ios' && __DEV__ ? 'default' : 'decimal-pad'}
                  mode="outlined"
                  style={{ backgroundColor: '#FFF' }}
                  left={<TextInput.Icon icon={discountMode === 'percent' ? 'percent' : 'currency-inr'} />}
                  right={discount ? <TextInput.Icon icon="close" onPress={() => setDiscount('')} /> : null}
                />
                {discountVal > 0 ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: -2, marginLeft: 4, fontWeight: 'bold' }}>
                    {`Applied Discount: -${organization.currency} ${discountVal.toFixed(2)}${discountMode === 'percent' ? ` (${discount}%)` : ''}`}
                  </Text>
                ) : null}
              </View>

              {/* Cash Round-Off Toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: '500' }}>Cash Round-Off</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    (to nearest {organization.currency || '₹'}1)
                  </Text>
                </View>
                <Chip
                  selected={enableRoundOff}
                  onPress={() => setEnableRoundOff(!enableRoundOff)}
                  compact
                  style={{ backgroundColor: enableRoundOff ? theme.colors.primaryContainer : '#F0F0F0' }}
                  textStyle={{ fontSize: 11, fontWeight: 'bold', color: enableRoundOff ? theme.colors.primary : '#666' }}
                >
                  {enableRoundOff ? 'ON' : 'OFF'}
                </Chip>
              </View>

              <Divider style={{ marginVertical: 2 }} />

              {/* Calculations Rows */}
              <View style={styles.calcRow}>
                <Text variant="bodyMedium">Subtotal</Text>
                <Text variant="bodyMedium" numberOfLines={1} adjustsFontSizeToFit>{organization.currency} {subtotal.toFixed(2)}</Text>
              </View>

              {organization.showGstOnBill && organization.gstNumber && totalTax > 0 ? (
                <>
                  <View style={styles.calcRow}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      CGST (Central GST)
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1} adjustsFontSizeToFit>
                      {organization.currency} {cgst.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.calcRow}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      SGST (State GST)
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1} adjustsFontSizeToFit>
                      {organization.currency} {sgst.toFixed(2)}
                    </Text>
                  </View>
                </>
              ) : null}

              {discountVal > 0 ? (
                <View style={styles.calcRow}>
                  <Text variant="bodySmall" style={{ color: theme.colors.error }}>Discount</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.error }} numberOfLines={1} adjustsFontSizeToFit>
                    -{organization.currency} {discountVal.toFixed(2)}
                  </Text>
                </View>
              ) : null}

              {enableRoundOff && Math.abs(roundOffDiff) > 0.001 ? (
                <View style={styles.calcRow}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Round-off Adjustment</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1} adjustsFontSizeToFit>
                    {roundOffDiff >= 0 ? '+' : ''}{organization.currency} {roundOffDiff.toFixed(2)}
                  </Text>
                </View>
              ) : null}

              <Divider />

              <View style={styles.calcRow}>
                <Text variant="titleMedium" style={styles.boldText}>Grand Total</Text>
                <Text variant="titleLarge" style={[styles.boldText, { color: theme.colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                  {organization.currency} {grandTotal.toFixed(2)}
                </Text>
              </View>
            </Card.Content>
          </Card>
        </View>
      </ScrollView>

      {/* Sticky Bottom Checkout Dock */}
      <View style={[styles.stickyCheckoutDock, { backgroundColor: theme.colors.surface }]}>
        <View style={{ width: '100%', maxWidth: 700, alignSelf: 'center' }}>
          {/* Row 1: Payment Method & Payment Status */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 6 }}>
            {/* Payment Method Selector */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.onSurfaceVariant, marginRight: 2, letterSpacing: 0.5 }}>
                PAY:
              </Text>
              {(['UPI', 'Cash', 'Card'] as const).map((method) => (
                <Button
                  key={method}
                  mode={paymentMethod === method ? 'contained' : 'outlined'}
                  onPress={() => setPaymentMethod(method)}
                  compact
                  style={{ borderRadius: 6, minWidth: 44, marginHorizontal: 1 }}
                  contentStyle={{ height: 26, paddingHorizontal: 6 }}
                  labelStyle={{ fontSize: 11, marginVertical: 0, marginHorizontal: 0, fontWeight: paymentMethod === method ? '700' : '500' }}
                >
                  {method}
                </Button>
              ))}
            </View>

            {/* Payment Status Selector */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Button
                mode={paymentStatus === 'Paid' ? 'contained' : 'outlined'}
                buttonColor={paymentStatus === 'Paid' ? theme.colors.success : undefined}
                textColor={paymentStatus === 'Paid' ? '#FFF' : theme.colors.success}
                onPress={() => setPaymentStatus('Paid')}
                compact
                style={{ borderRadius: 6, borderColor: theme.colors.success, marginHorizontal: 1 }}
                contentStyle={{ height: 26, paddingHorizontal: 8 }}
                labelStyle={{ fontSize: 11, marginVertical: 0, marginHorizontal: 0, fontWeight: paymentStatus === 'Paid' ? '700' : '500' }}
              >
                Paid
              </Button>
              <Button
                mode={paymentStatus === 'Unpaid' ? 'contained' : 'outlined'}
                buttonColor={paymentStatus === 'Unpaid' ? theme.colors.warning : undefined}
                textColor={paymentStatus === 'Unpaid' ? '#FFF' : theme.colors.warning}
                onPress={() => setPaymentStatus('Unpaid')}
                compact
                style={{ borderRadius: 6, borderColor: theme.colors.warning, marginHorizontal: 1 }}
                contentStyle={{ height: 26, paddingHorizontal: 8 }}
                labelStyle={{ fontSize: 11, marginVertical: 0, marginHorizontal: 0, fontWeight: paymentStatus === 'Unpaid' ? '700' : '500' }}
              >
                Unpaid
              </Button>
            </View>
          </View>

          {/* Row 2: Live Grand Total + Action Buttons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            {/* Total Summary */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Total ({cart.reduce((sum, item) => sum + item.quantity, 0)} {cart.reduce((sum, item) => sum + item.quantity, 0) === 1 ? 'item' : 'items'})
              </Text>
              <Text
                variant="titleLarge"
                style={[styles.boldText, { color: theme.colors.primary, lineHeight: 28, fontSize: 20 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {organization.currency} {grandTotal.toFixed(2)}
              </Text>
            </View>

            {/* Actions: Reset + Preview + Save & Print */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Button
                mode="outlined"
                icon={({ color }) => <Icon source="refresh" size={15} color={color} />}
                textColor={theme.colors.error}
                style={{ borderColor: theme.colors.error + '60', borderRadius: 8, minWidth: 46 }}
                contentStyle={{ height: 38, paddingHorizontal: 4 }}
                labelStyle={{ fontSize: 11, marginVertical: 0, marginLeft: 2, marginRight: 4 }}
                compact
                onPress={handleResetInvoiceData}
              >
                Reset
              </Button>

              <Button
                mode="outlined"
                icon={({ color }) => <Icon source="eye-outline" size={16} color={color} />}
                style={{ borderRadius: 8 }}
                contentStyle={{ height: 38, paddingHorizontal: 6 }}
                labelStyle={{ fontSize: 11.5, marginVertical: 0, marginLeft: 4, marginRight: 6 }}
                disabled={cart.length === 0 || isPrinterLocked}
                compact
                onPress={() => handleSaveInvoice(false)}
              >
                Preview
              </Button>

              <Button
                mode="contained"
                icon={({ color }) => <Icon source="printer" size={17} color={color} />}
                compact
                style={{ borderRadius: 8 }}
                contentStyle={{ height: 38, paddingHorizontal: 8 }}
                labelStyle={{ fontSize: 12, fontWeight: 'bold', marginVertical: 0, marginLeft: 4, marginRight: 8 }}
                disabled={cart.length === 0 || isPrinterLocked}
                onPress={() => handleSaveInvoice(true)}
              >
                Save & Print
              </Button>
            </View>
          </View>
        </View>
      </View>

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

        {/* Customer Selector Dialog with Inline Quick-Add */}
        <Dialog visible={customerDialogVisible} onDismiss={() => setCustomerDialogVisible(false)}>
          <Dialog.Title>Select Customer</Dialog.Title>

          <TextInput
            placeholder="Search by name or 10-digit mobile..."
            value={customerSearchQuery}
            onChangeText={setCustomerSearchQuery}
            mode="outlined"
            dense
            style={{ marginHorizontal: 24, marginBottom: 8, backgroundColor: '#FFFFFF' }}
            left={<TextInput.Icon icon="magnify" />}
            right={customerSearchQuery ? <TextInput.Icon icon="close" onPress={() => setCustomerSearchQuery('')} /> : null}
          />

          {customerSearchQuery.trim().length > 0 && !customers.some(c => c.name.toLowerCase() === customerSearchQuery.trim().toLowerCase() || c.phone === customerSearchQuery.trim()) && (
            <Card
              style={{ marginHorizontal: 24, marginBottom: 8, backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary }}
              mode="outlined"
              onPress={handleQuickAddCustomer}
            >
              <Card.Content style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 13, color: theme.colors.onPrimaryContainer }}>
                    + Quick Add Customer
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.colors.onPrimaryContainer }} numberOfLines={1}>
                    "{customerSearchQuery.trim()}"
                  </Text>
                </View>
                <Button mode="contained" compact onPress={handleQuickAddCustomer} labelStyle={{ fontSize: 11, marginHorizontal: 4 }}>
                  Add & Pick
                </Button>
              </Card.Content>
            </Card>
          )}

          <Dialog.ScrollArea>
            <FlatList
              data={filteredCustomers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <List.Item
                  title={item.name}
                  description={item.phone === '0000000000' ? 'Walk-in Customer' : item.phone}
                  onPress={() => {
                    setSelectedCustomerId(item.id);
                    setCustomerSearchQuery('');
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
              style={{ maxHeight: 260 }}
              ListEmptyComponent={() => (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>
                    No matching customers found.
                  </Text>
                </View>
              )}
            />
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => { setCustomerSearchQuery(''); setCustomerDialogVisible(false); }}>Cancel</Button>
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

        {/* Action Feedback Snackbar */}
        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={2500}
          style={{ backgroundColor: '#2E7D32', borderRadius: 8 }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>{snackbarMessage}</Text>
        </Snackbar>
      </Portal>

      {/* Loading Overlay Spinner */}
      {isLoading && (
        <Portal>
          <View style={styles.loadingOverlay}>
            <Card style={styles.loadingCard} mode="elevated">
              <Card.Content style={styles.loadingContent}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={{ marginTop: 12, fontWeight: '500' }} variant="bodyMedium">
                  Processing invoice...
                </Text>
              </Card.Content>
            </Card>
          </View>
        </Portal>
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
  compactCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  compactCustomerContent: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginVertical: 4,
  },
  centerAlign: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  cartCard: {
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
    borderRadius: 8,
  },
  cartCardContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyBtn: {
    margin: 0,
    width: 32,
    height: 32,
  },
  qtyText: {
    minWidth: 28,
    textAlign: 'center',
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  boldText: {
    fontWeight: 'bold',
  },
  stickyCheckoutDock: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: -2 },
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  loadingContent: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
});
