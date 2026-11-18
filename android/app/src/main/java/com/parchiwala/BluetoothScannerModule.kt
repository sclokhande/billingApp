package com.parchiwala

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.util.UUID
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
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
                    val deviceHardwareAddress = device.address ?: return
                    var deviceName = ""
                    try {
                        deviceName = device.name ?: ""
                    } catch (e: SecurityException) {
                        // Security exception due to missing connect permission
                    }

                    if (deviceName.isEmpty()) {
                        deviceName = "Bluetooth Printer"
                    }

                    val params = Arguments.createMap().apply {
                        putString("name", deviceName)
                        putString("address", deviceHardwareAddress)
                    }
                    sendEvent("onDeviceFound", params)
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

        Thread {
            try {
                if (bluetoothAdapter.isDiscovering) {
                    bluetoothAdapter.cancelDiscovery()
                    // Allow radio up to 300ms to finish cancelling previous discovery
                    var count = 0
                    while (bluetoothAdapter.isDiscovering && count < 6) {
                        Thread.sleep(50)
                        count++
                    }
                }

                var started = bluetoothAdapter.startDiscovery()
                if (!started) {
                    // Retry once after 250ms
                    Thread.sleep(250)
                    started = bluetoothAdapter.startDiscovery()
                }

                if (started) {
                    promise.resolve(true)
                } else {
                    promise.reject("SCAN_FAILED", "Failed to start Bluetooth discovery.")
                }
            } catch (e: SecurityException) {
                promise.reject("PERMISSION_DENIED", "Bluetooth scan permission is required.", e)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun stopScan(promise: Promise) {
        Thread {
            try {
                if (bluetoothAdapter != null && bluetoothAdapter.isDiscovering) {
                    bluetoothAdapter.cancelDiscovery()
                }
                promise.resolve(true)
            } catch (e: SecurityException) {
                promise.reject("PERMISSION_DENIED", "Bluetooth permission is required.", e)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message, e)
            }
        }.start()
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
    fun getBondedAuthorizedPrinter(allowedAddresses: ReadableArray, promise: Promise) {
        if (bluetoothAdapter == null) {
            promise.resolve(null)
            return
        }
        try {
            val bondedDevices = bluetoothAdapter.bondedDevices
            if (bondedDevices == null || bondedDevices.isEmpty()) {
                promise.resolve(null)
                return
            }

            val allowedSet = HashSet<String>()
            for (i in 0 until allowedAddresses.size()) {
                val addr = allowedAddresses.getString(i)
                if (!addr.isNullOrEmpty()) {
                    allowedSet.add(addr.replace(Regex("[^A-Fa-f0-9]"), "").uppercase())
                }
            }

            for (device in bondedDevices) {
                val devAddr = device.address
                if (!devAddr.isNullOrEmpty()) {
                    val cleanDev = devAddr.replace(Regex("[^A-Fa-f0-9]"), "").uppercase()
                    if (allowedSet.contains(cleanDev)) {
                        var devName = ""
                        try {
                            devName = device.name ?: ""
                        } catch (e: SecurityException) {
                            // Ignored
                        }
                        if (devName.isEmpty()) {
                            devName = "Parchiwala Thermal Printer"
                        }

                        val result = Arguments.createMap().apply {
                            putString("name", devName)
                            putString("address", devAddr)
                        }
                        promise.resolve(result)
                        return
                    }
                }
            }
            promise.resolve(null)
        } catch (e: SecurityException) {
            promise.resolve(null)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
                val packageName = reactApplicationContext.packageName
                val isIgnoring = powerManager?.isIgnoringBatteryOptimizations(packageName) ?: false
                promise.resolve(isIgnoring)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val packageName = reactApplicationContext.packageName
                val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
                if (powerManager != null && powerManager.isIgnoringBatteryOptimizations(packageName)) {
                    promise.resolve(true)
                    return
                }

                try {
                    val intent = Intent().apply {
                        action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                        data = Uri.parse("package:$packageName")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    val currentActivity = reactApplicationContext.currentActivity
                    if (currentActivity != null) {
                        currentActivity.startActivity(intent)
                    } else {
                        reactApplicationContext.startActivity(intent)
                    }
                    promise.resolve(true)
                } catch (intentEx: Exception) {
                    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    val currentActivity = reactApplicationContext.currentActivity
                    if (currentActivity != null) {
                        currentActivity.startActivity(intent)
                    } else {
                        reactApplicationContext.startActivity(intent)
                    }
                    promise.resolve(true)
                }
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun checkPrinterTelemetry(address: String, promise: Promise) {
        Thread {
            try {
                if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
                    val map = Arguments.createMap().apply {
                        putBoolean("online", false)
                        putBoolean("hasPaper", false)
                        putBoolean("paperNearEnd", false)
                        putNull("batteryLevel")
                        putBoolean("isCharging", false)
                        putString("status", "BLUETOOTH_OFF")
                    }
                    promise.resolve(map)
                    return@Thread
                }

                val cleanAddress = address.trim()
                if (cleanAddress.isEmpty()) {
                    val map = Arguments.createMap().apply {
                        putBoolean("online", false)
                        putBoolean("hasPaper", false)
                        putBoolean("paperNearEnd", false)
                        putNull("batteryLevel")
                        putBoolean("isCharging", false)
                        putString("status", "INVALID_ADDRESS")
                    }
                    promise.resolve(map)
                    return@Thread
                }

                val device = bluetoothAdapter.getRemoteDevice(cleanAddress)
                val sppUuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

                // First check if BLEPrinterAdapter already holds an active connected socket to this device
                var activeSocket: android.bluetooth.BluetoothSocket? = null
                var isReusingActiveSocket = false

                try {
                    val adapterClass = Class.forName("com.pinmi.react.printer.adapter.BLEPrinterAdapter")
                    val getInstanceMethod = adapterClass.getMethod("getInstance")
                    val adapterInstance = getInstanceMethod.invoke(null)
                    val socketField = adapterClass.getDeclaredField("mBluetoothSocket")
                    socketField.isAccessible = true
                    val existingSocket = socketField.get(adapterInstance) as? android.bluetooth.BluetoothSocket
                    if (existingSocket != null && existingSocket.isConnected) {
                        activeSocket = existingSocket
                        isReusingActiveSocket = true
                    }
                } catch (ignored: Exception) {
                    // Reflection fallback if class/field not available
                }

                var probeSocket: android.bluetooth.BluetoothSocket? = null
                try {
                    val socket = if (isReusingActiveSocket && activeSocket != null) {
                        activeSocket
                    } else {
                        probeSocket = device.createInsecureRfcommSocketToServiceRecord(sppUuid)
                        probeSocket.connect()
                        probeSocket
                    }

                    val outStream = socket.outputStream
                    val inStream = socket.inputStream

                    // Send ESC/POS real-time query command DLE EOT 4 (query paper roll status)
                    outStream.write(byteArrayOf(0x10, 0x04, 0x04))
                    outStream.flush()

                    val buffer = ByteArray(8)
                    var bytesRead = 0
                    val startTime = System.currentTimeMillis()
                    while (bytesRead == 0 && (System.currentTimeMillis() - startTime) < 450) {
                        if (inStream.available() > 0) {
                            bytesRead = inStream.read(buffer)
                        } else {
                            Thread.sleep(40)
                        }
                    }

                    var hasPaper = true
                    var paperNearEnd = false
                    if (bytesRead > 0) {
                        val statusByte = buffer[0].toInt()
                        // Bit 2 & 3: Paper end sensor (0 = present, 1 = out)
                        if ((statusByte and 0x0C) != 0) {
                            hasPaper = false
                        }
                        // Bit 5 & 6: Paper near end sensor
                        if ((statusByte and 0x60) != 0) {
                            paperNearEnd = true
                        }
                    }

                    // Query battery level via Android Bluetooth device API (API 28+)
                    var batteryLevel: Int? = null
                    var isCharging = false

                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                        try {
                            val method = device.javaClass.getMethod("getBatteryLevel")
                            val bl = method.invoke(device) as? Int
                            if (bl != null && bl in 0..100) {
                                batteryLevel = bl
                            }
                        } catch (ignored: Exception) {}
                    }

                    // Also try querying ESC/POS battery status byte (DLE EOT 8) if socket is open and batteryLevel is not reported by Android
                    if (batteryLevel == null) {
                        try {
                            outStream.write(byteArrayOf(0x10, 0x04, 0x08))
                            outStream.flush()
                            val battBuffer = ByteArray(4)
                            var battBytes = 0
                            val battStart = System.currentTimeMillis()
                            while (battBytes == 0 && (System.currentTimeMillis() - battStart) < 250) {
                                if (inStream.available() > 0) {
                                    battBytes = inStream.read(battBuffer)
                                } else {
                                    Thread.sleep(30)
                                }
                            }
                            if (battBytes > 0) {
                                val bVal = battBuffer[0].toInt() and 0xFF
                                if (bVal in 1..100) {
                                    batteryLevel = bVal
                                } else if (bVal == 0x03 || (bVal and 0x03) == 0x03) {
                                    batteryLevel = 90
                                } else if (bVal == 0x02 || (bVal and 0x02) == 0x02) {
                                    batteryLevel = 65
                                } else if (bVal == 0x01 || (bVal and 0x01) == 0x01) {
                                    batteryLevel = 35
                                } else if (bVal == 0x00) {
                                    batteryLevel = 15
                                }
                            }
                        } catch (ignored: Exception) {}
                    }

                    val map = Arguments.createMap().apply {
                        putBoolean("online", true)
                        putBoolean("hasPaper", hasPaper)
                        putBoolean("paperNearEnd", paperNearEnd)
                        if (batteryLevel != null) {
                            putInt("batteryLevel", batteryLevel)
                        } else {
                            putNull("batteryLevel")
                        }
                        putBoolean("isCharging", isCharging)
                        putString("status", if (!hasPaper) "PAPER_OUT" else if (paperNearEnd) "PAPER_NEAR_END" else "OK")
                    }
                    promise.resolve(map)
                } catch (socketEx: Exception) {
                    val map = Arguments.createMap().apply {
                        putBoolean("online", isReusingActiveSocket)
                        putBoolean("hasPaper", isReusingActiveSocket)
                        putBoolean("paperNearEnd", false)
                        putNull("batteryLevel")
                        putBoolean("isCharging", false)
                        putString("status", if (isReusingActiveSocket) "OK" else "SOCKET_PROBE_ERROR")
                        putString("error", socketEx.message ?: "Socket failed")
                    }
                    promise.resolve(map)
                } finally {
                    if (!isReusingActiveSocket && probeSocket != null) {
                        try {
                            probeSocket.close()
                        } catch (ignored: Exception) {}
                    }
                }
            } catch (e: Exception) {
                val map = Arguments.createMap().apply {
                    putBoolean("online", false)
                    putBoolean("hasPaper", false)
                    putBoolean("paperNearEnd", false)
                    putNull("batteryLevel")
                    putBoolean("isCharging", false)
                    putString("status", "ERROR")
                    putString("error", e.message ?: "Telemetry error")
                }
                promise.resolve(map)
            }
        }.start()
    }

    @ReactMethod
    fun convertImageToEscPosRaster(base64Image: String, targetWidth: Int, promise: Promise) {
        Thread {
            try {
                val cleanBase64 = if (base64Image.contains(",")) {
                    base64Image.substringAfter(",")
                } else {
                    base64Image
                }

                val imageBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                val originalBitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                if (originalBitmap == null) {
                    promise.reject("INVALID_IMAGE", "Could not decode image from base64")
                    return@Thread
                }

                // Scale image preserving aspect ratio
                val maxImgWidth = if (targetWidth <= 384) 360 else 520
                val maxImgHeight = if (targetWidth <= 384) 160 else 230

                var destW = originalBitmap.width
                var destH = originalBitmap.height

                if (destW > maxImgWidth || destH > maxImgHeight) {
                    val scaleW = maxImgWidth.toFloat() / destW
                    val scaleH = maxImgHeight.toFloat() / destH
                    val scale = Math.min(scaleW, scaleH)
                    destW = Math.max(1, (destW * scale).toInt())
                    destH = Math.max(1, (destH * scale).toInt())
                }

                val scaledBitmap = Bitmap.createScaledBitmap(originalBitmap, destW, destH, true)

                // Total raster width must be a multiple of 8 dots for ESC/POS byte packing
                val totalWidthBytes = targetWidth / 8
                val totalWidthDots = totalWidthBytes * 8

                // Center horizontally
                val leftOffsetDots = Math.max(0, (totalWidthDots - destW) / 2)

                val outStream = ByteArrayOutputStream()

                // ESC/POS GS v 0 raster header: 0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH
                val xL = (totalWidthBytes and 0xFF).toByte()
                val xH = ((totalWidthBytes shr 8) and 0xFF).toByte()
                val yL = (destH and 0xFF).toByte()
                val yH = ((destH shr 8) and 0xFF).toByte()

                outStream.write(byteArrayOf(0x1D.toByte(), 0x76.toByte(), 0x30.toByte(), 0x00.toByte(), xL, xH, yL, yH))

                for (y in 0 until destH) {
                    val rowBytes = ByteArray(totalWidthBytes)
                    for (x in 0 until destW) {
                        val pixel = scaledBitmap.getPixel(x, y)
                        val alpha = (pixel shr 24) and 0xFF
                        if (alpha > 120) {
                            val r = (pixel shr 16) and 0xFF
                            val g = (pixel shr 8) and 0xFF
                            val b = pixel and 0xFF
                            val luminance = (0.299 * r + 0.587 * g + 0.114 * b).toInt()
                            if (luminance < 160) {
                                val dotX = leftOffsetDots + x
                                if (dotX < totalWidthDots) {
                                    val byteIndex = dotX / 8
                                    val bitIndex = 7 - (dotX % 8)
                                    rowBytes[byteIndex] = (rowBytes[byteIndex].toInt() or (1 shl bitIndex)).toByte()
                                }
                            }
                        }
                    }
                    outStream.write(rowBytes)
                }

                val rasterBytes = outStream.toByteArray()
                val resultBase64 = Base64.encodeToString(rasterBytes, Base64.NO_WRAP)
                promise.resolve(resultBase64)
            } catch (e: Exception) {
                promise.reject("RASTER_ERROR", e.message ?: "Failed to generate raster bitmap")
            }
        }.start()
    }

    @ReactMethod
    fun fitAndOptimizeLogo(base64Image: String, targetWidth: Int, promise: Promise) {
        Thread {
            try {
                val cleanBase64 = if (base64Image.contains(",")) {
                    base64Image.substringAfter(",")
                } else {
                    base64Image
                }

                val imageBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                val originalBitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                if (originalBitmap == null) {
                    promise.reject("INVALID_IMAGE", "Could not decode image from base64")
                    return@Thread
                }

                val origW = originalBitmap.width
                val origH = originalBitmap.height

                // Target width boundaries: 360 for 58mm, 520 for 80mm
                val maxImgWidth = if (targetWidth <= 384) 360 else 520
                val maxImgHeight = if (targetWidth <= 384) 160 else 230

                val scaleW = maxImgWidth.toFloat() / origW
                val scaleH = maxImgHeight.toFloat() / origH
                val scale = Math.min(scaleW, scaleH)

                val destW = Math.max(1, (origW * scale).toInt())
                val destH = Math.max(1, (origH * scale).toInt())

                val scaledBitmap = Bitmap.createScaledBitmap(originalBitmap, destW, destH, true)

                // Create clean monochrome/thermal ARGB bitmap
                val monoBitmap = Bitmap.createBitmap(destW, destH, Bitmap.Config.ARGB_8888)

                for (y in 0 until destH) {
                    for (x in 0 until destW) {
                        val pixel = scaledBitmap.getPixel(x, y)
                        val alpha = (pixel shr 24) and 0xFF
                        if (alpha > 80) {
                            val r = (pixel shr 16) and 0xFF
                            val g = (pixel shr 8) and 0xFF
                            val b = pixel and 0xFF
                            val luminance = (0.299 * r + 0.587 * g + 0.114 * b).toInt()
                            if (luminance < 165) {
                                monoBitmap.setPixel(x, y, android.graphics.Color.BLACK)
                            } else {
                                monoBitmap.setPixel(x, y, android.graphics.Color.TRANSPARENT)
                            }
                        } else {
                            monoBitmap.setPixel(x, y, android.graphics.Color.TRANSPARENT)
                        }
                    }
                }

                val outStream = ByteArrayOutputStream()
                monoBitmap.compress(Bitmap.CompressFormat.PNG, 100, outStream)
                val pngBytes = outStream.toByteArray()
                val optimizedDataUri = "data:image/png;base64," + Base64.encodeToString(pngBytes, Base64.NO_WRAP)

                val map = Arguments.createMap().apply {
                    putString("dataUri", optimizedDataUri)
                    putInt("width", destW)
                    putInt("height", destH)
                    putInt("originalWidth", origW)
                    putInt("originalHeight", origH)
                    putInt("sizeBytes", pngBytes.size)
                }

                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("OPTIMIZE_ERROR", e.message ?: "Failed to optimize logo")
            }
        }.start()
    }

    @ReactMethod
    fun renderReceiptToRaster(
        receiptText: String,
        logoBase64: String?,
        qrMatrix: ReadableArray?,
        targetWidth: Int,
        titleLineCount: Int,
        promise: Promise
    ) {
        Thread {
            try {
                val widthDots = if (targetWidth <= 384) 384 else 576
                val rawLines = receiptText.split("\n")
                val actualTitleCount = Math.max(1, titleLineCount)

                val lineHeight = if (widthDots <= 384) 27f else 37f
                val normalTextSize = if (widthDots <= 384) 19f else 26f
                val boldTextSize = if (widthDots <= 384) 20f else 27f
                val titleTextSize = if (widthDots <= 384) 27f else 37f
                val titleLineHeight = if (widthDots <= 384) 35f else 47f

                val normalPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.BLACK
                    typeface = Typeface.MONOSPACE
                    textSize = normalTextSize
                }
                val boldPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.BLACK
                    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                    textSize = boldTextSize
                }
                val grandTotalPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.BLACK
                    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                    textSize = boldTextSize * 1.2f
                }
                val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.BLACK
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    textSize = titleTextSize
                }

                // 1. Pre-decode Logo if provided
                var logoBitmap: Bitmap? = null
                if (!logoBase64.isNullOrEmpty()) {
                    try {
                        val cleanLogo = if (logoBase64.contains(",")) logoBase64.substringAfter(",") else logoBase64
                        val logoBytes = Base64.decode(cleanLogo, Base64.DEFAULT)
                        val decoded = BitmapFactory.decodeByteArray(logoBytes, 0, logoBytes.size)
                        if (decoded != null) {
                            val maxLogoW = if (widthDots <= 384) 360 else 520
                            val maxLogoH = if (widthDots <= 384) 160 else 230
                            val scale = Math.min(maxLogoW.toFloat() / decoded.width, maxLogoH.toFloat() / decoded.height)
                            val destW = Math.max(1, (decoded.width * scale).toInt())
                            val destH = Math.max(1, (decoded.height * scale).toInt())
                            logoBitmap = Bitmap.createScaledBitmap(decoded, destW, destH, true)
                        }
                    } catch (ignored: Exception) {}
                }

                // 2. Pre-calculate QR dimensions
                val moduleCount = if (qrMatrix != null) qrMatrix.size() else 0
                val qrScale = if (widthDots <= 384) 4 else 6
                val quietZone = 4
                val qrPixelDim = (moduleCount + quietZone * 2) * qrScale

                // 3. Calculate dynamic height
                var totalHeightCalc = 24f
                if (logoBitmap != null) {
                    totalHeightCalc += logoBitmap.height + 16f
                }

                var titleCountProcessed = 0
                for (line in rawLines) {
                    val trimmed = line.trim()
                    if (titleCountProcessed < actualTitleCount && trimmed.isNotEmpty() && !trimmed.startsWith("=") && !trimmed.startsWith("-")) {
                        totalHeightCalc += titleLineHeight
                        titleCountProcessed++
                    } else if (trimmed.contains("[ UPI SCAN & PAY ]")) {
                        if (moduleCount > 0) {
                            totalHeightCalc += qrPixelDim + 22f
                        }
                    } else if (trimmed.contains("GRAND TOTAL")) {
                        totalHeightCalc += lineHeight * 1.35f
                    } else {
                        totalHeightCalc += lineHeight
                    }
                }
                totalHeightCalc += 40f
                val totalHeightDots = Math.max(120, totalHeightCalc.toInt())

                // 4. Create Bitmap and Canvas
                val receiptBitmap = Bitmap.createBitmap(widthDots, totalHeightDots, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(receiptBitmap)
                canvas.drawColor(Color.WHITE)

                var currentY = 16f

                // Draw Logo (Centered)
                if (logoBitmap != null) {
                    val logoLeft = (widthDots - logoBitmap.width) / 2f
                    canvas.drawBitmap(logoBitmap, logoLeft, currentY, null)
                    currentY += logoBitmap.height + 14f
                }

                // Draw Text & QR
                titleCountProcessed = 0
                val qrPaint = Paint().apply { color = Color.BLACK; style = Paint.Style.FILL }

                for (line in rawLines) {
                    val trimmed = line.trim()
                    if (titleCountProcessed < actualTitleCount && trimmed.isNotEmpty() && !trimmed.startsWith("=") && !trimmed.startsWith("-")) {
                        val textW = titlePaint.measureText(trimmed)
                        val x = Math.max(8f, (widthDots - textW) / 2f)
                        canvas.drawText(trimmed, x, currentY + titleTextSize, titlePaint)
                        currentY += titleLineHeight
                        titleCountProcessed++
                    } else if (trimmed.contains("[ UPI SCAN & PAY ]")) {
                        if (moduleCount > 0 && qrMatrix != null) {
                            currentY += 8f
                            val qrLeft = (widthDots - qrPixelDim) / 2f

                            for (r in 0 until moduleCount) {
                                val row = qrMatrix.getArray(r)
                                for (c in 0 until moduleCount) {
                                    if (row != null && row.getBoolean(c)) {
                                        val l = qrLeft + (c + quietZone) * qrScale
                                        val t = currentY + (r + quietZone) * qrScale
                                        canvas.drawRect(l, t, l + qrScale, t + qrScale, qrPaint)
                                    }
                                }
                            }
                            currentY += qrPixelDim + 14f
                        }
                    } else if (trimmed.contains("GRAND TOTAL")) {
                        canvas.drawText(line, 10f, currentY + boldTextSize * 1.15f, grandTotalPaint)
                        currentY += lineHeight * 1.35f
                    } else {
                        val p = if (trimmed.startsWith("=") || trimmed.startsWith("-")) boldPaint else normalPaint
                        canvas.drawText(line, 10f, currentY + normalTextSize, p)
                        currentY += lineHeight
                    }
                }

                // 5. Convert to ESC/POS GS v 0 raster bytes
                val totalWidthBytes = widthDots / 8
                val outRasterStream = ByteArrayOutputStream()

                val xL = (totalWidthBytes and 0xFF).toByte()
                val xH = ((totalWidthBytes shr 8) and 0xFF).toByte()
                val yL = (totalHeightDots and 0xFF).toByte()
                val yH = ((totalHeightDots shr 8) and 0xFF).toByte()

                // GS v 0 0 xL xH yL yH
                outRasterStream.write(byteArrayOf(0x1D.toByte(), 0x76.toByte(), 0x30.toByte(), 0x00.toByte(), xL, xH, yL, yH))

                for (y in 0 until totalHeightDots) {
                    val rowBytes = ByteArray(totalWidthBytes)
                    for (x in 0 until widthDots) {
                        val pixel = receiptBitmap.getPixel(x, y)
                        val alpha = (pixel shr 24) and 0xFF
                        if (alpha > 80) {
                            val r = (pixel shr 16) and 0xFF
                            val g = (pixel shr 8) and 0xFF
                            val b = pixel and 0xFF
                            val luminance = (0.299 * r + 0.587 * g + 0.114 * b).toInt()
                            if (luminance < 165) {
                                val byteIndex = x / 8
                                val bitIndex = 7 - (x % 8)
                                rowBytes[byteIndex] = (rowBytes[byteIndex].toInt() or (1 shl bitIndex)).toByte()
                            }
                        }
                    }
                    outRasterStream.write(rowBytes)
                }

                val rasterBytes = outRasterStream.toByteArray()
                val rasterBase64 = Base64.encodeToString(rasterBytes, Base64.NO_WRAP)

                // Optional PNG data URI for digital preview / sharing
                val pngStream = ByteArrayOutputStream()
                receiptBitmap.compress(Bitmap.CompressFormat.PNG, 95, pngStream)
                val pngDataUri = "data:image/png;base64," + Base64.encodeToString(pngStream.toByteArray(), Base64.NO_WRAP)

                val map = Arguments.createMap().apply {
                    putString("rasterBase64", rasterBase64)
                    putString("imageUri", pngDataUri)
                    putInt("width", widthDots)
                    putInt("height", totalHeightDots)
                    putInt("rasterBytesCount", rasterBytes.size)
                }

                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("RENDER_ERROR", e.message ?: "Failed to render receipt image")
            }
        }.start()
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
