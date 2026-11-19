package com.phonedeck.display

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var sensorManager: SensorManager? = null
  private var lightSensor: Sensor? = null
  private var targetWebView: WebView? = null

  private val lightListener = object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent?) {
      if (event?.sensor?.type == Sensor.TYPE_LIGHT) {
        val lux = event.values[0]
        runOnUiThread {
          targetWebView?.evaluateJavascript("window.__onNativeLux && window.__onNativeLux($lux);", null)
        }
      }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    hideSystemUI()

    // Initialize native light sensor for auto-dim night clock (Samsung Galaxy J8)
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    lightSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_LIGHT)
    registerLightSensor()

    // Proactively request camera permission on launch if not yet granted
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(Manifest.permission.CAMERA)) { _ -> }
    }
  }

  private fun registerLightSensor() {
    lightSensor?.let {
      sensorManager?.registerListener(lightListener, it, SensorManager.SENSOR_DELAY_NORMAL)
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    targetWebView = webView

    // Native bridge for screen brightness control and light sensor check
    webView.addJavascriptInterface(object {
      @JavascriptInterface
      fun setBrightness(value: Float) {
        runOnUiThread {
          val layoutParams = window.attributes
          if (value < 0.0f) {
            layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
          } else {
            layoutParams.screenBrightness = value.coerceIn(0.01f, 1.0f)
          }
          window.attributes = layoutParams
        }
      }

      @JavascriptInterface
      fun isLightSensorAvailable(): Boolean {
        return lightSensor != null
      }
    }, "PhoneDeckNative")

    webView.webChromeClient = object : WebChromeClient() {
      override fun onPermissionRequest(request: PermissionRequest) {
        val requestedResources = request.resources
        var needsCamera = false
        for (resource in requestedResources) {
          if (resource == PermissionRequest.RESOURCE_VIDEO_CAPTURE) {
            needsCamera = true
            break
          }
        }

        if (needsCamera) {
          if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            runOnUiThread {
              request.grant(requestedResources)
            }
          } else {
            runOnUiThread {
              requestPermissions(arrayOf(Manifest.permission.CAMERA)) { granted ->
                runOnUiThread {
                  if (granted == true) {
                    request.grant(requestedResources)
                  } else {
                    request.deny()
                  }
                }
              }
            }
          }
        } else {
          runOnUiThread {
            request.grant(requestedResources)
          }
        }
      }
    }
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      hideSystemUI()
    }
  }

  override fun onResume() {
    super.onResume()
    hideSystemUI()
    registerLightSensor()
  }

  override fun onPause() {
    super.onPause()
    sensorManager?.unregisterListener(lightListener)
  }

  private fun hideSystemUI() {
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowCompat.setDecorFitsSystemWindows(window, false)
      val controller = WindowInsetsControllerCompat(window, window.decorView)
      controller.hide(WindowInsetsCompat.Type.systemBars())
      controller.systemBarsBehavior =
        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = (
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
          or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
          or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
          or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
          or View.SYSTEM_UI_FLAG_FULLSCREEN
      )
    }
  }
}
