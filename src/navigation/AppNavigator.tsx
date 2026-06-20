import React from 'react';
import { Platform, View, Image } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

// Import Screens
import { DashboardScreen } from '../screens/DashboardScreen';
import { InvoiceBuilderScreen } from '../screens/InvoiceBuilderScreen';
import { InvoiceDetailScreen } from '../screens/InvoiceDetailScreen';
import { PrintPreviewScreen } from '../screens/PrintPreviewScreen';
import { ProductsScreen } from '../screens/ProductsScreen';
import { CustomersScreen } from '../screens/CustomersScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SplashScreen } from '../screens/SplashScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Bottom Tab Navigation
const MainTabNavigator = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarHideOnKeyboard: Platform.OS === 'android',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginBottom: 4,
        },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.surfaceVariant,
          elevation: 8,
          shadowOpacity: 0.1,
          shadowRadius: 4,
          height: Platform.OS === 'ios'
            ? 60 + insets.bottom
            : 60 + Math.max(insets.bottom, 16),
          paddingBottom: Platform.OS === 'ios'
            ? (insets.bottom > 0 ? insets.bottom : 8)
            : Math.max(insets.bottom, 12),
          paddingTop: 8,
        },
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: theme.colors.onPrimary,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image
                source={require('../assets/logo_emblem.png')}
                style={{ width: 32, height: 32, borderRadius: 6 }}
              />
              <Text style={{ marginLeft: 10, fontSize: 18, fontWeight: 'bold', color: theme.colors.onPrimary }}>
                PARCHIWALA
              </Text>
            </View>
          ),
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Billing"
        component={InvoiceBuilderScreen}
        options={{
          title: 'New Invoice',
          tabBarLabel: 'Billing',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="receipt" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Inventory"
        component={ProductsScreen}
        options={{
          title: 'Products Inventory',
          tabBarLabel: 'Products',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant-closed" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Customers"
        component={CustomersScreen}
        options={{
          title: 'Customers',
          tabBarLabel: 'Customers',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-multiple" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Store Settings',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="store" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// Root Stack Navigation
export const AppNavigator = () => {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: theme.colors.onPrimary,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      {/* Splash Screen */}
      <Stack.Screen
        name="Splash"
        component={SplashScreen}
        options={{ headerShown: false }}
      />

      {/* Main Bottom Tabs */}
      <Stack.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      
      {/* Detail Screens */}
      <Stack.Screen
        name="InvoiceDetail"
        component={InvoiceDetailScreen}
        options={{
          title: 'Invoice Detail',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="PrintPreview"
        component={PrintPreviewScreen}
        options={{
          title: 'Print Preview',
          headerBackTitle: 'Back',
        }}
      />
    </Stack.Navigator>
  );
};
