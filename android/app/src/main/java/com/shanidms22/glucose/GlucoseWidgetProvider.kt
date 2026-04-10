package com.shanidms22.glucose

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class GlucoseWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    super.onUpdate(context, appWidgetManager, appWidgetIds)
    GlucoseWidgetUpdater.updateWidgets(context)
  }

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    GlucoseWidgetUpdater.updateWidgets(context)
  }
}
