package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone
import kotlin.math.floor
import kotlin.math.roundToLong

private data class BasalSchedule(val zone: TimeZone, val rates: List<Pair<Int, Double>>)
private data class EffectiveBasalSchedule(val start: Long, val schedule: BasalSchedule)
private data class BasalControl(
  val start: Long, val end: Long?, val restore: Boolean = false,
  val programmedRate: Double? = null,
  val percentDelta: Double? = null,
)
private data class ActualBasal(val start: Long, val end: Long, val rate: Double)

/** Completed delivered amounts win; the schedule fills only uncovered time. */
internal fun withWidgetBasalEstimate(
  recorded: WidgetInsulinStats?, treatments: JSONArray?, profile: JSONObject?,
  startMs: Long, endMs: Long, observedAtMs: Long, zone: TimeZone,
  treatmentObservedAtMs: (JSONObject) -> Long = { observedAtMs },
): WidgetInsulinStats? {
  if (recorded == null) return null
  val basal = estimateWidgetBasal(treatments, profile, startMs, endMs, observedAtMs, zone, treatmentObservedAtMs)
  val total = if (basal != null && recorded.totalBolus != null) (basal + recorded.totalBolus).takeIf { it.isFinite() } else null
  return recorded.copy(estimatedBasalUnits = basal, estimatedTotalUnits = total)
}

internal fun validWidgetBasalProfile(profile: JSONObject?, asOfMs: Long, zone: TimeZone): Boolean =
  parseBasalSchedules(profile, asOfMs, asOfMs, zone) != null

private fun parseBasalSchedules(
  profile: JSONObject?, startMs: Long, endMs: Long, zone: TimeZone,
): List<EffectiveBasalSchedule>? {
  if (profile == null) return null
  val history = profile.optJSONArray("basalProfileHistory") ?: return parseBasalSchedule(profile, startMs, zone)
    ?.let { listOf(EffectiveBasalSchedule(startMs, it)) }
  if (history.length() == 0) return null
  val verifiedThrough = widgetParseTimestamp(profile.opt("basalProfileHistoryThroughMs")) ?: return null
  if (endMs - 1 > verifiedThrough) return null
  val schedules = mutableMapOf<Long, BasalSchedule>()
  for (index in 0 until history.length()) {
    val row = history.optJSONObject(index) ?: return null
    val effective = widgetParseTimestamp(row.opt("startDate")) ?: return null
    if (effective > verifiedThrough) return null
    val schedule = parseBasalSchedule(row, effective, zone) ?: return null
    val previous = schedules[effective]
    if (previous != null && previous != schedule) return null
    schedules[effective] = schedule
  }
  val sorted = schedules.toSortedMap().map { EffectiveBasalSchedule(it.key, it.value) }
  val carryIn = sorted.indexOfLast { it.start <= startMs }
  if (carryIn < 0) return null
  // Historical caches cover a full date, while comparisons use a moving matched cutoff.
  return sorted.drop(carryIn).filter { it.start <= endMs }
}

private fun parseBasalSchedule(profile: JSONObject?, asOfMs: Long, fallbackZone: TimeZone): BasalSchedule? {
  if (profile == null) return null
  val effective = widgetParseTimestamp(profile.opt("startDate")) ?: return null
  if (effective > asOfMs) return null
  val name = profile.optString("defaultProfile", "").takeIf { it.isNotBlank() } ?: return null
  val selected = profile.optJSONObject("store")?.optJSONObject(name) ?: return null
  val rawZone = selected.optString("timezone", profile.optString("timezone", "")).trim().replace("ETC/", "Etc/")
  val zone = when {
    rawZone.isEmpty() -> fallbackZone
    TimeZone.getAvailableIDs().contains(rawZone) -> TimeZone.getTimeZone(rawZone)
    Regex("(?:GMT|UTC)[+-](?:[01]?\\d|2[0-3])(?::[0-5]\\d)?", RegexOption.IGNORE_CASE).matches(rawZone) -> TimeZone.getTimeZone(rawZone.uppercase().replace("UTC", "GMT"))
    Regex("[+-](?:[01]\\d|2[0-3]):[0-5]\\d").matches(rawZone) -> TimeZone.getTimeZone("GMT$rawZone")
    else -> return null
  }
  val rows = selected.optJSONArray("basal") ?: return null
  if (rows.length() == 0) return null
  val rates = mutableListOf<Pair<Int, Double>>()
  for (index in 0 until rows.length()) {
    val row = rows.optJSONObject(index) ?: return null
    val rate = numeric(row.opt("value"))?.takeIf { it >= 0 } ?: return null
    fun textualSeconds(): Int? {
      val parts = Regex("^(\\d{2}):(\\d{2})(?::(\\d{2}))?$").matchEntire(row.optString("time", ""))?.groupValues ?: return null
      val hours = parts[1].toInt(); val minutes = parts[2].toInt(); val seconds = parts[3].ifEmpty { "0" }.toInt()
      if (hours !in 0..23 || minutes !in 0..59 || seconds !in 0..59) return null
      return hours * 3600 + minutes * 60 + seconds
    }
    val textual = if (!row.isNull("time")) textualSeconds() ?: return null else null
    val seconds = if (!row.isNull("timeAsSeconds")) {
      val numericSeconds = numeric(row.opt("timeAsSeconds"))?.takeIf { it == floor(it) }?.toInt() ?: return null
      if (textual != null && textual != numericSeconds) return null
      numericSeconds
    } else textual ?: return null
    if (seconds !in 0..86_399) return null
    rates.add(seconds to rate)
  }
  val sorted = rates.sortedBy { it.first }
  if (sorted.first().first != 0 || sorted.map { it.first }.distinct().size != sorted.size) return null
  return BasalSchedule(zone, sorted)
}

private fun estimateWidgetBasal(
  treatments: JSONArray?, profile: JSONObject?, startMs: Long, endMs: Long,
  observedAtMs: Long, zone: TimeZone,
  treatmentObservedAtMs: (JSONObject) -> Long,
): Double? {
  if (treatments == null || endMs <= startMs || endMs > observedAtMs) return null
  val schedule = parseBasalSchedules(profile, startMs, endMs, zone) ?: return null
  val byIdentity = linkedMapOf<String, JSONObject>()
  for (index in 0 until treatments.length()) {
    val row = treatments.optJSONObject(index) ?: return null
    val identity = sequenceOf("syncIdentifier", "identifier", "_id").mapNotNull { (row.opt(it) as? String)?.trim() }
      .firstOrNull { it.isNotEmpty() } ?: "row:$index"
    val previous = byIdentity[identity]
    fun revision(item: JSONObject) = widgetParseTimestamp(item.opt("srvModified")) ?: widgetParseTimestamp(item.opt("modified_at")) ?: 0L
    if (previous == null || revision(row) >= revision(previous)) byIdentity[identity] = row
  }
  val controls = mutableListOf<BasalControl>()
  val recordedIntervals = linkedSetOf<ActualBasal>()
  val fingerprints = mutableSetOf<String>()
  for (row in byIdentity.values) {
    if (row.opt("isValid") == false || row.opt("deleted") == true) continue
    val type = row.optString("eventType", "")
    if (Regex("^Profile\\s*(Switch|Change)$", RegexOption.IGNORE_CASE).matches(type)) {
      val changedAt = widgetTreatmentTimestamp(row) ?: widgetParseTimestamp(row.opt("date")) ?: return null
      if (changedAt >= endMs) continue
      val explicitLifetime = !row.isNull("endDate") || !row.isNull("endTime") || !row.isNull("duration")
      val switchEnd = if (explicitLifetime) basalControlEnd(row, changedAt) ?: return null else changedAt
      // defaultProfile does not prove which profile/percentage an active switch selected.
      if (switchEnd <= changedAt || switchEnd > startMs) return null
      continue
    }
    val isBasal = type.equals("Temp Basal", true) || type.equals("Basal", true)
    val suspended = Regex("^(Suspend\\s*Pump|Pump\\s*Suspend)$", RegexOption.IGNORE_CASE).matches(type)
    val resumed = Regex("^(Resume\\s*Pump|Pump\\s*Resume)$", RegexOption.IGNORE_CASE).matches(type)
    val unknownBasalControl = !isBasal && !suspended && !resumed &&
      Regex("basal|suspend.*pump|pump.*suspend|resume.*pump|pump.*resume", RegexOption.IGNORE_CASE).containsMatchIn(type)
    if (!isBasal && !suspended && !resumed && !unknownBasalControl) continue
    val start = widgetTreatmentTimestamp(row) ?: widgetParseTimestamp(row.opt("date")) ?: return null
    if (start >= endMs) continue
    if (unknownBasalControl) { controls.add(BasalControl(start, null)); continue }
    if (resumed) { controls.add(BasalControl(start, start, restore = true)); continue }
    val end = basalControlEnd(row, start)
    if (suspended) {
      val explicitLifetime = !row.isNull("endDate") || !row.isNull("endTime") || !row.isNull("duration")
      if (explicitLifetime && (end == null || end < start)) return null
      controls.add(BasalControl(start, end?.takeIf { it > start }, programmedRate = 0.0)); continue
    }
    if (end == null || end < start) { controls.add(BasalControl(start, null)); continue }
    if (end == start) { controls.add(BasalControl(start, start, restore = true)); continue }
    val completed = row.opt("isMutable") != true && row.opt("mutable") != true &&
      end <= minOf(observedAtMs, treatmentObservedAtMs(row))
    val loop = row.optString("enteredBy", "").startsWith("loop://", true)
    val hasRecorded = !row.isNull("deliveredUnits") || (loop && !row.isNull("amount"))
    val recordedAmount = if (!row.isNull("deliveredUnits")) numeric(row.opt("deliveredUnits")) else if (loop) numeric(row.opt("amount")) else null
    val recordedRate = if (completed && hasRecorded) recordedAmount?.takeIf { it >= 0 }?.let { it / (end - start) * HOUR_MS }?.takeIf { it.isFinite() } else null
    // An invalid explicit completed amount must not silently become its programmed rate.
    val invalidRecorded = completed && hasRecorded && recordedRate == null
    // Completed amount evidence is independent of commands which may have superseded it.
    if (invalidRecorded && start < endMs && end > startMs) return null
    if (recordedRate != null && start < endMs && end > startMs)
      recordedIntervals.add(ActualBasal(start, end, recordedRate))
    val absolute = if (!row.isNull("absolute")) numeric(row.opt("absolute"))?.takeIf { it >= 0 } else null
    val invalidAbsolute = !row.isNull("absolute") && absolute == null
    val mode = (row.opt("temp") as? String)?.trim()?.lowercase()
    val hasPercent = !row.isNull("percent") || mode == "percentage"
    val percent = if (hasPercent) numeric(row.opt("percent"))?.takeIf { it >= -100 } else null
    val rate = if (!hasPercent && !row.isNull("rate") && (row.isNull("temp") || mode == "absolute"))
      numeric(row.opt("rate"))?.takeIf { it >= 0 } else null
    val control = BasalControl(start, end,
      programmedRate = if (recordedRate != null || invalidRecorded || invalidAbsolute) null else absolute ?: rate,
      percentDelta = if (recordedRate != null || invalidRecorded || invalidAbsolute || absolute != null) null else percent)
    if (fingerprints.add(control.toString())) controls.add(control)
  }
  val actuals = recordedIntervals.sortedBy { it.start }
  if (actuals.zipWithNext().any { (a, b) -> a.end > b.start }) return null
  val sorted = mutableListOf<BasalControl>()
  for (control in controls.sortedBy { it.start }) {
    val previous = sorted.lastOrNull()
    if (previous == null || previous.start != control.start) sorted.add(control)
    else if (previous != control) {
      // Conflicting commands identify no unique programmed rate. Completed actual
      // delivery can still resolve that time; uncovered portions remain unknown.
      val until = maxOf(previous.end ?: Long.MAX_VALUE, control.end ?: Long.MAX_VALUE)
      sorted[sorted.lastIndex] = BasalControl(control.start, until.takeUnless { it == Long.MAX_VALUE })
    }
  }
  var cursor = startMs
  var total = 0.0
  var index = 0
  var actualIndex = 0
  var active: BasalControl? = null
  while (cursor < endMs) {
    while (index < sorted.size && sorted[index].start <= cursor) active = sorted[index++]
    while (actualIndex < actuals.size && actuals[actualIndex].end <= cursor) actualIndex++
    val nextActual = actuals.getOrNull(actualIndex)
    val actual = nextActual?.takeIf { it.start <= cursor && cursor < it.end }
    val command = active?.takeIf { !it.restore && (it.end == null || cursor < it.end) }
    val until = minOf(endMs, sorted.getOrNull(index)?.start ?: endMs, command?.end ?: endMs,
      actual?.end ?: nextActual?.start ?: endMs)
    val value = when {
      actual != null -> actual.rate * (until - cursor) / HOUR_MS
      command?.programmedRate != null -> command.programmedRate * (until - cursor) / HOUR_MS
      command?.percentDelta != null -> integrateSchedule(schedule, cursor, until)?.let { it * (100 + command.percentDelta) / 100 }
      command != null -> null
      else -> integrateSchedule(schedule, cursor, until)
    } ?: return null
    total += value
    if (!total.isFinite() || until <= cursor) return null
    cursor = until
  }
  return total.takeIf { it >= 0 }
}

/** Wall-clock schedule with actual elapsed durations, including repeated/skipped DST hours. */
private fun integrateSchedule(schedules: List<EffectiveBasalSchedule>, start: Long, end: Long): Double? {
  var cursor = start
  var total = 0.0
  while (cursor < end) {
    val index = schedules.indexOfLast { it.start <= cursor }
    if (index < 0) return null
    val until = minOf(end, schedules.getOrNull(index + 1)?.start ?: end)
    val value = integrateSingleSchedule(schedules[index].schedule, cursor, until) ?: return null
    total += value
    cursor = until
  }
  return total.takeIf { it.isFinite() }
}

private fun integrateSingleSchedule(schedule: BasalSchedule, start: Long, end: Long): Double? {
  var cursor = start
  var total = 0.0
  val clock = Calendar.getInstance(schedule.zone)
  while (cursor < end) {
    clock.timeInMillis = cursor
    val second = clock.get(Calendar.HOUR_OF_DAY) * 3600 + clock.get(Calendar.MINUTE) * 60 + clock.get(Calendar.SECOND)
    val rate = schedule.rates.last { it.first <= second }.second
    // Check every elapsed minute so a timezone offset change is observed at its real boundary.
    var until = minOf(end, (cursor / MINUTE_MS + 1) * MINUTE_MS)
    schedule.rates.firstOrNull { it.first > second && it.first / 60 == second / 60 }?.let {
      until = minOf(until, cursor + (it.first - second) * 1000L - clock.get(Calendar.MILLISECOND))
    }
    total += rate * (until - cursor) / HOUR_MS
    cursor = until
  }
  return total.takeIf { it.isFinite() }
}

private fun basalControlEnd(row: JSONObject, start: Long): Long? {
  widgetParseTimestamp(row.opt("endDate"))?.let { return it }
  widgetParseTimestamp(row.opt("endTime"))?.let { return it }
  if (!row.isNull("endDate") || !row.isNull("endTime")) return null
  if (row.isNull("duration")) return null
  val duration = numeric(row.opt("duration"))?.takeIf { it >= 0 } ?: return null
  val end = start.toDouble() + duration * MINUTE_MS
  return end.takeIf { it.isFinite() && it <= 8_640_000_000_000_000.0 }?.roundToLong()
}

private fun numeric(value: Any?): Double? = when (value) {
  is Number -> value.toDouble()
  is String -> value.trim().takeIf { Regex("[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?", RegexOption.IGNORE_CASE).matches(it) }?.toDoubleOrNull()
  else -> null
}?.takeIf { it.isFinite() }

private const val MINUTE_MS = 60_000L
private const val HOUR_MS = 3_600_000.0
