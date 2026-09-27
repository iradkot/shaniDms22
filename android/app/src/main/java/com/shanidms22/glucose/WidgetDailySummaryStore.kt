package com.shanidms22.glucose

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.TimeZone

internal data class WidgetDailyHistoryCache(
  val dayStartMs: Long,
  val fetchedAtMs: Long,
  val zoneId: String,
  val treatments: JSONArray,
  val profiles: JSONArray,
)

internal data class WidgetDailySyncResult(
  val summary: WidgetDailySummary,
  val historyCache: WidgetDailyHistoryCache?,
  val historyAttemptMs: Long?,
)

/** Kept with live preferences so logout/account replacement clears summaries and history together. */
internal object WidgetDailySummaryStore {
  private const val PREFS = "glucose_live_prefs"
  private const val KEY_ACCOUNT = "daily_account_v1"
  private const val KEY_SUMMARY = "daily_summary_v1"
  private const val KEY_HISTORY = "daily_history_v1"
  private const val KEY_HISTORY_ATTEMPT = "daily_history_attempt_v1"
  private const val KEY_ATTEMPT_DAY = "daily_history_attempt_day_v1"
  private const val KEY_ATTEMPT_ZONE = "daily_history_attempt_zone_v1"

  fun read(context: Context): WidgetDailySummary? = GlucoseWidgetCredentialStore.withConfigurationLock {
    val configuration = GlucoseWidgetCredentialStore.readSyncConfiguration(context) as? WidgetSyncConfiguration.Ready ?: return@withConfigurationLock null
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (prefs.getString(KEY_ACCOUNT, null) != accountKey(configuration)) return@withConfigurationLock null
    val summary = parseWidgetDailySummary(prefs.getString(KEY_SUMMARY, null), System.currentTimeMillis()) ?: return@withConfigurationLock null
    val (low, high) = GlucoseWidgetUpdater.getRangeThresholds(context)
    summary.takeIf { it.low == low && it.high == high }
  }

  /** Caller may fetch outside the lock; all changes are revalidated against the credentials here. */
  fun save(context: Context, configuration: WidgetSyncConfiguration.Ready, result: WidgetDailySyncResult) = GlucoseWidgetCredentialStore.withConfigurationLock {
    if (GlucoseWidgetCredentialStore.readSyncConfiguration(context) != configuration) return@withConfigurationLock
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val previous = parseWidgetDailySummary(prefs.getString(KEY_SUMMARY, null), System.currentTimeMillis())
    if (previous != null && previous.updatedAtMs > result.summary.updatedAtMs) return@withConfigurationLock
    val editor = prefs.edit().putString(KEY_ACCOUNT, accountKey(configuration))
      .putString(KEY_SUMMARY, widgetDailySummaryJson(result.summary))
    result.historyCache?.let { cache -> editor.putString(KEY_HISTORY, JSONObject().apply {
      put("dayStartMs", cache.dayStartMs); put("fetchedAtMs", cache.fetchedAtMs); put("zoneId", cache.zoneId)
      put("treatments", cache.treatments); put("profiles", cache.profiles)
    }.toString()) }
    result.historyAttemptMs?.let {
      editor.putLong(KEY_HISTORY_ATTEMPT, it).putLong(KEY_ATTEMPT_DAY, result.summary.dayStartMs)
        .putString(KEY_ATTEMPT_ZONE, TimeZone.getDefault().id)
    }
    editor.apply()
  }

  fun fetch(context: Context, configuration: WidgetSyncConfiguration.Ready, low: Int, high: Int): WidgetDailySyncResult {
    val now = System.currentTimeMillis()
    val dayStart = widgetStartOfDayMs(now)
    val baseUrl = configuration.baseUrl
    val secret = configuration.apiSecretSha1
    val zoneId = TimeZone.getDefault().id
    val cached = GlucoseWidgetCredentialStore.withConfigurationLock {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (GlucoseWidgetCredentialStore.readSyncConfiguration(context) != configuration || prefs.getString(KEY_ACCOUNT, null) != accountKey(configuration)) {
        Pair<WidgetDailyHistoryCache?, Long>(null, 0)
      } else {
        val history = runCatching {
          val raw = JSONObject(prefs.getString(KEY_HISTORY, null) ?: "{}")
          if (raw.getLong("dayStartMs") != dayStart || raw.getString("zoneId") != zoneId || now - raw.getLong("fetchedAtMs") !in 0 until HISTORY_CACHE_MS) null
          else WidgetDailyHistoryCache(dayStart, raw.getLong("fetchedAtMs"), zoneId, raw.getJSONArray("treatments"), raw.getJSONArray("profiles"))
        }.getOrNull()
        val attempt = if (prefs.getLong(KEY_ATTEMPT_DAY, 0) == dayStart && prefs.getString(KEY_ATTEMPT_ZONE, null) == zoneId) prefs.getLong(KEY_HISTORY_ATTEMPT, 0) else 0L
        Pair(history, attempt)
      }
    }
    // This request is deliberately unrelated to the small glucose graph's configured window.
    val glucose = fetchCompleteWidgetPages(widgetRangeQuery(baseUrl, "entries.json", "date", (dayStart - 5 * 60_000).toString(), now.toString()), secret, maxPages = 6)
    val range = glucose?.let { calculateWidgetDailyRange(parseValidWidgetEntries(it), dayStart, now, low, high) }
    val todayTreatments = fetchCompleteWidgetPages(widgetRangeQuery(baseUrl, "treatments", "created_at", widgetIsoUtc(dayStart - DAY_MS), widgetIsoUtc(now)), secret)
    val todayProfiles = fetchWidgetProfileHistory(baseUrl, secret, dayStart, now)
    var history = cached.first
    var attempt: Long? = null
    // Past-day history is reusable as the wall-clock cutoff moves; retry failures at most twice/hour.
    if (history == null && (cached.second == 0L || now - cached.second >= HISTORY_RETRY_MS)) {
      attempt = now
      val historyStart = widgetComparisonWindows(now).last().startMs
      val treatments = fetchCompleteWidgetPages(widgetRangeQuery(baseUrl, "treatments", "created_at", widgetIsoUtc(historyStart - DAY_MS), widgetIsoUtc(dayStart - 1)), secret)
      val profiles = fetchWidgetProfileHistory(baseUrl, secret, historyStart, dayStart)
      if (treatments != null && profiles != null) history = WidgetDailyHistoryCache(dayStart, now, zoneId, treatments, profiles)
    }
    val treatments = if (todayTreatments != null && history != null) mergeWidgetRows(history.treatments, todayTreatments) else todayTreatments
    val profiles = if (todayProfiles != null && history != null) mergeWidgetRows(history.profiles, todayProfiles) else todayProfiles
    val comparison = calculateWidgetInsulinComparison(treatments, profiles, now, includeHistory = history != null)
    return WidgetDailySyncResult(WidgetDailySummary(dayStart, now, low, high, range, comparison), history, attempt)
  }

  private fun accountKey(configuration: WidgetSyncConfiguration.Ready): String = MessageDigest.getInstance("SHA-256")
    .digest((configuration.baseUrl.trim().trimEnd('/') + "|" + configuration.apiSecretSha1.orEmpty()).toByteArray(Charsets.UTF_8))
    .joinToString("") { "%02x".format(it.toInt() and 255) }
}

private const val DAY_MS = 86_400_000L
private const val HISTORY_CACHE_MS = 6 * 60 * 60_000L
private const val HISTORY_RETRY_MS = 30 * 60_000L
