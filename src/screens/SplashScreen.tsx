import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Image, Animated, Dimensions } from 'react-native';
import { Text, ActivityIndicator, useTheme } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBilling } from '../context/BillingContext';
import { APP_CONFIG } from '../config/app_config';

export const SplashScreen = ({ navigation }: any) => {
  const theme = useTheme();
  const { isLoading } = useBilling();
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    // Start fade-in and scale-up logo animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  useEffect(() => {
    // Navigate once loading is done, but ensure the splash shows for at least 2 seconds
    const minimumDelay = new Promise<void>((resolve) => setTimeout(resolve, 2000));
    const databaseReady = new Promise<boolean>((resolve) => {
      const interval = setInterval(() => {
        if (!isLoading) {
          clearInterval(interval);
          resolve(true);
        }
      }, 100);
    });

    Promise.all([minimumDelay, databaseReady]).then(async () => {
      if (APP_CONFIG.REQUIRE_ACTIVATION_PIN) {
        try {
          const isActivated = await AsyncStorage.getItem(APP_CONFIG.ACTIVATION_STORAGE_KEY);
          if (isActivated !== 'true') {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Activation' }],
            });
            return;
          }
        } catch (e) {
          console.error('[SplashScreen] Failed to check activation state:', e);
        }
      }

      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    });
  }, [isLoading, navigation]);

  return (
    <View style={[styles.container, { backgroundColor: '#F9FCFC' }]}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Image
          source={require('../assets/logo_emblem.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>
          PARCHIWALA
        </Text>
        <Text variant="bodyLarge" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
          SMART BILLING APP
        </Text>
      </Animated.View>

      <View style={styles.loaderContainer}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text variant="labelSmall" style={[styles.loaderText, { color: theme.colors.outline }]}>
          Loading your store offline database...
        </Text>
      </View>
    </View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 64,
  },
  logo: {
    width: width * 0.4,
    height: width * 0.4,
    maxWidth: 180,
    maxHeight: 180,
    borderRadius: 24,
  },
  title: {
    fontWeight: 'bold',
    marginTop: 20,
    letterSpacing: 2,
  },
  subtitle: {
    fontWeight: '500',
    marginTop: 4,
    letterSpacing: 1,
    fontSize: 12,
  },
  loaderContainer: {
    position: 'absolute',
    bottom: 64,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 12,
    letterSpacing: 0.5,
  },
});
