package com.shanidms22.glucose

import android.content.Context
import android.os.SystemClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray

internal object GlucoseWidgetSync {
  private val foregroundRefresh = WidgetDailyRefreshThrottle()

  /** A launcher summary must also recover while foreground glucose is updating. */
  fun refreshDailyIfNeeded(context: Context, requestRefresh: (Context) -> Unit = ::syncAsync) {
    val configuration = GlucoseWidgetCredentialStore.readSyncConfiguration(context) as? WidgetSyncConfiguration.Ready ?: return
    val summary = WidgetDailySummaryStore.read(context)
    if (summary?.range != null && System.currentTimeMillis() - summary.updatedAtMs < 5 * 60_000L) return
    val thresholds = GlucoseWidgetUpdater.getRangeThresholds(context)
    if (foregroundRefresh.claim(configuration, thresholds, SystemClock.elapsedRealtime())) requestRefresh(context)
  }

  fun syncOnce(context: Context, fetch: (String, String?) -> JSONArray? = ::fetchWidgetJsonArray): Boolean {
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
    val entries = fetchRecentEntries(baseUrl, secret, sparklineHours, fetch)
    val latest = latestWidgetBgFromEntries(entries) ?: return false
    val load = runCatching {
      fetch("${baseUrl.trimEnd('/')}/api/v1/devicestatus.json?count=12", secret)?.let {
        parseWidgetLoad(it, System.currentTimeMillis())
      }
    }.getOrNull()
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
      val snapshot = WidgetForecastSnapshot(nowMs, latest.date, history, listOfNotNull(load?.loopForecast, nightscoutWidgetForecast(history, nowMs)))
      GlucoseWidgetUpdater.saveForecast(context, baseUrl, widgetForecastSnapshotJson(snapshot), native = true)
      GlucoseWidgetUpdater.updateWidgets(context)
      GlucoseWidgetUpdater.updateNotification(context)
      true
    }
    // Fresh glucose must reach the launcher before optional, potentially paginated history work.
    if (!glucoseSaved) return false
    fun publishDaily(result: WidgetDailySyncResult) {
      GlucoseWidgetCredentialStore.withConfigurationLock {
        if (GlucoseWidgetCredentialStore.readSyncConfiguration(context) == configuration &&
          GlucoseWidgetUpdater.getRangeThresholds(context) == Pair(low, high)) {
          WidgetDailySummaryStore.save(context, configuration, result)
          GlucoseWidgetUpdater.updateWidgets(context)
        }
      }
    }
    val daily = runCatching {
      WidgetDailySummaryStore.fetch(context, configuration, low, high, fetch = fetch, onProgress = ::publishDaily)
    }.getOrNull()
    if (daily != null) publishDaily(daily)
    return true
  }

  fun syncAsync(context: Context) {
    val appContext = context.applicationContext
    CoroutineScope(Dispatchers.IO).launch {
      runCatching { syncOnce(appContext) }
    }
  }

  private fun fetchRecentEntries(baseUrl: String, secret: String?, sparklineHours: Int, fetch: (String, String?) -> JSONArray?): JSONArray? {
    val safeHours = sparklineHours.coerceIn(1, 12)
    val count = (safeHours * 12 + 6).coerceIn(24, 180)
    val url = "${baseUrl.trimEnd('/')}/api/v1/entries.json?count=${count}"
    return fetch(url, secret)
  }
}

/** Repeated foreground renders do not create repeated history downloads; changed settings retry immediately. */
internal class WidgetDailyRefreshThrottle {
  private var previous: Pair<WidgetSyncConfiguration.Ready, Pair<Int, Int>>? = null
  private var attemptedAtMs = 0L

  @Synchronized fun claim(configuration: WidgetSyncConfiguration.Ready, thresholds: Pair<Int, Int>, elapsedMs: Long): Boolean {
    val key = Pair(configuration, thresholds)
    if (previous == key && elapsedMs - attemptedAtMs in 0 until 60_000L) return false
    previous = key
    attemptedAtMs = elapsedMs
    return true
  }
}
