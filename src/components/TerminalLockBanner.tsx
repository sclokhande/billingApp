import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text, Button, useTheme, Avatar } from 'react-native-paper';
import { useBilling } from '../context/BillingContext';
import { MasterUnlockDialog } from './MasterUnlockDialog';
import { APP_CONFIG } from '../config/app_config';

interface TerminalLockBannerProps {
  navigation?: any;
  style?: any;
}

export const TerminalLockBanner: React.FC<TerminalLockBannerProps> = ({
  navigation,
  style,
}) => {
  const theme = useTheme() as any;
  const { isPrinterLocked } = useBilling();
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);

  if (!isPrinterLocked) {
    return null;
  }

  const handleConnectPrinter = () => {
    if (navigation) {
      navigation.navigate('PrinterConnect');
    }
  };

  return (
    <>
      <Card style={[styles.card, style]} mode="outlined">
        <Card.Content style={styles.content}>
          <View style={styles.topRow}>
            <Avatar.Icon
              size={36}
              icon="lock-alert"
              color="#C62828"
              style={styles.avatar}
            />
            <View style={styles.textContainer}>
              <View style={styles.titleBadgeRow}>
                <Text variant="titleSmall" style={styles.title}>
                  Terminal Creation Restricted
                </Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>LOCKED</Text>
                </View>
              </View>
              <Text variant="bodySmall" style={styles.message}>
                No authorized thermal printer connected for over {APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS} hours (
                {Math.round(APP_CONFIG.PRINTER_SECURITY_LOCK.LOCK_THRESHOLD_HOURS / 24)} days). Creating new invoices, adding products, and customers are locked.
              </Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            {navigation && (
              <Button
                mode="contained"
                icon="printer-wireless"
                compact
                onPress={handleConnectPrinter}
                style={styles.btn}
                buttonColor="#C62828"
              >
                Connect Printer
              </Button>
            )}
            <Button
              mode="outlined"
              icon="key-outline"
              compact
              onPress={() => setUnlockModalVisible(true)}
              style={styles.outlineBtn}
              textColor="#C62828"
            >
              Enter Master Key
            </Button>
          </View>
        </Card.Content>
      </Card>

      <MasterUnlockDialog
        visible={unlockModalVisible}
        onDismiss={() => setUnlockModalVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  content: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatar: {
    backgroundColor: '#FFCDD2',
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  title: {
    fontWeight: 'bold',
    color: '#C62828',
  },
  badge: {
    backgroundColor: '#C62828',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  message: {
    color: '#424242',
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  btn: {
    borderRadius: 8,
  },
  outlineBtn: {
    borderRadius: 8,
    borderColor: '#C62828',
  },
});
