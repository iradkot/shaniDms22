package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

internal data class WidgetInsulinStats(
  val totalBasal: Double,
  val totalBolus: Double,
  val basalBolusRatio: Double,
  val totalInsulin: Double,
)

private data class WidgetBasalProfileEntry(val seconds: Int, val rate: Double)

private data class WidgetInsulinEntry(
  val type: String,
  val startMs: Long,
  val endMs: Long?,
  val rate: Double?,
  val amount: Double?,
  val order: Int,
)

internal fun fetchLatestWidgetInsulinStats(baseUrl: String, secret: String?): WidgetInsulinStats? {
  val nowMs = System.currentTimeMillis()
  val startMs = startOfLocalDayMs(nowMs)
  val treatments = fetchWidgetJsonArray(
    "${baseUrl.trimEnd('/')}/api/v1/treatments?find[created_at][\$gte]=${isoUtc(startMs - DAY_MS)}&find[created_at][\$lte]=${isoUtc(nowMs)}&count=1000",
    secret,
  )
  val profiles = fetchWidgetJsonArray(
    "${baseUrl.trimEnd('/')}/api/v1/profiles?find[startDate][\$lte]=${isoUtc(nowMs)}&sort[startDate]=-1&count=1",
    secret,
  )

  return calculateWidgetInsulinStats(treatments, profiles, startMs, nowMs)
}

private fun calculateWidgetInsulinStats(
  treatments: JSONArray?,
  profiles: JSONArray?,
  startMs: Long,
  endMs: Long,
): WidgetInsulinStats? {
  val entries = parseWidgetInsulinEntries(treatments)
  val profile = parseWidgetBasalProfile(profiles)
  if (entries.isEmpty() && profile.isEmpty()) return null

  val totalBasal = calculateWidgetBasal(profile, entries, startMs, endMs)
  val totalBolus = totalBolusInRange(entries, startMs, endMs)
  val totalInsulin = totalBasal + totalBolus
  val basalBolusRatio = if (totalInsulin > 0.0) totalBasal / totalInsulin else 0.0

  return WidgetInsulinStats(totalBasal, totalBolus, basalBolusRatio, totalInsulin)
}

private fun totalBolusInRange(entries: List<WidgetInsulinEntry>, startMs: Long, endMs: Long): Double =
  entries
    .filter { it.type == TYPE_BOLUS && it.amount != null && it.startMs >= startMs && it.startMs < endMs }
    .sumOf { it.amount ?: 0.0 }

private fun calculateWidgetBasal(
  profile: List<WidgetBasalProfileEntry>,
  entries: List<WidgetInsulinEntry>,
  startMs: Long,
  endMs: Long,
): Double {
  if (endMs <= startMs) return 0.0

  val overrides = buildEffectiveBasalOverrides(entries, startMs, endMs)
  val boundaries = sortedSetOf(startMs, endMs)
  addProfileBoundaries(boundaries, profile, startMs, endMs)
  overrides.forEach { override ->
    boundaries.add(override.startMs)
    override.endMs?.let(boundaries::add)
  }

  return boundaries
    .zipWithNext()
    .sumOf { (segmentStart, segmentEnd) ->
      if (segmentEnd <= segmentStart) {
        0.0
      } else {
        val rate = activeOverrideAt(overrides, segmentStart)?.rate ?: scheduledBasalRateAt(profile, segmentStart)
        rate * ((segmentEnd - segmentStart).toDouble() / HOUR_MS.toDouble())
      }
    }
}

private fun buildEffectiveBasalOverrides(
  entries: List<WidgetInsulinEntry>,
  startMs: Long,
  endMs: Long,
): List<WidgetInsulinEntry> {
  val controls = entries
    .filter { it.type == TYPE_TEMP_BASAL || it.type == TYPE_SUSPEND_PUMP }
    .sortedWith(compareBy<WidgetInsulinEntry> { it.startMs }.thenBy { it.order })

  return controls
    .mapIndexedNotNull { index, entry ->
      val nextStartMs = controls.getOrNull(index + 1)?.startMs
      val ownEndMs = entry.endMs ?: endMs
      val effectiveEndMs = nextStartMs
        ?.takeIf { it >= entry.startMs }
        ?.let { minOf(ownEndMs, it) }
        ?: ownEndMs
      val clippedStart = maxOf(startMs, entry.startMs)
      val clippedEnd = minOf(endMs, effectiveEndMs)

      if (clippedEnd > clippedStart) {
        entry.copy(startMs = clippedStart, endMs = clippedEnd)
      } else {
        null
      }
    }
}

private fun activeOverrideAt(overrides: List<WidgetInsulinEntry>, startMs: Long): WidgetInsulinEntry? =
  overrides.find { it.startMs <= startMs && (it.endMs ?: startMs) > startMs }

private fun parseWidgetInsulinEntries(arr: JSONArray?): List<WidgetInsulinEntry> {
  if (arr == null) return emptyList()

  val resumeTimes = collectPumpResumeTimes(arr)
  val mapped = mutableListOf<WidgetInsulinEntry>()

  for (i in 0 until arr.length()) {
    val row = arr.optJSONObject(i) ?: continue
    val eventType = row.optString("eventType", "")
    val ts = treatmentTimestampMs(row) ?: continue

    when {
      isBolus(eventType) -> parseBolus(row, ts, i)?.let(mapped::add)
      eventType == "Temp Basal" -> parseTempBasal(row, ts, i)?.let(mapped::add)
      isPumpSuspend(eventType) -> mapped.add(WidgetInsulinEntry(TYPE_SUSPEND_PUMP, ts, null, 0.0, null, i))
    }
  }

  return closePumpSuspends(mapped, resumeTimes)
}

private fun collectPumpResumeTimes(arr: JSONArray): List<Long> {
  val out = mutableListOf<Long>()
  for (i in 0 until arr.length()) {
    val row = arr.optJSONObject(i) ?: continue
    if (isPumpResume(row.optString("eventType", ""))) {
      treatmentTimestampMs(row)?.let(out::add)
    }
  }
  return out
}

private fun parseBolus(row: JSONObject, ts: Long, order: Int): WidgetInsulinEntry? {
  val insulin = finiteWidgetDouble(row.opt("insulin")) ?: finiteWidgetDouble(row.opt("amount"))
  return insulin
    ?.takeIf { it > 0.0 }
    ?.let { WidgetInsulinEntry(TYPE_BOLUS, ts, ts, null, it, order) }
}

private fun parseTempBasal(row: JSONObject, ts: Long, order: Int): WidgetInsulinEntry? {
  val durationMin = (finiteWidgetDouble(row.opt("duration")) ?: 0.0).coerceAtLeast(0.0)
  val rate = finiteWidgetDouble(row.opt("rate"))
    ?: finiteWidgetDouble(row.opt("absolute"))
    ?: if (durationMin == 0.0) 0.0 else null

  return rate
    ?.takeIf { it >= 0.0 }
    ?.let { WidgetInsulinEntry(TYPE_TEMP_BASAL, ts, ts + (durationMin * MINUTE_MS).toLong(), it, null, order) }
}

private fun closePumpSuspends(
  entries: List<WidgetInsulinEntry>,
  resumeTimes: List<Long>,
): List<WidgetInsulinEntry> {
  val sorted = entries.sortedWith(compareBy<WidgetInsulinEntry> { it.startMs }.thenBy { it.order }).toMutableList()

  for (index in sorted.indices) {
    val entry = sorted[index]
    if (entry.type != TYPE_SUSPEND_PUMP || entry.endMs != null) continue

    val nextControl = sorted
      .drop(index + 1)
      .filter { (it.type == TYPE_TEMP_BASAL || it.type == TYPE_SUSPEND_PUMP) && it.startMs > entry.startMs }
      .minOfOrNull { it.startMs }
    val nextResume = resumeTimes.filter { it > entry.startMs }.minOrNull()
    val end = listOfNotNull(nextControl, nextResume).minOrNull()

    if (end != null) {
      sorted[index] = entry.copy(endMs = end)
    }
  }

  return sorted
}

private fun parseWidgetBasalProfile(arr: JSONArray?): List<WidgetBasalProfileEntry> {
  val first = arr?.optJSONObject(0) ?: return emptyList()
  val defaultProfile = first.optString("defaultProfile", "")
  val store = first.optJSONObject("store") ?: return emptyList()
  val profile = store.optJSONObject(defaultProfile) ?: firstProfileObject(store) ?: return emptyList()
  val basal = profile.optJSONArray("basal") ?: return emptyList()
  val out = mutableListOf<WidgetBasalProfileEntry>()

  for (i in 0 until basal.length()) {
    val row = basal.optJSONObject(i) ?: continue
    val rate = finiteWidgetDouble(row.opt("value")) ?: continue
    val seconds = row.optInt("timeAsSeconds", parseProfileSeconds(row.optString("time", "00:00")))
      .coerceIn(0, 86_399)
    out.add(WidgetBasalProfileEntry(seconds, rate.coerceAtLeast(0.0)))
  }

  return out.sortedBy { it.seconds }
}

private fun addProfileBoundaries(
  boundaries: java.util.TreeSet<Long>,
  profile: List<WidgetBasalProfileEntry>,
  startMs: Long,
  endMs: Long,
) {
  if (profile.isEmpty()) return

  val cursor = Calendar.getInstance().apply {
    timeInMillis = startMs
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
  }

  while (cursor.timeInMillis < endMs) {
    for (entry in profile) {
      val boundaryMs = profileBoundaryMs(cursor, entry)
      if (boundaryMs > startMs && boundaryMs < endMs) {
        boundaries.add(boundaryMs)
      }
    }
    cursor.add(Calendar.DATE, 1)
  }
}

private fun profileBoundaryMs(day: Calendar, entry: WidgetBasalProfileEntry): Long =
  (day.clone() as Calendar).apply {
    set(Calendar.HOUR_OF_DAY, entry.seconds / 3600)
    set(Calendar.MINUTE, (entry.seconds % 3600) / 60)
    set(Calendar.SECOND, entry.seconds % 60)
    set(Calendar.MILLISECOND, 0)
  }.timeInMillis

private fun scheduledBasalRateAt(profile: List<WidgetBasalProfileEntry>, timeMs: Long): Double {
  if (profile.isEmpty()) return 0.0
  val seconds = localSecondsSinceMidnight(timeMs)
  return profile.lastOrNull { it.seconds <= seconds }?.rate ?: profile.last().rate
}

private fun firstProfileObject(store: JSONObject): JSONObject? {
  val keys = store.keys()
  while (keys.hasNext()) {
    val obj = store.optJSONObject(keys.next())
    if (obj?.optJSONArray("basal") != null) return obj
  }
  return null
}

private fun treatmentTimestampMs(row: JSONObject): Long? =
  parseWidgetTimestamp(row.opt("created_at")) ?: parseWidgetTimestamp(row.opt("timestamp"))

private fun isBolus(eventType: String): Boolean = eventType.contains("bolus", ignoreCase = true)

private fun isPumpSuspend(eventType: String): Boolean =
  eventType.equals("Suspend Pump", true) || eventType.equals("Pump Suspend", true)

private fun isPumpResume(eventType: String): Boolean =
  eventType.equals("Resume Pump", true) || eventType.equals("Pump Resume", true)

private fun parseProfileSeconds(time: String): Int {
  val parts = time.split(":")
  val hours = parts.getOrNull(0)?.toIntOrNull() ?: 0
  val minutes = parts.getOrNull(1)?.toIntOrNull() ?: 0
  return (hours * 3600 + minutes * 60).coerceIn(0, 86_399)
}

private fun finiteWidgetDouble(value: Any?): Double? {
  val parsed = when (value) {
    is Number -> value.toDouble()
    is String -> value.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull()
    else -> null
  }
  return parsed?.takeIf { it.isFinite() }
}

private fun parseWidgetTimestamp(value: Any?): Long? {
  if (value is Number) {
    return value.toLong().takeIf { it > 0L }
  }

  val raw = (value as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: return null
  for (pattern in ISO_PATTERNS) {
    val fmt = SimpleDateFormat(pattern, Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }
    runCatching { fmt.parse(raw)?.time }.getOrNull()?.let { return it }
  }
  return null
}

private fun startOfLocalDayMs(timeMs: Long): Long =
  Calendar.getInstance().apply {
    timeInMillis = timeMs
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
  }.timeInMillis

private fun localSecondsSinceMidnight(timeMs: Long): Int =
  Calendar.getInstance().run {
    timeInMillis = timeMs
    get(Calendar.HOUR_OF_DAY) * 3600 + get(Calendar.MINUTE) * 60 + get(Calendar.SECOND)
  }

private fun isoUtc(timeMs: Long): String =
  SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("UTC")
  }.format(timeMs)

private const val TYPE_BOLUS = "bolus"
private const val TYPE_TEMP_BASAL = "tempBasal"
private const val TYPE_SUSPEND_PUMP = "suspendPump"
private const val MINUTE_MS = 60_000L
private const val HOUR_MS = 3_600_000L
private const val DAY_MS = 24L * 60L * 60L * 1000L

private val ISO_PATTERNS = listOf(
  "yyyy-MM-dd'T'HH:mm:ss.SSSX",
  "yyyy-MM-dd'T'HH:mm:ssX",
  "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
  "yyyy-MM-dd'T'HH:mm:ss'Z'",
)
