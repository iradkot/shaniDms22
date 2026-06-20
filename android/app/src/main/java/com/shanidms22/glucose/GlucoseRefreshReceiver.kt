package com.shanidms22.glucose

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class GlucoseRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != GlucoseSyncScheduler.REFRESH_ALARM_ACTION) return

    GlucoseSyncScheduler.enqueueImmediate(context)
    GlucoseSyncScheduler.scheduleRefreshAlarm(context)
    GlucoseWidgetUpdater.updateWidgets(context)
  }
}
