import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    StyleSheet: {
      create: (s: any) => s,
    },
    View: ({ children, ...props }: any) => React.createElement('View', props, children),
    Text: ({ children, ...props }: any) => React.createElement('Text', props, children),
    TouchableOpacity: ({ children, ...props }: any) => React.createElement('TouchableOpacity', props, children),
    ActivityIndicator: (props: any) => React.createElement('ActivityIndicator', props),
    Platform: { OS: 'android' },
  };
});

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons');

// Mock useBilling hook
let mockBillingState: any = {
  connectedPrinter: null,
  printerConnectionStatus: 'offline',
  isPrinterConnecting: false,
};

jest.mock('../src/context/BillingContext', () => ({
  useBilling: () => mockBillingState,
}));

import { QuickActionPrinterBadge } from '../src/components/QuickActionPrinterBadge';

describe('QuickActionPrinterBadge', () => {
  const mockNavigation = {
    navigate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders printer icon with offline alert icon when disconnected', () => {
    mockBillingState = {
      connectedPrinter: null,
      printerConnectionStatus: 'offline',
      isPrinterConnecting: false,
    };

    let testRenderer: any;
    act(() => {
      testRenderer = renderer.create(<QuickActionPrinterBadge navigation={mockNavigation} />);
    });

    const root = testRenderer.root;
    const icons = root.findAllByType('MaterialCommunityIcons');
    expect(icons.length).toBe(2);
    expect(icons[0].props.name).toBe('printer-outline');
    expect(icons[1].props.name).toBe('alert-circle');
    expect(icons[0].props.color).toBe('#C62828');
    expect(icons[1].props.color).toBe('#C62828');
  });

  it('renders printer icon with ActivityIndicator spinner when connecting', () => {
    mockBillingState = {
      connectedPrinter: null,
      printerConnectionStatus: 'connecting',
      isPrinterConnecting: true,
    };

    let testRenderer: any;
    act(() => {
      testRenderer = renderer.create(<QuickActionPrinterBadge navigation={mockNavigation} />);
    });

    const root = testRenderer.root;
    const icons = root.findAllByType('MaterialCommunityIcons');
    expect(icons.length).toBe(1);
    expect(icons[0].props.name).toBe('printer-outline');
    expect(icons[0].props.color).toBe('#1565C0');

    const spinner = root.findByProps({ testID: 'printer-status-spinner' });
    expect(spinner).toBeDefined();
    expect(spinner.props.color).toBe('#1565C0');
  });

  it('renders printer icon with check-circle icon when connected (online)', () => {
    mockBillingState = {
      connectedPrinter: {
        name: 'Parchiwala 58mm Thermal Printer',
        address: '00:1B:10:73:05:19',
        connected: true,
      },
      printerConnectionStatus: 'connected',
      isPrinterConnecting: false,
    };

    let testRenderer: any;
    act(() => {
      testRenderer = renderer.create(<QuickActionPrinterBadge navigation={mockNavigation} />);
    });

    const root = testRenderer.root;
    const icons = root.findAllByType('MaterialCommunityIcons');
    expect(icons.length).toBe(2);
    expect(icons[0].props.name).toBe('printer-outline');
    expect(icons[1].props.name).toBe('check-circle');
    expect(icons[0].props.color).toBe('#2E7D32');
    expect(icons[1].props.color).toBe('#2E7D32');
  });

  it('navigates to PrinterConnect when pressed', () => {
    mockBillingState = {
      connectedPrinter: null,
      printerConnectionStatus: 'offline',
      isPrinterConnecting: false,
    };

    let testRenderer: any;
    act(() => {
      testRenderer = renderer.create(<QuickActionPrinterBadge navigation={mockNavigation} />);
    });

    const touchable = testRenderer.root.findByProps({ testID: 'quick-action-printer-badge' });
    act(() => {
      touchable.props.onPress();
    });

    expect(mockNavigation.navigate).toHaveBeenCalledWith('PrinterConnect');
  });
});

