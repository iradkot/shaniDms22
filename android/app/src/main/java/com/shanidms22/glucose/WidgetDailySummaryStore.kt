package com.shanidms22.glucose

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.net.URLEncoder
import java.util.Calendar
import java.util.TimeZone

internal data class WidgetDailyHistoryCache(
  val dayStartMs: Long,
  val fetchedAtMs: Long,
  val zoneId: String,
  val treatments: JSONArray,
  val profilesByDayStart: Map<Long, JSONObject?> = emptyMap(),
  val profilesFetchedAtMs: Long = 0,
  val sourceKey: String = "",
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
  private const val KEY_HISTORY = "daily_history_estimated_v3"
  private const val KEY_HISTORY_ATTEMPT = "daily_history_attempt_estimated_v3"
  private const val KEY_ATTEMPT_DAY = "daily_history_attempt_day_estimated_v3"
  private const val KEY_ATTEMPT_ZONE = "daily_history_attempt_zone_estimated_v3"

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
      put("treatments", cache.treatments)
      put("sourceKey", cache.sourceKey); put("profilesFetchedAtMs", cache.profilesFetchedAtMs)
      put("profilesByDayStart", JSONObject().apply { cache.profilesByDayStart.forEach { (day, profile) -> put(day.toString(), profile ?: JSONObject.NULL) } })
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
          else WidgetDailyHistoryCache(dayStart, raw.getLong("fetchedAtMs"), zoneId, raw.getJSONArray("treatments"),
            raw.optJSONObject("profilesByDayStart")?.let { profiles -> profiles.keys().asSequence().mapNotNull { key ->
              key.toLongOrNull()?.let { it to profiles.optJSONObject(key) }
            }.toMap() }.orEmpty(), raw.optLong("profilesFetchedAtMs", 0), raw.optString("sourceKey", ""))
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
  var today = calculateWidgetInsulinComparison(todayTreatments, now, zone, includeHistory = false)
  if (today != null) onProgress(WidgetDailySyncResult(WidgetDailySummary(dayStart, now, low, high, range, today), null, null))
  val sourceKey = widgetDailySourceKey(baseUrl, secret)
  var history = cachedHistory?.takeIf {
    it.dayStartMs == dayStart && it.zoneId == zone.id && it.sourceKey == sourceKey && now - it.fetchedAtMs in 0 until HISTORY_CACHE_MS
  }
  val profiles = history?.profilesByDayStart?.toMutableMap() ?: mutableMapOf()
  var profileAttempt = history?.profilesFetchedAtMs ?: 0L
  val retryProfiles = profileAttempt == 0L || now - profileAttempt >= HISTORY_RETRY_MS
  fun loadProfile(start: Long, through: Long, refresh: Boolean = false) {
    if (!refresh && profiles.containsKey(start) && (profiles[start] != null || !retryProfiles)) return
    profiles[start] = fetchWidgetBasalProfile(baseUrl, secret, start, zone, fetch, through)
    if (start != dayStart) profileAttempt = now
  }
  // First publish today's recorded doses. Profile/history failures cannot delay that first view.
  if (todayTreatments != null) {
    // A new profile upload later today invalidates a single-profile reconstruction of today.
    loadProfile(dayStart, now, refresh = true)
    today = calculateWidgetInsulinComparison(todayTreatments, now, zone, includeHistory = false, profilesByDayStart = profiles)
    if (today != null) onProgress(WidgetDailySyncResult(WidgetDailySummary(dayStart, now, low, high, range, today), null, null))
  }
  var attempt: Long? = null
  // Past-day history is reusable as the wall-clock cutoff moves; retry failures at most twice/hour.
  if (history == null && (lastHistoryAttemptMs == 0L || now - lastHistoryAttemptMs >= HISTORY_RETRY_MS)) {
    attempt = now
    val historyStart = widgetComparisonWindows(now, zone).last().startMs
    val treatments = fetchCompleteWidgetPages(widgetRangeQuery(baseUrl, "treatments", "created_at", widgetIsoUtc(historyStart - DAY_MS), widgetIsoUtc(dayStart - 1)), secret, fetch = fetch)
    if (treatments != null) history = WidgetDailyHistoryCache(dayStart, now, zone.id, treatments, sourceKey = sourceKey)
  }
  if (history != null) {
    widgetComparisonWindows(now, zone).drop(1).forEach {
      // Include each full past date so cached profiles stay safe as its matched cutoff advances.
      val endOfDate = Calendar.getInstance(zone).apply { timeInMillis = it.startMs; add(Calendar.DATE, 1) }.timeInMillis - 1
      loadProfile(it.startMs, endOfDate)
    }
    history = history.copy(profilesByDayStart = profiles.toMap(), profilesFetchedAtMs = profileAttempt)
  }
  val treatments = if (todayTreatments != null && history != null) mergeWidgetRows(history.treatments, todayTreatments) else todayTreatments
  // A failed historical request must not erase independently fetched today's recorded doses.
  val comparison = if (history != null) {
    calculateWidgetInsulinComparison(treatments, now, zone, includeHistory = true, profilesByDayStart = profiles)?.copy(today = today?.today) ?: today
  } else today
  return WidgetDailySyncResult(WidgetDailySummary(dayStart, now, low, high, range, comparison), history, attempt)
}

private fun widgetDailySourceKey(baseUrl: String, secret: String?): String = MessageDigest.getInstance("SHA-256")
  .digest((baseUrl.trim().trimEnd('/') + "|" + secret.orEmpty()).toByteArray(Charsets.UTF_8))
  .joinToString("") { "%02x".format(it.toInt() and 255) }

internal fun fetchWidgetBasalProfile(
  baseUrl: String, secret: String?, asOfMs: Long, zone: TimeZone,
  fetch: (String, String?) -> JSONArray? = ::fetchWidgetJsonArray,
  throughMs: Long = asOfMs,
): JSONObject? {
  fun encode(value: String) = URLEncoder.encode(value, "UTF-8")
  // Nightscout's profile default sort is startDate descending, including older v1 servers.
  if (throughMs < asOfMs) return null
  val url = "${baseUrl.trimEnd('/')}/api/v1/profiles?${encode("find[startDate][\$lte]")}=${encode(widgetIsoUtc(throughMs))}&count=1"
  val rows = runCatching { fetch(url, secret) }.getOrNull() ?: return null
  if (rows.length() != 1) return null
  return rows.optJSONObject(0)?.takeIf { validWidgetBasalProfile(it, asOfMs, zone) }
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
