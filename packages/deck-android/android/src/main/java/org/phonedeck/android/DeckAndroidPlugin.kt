package org.phonedeck.android

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.WindowManager
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import java.io.File

@InvokeArg
class ScreenArgs {
    var enabled: Boolean = true
}

@InvokeArg
class VibrateArgs {
    var kind: String = "done" // "done", "needs_input", "error", "alert"
}

@InvokeArg
class InstallApkArgs {
    var path: String = ""
}

@InvokeArg
class BrightnessArgs {
    var value: Float = -1.0f // -1.0f to restore system brightness, or 0.01f to 1.0f
}

@TauriPlugin
class DeckAndroidPlugin(private val activity: Activity) : Plugin(activity) {

    private var wifiLock: WifiManager.WifiLock? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private var nsdHelper: NsdDiscoveryHelper? = null
    private var thermalMonitor: ThermalMonitor? = null
    private var sensorManager: SensorManager? = null
    private var lightSensor: Sensor? = null
    private var isLightSensorActive = false
    private var originalBrightness: Float = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE

    private val lightListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent?) {
            if (event?.sensor?.type == Sensor.TYPE_LIGHT) {
                val lux = event.values[0]
                val ret = JSObject()
                ret.put("lux", lux)
                trigger("ambientLux", ret)
            }
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    override fun load(webView: android.webkit.WebView) {
        super.load(webView)
        val wifiManager = activity.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager

        // Create high performance WifiLock
        wifiLock = wifiManager?.createWifiLock(
            WifiManager.WIFI_MODE_FULL_HIGH_PERF,
            "PhoneDeck::HighPerfWifiLock"
        )?.apply { setReferenceCounted(false) }

        // Create MulticastLock for mDNS discovery
        multicastLock = wifiManager?.createMulticastLock("PhoneDeck::MulticastLock")?.apply {
            setReferenceCounted(false)
        }

        // Initialize Thermal Monitor
        thermalMonitor = ThermalMonitor(activity.applicationContext) { status ->
            val ret = JSObject()
            ret.put("status", status)
            trigger("thermalStatusChanged", ret)
        }
        thermalMonitor?.start()

        // Initialize Light Sensor
        sensorManager = activity.applicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        lightSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_LIGHT)
    }

    @Command
    fun isLightSensorAvailable(invoke: Invoke) {
        val available = lightSensor != null
        val ret = JSObject()
        ret.put("available", available)
        invoke.resolve(ret)
    }

    @Command
    fun startLightSensor(invoke: Invoke) {
        if (lightSensor != null && !isLightSensorActive) {
            // ~1s sampling period with maxReportLatency batching
            val samplingPeriodUs = 1_000_000 // 1 s
            val maxLatencyUs = 2_000_000 // 2 s batching
            sensorManager?.registerListener(lightListener, lightSensor, samplingPeriodUs, maxLatencyUs)
            isLightSensorActive = true
        }
        invoke.resolve()
    }

    @Command
    fun stopLightSensor(invoke: Invoke) {
        if (isLightSensorActive) {
            sensorManager?.unregisterListener(lightListener)
            isLightSensorActive = false
        }
        invoke.resolve()
    }

    @Command
    fun setScreenBrightness(invoke: Invoke) {
        val args = invoke.parseArgs(BrightnessArgs::class.java)
        activity.runOnUiThread {
            val layoutParams = activity.window.attributes
            if (args.value < 0.0f) {
                // Restore system default brightness
                layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            } else {
                // Clamp brightness between 0.01f and 1.0f
                layoutParams.screenBrightness = args.value.coerceIn(0.01f, 1.0f)
            }
            activity.window.attributes = layoutParams
            invoke.resolve()
        }
    }

    @Command
    fun keepScreenOn(invoke: Invoke) {
        val args = invoke.parseArgs(ScreenArgs::class.java)
        activity.runOnUiThread {
            if (args.enabled) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
            invoke.resolve()
        }
    }

    @Command
    fun acquireWifiLock(invoke: Invoke) {
        try {
            wifiLock?.let {
                if (!it.isHeld) it.acquire()
            }
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to acquire WifiLock: ${e.message}")
        }
    }

    @Command
    fun releaseWifiLock(invoke: Invoke) {
        try {
            wifiLock?.let {
                if (it.isHeld) it.release()
            }
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to release WifiLock: ${e.message}")
        }
    }

    @Command
    fun acquireMulticastLock(invoke: Invoke) {
        try {
            multicastLock?.let {
                if (!it.isHeld) it.acquire()
            }
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to acquire MulticastLock: ${e.message}")
        }
    }

    @Command
    fun releaseMulticastLock(invoke: Invoke) {
        try {
            multicastLock?.let {
                if (it.isHeld) it.release()
            }
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to release MulticastLock: ${e.message}")
        }
    }

    @Command
    fun startDiscovery(invoke: Invoke) {
        try {
            multicastLock?.let { if (!it.isHeld) it.acquire() }
            if (nsdHelper == null) {
                nsdHelper = NsdDiscoveryHelper(activity.applicationContext) { host, port, name ->
                    val ret = JSObject()
                    ret.put("host", host)
                    ret.put("port", port)
                    ret.put("name", name)
                    trigger("serviceDiscovered", ret)
                }
            }
            nsdHelper?.start()
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to start mDNS: ${e.message}")
        }
    }

    @Command
    fun stopDiscovery(invoke: Invoke) {
        try {
            nsdHelper?.stop()
            multicastLock?.let { if (it.isHeld) it.release() }
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to stop mDNS: ${e.message}")
        }
    }

    @Command
    fun startForegroundService(invoke: Invoke) {
        try {
            val intent = Intent(activity, DeckForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                activity.startForegroundService(intent)
            } else {
                activity.startService(intent)
            }
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to start foreground service: ${e.message}")
        }
    }

    @Command
    fun stopForegroundService(invoke: Invoke) {
        try {
            val intent = Intent(activity, DeckForegroundService::class.java)
            activity.stopService(intent)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to stop foreground service: ${e.message}")
        }
    }

    @Command
    fun requestBatteryOptimizationExemption(invoke: Invoke) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = activity.getSystemService(Context.POWER_SERVICE) as PowerManager
                val packageName = activity.packageName
                if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                    }
                    activity.startActivity(intent)
                }
            }
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to request battery exemption: ${e.message}")
        }
    }

    @Command
    fun getThermalStatus(invoke: Invoke) {
        val status = thermalMonitor?.getCurrentStatus() ?: 0
        val ret = JSObject()
        ret.put("status", status)
        invoke.resolve(ret)
    }

    @Command
    fun vibrate(invoke: Invoke) {
        val args = invoke.parseArgs(VibrateArgs::class.java)
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }

            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val effect = when (args.kind) {
                        "done" -> VibrationEffect.createWaveform(longArrayOf(0, 100, 50, 150), -1)
                        "needs_input", "approval" -> VibrationEffect.createWaveform(longArrayOf(0, 200, 100, 200, 100, 200), -1)
                        "error" -> VibrationEffect.createWaveform(longArrayOf(0, 300, 100, 300), -1)
                        else -> VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE)
                    }
                    vibrator.vibrate(effect)
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(100)
                }
            }
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Vibration failed: ${e.message}")
        }
    }

    @Command
    fun installApk(invoke: Invoke) {
        val args = invoke.parseArgs(InstallApkArgs::class.java)
        try {
            val file = File(args.path)
            if (!file.exists()) {
                invoke.reject("APK file does not exist at ${args.path}")
                return
            }

            val contentUri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                file
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }

            activity.startActivity(intent)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Install APK failed: ${e.message}")
        }
    }

    override fun onDestroy() {
        stopLightSensorInternal()
        // Restore screen brightness
        activity.runOnUiThread {
            val layoutParams = activity.window.attributes
            layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            activity.window.attributes = layoutParams
        }
        thermalMonitor?.stop()
        nsdHelper?.stop()
        multicastLock?.let { if (it.isHeld) it.release() }
        wifiLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    private fun stopLightSensorInternal() {
        if (isLightSensorActive) {
            sensorManager?.unregisterListener(lightListener)
            isLightSensorActive = false
        }
    }
}
