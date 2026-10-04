package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToLong

internal data class WidgetInsulinStats(
  val totalBasal: Double?,
  val totalBolus: Double?,
  val basalBolusRatio: Double?,
  val totalInsulin: Double?,
  val basalEstimated: Boolean = false,
  val quality: String = "available",
  val basalCoveragePercent: Double = 100.0,
  val basalCoveredMs: Long = 0,
  val basalEvidence: String = "recorded",
  // A profile/rate reconstruction is separate from the recorded amount and its coverage.
  val estimatedBasalUnits: Double? = null,
  val estimatedTotalUnits: Double? = null,
)

internal fun widgetInsulinStats(
  basal: Double?, bolus: Double?, basalCoveragePercent: Double = 100.0,
  basalCoveredMs: Long = 0, quality: String = "available",
): WidgetInsulinStats {
  val knownBasal = basal?.takeIf { it.isFinite() && it >= 0 }
  val knownBolus = bolus?.takeIf { it.isFinite() && it >= 0 }
  val sum = if (knownBasal != null && knownBolus != null) (knownBasal + knownBolus).takeIf { it.isFinite() } else null
  val complete = quality == "available" && sum != null && basalCoveragePercent == 100.0
  val total = if (complete) sum else null
  return WidgetInsulinStats(knownBasal, knownBolus,
    total?.let { if (it > 0) knownBasal!! / it else 0.0 }, total,
    quality = if (complete) "available" else "partial",
    basalCoveragePercent = basalCoveragePercent, basalCoveredMs = basalCoveredMs)
}

private data class RecordedBasal(val startMs: Long, val endMs: Long, val units: Double)
private data class RecordedBasalEvent(val timeMs: Long, val intervalIndex: Int, val starts: Boolean)

/**
 * Explicit recorded amounts only; no rate, schedule, or elapsed time proves basal delivery.
 * Boundary allocation prorates a completed recorded total uniformly over its recorded duration.
 */
internal fun calculateWidgetInsulinStats(
  treatments: JSONArray?, startMs: Long, endMs: Long, observedAtMs: Long = endMs,
): WidgetInsulinStats? {
  if (treatments == null || endMs <= startMs) return null
  val byIdentity = linkedMapOf<String, JSONObject>()
  for (index in 0 until treatments.length()) {
    val row = treatments.optJSONObject(index) ?: continue
    val identity = sequenceOf("syncIdentifier", "identifier", "_id").mapNotNull { (row.opt(it) as? String)?.trim() }.firstOrNull { it.isNotEmpty() } ?: "row:$index"
    val previous = byIdentity[identity]
    fun revision(item: JSONObject) = widgetParseTimestamp(item.opt("srvModified")) ?: widgetParseTimestamp(item.opt("modified_at")) ?: 0L
    if (previous == null || revision(row) >= revision(previous)) byIdentity[identity] = row
  }
  val intervals = mutableListOf<RecordedBasal>()
  val basalFingerprints = mutableSetOf<String>()
  var bolus = 0.0
  var bolusKnown = true
  for (row in byIdentity.values) {
    if (row.opt("isValid") == false || row.opt("deleted") == true) continue
    val type = row.optString("eventType", "")
    val start = widgetTreatmentTimestamp(row) ?: widgetParseTimestamp(row.opt("date"))
    val end = start?.let { recordedEndTime(row, it) }
    val mutable = row.opt("isMutable") == true || row.opt("mutable") == true
    if (type.contains("bolus", true)) {
      if (start == null) { bolusKnown = false; continue }
      val bolusType = row.optString("type", "normal")
      val requiresDuration = type.contains("combo", true) || type.contains("extended", true) || bolusType == "square" || bolusType == "dual"
      val interval = end != null && end > start
      val overlaps = start < endMs && (end == null || end < start || if (interval) end > startMs else start >= startMs)
      if (!overlaps) continue
      val amount = if (!row.isNull("deliveredUnits")) nonnegative(row.opt("deliveredUnits")) else nonnegative(row.opt("insulin"))
      if (amount == null || end == null || end < start || mutable || end > observedAtMs || bolusType == "dual" || type.contains("combo", true)) {
        bolusKnown = false; continue
      }
      if (requiresDuration && !interval) { bolusKnown = false; continue }
      if (interval) {
        bolus += amount * ((minOf(end, endMs) - maxOf(start, startMs)).toDouble() / (end - start))
      } else bolus += amount
      continue
    }
    if (!type.equals("Temp Basal", true) && !type.equals("Basal", true)) continue
    if (start == null || end == null || end <= start || mutable || end > observedAtMs || start >= endMs || end <= startMs) continue
    val loop = row.optString("enteredBy", "").startsWith("loop://", true)
    val amount = if (!row.isNull("deliveredUnits")) nonnegative(row.opt("deliveredUnits")) else if (loop) nonnegative(row.opt("amount")) else null
    if (amount == null || !amount.isFinite() || !basalFingerprints.add("$start:$end:$amount")) continue
    intervals.add(RecordedBasal(start, end, amount))
  }
  val events = intervals.flatMapIndexed { index, interval -> listOf(
    RecordedBasalEvent(maxOf(startMs, interval.startMs), index, true),
    RecordedBasalEvent(minOf(endMs, interval.endMs), index, false),
  ) }.sortedBy { it.timeMs }
  val active = linkedSetOf<Int>()
  var covered = 0L
  var basal = 0.0
  var left = startMs
  var eventIndex = 0
  // Sweep once; conflicting active records leave that segment unknown.
  while (eventIndex < events.size) {
    val right = events[eventIndex].timeMs
    if (active.size == 1 && right > left) {
      val interval = intervals[active.first()]
      covered += right - left
      basal += interval.units * ((right - left).toDouble() / (interval.endMs - interval.startMs))
    }
    // Group simultaneous starts and ends to preserve half-open interval boundaries.
    while (eventIndex < events.size && events[eventIndex].timeMs == right) {
      val event = events[eventIndex++]
      if (event.starts) active.add(event.intervalIndex) else active.remove(event.intervalIndex)
    }
    left = right
  }
  val coverage = (covered * 100.0 / (endMs - startMs)).coerceIn(0.0, 100.0)
  return widgetInsulinStats(if (covered > 0) basal else null, if (bolusKnown) bolus else null, coverage, covered,
    if (covered == endMs - startMs && bolusKnown) "available" else "partial")
}

private fun nonnegative(value: Any?): Double? = finiteDouble(value)?.takeIf { it >= 0 }

private fun recordedEndTime(row: JSONObject, startMs: Long): Long? {
  widgetParseTimestamp(row.opt("endDate"))?.let { return it }
  widgetParseTimestamp(row.opt("endTime"))?.let { return it }
  if (!row.isNull("endDate") || !row.isNull("endTime")) return null
  val duration = if (row.isNull("duration")) 0.0 else nonnegative(row.opt("duration")) ?: return null
  val durationMs = duration * MINUTE_MS
  if (!durationMs.isFinite() || durationMs > MAX_TIMESTAMP_MS - startMs) return null
  return startMs + durationMs.roundToLong()
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
  if (value is Number) {
    val numeric = value.toDouble()
    return value.toLong().takeIf { numeric.isFinite() && numeric == it.toDouble() && it in 1..MAX_TIMESTAMP_MS }
  }
  val raw = (value as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: return null
  if (raw.matches(Regex("[0-9]+"))) return raw.toLongOrNull()?.takeIf { it in 1..MAX_TIMESTAMP_MS }
  val groups = ISO_TIMESTAMP.matchEntire(raw)?.groupValues ?: return null
  val offset = groups[8]
  val zone = when {
    offset.equals("Z", true) -> "+00:00"
    offset.length == 3 -> "$offset:00"
    offset.length == 5 -> offset.take(3) + ":" + offset.takeLast(2)
    else -> offset
  }
  val normalized = "${groups[1]}-${groups[2]}-${groups[3]}T${groups[4]}:${groups[5]}:${groups[6]}.${groups[7].padEnd(3, '0').take(3)}$zone"
  val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }
  val position = ParsePosition(0)
  val parsed = runCatching { format.parse(normalized, position) }.getOrNull()
  return parsed?.time?.takeIf { position.index == normalized.length && it in 1..MAX_TIMESTAMP_MS }
}

internal fun widgetIsoUtc(timeMs: Long): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
  timeZone = TimeZone.getTimeZone("UTC")
}.format(timeMs)

private fun finiteDouble(value: Any?): Double? = when (value) {
  is Number -> value.toDouble()
  is String -> value.trim().takeIf { DECIMAL_NUMBER.matches(it) }?.toDoubleOrNull()
  else -> null
}?.takeIf { it.isFinite() }


private const val MINUTE_MS = 60_000L
private const val MAX_TIMESTAMP_MS = 8_640_000_000_000_000L
private val DECIMAL_NUMBER = Regex("[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?", RegexOption.IGNORE_CASE)
private val ISO_TIMESTAMP = Regex("^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,9}))?(Z|[+-]\\d{2}(?::?\\d{2})?)$", RegexOption.IGNORE_CASE)
