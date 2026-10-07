package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.Calendar
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

internal data class WidgetDailySummary(
  val dayStartMs: Long,
  val updatedAtMs: Long,
  val low: Int,
  val high: Int,
  val range: WidgetDailyRange?,
  val insulin: WidgetInsulinComparison?,
)

internal data class WidgetDailyRange(
  val lowPercent: Int,
  val inRangePercent: Int,
  val highPercent: Int,
  val coveragePercent: Int,
  val observedMinutes: Int,
)

internal data class WidgetInsulinComparison(
  val today: WidgetInsulinStats?,
  val yesterday: WidgetInsulinStats?,
  val weekAverage: WidgetInsulinStats?,
  val weekDays: Int,
)

internal data class WidgetDayWindow(val startMs: Long, val endMs: Long)

internal fun widgetStartOfDayMs(timeMs: Long, zone: TimeZone = TimeZone.getDefault()): Long =
  Calendar.getInstance(zone).apply {
    timeInMillis = timeMs
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
  }.timeInMillis

/** Local calendar dates and wall-clock cutoffs, including 23/25-hour DST days. */
internal fun widgetComparisonWindows(nowMs: Long, zone: TimeZone = TimeZone.getDefault()): List<WidgetDayWindow> =
  (0..7).map { daysAgo ->
    val end = Calendar.getInstance(zone).apply {
      timeInMillis = nowMs
      add(Calendar.DATE, -daysAgo)
    }.timeInMillis
    WidgetDayWindow(widgetStartOfDayMs(end, zone), end)
  }

/** Weight each sample by up to five observed minutes; a CGM gap is never filled. */
internal fun calculateWidgetDailyRange(
  entries: List<WidgetEntryPoint>,
  startMs: Long,
  endMs: Long,
  low: Int,
  high: Int,
): WidgetDailyRange? {
  if (endMs <= startMs || low <= 0 || high <= low) return null
  val sorted = entries.filter { it.ts <= endMs && it.ts + CGM_SAMPLE_MS > startMs && it.sgv in 20..600 }
    .distinctBy { it.ts }.sortedBy { it.ts }
  val durations = LongArray(3)
  sorted.forEachIndexed { index, point ->
    val until = minOf(endMs, point.ts + CGM_SAMPLE_MS, sorted.getOrNull(index + 1)?.ts ?: endMs)
    val duration = (until - maxOf(startMs, point.ts)).coerceAtLeast(0)
    val bucket = if (point.sgv < low) 0 else if (point.sgv <= high) 1 else 2
    durations[bucket] += duration
  }
  val observed = durations.sum()
  if (observed <= 0L) return null
  val exact = durations.map { it * 100.0 / observed }
  val percentages = exact.map { floor(it).toInt() }.toMutableList()
  exact.indices.sortedByDescending { exact[it] - percentages[it] }
    .take(100 - percentages.sum()).forEach { percentages[it]++ }
  return WidgetDailyRange(percentages[0], percentages[1], percentages[2],
    (observed * 100.0 / (endMs - startMs)).roundToInt().coerceIn(0, 100),
    (observed / 60_000L).toInt())
}

internal fun calculateWidgetInsulinComparison(
  treatments: JSONArray?, nowMs: Long, zone: TimeZone = TimeZone.getDefault(),
  includeHistory: Boolean = true,
  profilesByDayStart: Map<Long, JSONObject?> = emptyMap(),
  treatmentObservedAtMs: (JSONObject) -> Long = { nowMs },
): WidgetInsulinComparison? {
  val windows = widgetComparisonWindows(nowMs, zone)
  fun stats(window: WidgetDayWindow) = withWidgetBasalEstimate(
    calculateWidgetInsulinStats(treatments, window.startMs, window.endMs, nowMs, treatmentObservedAtMs), treatments,
    profilesByDayStart[window.startMs], window.startMs, window.endMs, nowMs, zone, treatmentObservedAtMs,
  )
  val today = stats(windows[0])
  val previous = if (includeHistory) windows.drop(1).map {
    stats(it)
  } else emptyList()
  val valid = previous.filterNotNull().filter { it.totalBasal != null || it.totalBolus != null }
  // A weekly comparison represents all seven prior dates; never silently average a biased subset.
  val average = if (valid.size == 7) {
    // Recorded subtotals remain recorded subtotals; averaging never promotes their coverage.
    val basal = valid.mapNotNull { it.totalBasal }.completeWeekMean()
    val bolus = valid.mapNotNull { it.totalBolus }.completeWeekMean()
    // A fully recorded date needs no profile. Combine its actual amount with modeled dates,
    // but retain the estimated label if any of the seven dates needs reconstruction.
    val someEstimated = valid.any { it.totalInsulin == null }
    val estimatedBasal = if (someEstimated) valid.mapNotNull { stats ->
      if (stats.totalInsulin != null) stats.totalBasal else {
        val estimate = stats.estimatedBasalUnits
        val total = stats.estimatedTotalUnits
        val recordedBolus = stats.totalBolus
        estimate?.takeIf {
          it.isFinite() && it >= 0 && total != null && total.isFinite() && total >= 0 &&
            recordedBolus != null && abs(total - it - recordedBolus) <= maxOf(0.000001, total * 1e-9)
        }
      }
    }.completeWeekMean() else null
    val estimatedTotal = if (estimatedBasal != null && bolus != null)
      (estimatedBasal + bolus).takeIf { it.isFinite() } else null
    if (basal == null && bolus == null && estimatedBasal == null) null else widgetInsulinStats(basal, bolus,
      valid.map { it.basalCoveragePercent }.average(), valid.map { it.basalCoveredMs }.average().toLong(),
      if (valid.all { it.quality == "available" }) "available" else "partial")
      .copy(estimatedBasalUnits = estimatedBasal, estimatedTotalUnits = estimatedTotal)
  } else null
  if (today == null && previous.firstOrNull() == null && average == null) return null
  return WidgetInsulinComparison(today, previous.firstOrNull(), average, valid.size)
}

private fun List<Double>.completeWeekMean(): Double? =
  if (size != 7) null else foldIndexed(0.0) { index, mean, value -> mean + (value - mean) / (index + 1) }

/**
 * Nightscout v1 applies count but does not implement skip, including for treatments.
 * Expand the count for the same bounded range until an unsaturated response proves completeness.
 * Keep the existing request/record cap; never cache a saturated prefix as the complete day.
 */
internal fun fetchCompleteWidgetPages(
  url: String,
  secret: String?,
  pageSize: Int = 500,
  maxPages: Int = 12,
  fetch: (String, String?) -> JSONArray? = ::fetchWidgetJsonArray,
): JSONArray? {
  if (pageSize <= 0 || maxPages <= 0) return null
  val maxCount = (pageSize.toLong() * maxPages).coerceAtMost(100_000L).toInt()
  var count = minOf(pageSize, maxCount)
  while (true) {
    val rows = runCatching { fetch("$url&count=$count", secret) }.getOrNull() ?: return null
    if (rows.length() > count) return null
    if (rows.length() < count) {
      val complete = JSONArray()
      val seenIds = mutableSetOf<String>()
      for (index in 0 until rows.length()) {
        val row = rows.optJSONObject(index) ?: return null
        val id = row.optString("_id", "")
        if (id.isEmpty() || seenIds.add(id)) complete.put(row)
      }
      return complete
    }
    if (count >= maxCount) return null
    count = minOf(count * 2, maxCount)
  }
}

internal fun widgetRangeQuery(baseUrl: String, endpoint: String, field: String, start: String, end: String): String {
  fun encode(value: String) = URLEncoder.encode(value, "UTF-8")
  // The server's default sort is sufficient: callers sort their complete range locally.
  // Older Nightscout/MongoDB combinations pass HTTP sort values as strings and reject them.
  return "${baseUrl.trimEnd('/')}/api/v1/$endpoint?${encode("find[$field][\$gte]")}=${encode(start)}&${encode("find[$field][\$lte]")}=${encode(end)}"
}

internal fun widgetDailySummaryJson(summary: WidgetDailySummary): String = JSONObject().apply {
  put("dayStartMs", summary.dayStartMs); put("updatedAtMs", summary.updatedAtMs)
  put("low", summary.low); put("high", summary.high)
  summary.range?.let { range -> put("range", JSONObject().apply {
    put("lowPercent", range.lowPercent); put("inRangePercent", range.inRangePercent)
    put("highPercent", range.highPercent); put("coveragePercent", range.coveragePercent)
    put("observedMinutes", range.observedMinutes)
  }) }
  summary.insulin?.let { comparison -> put("insulin", JSONObject().apply {
    put("schemaVersion", 3)
    comparison.today?.let { put("today", insulinJson(it)) }
    comparison.yesterday?.let { put("yesterday", insulinJson(it)) }
    comparison.weekAverage?.let { put("weekAverage", insulinJson(it)) }
    put("weekDays", comparison.weekDays)
  }) }
}.toString()

internal fun parseWidgetDailySummary(raw: String?, nowMs: Long, zone: TimeZone = TimeZone.getDefault()): WidgetDailySummary? = runCatching {
  val root = JSONObject(raw ?: return null)
  val start = root.getLong("dayStartMs")
  val updated = root.getLong("updatedAtMs")
  if (start != widgetStartOfDayMs(nowMs, zone) || updated < start || updated > nowMs + 60_000 || nowMs - updated >= 60 * 60_000) return null
  val low = root.getInt("low"); val high = root.getInt("high")
  if (low <= 0 || high <= low) return null
  val range = root.optJSONObject("range")?.let {
    val values = listOf(it.getInt("lowPercent"), it.getInt("inRangePercent"), it.getInt("highPercent"))
    val coverage = it.getInt("coveragePercent"); val observed = it.getInt("observedMinutes")
    if (values.any { value -> value !in 0..100 } || values.sum() != 100 || coverage !in 0..100 || observed < 0) return null
    if (observed * 60_000L > updated - start + 60_000L) return null
    WidgetDailyRange(values[0], values[1], values[2], coverage, observed)
  }
  // Version 1 could contain rate-derived basal labeled recorded. Keep TIR, discard those doses.
  val insulin = root.optJSONObject("insulin")?.takeIf { it.optInt("schemaVersion", 0) in 2..3 }?.let {
    val current = it.optInt("schemaVersion", 0) == 3
    // Schema 2's week dropped recorded partial basal. Keep today's facts, rebuild comparisons.
    WidgetInsulinComparison(parseInsulinJson(it.optJSONObject("today"), current),
      if (current) parseInsulinJson(it.optJSONObject("yesterday"), true) else null,
      if (current) parseInsulinJson(it.optJSONObject("weekAverage"), true) else null,
      if (current) it.optInt("weekDays", 0).coerceIn(0, 7) else 0)
  }
  WidgetDailySummary(start, updated, low, high, range, insulin)
}.getOrNull()

private fun insulinJson(stats: WidgetInsulinStats) = JSONObject().apply {
  put("basal", stats.totalBasal); put("bolus", stats.totalBolus)
  put("quality", stats.quality); put("basalCoveragePercent", stats.basalCoveragePercent)
  put("basalCoveredMs", stats.basalCoveredMs); put("basalEvidence", stats.basalEvidence)
  put("estimatedBasalUnits", stats.estimatedBasalUnits); put("estimatedTotalUnits", stats.estimatedTotalUnits)
}

private fun parseInsulinJson(row: JSONObject?, allowEstimate: Boolean): WidgetInsulinStats? {
  if (row == null) return null
  // Legacy rows contained scheduled estimates. Never relabel those as recorded delivery.
  if (row.optString("basalEvidence", "") != "recorded" || row.optBoolean("estimated", false)) return null
  val quality = row.optString("quality", "")
  if (quality != "available" && quality != "partial") return null
  fun component(key: String): Double? = row.optDouble(key, Double.NaN).takeIf { it.isFinite() && it >= 0 }
  val basal = component("basal"); val bolus = component("bolus")
  val coverage = row.optDouble("basalCoveragePercent", Double.NaN)
  val covered = row.optLong("basalCoveredMs", -1)
  if (!coverage.isFinite() || coverage !in 0.0..100.0 || covered < 0) return null
  if (basal != null && covered == 0L) return null
  if (quality == "available" && (basal == null || bolus == null || coverage != 100.0 || covered <= 0L)) return null
  val recorded = widgetInsulinStats(basal, bolus, coverage, covered, quality)
  if (!allowEstimate) return recorded
  val estimatedBasal = component("estimatedBasalUnits")
  val estimatedTotal = component("estimatedTotalUnits")
  if (estimatedTotal != null && (estimatedBasal == null || bolus == null || kotlin.math.abs(estimatedTotal - estimatedBasal - bolus) > 0.000001)) return null
  return recorded.copy(estimatedBasalUnits = estimatedBasal, estimatedTotalUnits = estimatedTotal)
}

private const val CGM_SAMPLE_MS = 5 * 60_000L
