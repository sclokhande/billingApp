import React from 'react';
import { StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useBilling } from '../context/BillingContext';

interface QuickActionPrinterBadgeProps {
  navigation?: any;
}

export const QuickActionPrinterBadge: React.FC<QuickActionPrinterBadgeProps> = ({ navigation }) => {
  const { printerConnectionStatus } = useBilling();

  const handlePress = () => {
    if (navigation) {
      navigation.navigate('PrinterConnect');
    }
  };

  const isOnline = printerConnectionStatus === 'connected';
  const isConnecting = printerConnectionStatus === 'connecting';

  const badgeColor = isOnline ? '#2E7D32' : isConnecting ? '#1565C0' : '#C62828';
  const statusLabel = isOnline ? 'Online' : isConnecting ? 'Connecting' : 'Offline';

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={[
        styles.badge,
        isOnline
          ? styles.badgeOnline
          : isConnecting
          ? styles.badgeConnecting
          : styles.badgeOffline,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Printer Status: ${statusLabel}`}
      testID="quick-action-printer-badge"
    >
      <MaterialCommunityIcons
        name="printer-outline"
        size={19}
        color={badgeColor}
        testID="printer-main-icon"
      />
      {isConnecting ? (
        <ActivityIndicator
          size={12}
          color={badgeColor}
          style={styles.indicator}
          testID="printer-status-spinner"
        />
      ) : (
        <MaterialCommunityIcons
          name={isOnline ? 'check-circle' : 'alert-circle'}
          size={14}
          color={badgeColor}
          testID={isOnline ? 'printer-status-online-icon' : 'printer-status-offline-icon'}
        />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  badgeOnline: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
  },
  badgeConnecting: {
    backgroundColor: '#E3F2FD',
    borderColor: '#90CAF9',
  },
  badgeOffline: {
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
  },
  indicator: {
    marginHorizontal: 1,
  },
});

