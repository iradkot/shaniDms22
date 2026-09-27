package com.shanidms22.glucose

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle

class GlucoseWidgetProvider : AppWidgetProvider() {
  companion object {
    const val ACTION_CYCLE_COMPARISON = "com.shanidms22.glucose.CYCLE_SUMMARY_COMPARISON"
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ACTION_CYCLE_COMPARISON) {
      val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
      val activeIds = AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, GlucoseWidgetProvider::class.java))
      if (id in activeIds) {
        GlucoseSummaryWidgetPreferences.toggle(context, id)
        GlucoseWidgetUpdater.updateWidgets(context)
      }
      return
    }
    super.onReceive(context, intent)
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    GlucoseSummaryWidgetPreferences.remove(context, appWidgetIds)
    super.onDeleted(context, appWidgetIds)
  }

  override fun onRestored(context: Context, oldWidgetIds: IntArray, newWidgetIds: IntArray) {
    GlucoseSummaryWidgetPreferences.restore(context, oldWidgetIds, newWidgetIds)
    super.onRestored(context, oldWidgetIds, newWidgetIds)
    GlucoseWidgetUpdater.updateWidgets(context)
  }

  override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    GlucoseWidgetUpdater.updateWidgets(context)
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    super.onUpdate(context, appWidgetManager, appWidgetIds)
    GlucoseSyncScheduler.scheduleFromPrefs(context)
    GlucoseSyncScheduler.requestImmediateRefresh(context)
    GlucoseWidgetUpdater.updateWidgets(context)
  }

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    GlucoseSyncScheduler.scheduleFromPrefs(context)
    GlucoseSyncScheduler.requestImmediateRefresh(context)
    GlucoseWidgetUpdater.updateWidgets(context)
  }

  override fun onDisabled(context: Context) {
    super.onDisabled(context)
    if (!GlucoseWidgetUpdater.hasActiveWidgets(context)) {
      GlucoseSyncScheduler.cancel(context)
    }
  }
}
