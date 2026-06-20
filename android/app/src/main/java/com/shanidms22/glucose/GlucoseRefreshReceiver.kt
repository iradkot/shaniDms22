package com.shanidms22.glucose

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class GlucoseRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != GlucoseSyncScheduler.REFRESH_ALARM_ACTION) return

    GlucoseWidgetUpdater.updateWidgets(context)
    GlucoseSyncScheduler.enqueueImmediate(context)

    val pendingResult = goAsync()
    val appContext = context.applicationContext
    GlucoseSyncScheduler.scheduleRefreshAlarm(appContext)
    CoroutineScope(Dispatchers.IO).launch {
      try {
        runCatching { GlucoseWidgetSync.syncOnce(appContext) }
      } finally {
        pendingResult.finish()
      }
    }
  }
}
