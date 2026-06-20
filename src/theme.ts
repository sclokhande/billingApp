import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#157F92', // Teal-Blue from Logo
    onPrimary: '#FFFFFF',
    primaryContainer: '#E0F4F7', // Light Cyan from Logo background
    onPrimaryContainer: '#083E48', // Dark Navy-Teal
    secondary: '#1BC09E', // Bright Teal-Green from Logo accent
    onSecondary: '#FFFFFF',
    secondaryContainer: '#D1F7F0',
    onSecondaryContainer: '#004A3C',
    background: '#F9FCFC', // Subtle cyan-tinted light background
    surface: '#FFFFFF',
    onSurface: '#212121',
    surfaceVariant: '#EAF2F2', // Soft cyan-grey surface lines
    onSurfaceVariant: '#576061',
    error: '#D32F2F',
    onError: '#FFFFFF',
    outline: '#AEC0C2',
    success: '#109D83', // Brand-aligned green-teal for paid states
    warning: '#E67E22', // Balanced orange-gold
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#4DD0E1', // Neon Cyan
    onPrimary: '#00363A',
    primaryContainer: '#004F56',
    onPrimaryContainer: '#E0F7FA',
    secondary: '#4DB6AC', // Soft Teal
    onSecondary: '#003732',
    secondaryContainer: '#005D54',
    onSecondaryContainer: '#E0F2F1',
    background: '#0F1617', // Very dark cyan-tinted background
    surface: '#182022', // Dark surface
    onSurface: '#E0EAEB',
    surfaceVariant: '#243033',
    onSurfaceVariant: '#A4B4B5',
    error: '#EF5350',
    onError: '#FFFFFF',
    outline: '#4F5E60',
    success: '#4DB6AC',
    warning: '#FFB74D',
  },
};
