import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, FlatList, Alert } from 'react-native';
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
} from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { Invoice, InvoiceItem, Customer, Product } from '../db/types';

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
    if (existing) {
      const delta = getDeltaForUnit(existing.unit, false);
      setCart(
        cart.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + delta } : item
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

  const updateQuantity = (productId: string, isDecrement: boolean) => {
    setCart(
      cart
        .map((item) => {
          if (item.product.id === productId) {
            const delta = getDeltaForUnit(item.unit, isDecrement);
            const nextQty = Math.max(0, item.quantity + delta);
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
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
      navigation.navigate('PrintPreview', { invoiceId });
    } catch (e) {
      Alert.alert('Error', 'Failed to generate invoice. Please try again.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
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
                  <Text variant="titleMedium" style={styles.boldText} numberOfLines={1}>
                    {item.product.name}
                  </Text>
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
                const sanitized = text.replace(/[^0-9.]/g, '');
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
              keyboardType="numeric"
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
              <Text variant="bodyLarge">{organization.currency} {subtotal.toFixed(2)}</Text>
            </View>

            {organization.showGstOnBill && organization.gstNumber && totalTax > 0 ? (
              <>
                <View style={styles.calcRow}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    CGST (Central GST)
                  </Text>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {organization.currency} {cgst.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.calcRow}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    SGST (State GST)
                  </Text>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {organization.currency} {sgst.toFixed(2)}
                  </Text>
                </View>
              </>
            ) : null}

            {discountVal > 0 ? (
              <View style={styles.calcRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.error }}>Discount</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                  -{organization.currency} {discountVal.toFixed(2)}
                </Text>
              </View>
            ) : null}

            <Divider />

            <View style={styles.calcRow}>
              <Text variant="titleLarge" style={styles.boldText}>Grand Total</Text>
              <Text variant="titleLarge" style={[styles.boldText, { color: theme.colors.primary }]}>
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
                      let sanitized = text.replace(/[^0-9.]/g, '');
                      const u = (editingCartItem.unit || '').toLowerCase();
                      if (['pcs', 'numbers', 'number', 'pack', 'box', 'strip', 'tablet'].includes(u)) {
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
                    keyboardType="numeric"
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
                  } else {
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
                  }
                  setEditItemDialogVisible(false);
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
                renderItem={({ item }) => (
                  <List.Item
                    title={item.name}
                    description={`Price: ${organization.currency}${item.price.toFixed(2)} / ${item.unit || 'Pcs'} • GST: ${item.taxRate}%`}
                    onPress={() => addToCart(item)}
                    left={(props) => <List.Icon {...props} icon="package-variant-closed" />}
                  />
                )}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
});
