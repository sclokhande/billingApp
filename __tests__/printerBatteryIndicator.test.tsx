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
    Platform: { OS: 'android' },
  };
});

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons');

let mockBillingState: any = {
  connectedPrinter: null,
  printerConnectionStatus: 'offline',
  printerTelemetry: null,
};

jest.mock('../src/context/BillingContext', () => ({
  useBilling: () => mockBillingState,
}));

import { PrinterBatteryIndicator } from '../src/components/PrinterBatteryIndicator';

describe('PrinterBatteryIndicator Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders strictly null when printer is disconnected/offline', () => {
    mockBillingState = {
      connectedPrinter: null,
      printerConnectionStatus: 'offline',
      printerTelemetry: null,
    };

    let testRenderer: any;
    act(() => {
      testRenderer = renderer.create(<PrinterBatteryIndicator />);
    });

    expect(testRenderer.toJSON()).toBeNull();
  });

  it('renders strictly null when printer is connecting', () => {
    mockBillingState = {
      connectedPrinter: null,
      printerConnectionStatus: 'connecting',
      printerTelemetry: null,
    };

    let testRenderer: any;
    act(() => {
      testRenderer = renderer.create(<PrinterBatteryIndicator />);
    });

    expect(testRenderer.toJSON()).toBeNull();
  });

  it('renders optimal green battery icon and percentage when battery is >= 50%', () => {
    mockBillingState = {
      connectedPrinter: {
        name: 'Parchiwala 58mm Thermal Printer',
        address: '00:1B:10:73:05:19',
        connected: true,
      },
      printerConnectionStatus: 'connected',
      printerTelemetry: {
        online: true,
        hasPaper: true,
        paperNearEnd: false,
        batteryLevel: 85,
        isCharging: false,
      },
    };

    let testRenderer: any;
    act(() => {
      testRenderer = renderer.create(<PrinterBatteryIndicator />);
    });

    const root = testRenderer.root;
    const text = root.findByProps({ testID: 'printer-battery-text' });
    expect(text.props.children).toBe('85%');
    expect(text.props.style).toContainEqual({ color: '#2E7D32' });

    const icon = root.findByProps({ testID: 'printer-battery-icon' });
    expect(icon.props.name).toBe('battery');
    expect(icon.props.color).toBe('#2E7D32');
  });

  it('renders amber battery icon and percentage when battery is between 20% and 49%', () => {
    mockBillingState = {
      connectedPrinter: {
        name: 'Parchiwala 58mm Thermal Printer',
        address: '00:1B:10:73:05:19',
        connected: true,
      },
      printerConnectionStatus: 'connected',
      printerTelemetry: {
        online: true,
        hasPaper: true,
        paperNearEnd: false,
        batteryLevel: 35,
        isCharging: false,
      },
    };

    let testRenderer: any;
    act(() => {
      testRenderer = renderer.create(<PrinterBatteryIndicator />);
    });

    const root = testRenderer.root;
    const text = root.findByProps({ testID: 'printer-battery-text' });
    expect(text.props.children).toBe('35%');
    expect(text.props.style).toContainEqual({ color: '#E65100' });

    const icon = root.findByProps({ testID: 'printer-battery-icon' });
    expect(icon.props.name).toBe('battery-30');
    expect(icon.props.color).toBe('#E65100');
  });

  it('renders red alert battery icon and warning color when battery is below 20%', () => {
    mockBillingState = {
      connectedPrinter: {
        name: 'Parchiwala 58mm Thermal Printer',
        address: '00:1B:10:73:05:19',
        connected: true,
      },
      printerConnectionStatus: 'connected',
      printerTelemetry: {
        online: true,
        hasPaper: true,
        paperNearEnd: false,
        batteryLevel: 15,
        isCharging: false,
      },
    };

    let testRenderer: any;
    act(() => {
      testRenderer = renderer.create(<PrinterBatteryIndicator />);
    });

    const root = testRenderer.root;
    const text = root.findByProps({ testID: 'printer-battery-text' });
    expect(text.props.children).toBe('15%');
    expect(text.props.style).toContainEqual({ color: '#C62828' });

    const icon = root.findByProps({ testID: 'printer-battery-icon' });
    expect(icon.props.name).toBe('battery-alert');
    expect(icon.props.color).toBe('#C62828');
  });

  it('renders blue battery-charging icon when printer is actively charging', () => {
    mockBillingState = {
      connectedPrinter: {
        name: 'Parchiwala 58mm Thermal Printer',
        address: '00:1B:10:73:05:19',
        connected: true,
      },
      printerConnectionStatus: 'connected',
      printerTelemetry: {
        online: true,
        hasPaper: true,
        paperNearEnd: false,
        batteryLevel: 12,
        isCharging: true,
      },
    };

    let testRenderer: any;
    act(() => {
      testRenderer = renderer.create(<PrinterBatteryIndicator />);
    });

    const root = testRenderer.root;
    const text = root.findByProps({ testID: 'printer-battery-text' });
    expect(text.props.children).toBe('12%');
    expect(text.props.style).toContainEqual({ color: '#1976D2' });

    const icon = root.findByProps({ testID: 'printer-battery-icon' });
    expect(icon.props.name).toBe('battery-charging');
    expect(icon.props.color).toBe('#1976D2');
  });

  it('handles onPress callback when provided', () => {
    const onPressMock = jest.fn();
    mockBillingState = {
      connectedPrinter: {
        name: 'Parchiwala 58mm Thermal Printer',
        address: '00:1B:10:73:05:19',
        connected: true,
      },
      printerConnectionStatus: 'connected',
      printerTelemetry: {
        online: true,
        batteryLevel: 90,
      },
    };

    let testRenderer: any;
    act(() => {
      testRenderer = renderer.create(<PrinterBatteryIndicator onPress={onPressMock} />);
    });

    const root = testRenderer.root;
    const touchable = root.findByProps({ testID: 'printer-battery-indicator-touchable' });
    expect(touchable).toBeDefined();
    touchable.props.onPress();
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });
});
