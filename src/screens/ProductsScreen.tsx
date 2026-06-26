import React, { useState } from 'react';
import { StyleSheet, View, FlatList, Alert, ScrollView, useWindowDimensions } from 'react-native';
import {
  Text,
  Card,
  Button,
  FAB,
  Portal,
  Dialog,
  TextInput,
  IconButton,
  SegmentedButtons,
  useTheme,
  Divider,
  Chip,
  Snackbar,
  ActivityIndicator,
} from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { Product } from '../db/types';

const UNIT_PRESETS = [
  'Pcs', 'Numbers', 'Kg', 'Gm', 'Ltr', 'Ml', 'Meter', 'Pack', 'Box', 'Doz', 
  'Roll', 'Service', 'Session', 'Hour', 'Month', 'Visit', 'Day'
];

export const ProductsScreen = () => {
  const theme = useTheme();
  const { products, saveProduct, deleteProduct, organization, isLoading } = useBilling();
  const { width } = useWindowDimensions();

  const numColumns = width > 600 ? 2 : 1;

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog management
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Snackbar states
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [taxRate, setTaxRate] = useState('18'); // Default 18% GST
  const [unit, setUnit] = useState('Pcs');

  const openAddDialog = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setPrice('');
    setTaxRate('18');
    setUnit('Pcs');
    setDialogVisible(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description || '');
    setPrice(product.price.toString());
    setTaxRate(product.taxRate.toString());
    setUnit(product.unit || 'Pcs');
    setDialogVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Product Name is required.');
      return;
    }
    const priceVal = parseFloat(price);
    if (isNaN(priceVal) || priceVal <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid product price.');
      return;
    }

    try {
      const productData: Product = {
        id: editingProduct ? editingProduct.id : '',
        name: name.trim(),
        description: description.trim(),
        price: priceVal,
        taxRate: parseFloat(taxRate) || 0,
        unit: unit.trim() || 'Pcs',
      };

      await saveProduct(productData);
      setDialogVisible(false);
      setSnackbarMessage(editingProduct ? 'Product updated successfully!' : 'Product added successfully!');
      setSnackbarVisible(true);
    } catch (e) {
      setSnackbarMessage('Error: Failed to save product.');
      setSnackbarVisible(true);
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
              setSnackbarMessage('Product deleted successfully!');
              setSnackbarVisible(true);
            } catch (e) {
              setSnackbarMessage('Error: Failed to delete product.');
              setSnackbarVisible(true);
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
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>{editingProduct ? 'Edit Product' : 'Add New Product'}</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12 }}>
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
                onChangeText={(text) => setPrice(text.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="currency-inr" />}
              />

              <TextInput
                label="Product Unit (e.g. KG, Pcs, Meter) *"
                value={unit}
                onChangeText={setUnit}
                mode="outlined"
                style={styles.input}
                placeholder="e.g. KG, Pcs, Meter"
                left={<TextInput.Icon icon="weight-kilogram" />}
              />

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                QUICK UNIT PRESETS
              </Text>
              
              <View style={styles.presetsContainer}>
                {UNIT_PRESETS.map((preset) => (
                  <Chip
                    key={preset}
                    selected={unit === preset}
                    onPress={() => setUnit(preset)}
                    style={styles.presetChip}
                    selectedColor={theme.colors.primary}
                    showSelectedOverlay
                  >
                    {preset}
                  </Chip>
                ))}
              </View>

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, marginBottom: 8 }}>
                GST RATE (%)
              </Text>
              
              <SegmentedButtons
                value={taxRate}
                onValueChange={setTaxRate}
                buttons={[
                  { value: '0', label: '0%' },
                  { value: '5', label: '5%' },
                  { value: '12', label: '12%' },
                  { value: '18', label: '18%' },
                  { value: '28', label: '28%' },
                ]}
                style={{ marginBottom: 12 }}
              />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleSave}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
      >
        {snackbarMessage}
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
});
