import React, { useState } from 'react';
import { StyleSheet, View, Alert, Linking, Platform } from 'react-native';
import { Portal, Dialog, TextInput, Button, Text, useTheme, Avatar } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { APP_CONFIG } from '../config/app_config';

interface MasterUnlockDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onSuccess?: () => void;
}

export const MasterUnlockDialog: React.FC<MasterUnlockDialogProps> = ({
  visible,
  onDismiss,
  onSuccess,
}) => {
  const theme = useTheme() as any;
  const { unlockViaMasterPassword } = useBilling();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleUnlock = async () => {
    if (!password.trim()) {
      setErrorMessage('Please enter the Master Password.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage('');
      const res = await unlockViaMasterPassword(password.trim());
      if (res.success) {
        setPassword('');
        onDismiss();
        Alert.alert(
          'Terminal Unlocked',
          `Master key verified. A temporary ${APP_CONFIG.PRINTER_SECURITY_LOCK.MASTER_UNLOCK_GRACE_HOURS}-hour operational extension has been granted. All creation features are now active.`,
          [{ text: 'OK', onPress: () => onSuccess?.() }]
        );
      } else {
        setErrorMessage(res.message || 'Incorrect Master Password.');
      }
    } catch {
      setErrorMessage('Verification failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCallSupport = () => {
    const phoneNumber = '+918551010291';
    const url = Platform.OS === 'android' ? `tel:${phoneNumber}` : `telprompt:${phoneNumber}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Unable to initiate call.'));
  };

  const handleWhatsAppSupport = () => {
    const url = 'whatsapp://send?phone=+918551010291&text=Hello%20Parchiwala%20Support,%20my%20billing%20terminal%20creation%20features%20are%20locked.';
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Linking.openURL('https://wa.me/918551010291');
        }
      })
      .catch(() => Linking.openURL('https://wa.me/918551010291'));
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.titleRow}>
          <View style={styles.header}>
            <Avatar.Icon
              size={40}
              icon="shield-key-outline"
              style={{ backgroundColor: theme.colors.primaryContainer }}
              color={theme.colors.primary}
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
                Unlock Billing Terminal
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Administrative Override
              </Text>
            </View>
          </View>
        </Dialog.Title>

        <Dialog.Content>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 14 }}>
            Enter the administrative Master Password to temporarily unlock invoice creation, product additions, and customer management for{' '}
            {APP_CONFIG.PRINTER_SECURITY_LOCK.MASTER_UNLOCK_GRACE_HOURS} hours.
          </Text>

          <TextInput
            mode="outlined"
            label="Master Password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setErrorMessage('');
            }}
            secureTextEntry={!showPassword}
            autoCapitalize="characters"
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
            style={styles.input}
          />

          {errorMessage ? (
            <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
              {errorMessage}
            </Text>
          ) : null}

          <View style={styles.supportBox}>
            <Text variant="labelSmall" style={{ color: theme.colors.outline, marginBottom: 6 }}>
              Don't have the key? Contact Parchiwala Support:
            </Text>
            <View style={styles.supportRow}>
              <Button
                mode="text"
                icon="phone"
                compact
                onPress={handleCallSupport}
                labelStyle={{ fontSize: 12 }}
              >
                Call
              </Button>
              <Button
                mode="text"
                icon="whatsapp"
                compact
                onPress={handleWhatsAppSupport}
                labelStyle={{ fontSize: 12 }}
              >
                WhatsApp
              </Button>
            </View>
          </View>
        </Dialog.Content>

        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleUnlock}
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Unlock Now
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  titleRow: {
    paddingBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    backgroundColor: '#FFFFFF',
  },
  errorText: {
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '500',
  },
  supportBox: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  supportRow: {
    flexDirection: 'row',
    gap: 10,
  },
});
