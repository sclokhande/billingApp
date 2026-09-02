import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Image,
  ScrollView,
  Alert,
  Platform,
  Linking,
  KeyboardAvoidingView,
  TouchableOpacity,
} from 'react-native';
import { Text, TextInput, Button, Card, Avatar, useTheme } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_CONFIG } from '../config/app_config';

export const ActivationScreen = ({ navigation }: any) => {
  const theme = useTheme();
  const [activationKey, setActivationKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleActivate = async () => {
    const trimmedInput = activationKey.trim().toUpperCase();
    if (!trimmedInput) {
      setErrorMessage('Please enter the activation key.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    const expectedPin = (APP_CONFIG.ACTIVATION_PIN || '').trim().toUpperCase();

    if (trimmedInput === expectedPin) {
      try {
        await AsyncStorage.setItem(APP_CONFIG.ACTIVATION_STORAGE_KEY, 'true');
        Alert.alert(
          'Activation Successful',
          'Parchiwala App has been successfully activated on your device.',
          [
            {
              text: 'Get Started',
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'MainTabs' }],
                });
              },
            },
          ]
        );
      } catch (e) {
        console.error('[ActivationScreen] Failed to save activation flag:', e);
        Alert.alert('Error', 'Failed to store activation state. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(false);
      setErrorMessage('Invalid Activation Key. Please verify your key and try again.');
      Alert.alert(
        'Activation Failed',
        'The Activation Key entered is invalid for this build. Please contact Parchiwala support if you need assistance.'
      );
    }
  };

  const handleCallSupport = () => {
    const phoneNumber = '+918551010291';
    const url = Platform.OS === 'android' ? `tel:${phoneNumber}` : `telprompt:${phoneNumber}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Unable to initiate call.'));
  };

  const handleEmailSupport = () => {
    const email = 'support@parchiwala.com';
    const subject = encodeURIComponent('Parchiwala Activation Key Query');
    const url = `mailto:${email}?subject=${subject}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Unable to open email client.'));
  };

  const handleWebsiteSupport = async () => {
    const websiteUrl = 'https://www.parchiwala.com';
    try {
      await Linking.openURL(websiteUrl);
    } catch {
      Alert.alert('Error', 'Unable to open website in browser.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerContainer}>
          <Image
            source={require('../assets/logo_emblem.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text variant="headlineMedium" style={[styles.appTitle, { color: theme.colors.primary }]}>
            PARCHIWALA
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
            First-Time App Activation
          </Text>
        </View>

        <Card style={styles.card} mode="elevated">
          <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Enter Activation Key
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
              This app installation requires a valid Activation Key to unlock functionality on your mobile device.
            </Text>

            <TextInput
              label="Activation Key"
              placeholder="e.g. S5M26080690"
              value={activationKey}
              onChangeText={(text) => {
                setActivationKey(text.toUpperCase());
                if (errorMessage) setErrorMessage('');
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              mode="outlined"
              error={!!errorMessage}
              left={<TextInput.Icon icon="shield-key-outline" />}
              right={
                activationKey.length > 0 ? (
                  <TextInput.Icon icon="close-circle-outline" onPress={() => setActivationKey('')} />
                ) : null
              }
              style={styles.input}
            />

            {!!errorMessage && (
              <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 4, marginBottom: 8 }}>
                {errorMessage}
              </Text>
            )}

            <Button
              mode="contained"
              onPress={handleActivate}
              loading={isSubmitting}
              disabled={isSubmitting || !activationKey.trim()}
              style={styles.activateBtn}
              contentStyle={{ paddingVertical: 6 }}
            >
              Activate App
            </Button>
          </Card.Content>
        </Card>

        {/* Need Help Section */}
        <View style={styles.supportSection}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12, textAlign: 'center' }}>
            Don't have an Activation Key? Contact Support:
          </Text>

          <View style={styles.supportRow}>
            <TouchableOpacity
              style={[styles.supportChip, { backgroundColor: theme.colors.primaryContainer }]}
              onPress={handleCallSupport}
            >
              <Avatar.Icon size={28} icon="phone" style={{ backgroundColor: theme.colors.primary }} color={theme.colors.onPrimary} />
              <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onPrimaryContainer, fontWeight: 'bold' }}>
                Call Us
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.supportChip, { backgroundColor: theme.colors.secondaryContainer }]}
              onPress={handleEmailSupport}
            >
              <Avatar.Icon size={28} icon="email" style={{ backgroundColor: theme.colors.secondary }} color={theme.colors.onSecondary} />
              <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSecondaryContainer, fontWeight: 'bold' }}>
                Email Us
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.supportChip, { backgroundColor: theme.colors.surfaceVariant }]}
              onPress={handleWebsiteSupport}
            >
              <Avatar.Icon size={28} icon="web" style={{ backgroundColor: theme.colors.outline }} color={theme.colors.surface} />
              <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant, fontWeight: 'bold' }}>
                Website
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 90,
    height: 90,
    borderRadius: 18,
    marginBottom: 12,
  },
  appTitle: {
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
  },
  cardContent: {
    padding: 20,
  },
  cardTitle: {
    fontWeight: 'bold',
    marginBottom: 6,
  },
  input: {
    marginBottom: 8,
  },
  activateBtn: {
    marginTop: 12,
    borderRadius: 8,
  },
  supportSection: {
    marginTop: 32,
    width: '100%',
    maxWidth: 440,
  },
  supportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  supportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flex: 1,
    minWidth: 100,
    justifyContent: 'center',
  },
});
