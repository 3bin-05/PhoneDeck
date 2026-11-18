package org.phonedeck.android

import android.content.Context
import android.os.Build
import android.os.PowerManager
import androidx.annotation.RequiresApi

class ThermalMonitor(
    context: Context,
    private val onThermalChange: (status: Int) -> Unit
) {
    private val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager

    private val listener = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        PowerManager.OnThermalStatusChangedListener { status ->
            onThermalChange(status)
        }
    } else null

    fun start() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && listener != null) {
            powerManager?.addThermalStatusListener(listener)
        }
    }

    fun getCurrentStatus(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            powerManager?.currentThermalStatus ?: 0
        } else {
            0
        }
    }

    fun stop() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && listener != null) {
            powerManager?.removeThermalStatusListener(listener)
        }
    }
}
