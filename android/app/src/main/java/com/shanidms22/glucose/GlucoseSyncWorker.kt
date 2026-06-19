package com.shanidms22.glucose

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONArray

class GlucoseSyncWorker(
  appContext: Context,
  params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

  override suspend fun doWork(): Result {
    val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val enabled = prefs.getBoolean(KEY_ENABLED, false)
    val baseUrl = prefs.getString(KEY_BASE_URL, null)?.trim().orEmpty()
    if (!enabled || baseUrl.isBlank()) return Result.success()

    return try {
      val secret = prefs.getString(KEY_API_SECRET_SHA1, null)
      val sparklineHours = prefs.getInt(KEY_SPARKLINE_HOURS, 3).coerceIn(1, 12)
      val entries = fetchRecentEntries(baseUrl, secret, sparklineHours)
      val latest = latestFromEntries(entries)

      if (latest != null) {
        val load = fetchLatestWidgetLoad(baseUrl, secret)
        val (low, high) = GlucoseWidgetUpdater.getRangeThresholds(applicationContext)
        GlucoseWidgetUpdater.save(
          applicationContext,
          latest.sgv,
          latest.trend,
          latest.date,
          load?.iob,
          load?.cob,
          null,
          null,
          null,
          null,
          calculateWidgetTir(entries, sparklineHours, low, high),
          load?.projected1,
          load?.projected2,
          load?.projected3,
          null,
          null,
          entriesToSparkline(entries, sparklineHours),
        )
        GlucoseWidgetUpdater.updateWidgets(applicationContext)
        GlucoseWidgetUpdater.updateNotification(applicationContext)
      }

      Result.success()
    } catch (_: Exception) {
      Result.retry()
    }
  }

  private fun fetchRecentEntries(baseUrl: String, secret: String?, sparklineHours: Int): JSONArray? {
    val safeHours = sparklineHours.coerceIn(1, 12)
    val count = (safeHours * 12 + 6).coerceIn(24, 180)
    val url = "${baseUrl.trimEnd('/')}/api/v1/entries.json?count=${count}"
    return fetchWidgetJsonArray(url, secret)
  }

  private fun latestFromEntries(arr: JSONArray?) = latestWidgetBgFromEntries(arr)

  private fun entriesToSparkline(arr: JSONArray?, sparklineHours: Int) =
    widgetEntriesToSparkline(arr, sparklineHours)

  companion object {
    const val PREFS = "glucose_sync_prefs"
    const val KEY_BASE_URL = "base_url"
    const val KEY_API_SECRET_SHA1 = "api_secret_sha1"
    const val KEY_ENABLED = "enabled"
    const val KEY_LIVE_MODE = "live_mode"
    const val KEY_SPARKLINE_HOURS = "sparkline_hours"
  }
}
