package com.billingapp

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.LocationManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class BluetoothScannerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var isReceiverRegistered = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action: String? = intent.action
            if (BluetoothDevice.ACTION_FOUND == action) {
                val device: BluetoothDevice? = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                if (device != null) {
                    var deviceName = ""
                    try {
                        deviceName = device.name ?: ""
                    } catch (e: SecurityException) {
                        // Security exception due to missing connect permission
                    }

                    if (deviceName.isEmpty()) {
                        return
                    }

                    val isPrinterClass = try {
                        val deviceClass = device.bluetoothClass?.majorDeviceClass
                        deviceClass == 1536 // BluetoothClass.Device.Major.IMAGING is 1536
                    } catch (e: SecurityException) {
                        false
                    }

                    val nameLower = deviceName.lowercase()
                    val hasPrinterKeyword = nameLower.contains("printer") ||
                                           nameLower.contains("thermal") ||
                                           nameLower.contains("pos") ||
                                           nameLower.contains("receipt") ||
                                           nameLower.contains("spp") ||
                                           nameLower.contains("pt-") ||
                                           nameLower.contains("xp-") ||
                                           nameLower.contains("mtp") ||
                                           nameLower.contains("ep-") ||
                                           nameLower.contains("mp-") ||
                                           nameLower.contains("gp-")

                    if (isPrinterClass || hasPrinterKeyword) {
                        val deviceHardwareAddress = device.address // MAC address

                        val params = Arguments.createMap().apply {
                            putString("name", deviceName)
                            putString("address", deviceHardwareAddress)
                        }
                        sendEvent("onDeviceFound", params)
                    }
                }
            } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED == action) {
                sendEvent("onDiscoveryFinished", null)
            }
        }
    }

    override fun getName(): String {
        return "BluetoothScanner"
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun startScan(promise: Promise) {
        if (bluetoothAdapter == null) {
            promise.reject("BLUETOOTH_NOT_SUPPORTED", "Bluetooth is not supported on this device.")
            return
        }

        if (!bluetoothAdapter.isEnabled) {
            promise.reject("BLUETOOTH_DISABLED", "Bluetooth is disabled.")
            return
        }

        // Register receiver if not already registered
        if (!isReceiverRegistered) {
            val filter = IntentFilter().apply {
                addAction(BluetoothDevice.ACTION_FOUND)
                addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
            }
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                reactApplicationContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                reactApplicationContext.registerReceiver(receiver, filter)
            }
            isReceiverRegistered = true
        }

        try {
            if (bluetoothAdapter.isDiscovering) {
                bluetoothAdapter.cancelDiscovery()
            }

            val started = bluetoothAdapter.startDiscovery()
            if (started) {
                promise.resolve(true)
            } else {
                promise.reject("SCAN_FAILED", "Failed to start Bluetooth discovery.")
            }
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_DENIED", "Bluetooth scan permission is required.", e)
        }
    }

    @ReactMethod
    fun stopScan(promise: Promise) {
        try {
            if (bluetoothAdapter != null && bluetoothAdapter.isDiscovering) {
                bluetoothAdapter.cancelDiscovery()
            }
            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_DENIED", "Bluetooth permission is required.", e)
        }
    }

    @ReactMethod
    fun isBluetoothEnabled(promise: Promise) {
        if (bluetoothAdapter == null) {
            promise.resolve(false)
            return
        }
        try {
            promise.resolve(bluetoothAdapter.isEnabled)
        } catch (e: SecurityException) {
            promise.resolve(false)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun enableBluetooth(promise: Promise) {
        if (bluetoothAdapter == null) {
            promise.reject("BLUETOOTH_NOT_SUPPORTED", "Bluetooth is not supported on this device.")
            return
        }

        if (bluetoothAdapter.isEnabled) {
            promise.resolve(true)
            return
        }

        try {
            val intent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
            val currentActivity = reactApplicationContext.currentActivity
            if (currentActivity != null) {
                currentActivity.startActivity(intent)
                promise.resolve(true)
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isLocationEnabled(promise: Promise) {
        try {
            val locationManager = reactApplicationContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            if (locationManager == null) {
                promise.resolve(false)
                return
            }
            val isGpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            val isNetworkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            promise.resolve(isGpsEnabled || isNetworkEnabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun openLocationSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
            val currentActivity = reactApplicationContext.currentActivity
            if (currentActivity != null) {
                currentActivity.startActivity(intent)
                promise.resolve(true)
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun pairDevice(address: String, promise: Promise) {
        if (bluetoothAdapter == null) {
            promise.reject("BLUETOOTH_NOT_SUPPORTED", "Bluetooth is not supported.")
            return
        }

        try {
            val device = bluetoothAdapter.getRemoteDevice(address)
            if (device.bondState == BluetoothDevice.BOND_BONDED) {
                promise.resolve(true)
                return
            }

            // Register receiver to listen to bond state changes
            val filter = IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    val action = intent.action
                    if (BluetoothDevice.ACTION_BOND_STATE_CHANGED == action) {
                        val boundDevice = intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)
                        if (boundDevice != null && boundDevice.address == address) {
                            val bondState = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR)
                            val prevBondState = intent.getIntExtra(BluetoothDevice.EXTRA_PREVIOUS_BOND_STATE, BluetoothDevice.ERROR)
                            
                            if (bondState == BluetoothDevice.BOND_BONDED) {
                                try {
                                    reactApplicationContext.unregisterReceiver(this)
                                } catch (e: Exception) {}
                                promise.resolve(true)
                            } else if (bondState == BluetoothDevice.BOND_NONE && prevBondState == BluetoothDevice.BOND_BONDING) {
                                try {
                                    reactApplicationContext.unregisterReceiver(this)
                                } catch (e: Exception) {}
                                promise.reject("PAIRING_FAILED", "Pairing was cancelled or failed.")
                            }
                        }
                    }
                }
            }

            if (android.os.Build.VERSION.SDK_INT >= 33) {
                reactApplicationContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                reactApplicationContext.registerReceiver(receiver, filter)
            }

            val success = device.createBond()
            if (!success) {
                try {
                    reactApplicationContext.unregisterReceiver(receiver)
                } catch (e: Exception) {}
                promise.reject("PAIRING_FAILED", "Failed to initiate pairing.")
            }
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_DENIED", "Bluetooth connect permission is required for pairing.", e)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isDeviceBonded(address: String, promise: Promise) {
        if (bluetoothAdapter == null) {
            promise.resolve(false)
            return
        }
        try {
            val bondedDevices = bluetoothAdapter.bondedDevices
            var isBonded = false
            if (bondedDevices != null) {
                for (device in bondedDevices) {
                    if (device.address.equals(address, ignoreCase = true)) {
                        isBonded = true
                        break
                    }
                }
            }
            promise.resolve(isBonded)
        } catch (e: SecurityException) {
            promise.resolve(false)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun cleanUp() {
        if (isReceiverRegistered) {
            try {
                reactApplicationContext.unregisterReceiver(receiver)
            } catch (e: Exception) {
                // Ignore
            }
            isReceiverRegistered = false
        }
    }

    override fun onCatalystInstanceDestroy() {
        cleanUp()
        super.onCatalystInstanceDestroy()
    }
}
