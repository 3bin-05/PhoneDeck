package org.phonedeck.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class MyPackageReplacedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            try {
                val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
                if (launchIntent != null) {
                    context.startActivity(launchIntent)
                }
            } catch (_: Exception) {
                // Background start limits on modern Android may require manual tap
            }
        }
    }
}
