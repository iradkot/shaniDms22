package com.shanidms22.glucose

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle

class GlucoseGraphWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    super.onUpdate(context, appWidgetManager, appWidgetIds)
    GlucoseSyncScheduler.scheduleFromPrefs(context)
    GlucoseSyncScheduler.enqueueImmediate(context)
    GlucoseWidgetUpdater.updateWidgets(context)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle,
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    GlucoseWidgetUpdater.updateWidgets(context)
  }

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    GlucoseSyncScheduler.scheduleFromPrefs(context)
    GlucoseSyncScheduler.enqueueImmediate(context)
    GlucoseWidgetUpdater.updateWidgets(context)
  }

  override fun onDisabled(context: Context) {
    super.onDisabled(context)
    if (!GlucoseWidgetUpdater.hasActiveWidgets(context)) {
      GlucoseSyncScheduler.cancel(context)
    }
  }
}
