package org.phonedeck.android

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
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
import java.io.FileInputStream
import java.security.MessageDigest

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
class VerifyApkArgs {
    var path: String = ""
    var expectedCertSha256: String = ""
    var minVersionCode: Long = 0
}

@InvokeArg
class InstallSessionArgs {
    var path: String = ""
    var allowSilent: Boolean = true
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
        instance = this
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

    @Command
    fun canRequestPackageInstalls(invoke: Invoke) {
        val allowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
        val ret = JSObject()
        ret.put("allowed", allowed)
        invoke.resolve(ret)
    }

    @Command
    fun openInstallPermissionSettings(invoke: Invoke) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:${activity.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
            }
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to open install permissions: ${e.message}")
        }
    }

    @Command
    fun verifyApk(invoke: Invoke) {
        val args = invoke.parseArgs(VerifyApkArgs::class.java)
        try {
            val file = File(args.path)
            if (!file.exists() || !file.canRead()) {
                invoke.reject("APK file does not exist or is unreadable at ${args.path}")
                return
            }

            val pm = activity.packageManager
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageManager.GET_SIGNING_CERTIFICATES
            } else {
                @Suppress("DEPRECATION")
                PackageManager.GET_SIGNATURES
            }

            val pkgInfo = pm.getPackageArchiveInfo(args.path, flags)
            if (pkgInfo == null) {
                invoke.reject("Failed to parse APK archive: corrupted or invalid package format")
                return
            }

            // 1. Verify package name matches installed application
            if (pkgInfo.packageName != activity.packageName) {
                invoke.reject("Package name mismatch: candidate '${pkgInfo.packageName}' does not match installed '${activity.packageName}'")
                return
            }

            // 2. Verify versionCode is higher than installed (downgrade prevention)
            val candidateVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pkgInfo.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                pkgInfo.versionCode.toLong()
            }

            if (candidateVersionCode <= args.minVersionCode) {
                invoke.reject("Downgrade rejected: candidate versionCode $candidateVersionCode is not higher than installed ${args.minVersionCode}")
                return
            }

            // 3. Verify signing certificate SHA-256 against installed certificate & manifest expected cert
            val candidateCertSha256 = getApkCertSha256(pkgInfo)
            if (candidateCertSha256 == null) {
                invoke.reject("Failed to read signing certificate from APK archive")
                return
            }

            val installedCertSha256 = getInstalledSigningCertSha256(activity)
            if (installedCertSha256 != null && !candidateCertSha256.equals(installedCertSha256, ignoreCase = true)) {
                invoke.reject("Security violation: APK signing certificate SHA-256 does not match installed application certificate")
                return
            }

            if (args.expectedCertSha256.isNotBlank() && !candidateCertSha256.equals(args.expectedCertSha256, ignoreCase = true)) {
                invoke.reject("Security violation: APK signing certificate SHA-256 does not match release manifest certificate")
                return
            }

            val ret = JSObject()
            ret.put("valid", true)
            ret.put("packageName", pkgInfo.packageName)
            ret.put("versionCode", candidateVersionCode)
            ret.put("versionName", pkgInfo.versionName ?: "")
            ret.put("certSha256", candidateCertSha256)
            invoke.resolve(ret)
        } catch (e: Exception) {
            invoke.reject("APK verification failed: ${e.message}")
        }
    }

    @Command
    fun installApkSession(invoke: Invoke) {
        val args = invoke.parseArgs(InstallSessionArgs::class.java)
        try {
            val file = File(args.path)
            if (!file.exists()) {
                invoke.reject("APK file does not exist at ${args.path}")
                return
            }

            val packageInstaller = activity.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                setAppPackageName(activity.packageName)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && args.allowSilent) {
                    setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                }
            }

            val sessionId = packageInstaller.createSession(params)
            val session = packageInstaller.openSession(sessionId)

            session.openWrite("phone_deck_update", 0, file.length()).use { outStream ->
                FileInputStream(file).use { inStream ->
                    inStream.copyTo(outStream)
                    session.fsync(outStream)
                }
            }

            val callbackIntent = Intent(activity, InstallResultReceiver::class.java)
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pendingIntent = PendingIntent.getBroadcast(activity, sessionId, callbackIntent, flags)

            session.commit(pendingIntent.intentSender)
            session.close()

            val ret = JSObject()
            ret.put("sessionId", sessionId)
            invoke.resolve(ret)
        } catch (e: Exception) {
            invoke.reject("PackageInstaller session failed: ${e.message}")
        }
    }

    @Command
    fun launchPendingUserAction(invoke: Invoke) {
        try {
            val intent = pendingConfirmIntent
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.startActivity(intent)
                pendingConfirmIntent = null
                invoke.resolve()
            } else {
                invoke.reject("No pending user confirmation intent available")
            }
        } catch (e: Exception) {
            invoke.reject("Failed to launch confirmation intent: ${e.message}")
        }
    }

    companion object {
        @Volatile
        var instance: DeckAndroidPlugin? = null
        @Volatile
        var pendingConfirmIntent: Intent? = null

        fun onInstallResult(context: Context, status: Int, message: String?, confirmIntent: Intent?) {
            val inst = instance ?: return
            val ret = JSObject()
            ret.put("status", status)
            ret.put("message", message ?: "")

            when (status) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    pendingConfirmIntent = confirmIntent
                    ret.put("state", "pending_user_action")
                    inst.trigger("installStatus", ret)
                }
                PackageInstaller.STATUS_SUCCESS -> {
                    pendingConfirmIntent = null
                    ret.put("state", "success")
                    inst.trigger("installStatus", ret)
                }
                else -> {
                    pendingConfirmIntent = null
                    ret.put("state", "failure")
                    val friendlyMsg = when (status) {
                        PackageInstaller.STATUS_FAILURE_ABORTED -> "Installation aborted by system or user."
                        PackageInstaller.STATUS_FAILURE_BLOCKED -> "Installation blocked by device policy."
                        PackageInstaller.STATUS_FAILURE_CONFLICT -> "Package conflict with an existing installation."
                        PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "Package incompatible with this device ABI or OS."
                        PackageInstaller.STATUS_FAILURE_STORAGE -> "Insufficient storage space for installation."
                        else -> message ?: "Installation failed with status code $status"
                    }
                    ret.put("message", friendlyMsg)
                    inst.trigger("installStatus", ret)
                }
            }
        }

        fun sha256Hex(bytes: ByteArray): String {
            val md = MessageDigest.getInstance("SHA-256")
            val digest = md.digest(bytes)
            return digest.joinToString("") { "%02x".format(it) }
        }

        fun getInstalledSigningCertSha256(context: Context): String? {
            return try {
                val pm = context.packageManager
                val pkg = context.packageName
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    val info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES)
                    val certs = info.signingInfo?.apkContentsSigners
                    certs?.firstOrNull()?.let { sha256Hex(it.toByteArray()) }
                } else {
                    @Suppress("DEPRECATION")
                    val info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES)
                    @Suppress("DEPRECATION")
                    info.signatures?.firstOrNull()?.let { sha256Hex(it.toByteArray()) }
                }
            } catch (_: Exception) {
                null
            }
        }

        fun getApkCertSha256(pkgInfo: PackageInfo): String? {
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    val certs = pkgInfo.signingInfo?.apkContentsSigners
                    certs?.firstOrNull()?.let { sha256Hex(it.toByteArray()) }
                } else {
                    @Suppress("DEPRECATION")
                    pkgInfo.signatures?.firstOrNull()?.let { sha256Hex(it.toByteArray()) }
                }
            } catch (_: Exception) {
                null
            }
        }
    }


    override fun onDestroy() {
        if (instance === this) {
            instance = null
        }
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
