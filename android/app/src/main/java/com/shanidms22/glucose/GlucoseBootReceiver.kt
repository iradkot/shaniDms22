package com.shanidms22.glucose

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class GlucoseBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    when (intent?.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.intent.action.QUICKBOOT_POWERON" -> {
        GlucoseSyncScheduler.scheduleFromPrefs(context)
        GlucoseSyncScheduler.enqueueImmediate(context)
        GlucoseWidgetUpdater.updateWidgets(context)
      }
    }
  }
}
