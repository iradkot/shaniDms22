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
  // Rebuild histories persisted before carry-in profile ambiguity was checked.
  private const val KEY_HISTORY = "daily_history_estimated_v4"
  private const val KEY_HISTORY_ATTEMPT = "daily_history_attempt_estimated_v4"
  private const val KEY_ATTEMPT_DAY = "daily_history_attempt_day_estimated_v4"
  private const val KEY_ATTEMPT_ZONE = "daily_history_attempt_zone_estimated_v4"

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
    // Load the effective profile and any changes through today's current cutoff.
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
    // mergeWidgetRows preserves the winning row object. Fresh revisions establish
    // a new observation, while elapsed time cannot finalize an unchanged cached dose.
    val freshRows = todayTreatments?.let { rows -> (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }.toSet() }.orEmpty()
    val historicalObservedAt = history.fetchedAtMs
    calculateWidgetInsulinComparison(treatments, now, zone, includeHistory = true, profilesByDayStart = profiles,
      treatmentObservedAtMs = { row -> if (row in freshRows) now else historicalObservedAt })?.copy(today = today?.today) ?: today
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
  fun latest(cutoff: Long): JSONObject? {
    // Two rows establish whether the latest effective time is unique. A tied
    // timestamp requires every row at that time, not an arbitrary first profile.
    val url = "${baseUrl.trimEnd('/')}/api/v1/profiles?${encode("find[startDate][\$lte]")}=${encode(widgetIsoUtc(cutoff))}&count=2"
    val rows = runCatching { fetch(url, secret) }.getOrNull() ?: return null
    if (rows.length() !in 1..2) return null
    val newest = rows.optJSONObject(0) ?: return null
    val effective = widgetParseTimestamp(newest.opt("startDate")) ?: return null
    if (effective > cutoff || !validWidgetBasalProfile(newest, effective, zone)) return null
    if (rows.length() == 1) return newest
    val previous = rows.optJSONObject(1) ?: return null
    val previousStart = widgetParseTimestamp(previous.opt("startDate")) ?: return null
    if (previousStart > effective) return null
    if (previousStart < effective) return newest
    val atEffectiveTime = fetchCompleteWidgetPages(widgetRangeQuery(baseUrl, "profiles", "startDate",
      widgetIsoUtc(effective), widgetIsoUtc(effective)), secret, pageSize = 100, maxPages = 10, fetch = fetch) ?: return null
    if (atEffectiveTime.length() == 0) return null
    for (index in 0 until atEffectiveTime.length()) {
      val row = atEffectiveTime.optJSONObject(index) ?: return null
      if (widgetParseTimestamp(row.opt("startDate")) != effective) return null
    }
    val history = JSONObject().put("basalProfileHistory", atEffectiveTime).put("basalProfileHistoryThroughMs", cutoff)
    if (!validWidgetBasalProfile(history, cutoff, zone)) return null
    return atEffectiveTime.optJSONObject(0)
  }
  val newest = latest(throughMs) ?: return null
  val newestStart = widgetParseTimestamp(newest.opt("startDate")) ?: return null
  // A latest record effective before midnight already proves there were no later updates.
  if (newestStart <= asOfMs) return newest
  val carryIn = latest(asOfMs) ?: return null
  val changes = fetchCompleteWidgetPages(widgetRangeQuery(baseUrl, "profiles", "startDate", widgetIsoUtc(asOfMs + 1), widgetIsoUtc(throughMs)),
    secret, pageSize = 100, maxPages = 10, fetch = fetch) ?: return null
  if (changes.length() == 0) return null
  val history = JSONArray().put(carryIn)
  var foundNewest = false
  for (index in 0 until changes.length()) {
    val row = changes.optJSONObject(index) ?: return null
    val effective = widgetParseTimestamp(row.opt("startDate")) ?: return null
    if (effective <= asOfMs || effective > throughMs) return null
    if (effective == newestStart) foundNewest = true
    history.put(row)
  }
  if (!foundNewest) return null
  return JSONObject().put("basalProfileHistory", history).put("basalProfileHistoryThroughMs", throughMs)
    .takeIf { validWidgetBasalProfile(it, asOfMs, zone) }
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
