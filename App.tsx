import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
import { BillingProvider } from './src/context/BillingContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { theme, darkTheme } from './src/theme';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const activeTheme = isDarkMode ? darkTheme : theme;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={activeTheme}>
        <BillingProvider>
          <NavigationContainer>
            <StatusBar
              barStyle={isDarkMode ? 'light-content' : 'dark-content'}
              backgroundColor={activeTheme.colors.primary}
            />
            <AppNavigator />
          </NavigationContainer>
        </BillingProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

export default App;
