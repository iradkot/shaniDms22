package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

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
)

internal fun widgetInsulinStats(
  basal: Double?, bolus: Double?, basalCoveragePercent: Double = 100.0,
  basalCoveredMs: Long = 0, quality: String = "available",
): WidgetInsulinStats {
  val knownBasal = basal?.takeIf { it.isFinite() && it >= 0 }
  val knownBolus = bolus?.takeIf { it.isFinite() && it >= 0 }
  val complete = quality == "available" && knownBasal != null && knownBolus != null && basalCoveragePercent == 100.0
  val total = if (complete) knownBasal!! + knownBolus!! else null
  return WidgetInsulinStats(knownBasal, knownBolus,
    total?.let { if (it > 0) knownBasal!! / it else 0.0 }, total,
    quality = if (complete) "available" else "partial",
    basalCoveragePercent = basalCoveragePercent, basalCoveredMs = basalCoveredMs)
}

private data class RecordedBasal(val startMs: Long, val endMs: Long, val units: Double)

/** No profiles, programmed schedule, or missing interval is converted into delivered insulin. */
internal fun calculateWidgetInsulinStats(
  treatments: JSONArray?, startMs: Long, endMs: Long, observedAtMs: Long = endMs,
): WidgetInsulinStats? {
  if (treatments == null || endMs <= startMs) return null
  val byIdentity = linkedMapOf<String, JSONObject>()
  for (index in 0 until treatments.length()) {
    val row = treatments.optJSONObject(index) ?: continue
    val identity = sequenceOf("syncIdentifier", "identifier", "_id").mapNotNull { row.opt(it) as? String }.firstOrNull { it.isNotEmpty() } ?: "row:$index"
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
    val end = start?.let {
      widgetParseTimestamp(row.opt("endDate")) ?: widgetParseTimestamp(row.opt("endTime"))
        ?: (it + ((nonnegative(row.opt("duration")) ?: 0.0) * MINUTE_MS).toLong())
    }
    val mutable = row.opt("isMutable") == true || row.opt("mutable") == true
    if (type.contains("bolus", true)) {
      if (start == null || end == null) { bolusKnown = false; continue }
      val bolusType = row.optString("type", "normal")
      val extended = type.contains("combo", true) || type.contains("extended", true) || bolusType == "square" || bolusType == "dual"
      val overlaps = start < endMs && if (extended && end > start) end > startMs else start >= startMs
      if (!overlaps) continue
      val amount = if (!row.isNull("deliveredUnits")) nonnegative(row.opt("deliveredUnits")) else nonnegative(row.opt("insulin"))
      if (amount == null || mutable || end > observedAtMs || bolusType == "dual" || type.contains("combo", true)) {
        bolusKnown = false; continue
      }
      if (extended) {
        if (end <= start) { bolusKnown = false; continue }
        bolus += amount * (minOf(end, endMs) - maxOf(start, startMs)) / (end - start)
      } else bolus += amount
      continue
    }
    if (!type.equals("Temp Basal", true) && !type.equals("Basal", true)) continue
    if (start == null || end == null || end <= start || mutable || end > observedAtMs || start >= endMs || end <= startMs) continue
    val loop = row.optString("enteredBy", "").startsWith("loop://", true)
    val hasExplicitAmount = !row.isNull("deliveredUnits") || (loop && !row.isNull("amount"))
    val explicit = if (!row.isNull("deliveredUnits")) nonnegative(row.opt("deliveredUnits")) else if (loop) nonnegative(row.opt("amount")) else null
    val absolute = nonnegative(row.opt("absolute")) ?: nonnegative(row.opt("rate"))
    val isAbsolute = !row.has("temp") || row.optString("temp", "") == "absolute"
    // A malformed recorded amount is unknown; it cannot authorize a programmed-rate fallback.
    val amount = if (hasExplicitAmount) explicit else if (loop && isAbsolute && absolute != null) absolute * (end - start) / HOUR_MS else null
    if (amount == null || !amount.isFinite() || !basalFingerprints.add("$start:$end:$amount")) continue
    intervals.add(RecordedBasal(start, end, amount))
  }
  val boundaries = sortedSetOf(startMs, endMs)
  intervals.forEach { boundaries.add(maxOf(startMs, it.startMs)); boundaries.add(minOf(endMs, it.endMs)) }
  var covered = 0L
  var basal = 0.0
  for ((left, right) in boundaries.zipWithNext()) {
    val active = intervals.filter { it.startMs <= left && it.endMs >= right }
    // Distinct overlapping records do not establish which delivery occurred in that segment.
    if (active.size != 1) continue
    val interval = active.single()
    covered += right - left
    basal += interval.units * (right - left) / (interval.endMs - interval.startMs)
  }
  val coverage = (covered * 100.0 / (endMs - startMs)).coerceIn(0.0, 100.0)
  return widgetInsulinStats(if (covered > 0) basal else null, if (bolusKnown) bolus else null, coverage, covered,
    if (covered == endMs - startMs && bolusKnown) "available" else "partial")
}

private fun nonnegative(value: Any?): Double? = finiteDouble(value)?.takeIf { it >= 0 }

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


private const val MINUTE_MS = 60_000L
private const val HOUR_MS = 3_600_000.0
