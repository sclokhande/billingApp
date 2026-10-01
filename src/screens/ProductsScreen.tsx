import React, { useState } from 'react';
import { StyleSheet, View, FlatList, Alert, ScrollView, useWindowDimensions, Platform, TouchableOpacity } from 'react-native';
import {
  Text,
  Card,
  Button,
  FAB,
  Portal,
  Dialog,
  TextInput,
  IconButton,
  useTheme,
  Chip,
  Snackbar,
  ActivityIndicator,
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useBilling } from '../context/BillingContext';
import { Product } from '../db/types';

const UNIT_DROPDOWN_OPTIONS = [
  { value: 'Pcs', label: 'Pcs (Pieces)' },
  { value: 'Nos', label: 'Nos (Numbers)' },
  { value: 'Kg', label: 'Kg (Kilograms)' },
  { value: 'Gm', label: 'Gm (Grams)' },
  { value: 'Ltr', label: 'Ltr (Liters)' },
  { value: 'Ml', label: 'Ml (Milliliters)' },
  { value: 'Meter', label: 'Meter (Mtrs)' },
  { value: 'Pack', label: 'Pack (Packet)' },
  { value: 'Box', label: 'Box (Carton)' },
  { value: 'Doz', label: 'Doz (Dozen)' },
  { value: 'Roll', label: 'Roll' },
  { value: 'Plate', label: 'Plate' },
  { value: 'Set', label: 'Set' },
  { value: 'Bundle', label: 'Bundle' },
  { value: 'Service', label: 'Service' },
  { value: 'Session', label: 'Session' },
  { value: 'Hour', label: 'Hour (Hrs)' },
  { value: 'Day', label: 'Day' },
  { value: 'Month', label: 'Month' },
  { value: 'Visit', label: 'Visit' },
];

const QUICK_UNIT_PRESETS = ['Pcs', 'Nos', 'Kg', 'Gm', 'Ltr', 'Pack', 'Box'];

const getUnitLabel = (currentUnit: string): string => {
  const match = UNIT_DROPDOWN_OPTIONS.find((opt) => opt.value.toLowerCase() === currentUnit?.trim().toLowerCase());
  if (match) return match.label;
  if (!currentUnit || currentUnit.trim() === '') return 'Pcs (Pieces)';
  return `Custom: ${currentUnit}`;
};

const GST_DROPDOWN_OPTIONS = [
  { value: '0', label: '0% (Nil / Exempt Goods)' },
  { value: '0.25', label: '0.25% (Precious Stones & Diamonds)' },
  { value: '3', label: '3% (Gold, Silver & Jewelry)' },
  { value: '5', label: '5% (Essential Commodities)' },
  { value: '12', label: '12% (Standard Lower Slab)' },
  { value: '18', label: '18% (Standard General Slab)' },
  { value: '28', label: '28% (Luxury & High Tax Slab)' },
];

const getGstRateLabel = (rate: string): string => {
  const match = GST_DROPDOWN_OPTIONS.find((opt) => opt.value === rate);
  if (match) return match.label;
  if (!rate || rate === '0') return '0% (Nil / Exempt Goods)';
  return `Custom: ${rate}% (Manual Rate)`;
};

export const ProductsScreen = () => {
  const theme = useTheme() as any;
  const { products, saveProduct, deleteProduct, organization, isLoading, isDemoMode } = useBilling();
  const { width, height } = useWindowDimensions();

  const numColumns = width > 600 ? 2 : 1;

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog management
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Snackbar states
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<'success' | 'error' | 'info'>('success');

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setSnackbarMessage(msg);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [taxRate, setTaxRate] = useState('0'); // Default 0% GST
  const [unit, setUnit] = useState('Pcs');
  const [stockQuantity, setStockQuantity] = useState('0');

  // Custom GST Rate Popup Dialog states
  const [customTaxDialogVisible, setCustomTaxDialogVisible] = useState(false);
  const [customTaxInput, setCustomTaxInput] = useState('');
  const [gstDropdownOpen, setGstDropdownOpen] = useState(false);

  // Unit Dropdown & Custom Popup states
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [customUnitDialogVisible, setCustomUnitDialogVisible] = useState(false);
  const [customUnitInput, setCustomUnitInput] = useState('');

  const toggleUnitDropdown = () => {
    if (!unitDropdownOpen) {
      setGstDropdownOpen(false);
    }
    setUnitDropdownOpen(!unitDropdownOpen);
  };

  const toggleGstDropdown = () => {
    if (!gstDropdownOpen) {
      setUnitDropdownOpen(false);
    }
    setGstDropdownOpen(!gstDropdownOpen);
  };

  const openCustomTaxDialog = () => {
    setGstDropdownOpen(false);
    setUnitDropdownOpen(false);
    setCustomTaxInput(taxRate !== '0' ? taxRate : '');
    setCustomTaxDialogVisible(true);
  };

  const handleApplyCustomTax = () => {
    const trimmed = customTaxInput.trim();
    if (!trimmed) {
      setTaxRate('0');
      setCustomTaxDialogVisible(false);
      return;
    }
    const val = parseFloat(trimmed);
    if (isNaN(val) || val < 0 || val > 100) {
      Alert.alert('Invalid Rate', 'Please enter a valid GST rate between 0% and 100%.');
      return;
    }
    setTaxRate(val.toString());
    setCustomTaxDialogVisible(false);
  };

  const openCustomUnitDialog = () => {
    setUnitDropdownOpen(false);
    setGstDropdownOpen(false);
    setCustomUnitInput(unit && unit !== 'Pcs' ? unit : '');
    setCustomUnitDialogVisible(true);
  };

  const handleApplyCustomUnit = () => {
    const trimmed = customUnitInput.trim();
    if (!trimmed) {
      setUnit('Pcs');
      setCustomUnitDialogVisible(false);
      return;
    }
    if (trimmed.length > 20) {
      Alert.alert('Invalid Unit', 'Unit name should be at most 20 characters.');
      return;
    }
    setUnit(trimmed);
    setCustomUnitDialogVisible(false);
  };

  const openAddDialog = () => {
    if (isDemoMode && products.length >= 3) {
      Alert.alert('Demo Limit Reached', 'Demo Version Limit: You can add a maximum of 3 inventory products in the Demo build.');
      return;
    }
    setEditingProduct(null);
    setName('');
    setDescription('');
    setPrice('');
    setTaxRate('0');
    setUnit('Pcs');
    setStockQuantity('0');
    setGstDropdownOpen(false);
    setUnitDropdownOpen(false);
    setDialogVisible(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description || '');
    setPrice(product.price.toString());
    setTaxRate(product.taxRate.toString());
    setUnit(product.unit || 'Pcs');
    setStockQuantity((product.stockQuantity ?? 0).toString());
    setGstDropdownOpen(false);
    setUnitDropdownOpen(false);
    setDialogVisible(true);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Validation Error', 'Product Name is required.');
      return;
    }
    if (trimmedName.length < 2) {
      Alert.alert('Validation Error', 'Product Name must be at least 2 characters.');
      return;
    }

    if (!price.trim()) {
      Alert.alert('Validation Error', 'Product Price is required.');
      return;
    }
    const priceVal = parseFloat(price);
    if (isNaN(priceVal) || priceVal <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid product price (must be greater than Rs. 0).');
      return;
    }

    if (!stockQuantity.trim()) {
      Alert.alert('Validation Error', 'Stock Quantity is required.');
      return;
    }
    const stockVal = parseFloat(stockQuantity);
    if (isNaN(stockVal) || stockVal < 0) {
      Alert.alert('Validation Error', 'Please enter a valid stock quantity (0 or more).');
      return;
    }

    const parsedTax = parseFloat(taxRate);
    if (isNaN(parsedTax) || parsedTax < 0 || parsedTax > 100) {
      Alert.alert('Validation Error', 'Please enter a valid GST rate between 0% and 100%.');
      return;
    }

    try {
      const productData: Product = {
        id: editingProduct ? editingProduct.id : '',
        name: name.trim(),
        description: description.trim(),
        price: priceVal,
        taxRate: parsedTax,
        unit: unit.trim() || 'Pcs',
        stockQuantity: stockVal,
      };

      await saveProduct(productData);
      setDialogVisible(false);
      showToast(editingProduct ? 'Product updated successfully!' : 'Product added successfully!', 'success');
    } catch {
      showToast('Error: Failed to save product.', 'error');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Product',
      'Are you sure you want to delete this product from the inventory?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProduct(id);
              showToast('Product deleted successfully!', 'success');
            } catch {
              showToast('Error: Failed to delete product.', 'error');
            }
          },
        },
      ]
    );
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <View style={styles.container}>
      <View style={{ flex: 1, width: '100%', maxWidth: 900, alignSelf: 'center' }}>
        {/* Search Input */}
        <TextInput
          placeholder="Search products..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          mode="outlined"
          dense
          style={styles.searchBar}
          left={<TextInput.Icon icon="magnify" />}
          right={searchQuery ? <TextInput.Icon icon="close" onPress={() => setSearchQuery('')} /> : null}
        />

        {/* Product List */}
        {filteredProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              {searchQuery ? 'No products matches your search.' : 'No products in inventory.'}
            </Text>
          </View>
        ) : (
          <FlatList
            key={numColumns}
            numColumns={numColumns}
            data={filteredProducts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 88 }}
            renderItem={({ item }) => (
              <Card style={[styles.card, { flex: 1, marginHorizontal: numColumns > 1 ? 6 : 0 }]} mode="outlined">
                <Card.Content style={styles.cardContent}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text variant="titleMedium" style={styles.boldText} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.description ? (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginVertical: 4 }} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}
                    <Text variant="bodyMedium" style={{ fontWeight: '500', color: theme.colors.primary }}>
                      Price: {organization.currency} {item.price.toFixed(2)}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      GST Tax: {item.taxRate}%
                    </Text>
                    <Text 
                      variant="bodySmall" 
                      style={{ 
                        fontWeight: 'bold', 
                        color: item.stockQuantity <= 0 
                          ? theme.colors.error 
                          : item.stockQuantity <= 5 
                            ? theme.colors.warning 
                            : theme.colors.success,
                        marginTop: 4 
                      }}
                    >
                      {item.stockQuantity <= 0 
                        ? 'Out of Stock' 
                        : item.stockQuantity <= 5 
                          ? `Low Stock: ${item.stockQuantity} ${item.unit || 'Pcs'}`
                          : `Stock: ${item.stockQuantity} ${item.unit || 'Pcs'}`}
                    </Text>
                  </View>
                  <View style={styles.cardActions}>
                    <IconButton icon="pencil-outline" size={20} onPress={() => openEditDialog(item)} />
                    <IconButton icon="trash-can-outline" size={20} iconColor={theme.colors.error} onPress={() => handleDelete(item.id)} />
                  </View>
                </Card.Content>
              </Card>
            )}
          />
        )}

        {/* Floating Action Button */}
        <FAB icon="plus" style={[styles.fab, { backgroundColor: theme.colors.primary }]} color="#FFF" onPress={openAddDialog} />
      </View>

      {/* Add/Edit Product Dialog */}
      <Portal>
        <Dialog
          visible={dialogVisible}
          onDismiss={() => setDialogVisible(false)}
          style={[
            styles.productDialog,
            {
              width: width > 640 ? Math.min(Math.round(width * 0.75), 580) : '94%',
              height: height > 550 ? Math.min(Math.round(height * 0.85), 680) : Math.round(height * 0.92),
            },
          ]}
        >
          {/* Fixed Header */}
          <View style={styles.dialogFixedHeader}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={[
                  styles.headerIconContainer,
                  { backgroundColor: theme.colors.primaryContainer || '#E0E7FF' },
                ]}
              >
                <MaterialCommunityIcons
                  name={editingProduct ? 'pencil-outline' : 'plus'}
                  size={20}
                  color={theme.colors.primary}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                  {editingProduct ? 'Update item pricing, unit & GST slab' : 'Enter product details to add to inventory'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setDialogVisible(false)}
              style={styles.dialogCloseButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="close" size={22} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {/* Scrollable Body Only */}
          <View style={styles.dialogScrollArea}>
            <ScrollView
              style={{ flex: 1, width: '100%' }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.dialogScrollContent}
            >
              <TextInput
                label="Product Name *"
                value={name}
                onChangeText={setName}
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Description"
                value={description}
                onChangeText={setDescription}
                mode="outlined"
                multiline
                numberOfLines={2}
                style={styles.input}
              />
              <TextInput
                label="Price (Rs.) *"
                value={price}
                onChangeText={(text) => setPrice(text.replace(/,/g, '.').replace(/[^0-9.]/g, ''))}
                keyboardType={Platform.OS === 'ios' && __DEV__ ? 'default' : 'decimal-pad'}
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="currency-inr" />}
              />

              <TextInput
                label="Stock Quantity Available *"
                value={stockQuantity}
                onChangeText={(text) => setStockQuantity(text.replace(/,/g, '.').replace(/[^0-9.]/g, ''))}
                keyboardType={Platform.OS === 'ios' && __DEV__ ? 'default' : 'decimal-pad'}
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="archive-outline" />}
              />

              {/* Product Unit Section: Interactive Dropdown & Manual Popup */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 6 }}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold' }}>
                  PRODUCT UNIT ({unit || 'Pcs'}) *
                </Text>
                <TouchableOpacity
                  onPress={openCustomUnitDialog}
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.colors.primary} />
                  <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: 'bold', marginLeft: 4 }}>
                    Enter Manually
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Product Unit Dropdown Selector Field */}
              <View style={styles.dropdownWrapper}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={toggleUnitDropdown}
                  style={[
                    styles.dropdownButton,
                    {
                      borderColor: unitDropdownOpen ? theme.colors.primary : '#CBD5E1',
                      backgroundColor: unitDropdownOpen ? theme.colors.primaryContainer + '20' : '#FFFFFF',
                    },
                  ]}
                >
                  <MaterialCommunityIcons name="tag-outline" size={20} color={theme.colors.primary} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                      Select Product Unit (Dropdown)
                    </Text>
                    <Text
                      variant="bodyMedium"
                      style={{
                        fontWeight: 'bold',
                        color: theme.colors.onSurface,
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {getUnitLabel(unit)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={unitDropdownOpen ? 'chevron-up' : 'menu-down'}
                    size={26}
                    color={theme.colors.primary}
                  />
                </TouchableOpacity>

                {/* Dropdown Options List */}
                {unitDropdownOpen && (
                  <View style={[styles.dropdownMenu, { maxHeight: 230 }]}>
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                      {UNIT_DROPDOWN_OPTIONS.map((option) => {
                        const isSelected = unit?.trim().toLowerCase() === option.value.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={option.value}
                            activeOpacity={0.7}
                            onPress={() => {
                              setUnit(option.value);
                              setUnitDropdownOpen(false);
                            }}
                            style={[
                              styles.dropdownMenuItem,
                              isSelected && { backgroundColor: theme.colors.primaryContainer },
                            ]}
                          >
                            <Text
                              variant="bodyMedium"
                              style={{
                                flex: 1,
                                fontWeight: isSelected ? 'bold' : 'normal',
                                color: isSelected ? theme.colors.primary : theme.colors.onSurface,
                              }}
                            >
                              {option.label}
                            </Text>
                            {isSelected && (
                              <MaterialCommunityIcons name="check" size={18} color={theme.colors.primary} />
                            )}
                          </TouchableOpacity>
                        );
                      })}

                      {/* Custom Unit Dropdown Item */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          setUnitDropdownOpen(false);
                          openCustomUnitDialog();
                        }}
                        style={[
                          styles.dropdownMenuItem,
                          styles.dropdownCustomItem,
                          !UNIT_DROPDOWN_OPTIONS.some((p) => p.value.toLowerCase() === unit?.trim().toLowerCase()) && Boolean(unit && unit !== 'Pcs')
                            ? { backgroundColor: theme.colors.primaryContainer }
                            : null,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="pencil-outline"
                          size={18}
                          color={theme.colors.primary}
                          style={{ marginRight: 8 }}
                        />
                        <Text
                          variant="bodyMedium"
                          style={{
                            flex: 1,
                            fontWeight: 'bold',
                            color: theme.colors.primary,
                          }}
                        >
                          {!UNIT_DROPDOWN_OPTIONS.some((p) => p.value.toLowerCase() === unit?.trim().toLowerCase()) && Boolean(unit && unit !== 'Pcs')
                            ? `Custom Unit: "${unit}" (Edit in Popup)`
                            : '+ Enter Custom Unit (Popup)...'}
                        </Text>
                        {!UNIT_DROPDOWN_OPTIONS.some((p) => p.value.toLowerCase() === unit?.trim().toLowerCase()) && Boolean(unit && unit !== 'Pcs') && (
                          <MaterialCommunityIcons name="check" size={18} color={theme.colors.primary} />
                        )}
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Quick Preset Chips Row for Units */}
              <View style={[styles.presetsContainer, { marginTop: 6, marginBottom: 6 }]}>
                {QUICK_UNIT_PRESETS.map((preset) => {
                  const isSelected = unit === preset;
                  return (
                    <Chip
                      key={preset}
                      selected={isSelected}
                      onPress={() => {
                        setUnit(preset);
                        setUnitDropdownOpen(false);
                      }}
                      style={[
                        styles.presetChip,
                        isSelected && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer },
                      ]}
                      selectedColor={theme.colors.primary}
                      showSelectedOverlay
                    >
                      {preset}
                    </Chip>
                  );
                })}
                <Chip
                  selected={!UNIT_DROPDOWN_OPTIONS.some((p) => p.value.toLowerCase() === unit?.trim().toLowerCase()) && Boolean(unit && unit !== 'Pcs')}
                  onPress={openCustomUnitDialog}
                  icon={!UNIT_DROPDOWN_OPTIONS.some((p) => p.value.toLowerCase() === unit?.trim().toLowerCase()) && Boolean(unit && unit !== 'Pcs') ? 'pencil-outline' : 'plus'}
                  style={[
                    styles.presetChip,
                    !UNIT_DROPDOWN_OPTIONS.some((p) => p.value.toLowerCase() === unit?.trim().toLowerCase()) && Boolean(unit && unit !== 'Pcs')
                      ? { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer }
                      : null,
                  ]}
                  selectedColor={theme.colors.primary}
                >
                  {!UNIT_DROPDOWN_OPTIONS.some((p) => p.value.toLowerCase() === unit?.trim().toLowerCase()) && Boolean(unit && unit !== 'Pcs')
                    ? `Custom: ${unit}`
                    : 'Custom'}
                </Chip>
              </View>

              {/* GST Rate Section: Interactive Dropdown & Manual Popup */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 6 }}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold' }}>
                  GST TAX RATE ({taxRate !== '' ? `${taxRate}%` : '0%'}) *
                </Text>
                <TouchableOpacity
                  onPress={openCustomTaxDialog}
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.colors.primary} />
                  <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: 'bold', marginLeft: 4 }}>
                    Enter Manually
                  </Text>
                </TouchableOpacity>
              </View>

              {/* GST Rate Dropdown Selector Field */}
              <View style={styles.dropdownWrapper}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={toggleGstDropdown}
                  style={[
                    styles.dropdownButton,
                    {
                      borderColor: gstDropdownOpen ? theme.colors.primary : '#CBD5E1',
                      backgroundColor: gstDropdownOpen ? theme.colors.primaryContainer + '20' : '#FFFFFF',
                    },
                  ]}
                >
                  <MaterialCommunityIcons name="percent" size={20} color={theme.colors.primary} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                      Select GST Rate Slab (Dropdown)
                    </Text>
                    <Text
                      variant="bodyMedium"
                      style={{
                        fontWeight: 'bold',
                        color: theme.colors.onSurface,
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {getGstRateLabel(taxRate)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={gstDropdownOpen ? 'chevron-up' : 'menu-down'}
                    size={26}
                    color={theme.colors.primary}
                  />
                </TouchableOpacity>

                {/* Dropdown Options List */}
                {gstDropdownOpen && (
                  <View style={styles.dropdownMenu}>
                    {GST_DROPDOWN_OPTIONS.map((option) => {
                      const isSelected = taxRate === option.value;
                      return (
                        <TouchableOpacity
                          key={option.value}
                          activeOpacity={0.7}
                          onPress={() => {
                            setTaxRate(option.value);
                            setGstDropdownOpen(false);
                          }}
                          style={[
                            styles.dropdownMenuItem,
                            isSelected && { backgroundColor: theme.colors.primaryContainer },
                          ]}
                        >
                          <Text
                            variant="bodyMedium"
                            style={{
                              flex: 1,
                              fontWeight: isSelected ? 'bold' : 'normal',
                              color: isSelected ? theme.colors.primary : theme.colors.onSurface,
                            }}
                          >
                            {option.label}
                          </Text>
                          {isSelected && (
                            <MaterialCommunityIcons name="check" size={18} color={theme.colors.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}

                    {/* Custom Rate Dropdown Item */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        setGstDropdownOpen(false);
                        openCustomTaxDialog();
                      }}
                      style={[
                        styles.dropdownMenuItem,
                        styles.dropdownCustomItem,
                        !GST_DROPDOWN_OPTIONS.some((p) => p.value === taxRate) && Boolean(taxRate && taxRate !== '0')
                          ? { backgroundColor: theme.colors.primaryContainer }
                          : null,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="pencil-outline"
                        size={18}
                        color={theme.colors.primary}
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        variant="bodyMedium"
                        style={{
                          flex: 1,
                          fontWeight: 'bold',
                          color: theme.colors.primary,
                        }}
                      >
                        {!GST_DROPDOWN_OPTIONS.some((p) => p.value === taxRate) && Boolean(taxRate && taxRate !== '0')
                          ? `Custom Rate: ${taxRate}% (Edit in Popup)`
                          : '+ Enter Custom / Manual Rate (Popup)...'}
                      </Text>
                      {!GST_DROPDOWN_OPTIONS.some((p) => p.value === taxRate) && Boolean(taxRate && taxRate !== '0') && (
                        <MaterialCommunityIcons name="check" size={18} color={theme.colors.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Quick Preset Chips Row */}
              <View style={[styles.presetsContainer, { marginTop: 8 }]}>
                {['0', '5', '12', '18', '28'].map((val) => {
                  const isSelected = taxRate === val;
                  return (
                    <Chip
                      key={val}
                      selected={isSelected}
                      onPress={() => {
                        setTaxRate(val);
                        setGstDropdownOpen(false);
                      }}
                      style={[
                        styles.presetChip,
                        isSelected && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer },
                      ]}
                      selectedColor={theme.colors.primary}
                      showSelectedOverlay
                    >
                      {val}%
                    </Chip>
                  );
                })}
                <Chip
                  selected={!GST_DROPDOWN_OPTIONS.some((p) => p.value === taxRate) && Boolean(taxRate && taxRate !== '0')}
                  onPress={openCustomTaxDialog}
                  icon={!GST_DROPDOWN_OPTIONS.some((p) => p.value === taxRate) && Boolean(taxRate && taxRate !== '0') ? 'pencil-outline' : 'plus'}
                  style={[
                    styles.presetChip,
                    !GST_DROPDOWN_OPTIONS.some((p) => p.value === taxRate) && Boolean(taxRate && taxRate !== '0')
                      ? { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer }
                      : null,
                  ]}
                  selectedColor={theme.colors.primary}
                >
                  {!GST_DROPDOWN_OPTIONS.some((p) => p.value === taxRate) && Boolean(taxRate && taxRate !== '0')
                    ? `Custom: ${taxRate}%`
                    : 'Custom'}
                </Chip>
              </View>

              {/* Live Price + GST Calculation Preview */}
              {parseFloat(price) > 0 && (
                <View
                  style={[
                    styles.calcPreviewCard,
                    { backgroundColor: theme.colors.surfaceVariant || '#F0F4F8' },
                  ]}
                >
                  <MaterialCommunityIcons name="calculator-variant-outline" size={18} color={theme.colors.primary} />
                  <Text variant="bodySmall" style={{ marginLeft: 8, flex: 1, color: theme.colors.onSurfaceVariant }}>
                    Base: <Text style={{ fontWeight: 'bold' }}>{organization.currency} {parseFloat(price).toFixed(2)}</Text>
                    {' '}+ GST ({taxRate || '0'}%): <Text style={{ fontWeight: 'bold', color: theme.colors.primary }}>{organization.currency} {((parseFloat(price) * (parseFloat(taxRate) || 0)) / 100).toFixed(2)}</Text>
                    {' '}= Total: <Text style={{ fontWeight: 'bold', color: '#2E7D32' }}>{organization.currency} {(parseFloat(price) * (1 + (parseFloat(taxRate) || 0) / 100)).toFixed(2)}</Text>
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>

          {/* Fixed Footer */}
          <View style={styles.dialogFixedFooter}>
            <Button
              mode="outlined"
              onPress={() => setDialogVisible(false)}
              style={styles.dialogCancelBtn}
              textColor={theme.colors.onSurfaceVariant}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              style={styles.dialogSaveBtn}
              icon={editingProduct ? 'check' : 'plus'}
            >
              {editingProduct ? 'Update Product' : 'Save Product'}
            </Button>
          </View>
        </Dialog>

        {/* Custom GST Rate Popup Dialog */}
        <Dialog
          visible={customTaxDialogVisible}
          onDismiss={() => setCustomTaxDialogVisible(false)}
          style={{
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            width: width > 600 ? 440 : '90%',
            maxWidth: 440,
            alignSelf: 'center',
          }}
        >
          <Dialog.Title>Custom GST Rate</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Enter a custom GST percentage for this product (e.g. 0.25%, 3%, 7.5%, 18%).
            </Text>
            <TextInput
              label="GST Tax Rate (%) *"
              value={customTaxInput}
              onChangeText={(text) => {
                const sanitized = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
                const parts = sanitized.split('.');
                const formatted = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : sanitized;
                setCustomTaxInput(formatted);
              }}
              keyboardType={Platform.OS === 'ios' && __DEV__ ? 'default' : 'decimal-pad'}
              mode="outlined"
              style={{ backgroundColor: '#FFFFFF' }}
              left={<TextInput.Icon icon="percent" />}
              placeholder="e.g. 7.5 or 0.25"
              autoFocus
              right={
                customTaxInput ? (
                  <TextInput.Icon icon="close-circle-outline" onPress={() => setCustomTaxInput('')} />
                ) : null
              }
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCustomTaxDialogVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleApplyCustomTax}>
              Set Rate
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Custom Product Unit Popup Dialog */}
        <Dialog
          visible={customUnitDialogVisible}
          onDismiss={() => setCustomUnitDialogVisible(false)}
          style={{
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            width: width > 600 ? 440 : '90%',
            maxWidth: 440,
            alignSelf: 'center',
          }}
        >
          <Dialog.Title>Custom Product Unit</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Enter a custom measurement unit for this product (e.g. Plate, Quintal, SqFt, Cup, Bundle, Set).
            </Text>
            <TextInput
              label="Product Unit *"
              value={customUnitInput}
              onChangeText={setCustomUnitInput}
              mode="outlined"
              style={{ backgroundColor: '#FFFFFF' }}
              left={<TextInput.Icon icon="tag-outline" />}
              placeholder="e.g. Plate or Quintal"
              autoFocus
              right={
                customUnitInput ? (
                  <TextInput.Icon icon="close-circle-outline" onPress={() => setCustomUnitInput('')} />
                ) : null
              }
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCustomUnitDialogVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleApplyCustomUnit}>
              Set Unit
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2500}
        style={{
          backgroundColor:
            snackbarType === 'error'
              ? '#D32F2F'
              : snackbarType === 'info'
              ? '#0288D1'
              : '#2E7D32',
          borderRadius: 8,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>{snackbarMessage}</Text>
      </Snackbar>

      {/* Loading Overlay Spinner */}
      {isLoading && (
        <Portal>
          <View style={styles.loadingOverlay}>
            <Card style={styles.loadingCard} mode="elevated">
              <Card.Content style={styles.loadingContent}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={{ marginTop: 12, fontWeight: '500' }} variant="bodyMedium">
                  Updating inventory...
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
  searchBar: {
    margin: 16,
    backgroundColor: '#FFFFFF',
  },
  card: {
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardActions: {
    flexDirection: 'row',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    borderRadius: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  presetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  presetChip: {
    marginRight: 6,
    marginBottom: 8,
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
  calcPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  dropdownWrapper: {
    marginBottom: 4,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginTop: 4,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownCustomItem: {
    borderBottomWidth: 0,
    backgroundColor: '#F8FAFC',
  },
  productDialog: {
    alignSelf: 'center',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    marginVertical: 0,
    marginHorizontal: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  dialogFixedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  headerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogCloseButton: {
    padding: 4,
    borderRadius: 20,
  },
  dialogScrollArea: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  dialogScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  dialogFixedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 12,
    flexShrink: 0,
  },
  dialogCancelBtn: {
    borderColor: '#CBD5E1',
    borderRadius: 8,
  },
  dialogSaveBtn: {
    borderRadius: 8,
    minWidth: 110,
  },
});
