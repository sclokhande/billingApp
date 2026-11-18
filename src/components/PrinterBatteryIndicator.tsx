import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useBilling } from '../context/BillingContext';

interface PrinterBatteryIndicatorProps {
  onPress?: () => void;
  style?: any;
  compact?: boolean;
}

export const PrinterBatteryIndicator: React.FC<PrinterBatteryIndicatorProps> = ({
  onPress,
  style,
  compact = false,
}) => {
  const { connectedPrinter, printerConnectionStatus, printerTelemetry } = useBilling();

  // Strictly only display when printer is connected
  if (printerConnectionStatus !== 'connected' || !connectedPrinter) {
    return null;
  }

  const isCharging = Boolean(printerTelemetry?.isCharging);
  const batteryLevel =
    typeof printerTelemetry?.batteryLevel === 'number'
      ? Math.max(0, Math.min(100, Math.round(printerTelemetry.batteryLevel)))
      : 100;

  // Determine color scheme based on charging state and battery percentage
  let themeColor = '#2E7D32'; // Green (>= 50%)
  let bgColor = '#E8F5E9';
  let borderColor = '#A5D6A7';

  if (isCharging) {
    themeColor = '#1976D2'; // Blue (Charging)
    bgColor = '#E3F2FD';
    borderColor = '#90CAF9';
  } else if (batteryLevel < 20) {
    themeColor = '#C62828'; // Red (< 20%)
    bgColor = '#FFEBEE';
    borderColor = '#FFCDD2';
  } else if (batteryLevel < 50) {
    themeColor = '#E65100'; // Amber (20% - 49%)
    bgColor = '#FFF3E0';
    borderColor = '#FFE0B2';
  }

  // Determine battery icon name
  let iconName = 'battery';
  if (isCharging) {
    iconName = 'battery-charging';
  } else if (batteryLevel < 20) {
    iconName = 'battery-alert';
  } else if (batteryLevel < 40) {
    iconName = 'battery-30';
  } else if (batteryLevel < 70) {
    iconName = 'battery-60';
  } else {
    iconName = 'battery';
  }

  const content = (
    <View
      style={[
        styles.container,
        { backgroundColor: bgColor, borderColor: borderColor },
        compact && styles.compactContainer,
        style,
      ]}
      testID="printer-battery-indicator"
      accessibilityRole="text"
      accessibilityLabel={`Printer battery: ${batteryLevel} percent${isCharging ? ', charging' : ''}`}
    >
      <MaterialCommunityIcons
        name={iconName}
        size={compact ? 15 : 17}
        color={themeColor}
        testID="printer-battery-icon"
      />
      <Text
        style={[
          styles.percentageText,
          { color: themeColor },
          compact && styles.compactText,
        ]}
        testID="printer-battery-text"
        numberOfLines={1}
      >
        {`${batteryLevel}%`}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        testID="printer-battery-indicator-touchable"
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1.2,
    alignSelf: 'flex-start',
  },
  compactContainer: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 3,
    borderRadius: 14,
  },
  percentageText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  compactText: {
    fontSize: 11,
  },
});
