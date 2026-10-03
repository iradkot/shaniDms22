package com.shanidms22.glucose

import android.content.Context
import com.shanidms22.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray

internal object GlucoseWidgetSync {
  fun syncOnce(context: Context): Boolean {
    val configuration = when (val stored = GlucoseWidgetCredentialStore.readSyncConfiguration(context)) {
      is WidgetSyncConfiguration.Ready -> stored
      WidgetSyncConfiguration.Disabled -> return false
      WidgetSyncConfiguration.CredentialUnavailable -> {
        // The vault already disabled the preference. Stop alarms, work, and live mode too.
        // Recheck under the configuration lock so a concurrent reconfiguration is not canceled.
        GlucoseSyncScheduler.cancelIfConfigurationUnavailable(context)
        return false
      }
    }
    val prefs = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
    val baseUrl = configuration.baseUrl
    val secret = configuration.apiSecretSha1
    val sparklineHours = prefs.getInt(GlucoseSyncWorker.KEY_SPARKLINE_HOURS, 3).coerceIn(1, 12)
    val entries = fetchRecentEntries(baseUrl, secret, sparklineHours)
    val latest = latestWidgetBgFromEntries(entries) ?: return false
    val load = runCatching { fetchLatestWidgetLoad(baseUrl, secret) }.getOrNull()
    val (low, high) = GlucoseWidgetUpdater.getRangeThresholds(context)

    val glucoseSaved = GlucoseWidgetCredentialStore.withConfigurationLock {
      // Network requests may finish after an account switch or credential rotation.
      if (GlucoseWidgetCredentialStore.readSyncConfiguration(context) != configuration) return@withConfigurationLock false
      val history = parseValidWidgetEntries(entries)
      val nowMs = System.currentTimeMillis()
      GlucoseWidgetUpdater.save(
        context,
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
        null,
        null,
        null,
        null,
        null,
        widgetEntriesToSparkline(entries, sparklineHours),
        preserveInsulinStats = true,
        historyPoints = history,
        iobTimestampMs = load?.iobTimestampMs,
        cobTimestampMs = load?.cobTimestampMs,
      )
      if (BuildConfig.SHANI_EXPERIMENTAL_FEATURES_ENABLED) {
        val snapshot = WidgetForecastSnapshot(nowMs, latest.date, history, listOfNotNull(load?.loopForecast, nightscoutWidgetForecast(history, nowMs)))
        GlucoseWidgetUpdater.saveForecast(context, baseUrl, widgetForecastSnapshotJson(snapshot), native = true)
      }
      GlucoseWidgetUpdater.updateWidgets(context)
      GlucoseWidgetUpdater.updateNotification(context)
      true
    }
    // Fresh glucose must reach the launcher before optional, potentially paginated history work.
    if (!glucoseSaved) return false
    val daily = runCatching { WidgetDailySummaryStore.fetch(context, configuration, low, high) }.getOrNull()
    if (daily != null) GlucoseWidgetCredentialStore.withConfigurationLock {
      if (GlucoseWidgetCredentialStore.readSyncConfiguration(context) == configuration) {
        WidgetDailySummaryStore.save(context, configuration, daily)
        GlucoseWidgetUpdater.updateWidgets(context)
      }
    }
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
