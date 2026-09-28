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

  fun fetch(
    context: Context, configuration: WidgetSyncConfiguration.Ready, low: Int, high: Int,
    fetch: (String, String?) -> JSONArray? = ::fetchWidgetJsonArray,
    onProgress: (WidgetDailySyncResult) -> Unit = {},
  ): WidgetDailySyncResult {
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
    var displayed = read(context)
    return fetchWidgetDailySummary(baseUrl, secret, low, high, now, TimeZone.getDefault(), cached.first, cached.second,
      onProgress = { progress ->
        // Partial first-load results are useful. Existing complete results stay visible during refresh.
        if (widgetDailyProgressPreservesData(displayed, progress.summary)) {
          onProgress(progress)
          displayed = progress.summary
        }
      }, fetch = fetch)
  }

  private fun accountKey(configuration: WidgetSyncConfiguration.Ready): String = MessageDigest.getInstance("SHA-256")
    .digest((configuration.baseUrl.trim().trimEnd('/') + "|" + configuration.apiSecretSha1.orEmpty()).toByteArray(Charsets.UTF_8))
    .joinToString("") { "%02x".format(it.toInt() and 255) }
}

/** Transport seam shared by the real sync and deterministic Nightscout contract tests. */
internal fun fetchWidgetDailySummary(
  baseUrl: String,
  secret: String?,
  low: Int,
  high: Int,
  now: Long,
  zone: TimeZone,
  cachedHistory: WidgetDailyHistoryCache? = null,
  lastHistoryAttemptMs: Long = 0,
  onProgress: (WidgetDailySyncResult) -> Unit = {},
  fetch: (String, String?) -> JSONArray? = ::fetchWidgetJsonArray,
): WidgetDailySyncResult {
  val dayStart = widgetStartOfDayMs(now, zone)
  // This request is deliberately unrelated to the small glucose graph's configured window.
  val glucose = fetchCompleteWidgetPages(widgetRangeQuery(baseUrl, "entries.json", "date", (dayStart - 5 * 60_000).toString(), now.toString()), secret, maxPages = 6, fetch = fetch)
  val range = glucose?.let { calculateWidgetDailyRange(parseValidWidgetEntries(it), dayStart, now, low, high) }
  if (range != null) onProgress(WidgetDailySyncResult(WidgetDailySummary(dayStart, now, low, high, range, null), null, null))
  val todayTreatments = fetchCompleteWidgetPages(widgetRangeQuery(baseUrl, "treatments", "created_at", widgetIsoUtc(dayStart - DAY_MS), widgetIsoUtc(now)), secret, fetch = fetch)
  val todayProfiles = fetchWidgetProfileHistory(baseUrl, secret, dayStart, now, fetch)
  val today = calculateWidgetInsulinComparison(todayTreatments, todayProfiles, now, zone, includeHistory = false)
  if (today != null) onProgress(WidgetDailySyncResult(WidgetDailySummary(dayStart, now, low, high, range, today), null, null))
  var history = cachedHistory
  var attempt: Long? = null
  // Past-day history is reusable as the wall-clock cutoff moves; retry failures at most twice/hour.
  if (history == null && (lastHistoryAttemptMs == 0L || now - lastHistoryAttemptMs >= HISTORY_RETRY_MS)) {
    attempt = now
    val historyStart = widgetComparisonWindows(now, zone).last().startMs
    val treatments = fetchCompleteWidgetPages(widgetRangeQuery(baseUrl, "treatments", "created_at", widgetIsoUtc(historyStart - DAY_MS), widgetIsoUtc(dayStart - 1)), secret, fetch = fetch)
    val profiles = fetchWidgetProfileHistory(baseUrl, secret, historyStart, dayStart, fetch)
    if (treatments != null && profiles != null) history = WidgetDailyHistoryCache(dayStart, now, zone.id, treatments, profiles)
  }
  val treatments = if (todayTreatments != null && history != null) mergeWidgetRows(history.treatments, todayTreatments) else todayTreatments
  val profiles = if (todayProfiles != null && history != null) mergeWidgetRows(history.profiles, todayProfiles) else todayProfiles
  // Past profiles may be malformed or unsupported. They must not erase independently valid today totals.
  val comparison = if (history != null) {
    calculateWidgetInsulinComparison(treatments, profiles, now, zone, includeHistory = true)?.copy(today = today?.today) ?: today
  } else today
  return WidgetDailySyncResult(WidgetDailySummary(dayStart, now, low, high, range, comparison), history, attempt)
}

internal fun widgetDailyProgressPreservesData(previous: WidgetDailySummary?, incoming: WidgetDailySummary): Boolean =
  previous == null || (
    (previous.range == null || incoming.range != null) &&
      (previous.insulin?.today == null || incoming.insulin?.today != null) &&
      (previous.insulin?.yesterday == null || incoming.insulin?.yesterday != null) &&
      (previous.insulin?.weekAverage == null || incoming.insulin?.weekAverage != null)
    )

private const val DAY_MS = 86_400_000L
private const val HISTORY_CACHE_MS = 6 * 60 * 60_000L
private const val HISTORY_RETRY_MS = 30 * 60_000L
