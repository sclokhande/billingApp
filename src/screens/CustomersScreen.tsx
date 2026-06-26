import React, { useState } from 'react';
import { StyleSheet, View, FlatList, Alert, Linking, Platform, ScrollView, useWindowDimensions } from 'react-native';
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
  Snackbar,
  ActivityIndicator,
} from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { Customer } from '../db/types';

export const CustomersScreen = () => {
  const theme = useTheme();
  const { customers, saveCustomer, deleteCustomer, isLoading } = useBilling();
  const { width } = useWindowDimensions();

  const numColumns = width > 600 ? 2 : 1;

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog management
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Snackbar states
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const openAddDialog = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setDialogVisible(true);
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setPhone(customer.phone === '0000000000' ? '' : customer.phone);
    setEmail(customer.email === 'walkin@retail.com' ? '' : customer.email || '');
    setAddress(customer.address === 'Retail Counter' ? '' : customer.address || '');
    setDialogVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Customer Name is required.');
      return;
    }

    try {
      const customerData: Customer = {
        id: editingCustomer ? editingCustomer.id : '',
        name: name.trim(),
        phone: phone.trim() || '0000000000',
        email: email.trim() || '',
        address: address.trim() || '',
      };

      await saveCustomer(customerData);
      setDialogVisible(false);
      setSnackbarMessage(editingCustomer ? 'Customer details updated!' : 'Customer added successfully!');
      setSnackbarVisible(true);
    } catch (e) {
      setSnackbarMessage('Error: Failed to save customer.');
      setSnackbarVisible(true);
    }
  };

  const handleDelete = (customer: Customer) => {
    if (customer.name.toLowerCase().includes('walk-in')) {
      Alert.alert('Protected Account', 'The default Walk-in Customer account cannot be deleted.');
      return;
    }

    Alert.alert(
      'Delete Customer',
      `Are you sure you want to delete "${customer.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCustomer(customer.id);
              setSnackbarMessage('Customer deleted successfully!');
              setSnackbarVisible(true);
            } catch (e) {
              setSnackbarMessage('Error: Failed to delete customer.');
              setSnackbarVisible(true);
            }
          },
        },
      ]
    );
  };

  const handleCall = (phoneNumber: string) => {
    if (phoneNumber === '0000000000') return;
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

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  );

  return (
    <View style={styles.container}>
      <View style={{ flex: 1, width: '100%', maxWidth: 900, alignSelf: 'center' }}>
        {/* Search Input */}
        <TextInput
          placeholder="Search customers by name or phone..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          mode="outlined"
          dense
          style={styles.searchBar}
          left={<TextInput.Icon icon="magnify" />}
          right={searchQuery ? <TextInput.Icon icon="close" onPress={() => setSearchQuery('')} /> : null}
        />

        {/* Customers List */}
        {filteredCustomers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              {searchQuery ? 'No customers match your search.' : 'No customers listed.'}
            </Text>
          </View>
        ) : (
          <FlatList
            key={numColumns}
            numColumns={numColumns}
            data={filteredCustomers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 88 }}
            renderItem={({ item }) => {
              const isWalkIn = item.name.toLowerCase().includes('walk-in');
              return (
                <Card style={[styles.card, { flex: 1, marginHorizontal: numColumns > 1 ? 6 : 0 }]} mode="outlined">
                  <Card.Content style={styles.cardContent}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text variant="titleMedium" style={styles.boldText} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.phone && item.phone !== '0000000000' && (
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                          📞 {item.phone}
                        </Text>
                      )}
                      {item.address && item.address !== 'Retail Counter' && (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }} numberOfLines={1}>
                          📍 {item.address}
                        </Text>
                      )}
                    </View>
                    <View style={styles.cardActions}>
                      {item.phone && item.phone !== '0000000000' && (
                        <IconButton icon="phone-outline" size={20} iconColor={theme.colors.primary} onPress={() => handleCall(item.phone)} />
                      )}
                      <IconButton icon="pencil-outline" size={20} onPress={() => openEditDialog(item)} />
                      {!isWalkIn && (
                        <IconButton icon="trash-can-outline" size={20} iconColor={theme.colors.error} onPress={() => handleDelete(item)} />
                      )}
                    </View>
                  </Card.Content>
                </Card>
              );
            }}
          />
        )}

        {/* Floating Action Button */}
        <FAB icon="plus" style={[styles.fab, { backgroundColor: theme.colors.primary }]} color="#FFF" onPress={openAddDialog} />
      </View>

      {/* Add/Edit Customer Dialog */}
      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>{editingCustomer ? 'Edit Customer Info' : 'Add New Customer'}</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12 }}>
              <TextInput
                label="Customer Name *"
                value={name}
                onChangeText={setName}
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Phone Number"
                value={phone}
                onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
                keyboardType="phone-pad"
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Billing Address"
                value={address}
                onChangeText={setAddress}
                mode="outlined"
                multiline
                numberOfLines={2}
                style={styles.input}
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
                  Updating customers...
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
