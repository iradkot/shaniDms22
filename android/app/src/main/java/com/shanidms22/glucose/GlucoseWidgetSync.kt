package com.shanidms22.glucose

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray

internal object GlucoseWidgetSync {
  fun syncOnce(context: Context): Boolean {
    val prefs = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
    val enabled = prefs.getBoolean(GlucoseSyncWorker.KEY_ENABLED, false)
    val baseUrl = prefs.getString(GlucoseSyncWorker.KEY_BASE_URL, null)?.trim().orEmpty()
    if (!enabled || baseUrl.isBlank()) return false

    val secret = prefs.getString(GlucoseSyncWorker.KEY_API_SECRET_SHA1, null)
    val sparklineHours = prefs.getInt(GlucoseSyncWorker.KEY_SPARKLINE_HOURS, 3).coerceIn(1, 12)
    val entries = fetchRecentEntries(baseUrl, secret, sparklineHours)
    val latest = latestWidgetBgFromEntries(entries) ?: return false
    val load = fetchLatestWidgetLoad(baseUrl, secret)
    val insulinStats = fetchLatestWidgetInsulinStats(baseUrl, secret)
    val (low, high) = GlucoseWidgetUpdater.getRangeThresholds(context)

    GlucoseWidgetUpdater.save(
      context,
      latest.sgv,
      latest.trend,
      latest.date,
      load?.iob,
      load?.cob,
      insulinStats?.totalBasal,
      insulinStats?.totalBolus,
      insulinStats?.basalBolusRatio,
      insulinStats?.totalInsulin,
      calculateWidgetTir(entries, sparklineHours, low, high),
      load?.projected1,
      load?.projected2,
      load?.projected3,
      null,
      null,
      widgetEntriesToSparkline(entries, sparklineHours),
      preserveInsulinStats = true,
    )
    GlucoseWidgetUpdater.updateWidgets(context)
    GlucoseWidgetUpdater.updateNotification(context)
    return true
  }

  fun syncAsync(context: Context) {
    val appContext = context.applicationContext
    CoroutineScope(Dispatchers.IO).launch {
      runCatching { syncOnce(appContext) }
    }
  }

  private fun fetchRecentEntries(baseUrl: String, secret: String?, sparklineHours: Int): JSONArray? {
    val safeHours = sparklineHours.coerceIn(1, 12)
    val count = (safeHours * 12 + 6).coerceIn(24, 180)
    val url = "${baseUrl.trimEnd('/')}/api/v1/entries.json?count=${count}"
    return fetchWidgetJsonArray(url, secret)
  }
}
