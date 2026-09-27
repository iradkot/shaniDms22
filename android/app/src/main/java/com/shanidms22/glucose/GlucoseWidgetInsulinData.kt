package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

internal data class WidgetInsulinStats(
  val totalBasal: Double,
  val totalBolus: Double,
  val basalBolusRatio: Double,
  val totalInsulin: Double,
  // Scheduled basal plus recorded overrides is an estimate, not a pump delivery ledger.
  val basalEstimated: Boolean = true,
)

internal fun widgetInsulinStats(basal: Double, bolus: Double): WidgetInsulinStats {
  val total = basal + bolus
  return WidgetInsulinStats(basal, bolus, if (total > 0) basal / total else 0.0, total)
}

private data class BasalRate(val seconds: Int, val rate: Double)
private data class BasalProfile(val startMs: Long, val rates: List<BasalRate>, val zone: TimeZone)
private data class BasalControl(val startMs: Long, val endMs: Long, val rate: Double?)

/** Retained for callers outside the daily dashboard. */
internal fun fetchLatestWidgetInsulinStats(baseUrl: String, secret: String?): WidgetInsulinStats? {
  val now = System.currentTimeMillis()
  val start = widgetStartOfDayMs(now)
  val treatments = fetchCompleteWidgetPages(widgetRangeQuery(baseUrl, "treatments", "created_at", widgetIsoUtc(start - DAY_MS), widgetIsoUtc(now)), secret)
  val profiles = fetchWidgetProfileHistory(baseUrl, secret, start, now)
  return calculateWidgetInsulinStats(treatments, profiles, start, now)
}

/** Each date uses the profile actually effective then; today's profile is never backfilled. */
internal fun fetchWidgetProfileHistory(baseUrl: String, secret: String?, startMs: Long, endMs: Long): JSONArray? {
  val baselineUrl = "${baseUrl.trimEnd('/')}/api/v1/profiles?find[startDate][\$lte]=${widgetIsoUtc(startMs)}&sort[startDate]=-1&count=1"
  val baseline = runCatching { fetchWidgetJsonArray(baselineUrl, secret) }.getOrNull() ?: return null
  val changes = fetchCompleteWidgetPages(widgetRangeQuery(baseUrl, "profiles", "startDate", widgetIsoUtc(startMs), widgetIsoUtc(endMs)), secret, pageSize = 100, maxPages = 10) ?: return null
  return mergeWidgetRows(baseline, changes)
}

internal fun calculateWidgetInsulinStats(
  treatments: JSONArray?, profiles: JSONArray?, startMs: Long, endMs: Long,
  fallbackZone: TimeZone = TimeZone.getDefault(),
): WidgetInsulinStats? {
  if (treatments == null || profiles == null || endMs <= startMs) return null
  val history = parseProfiles(profiles, fallbackZone) ?: return null
  if (history.none { it.startMs <= startMs }) return null
  val rows = (0 until treatments.length()).mapNotNull { treatments.optJSONObject(it) }
    .distinctBy { it.optString("_id", "").ifEmpty { it.toString() } }
  val controls = mutableListOf<BasalControl>()
  val profileSwitches = mutableListOf<Long>()
  var bolus = 0.0
  for (row in rows) {
    val event = row.optString("eventType", "")
    val relevant = event.contains("bolus", true) || event.equals("Temp Basal", true) || isSuspend(event) || isResume(event) || event.contains("Profile", true)
    val ts = widgetTreatmentTimestamp(row)
    if (ts == null) { if (relevant) return null else continue }
    if (ts >= endMs) continue
    when {
      event.contains("bolus", true) -> {
        // An extended delivery beginning before midnight can still overlap today's window.
        if (event.contains("combo", true) || event.contains("extended", true)) {
          val duration = finiteDouble(row.opt("duration"))
          if (duration == null || ts + duration.coerceAtLeast(0.0) * MINUTE_MS > startMs || ts >= startMs) return null
          continue
        }
        if (ts >= startMs) {
          val amount = finiteDouble(row.opt("insulin")) ?: finiteDouble(row.opt("amount")) ?: return null
          if (amount < 0) return null
          bolus += amount
        }
      }
      event.equals("Temp Basal", true) -> {
        val duration = finiteDouble(row.opt("duration")) ?: return null
        if (duration < 0 || duration > 24 * 60) return null
        val rate = finiteDouble(row.opt("absolute")) ?: finiteDouble(row.opt("rate"))
        // Unsupported percentage basals remain an unknown interval rather than scheduled basal.
        val supportedRate = rate?.takeIf { it >= 0 && !row.optString("temp", "").equals("percent", true) }
        controls.add(BasalControl(ts, ts + (duration * MINUTE_MS).toLong(), supportedRate))
      }
      isSuspend(event) -> controls.add(BasalControl(ts, Long.MAX_VALUE, 0.0))
      isResume(event) -> controls.add(BasalControl(ts, ts, 0.0))
      event.contains("Profile Switch", true) || event.contains("Temporary Profile", true) -> profileSwitches.add(ts)
    }
  }
  val ordered = controls.sortedBy { it.startMs }
  val overrides = ordered.mapIndexed { index, control ->
    control.copy(endMs = minOf(control.endMs, ordered.getOrNull(index + 1)?.startMs ?: endMs))
  }.filter { it.endMs > startMs && it.startMs < endMs && it.endMs > it.startMs }
  val boundaries = sortedSetOf(startMs, endMs)
  history.forEach { if (it.startMs in (startMs + 1) until endMs) boundaries.add(it.startMs) }
  profileSwitches.forEach { if (it in (startMs + 1) until endMs) boundaries.add(it) }
  overrides.forEach { boundaries.add(maxOf(startMs, it.startMs)); boundaries.add(minOf(endMs, it.endMs)) }
  var basal = 0.0
  for ((segmentStart, segmentEnd) in boundaries.zipWithNext()) {
    val active = overrides.lastOrNull { it.startMs <= segmentStart && it.endMs > segmentStart }
    if (active != null) {
      basal += (active.rate ?: return null) * (segmentEnd - segmentStart) / HOUR_MS
      continue
    }
    val profile = history.lastOrNull { it.startMs <= segmentStart } ?: return null
    // A switch without a corresponding profile revision is not enough to infer a new schedule.
    if (profileSwitches.any { it <= segmentStart && it > profile.startMs }) return null
    if (profile.rates.isEmpty()) return null
    basal += integrateSchedule(profile, segmentStart, segmentEnd)
  }
  return widgetInsulinStats(basal, bolus)
}

private fun integrateSchedule(profile: BasalProfile, startMs: Long, endMs: Long): Double {
  var cursor = startMs
  var total = 0.0
  val calendar = Calendar.getInstance(profile.zone)
  // Advancing on the actual timeline handles both occurrences of the repeated DST hour.
  // Minute boundaries also bound a timezone offset change; explicit seconds remain exact.
  while (cursor < endMs) {
    calendar.timeInMillis = cursor
    val seconds = calendar.get(Calendar.HOUR_OF_DAY) * 3600 + calendar.get(Calendar.MINUTE) * 60 + calendar.get(Calendar.SECOND)
    val rate = profile.rates.lastOrNull { it.seconds <= seconds }?.rate ?: profile.rates.last().rate
    var next = minOf(endMs, (cursor / MINUTE_MS + 1) * MINUTE_MS)
    val nextSchedule = profile.rates.firstOrNull { it.seconds > seconds && it.seconds / 60 == seconds / 60 }
    if (nextSchedule != null) next = minOf(next, cursor + (nextSchedule.seconds - seconds) * 1000L - calendar.get(Calendar.MILLISECOND))
    total += rate * (next - cursor) / HOUR_MS
    cursor = next
  }
  return total
}

private fun parseProfiles(arr: JSONArray, fallbackZone: TimeZone): List<BasalProfile>? {
  val profiles = mutableListOf<BasalProfile>()
  for (i in 0 until arr.length()) {
    val row = arr.optJSONObject(i) ?: return null
    val start = widgetParseTimestamp(row.opt("startDate")) ?: widgetParseTimestamp(row.opt("mills")) ?: return null
    val store = row.optJSONObject("store")
    val profile = store?.optJSONObject(row.optString("defaultProfile", ""))
    val schedule = profile?.optJSONArray("basal")
    val rates = mutableListOf<BasalRate>()
    if (schedule != null) for (j in 0 until schedule.length()) {
      val entry = schedule.optJSONObject(j) ?: return null
      val rate = finiteDouble(entry.opt("value")) ?: return null
      val seconds = finiteDouble(entry.opt("timeAsSeconds"))?.toInt() ?: parseProfileSeconds(entry.optString("time", "")) ?: return null
      if (rate < 0 || seconds !in 0..86_399) return null
      rates.add(BasalRate(seconds, rate))
    }
    val zoneId = profile?.optString("timezone", "").orEmpty().ifEmpty { row.optString("timezone", "") }
    if (zoneId.isNotEmpty() && zoneId !in TimeZone.getAvailableIDs()) return null
    profiles.add(BasalProfile(start, rates.distinctBy { it.seconds }.sortedBy { it.seconds },
      if (zoneId.isEmpty()) fallbackZone else TimeZone.getTimeZone(zoneId)))
  }
  return profiles.distinctBy { it.startMs }.sortedBy { it.startMs }
}

internal fun mergeWidgetRows(vararg arrays: JSONArray): JSONArray {
  val byId = linkedMapOf<String, JSONObject>()
  arrays.forEach { arr -> for (i in 0 until arr.length()) {
    val row = arr.optJSONObject(i) ?: continue
    byId[row.optString("_id", "").ifEmpty { row.toString() }] = row
  } }
  return JSONArray().apply { byId.values.forEach { put(it) } }
}

internal fun widgetTreatmentTimestamp(row: JSONObject): Long? =
  widgetParseTimestamp(row.opt("created_at")) ?: widgetParseTimestamp(row.opt("timestamp"))

internal fun widgetParseTimestamp(value: Any?): Long? {
  if (value is Number) return value.toLong().takeIf { it > 0 }
  val raw = (value as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: return null
  raw.toLongOrNull()?.let { return it.takeIf { time -> time > 0 } }
  for (pattern in listOf("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd'T'HH:mm:ss.SSSXX", "yyyy-MM-dd'T'HH:mm:ssXX", "yyyy-MM-dd'T'HH:mm:ss.SSSX", "yyyy-MM-dd'T'HH:mm:ssX")) {
    val format = SimpleDateFormat(pattern, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }
    val position = ParsePosition(0)
    val parsed = runCatching { format.parse(raw, position) }.getOrNull()
    if (parsed != null && position.index == raw.length) return parsed.time
  }
  return null
}

internal fun widgetIsoUtc(timeMs: Long): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
  timeZone = TimeZone.getTimeZone("UTC")
}.format(timeMs)

private fun finiteDouble(value: Any?): Double? = when (value) {
  is Number -> value.toDouble()
  is String -> value.trim().toDoubleOrNull()
  else -> null
}?.takeIf { it.isFinite() }

private fun parseProfileSeconds(time: String): Int? {
  val parts = time.split(":")
  val hours = parts.getOrNull(0)?.toIntOrNull() ?: return null
  val minutes = parts.getOrNull(1)?.toIntOrNull() ?: return null
  val seconds = parts.getOrNull(2)?.toIntOrNull() ?: 0
  if (hours !in 0..23 || minutes !in 0..59 || seconds !in 0..59) return null
  return hours * 3600 + minutes * 60 + seconds
}

private fun isSuspend(event: String) = event.equals("Suspend Pump", true) || event.equals("Pump Suspend", true)
private fun isResume(event: String) = event.equals("Resume Pump", true) || event.equals("Pump Resume", true)
private const val MINUTE_MS = 60_000L
private const val HOUR_MS = 3_600_000.0
private const val DAY_MS = 86_400_000L
