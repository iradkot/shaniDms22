package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.roundToInt

internal const val WIDGET_FORECAST_FRESH_MS = 15L * 60L * 1000L
internal const val WIDGET_FORECAST_STEP_MS = 5L * 60L * 1000L

internal data class WidgetForecastPoint(val ts: Long, val sgv: Int, val lower: Int? = null, val upper: Int? = null)
internal data class WidgetForecastSeries(
  val id: String,
  val label: String,
  val sourceTimestampMs: Long,
  val points: List<WidgetForecastPoint>,
  val coveragePercent: Double? = null,
  val sampleCount: Int = 0,
  val within20Percent: Double? = null,
)
internal data class WidgetForecastLoad(val iob: Double?, val cob: Double?, val iobTimestampMs: Long?, val cobTimestampMs: Long?)
internal data class WidgetForecastSnapshot(
  val generatedAtMs: Long,
  val glucoseTimestampMs: Long,
  val history: List<WidgetEntryPoint>,
  val series: List<WidgetForecastSeries>,
  val load: WidgetForecastLoad? = null,
)
internal data class WidgetForecastSummary(val series: WidgetForecastSeries, val point: WidgetForecastPoint)

internal fun widgetTimestampIsFresh(ts: Long, nowMs: Long): Boolean =
  ts > 0 && ts <= nowMs + 2L * 60L * 1000L && nowMs - ts < WIDGET_FORECAST_FRESH_MS

internal fun freshWidgetForecastSeries(
  snapshot: WidgetForecastSnapshot?,
  latestGlucoseMs: Long?,
  nowMs: Long,
): List<WidgetForecastSeries> {
  if (snapshot == null || latestGlucoseMs == null || !widgetTimestampIsFresh(latestGlucoseMs, nowMs)) return emptyList()
  if (!widgetTimestampIsFresh(snapshot.glucoseTimestampMs, nowMs) || !widgetTimestampIsFresh(snapshot.generatedAtMs, nowMs)) return emptyList()
  // A fresh reading can materially change a forecast. Do not retain a model from an older CGM cycle.
  if (abs(snapshot.glucoseTimestampMs - latestGlucoseMs) > 60_000L) return emptyList()
  return snapshot.series.filter { series ->
    widgetTimestampIsFresh(series.sourceTimestampMs, nowMs) && series.points.any { it.ts > nowMs }
  }
}

internal fun widgetForecastSummary(series: List<WidgetForecastSeries>, nowMs: Long): WidgetForecastSummary? {
  val targetMs = nowMs + 30L * 60L * 1000L
  for (id in listOf("ensemble", "personalized", "loop", "nightscout")) {
    val source = series.firstOrNull { it.id == id } ?: continue
    // Prefer a point at now+30m. Never extrapolate an uploaded curve beyond its last point.
    val point = interpolateWidgetForecast(source.points, targetMs)
      ?: source.points.minByOrNull { abs(it.ts - targetMs) }?.takeIf {
        it.ts > nowMs && abs(it.ts - targetMs) <= WIDGET_FORECAST_STEP_MS
      }
    if (point != null) return WidgetForecastSummary(source, point)
  }
  return null
}

internal fun interpolateWidgetForecast(points: List<WidgetForecastPoint>, ts: Long): WidgetForecastPoint? {
  points.firstOrNull { it.ts == ts }?.let { return it }
  val pair = points.zipWithNext().firstOrNull { (a, b) -> a.ts < ts && b.ts > ts } ?: return null
  val (a, b) = pair
  if (b.ts - a.ts > WIDGET_FORECAST_STEP_MS + 60_000L) return null
  val ratio = (ts - a.ts).toDouble() / (b.ts - a.ts).toDouble()
  fun lerp(x: Int?, y: Int?): Int? = if (x != null && y != null) (x + (y - x) * ratio).roundToInt() else null
  return WidgetForecastPoint(ts, lerp(a.sgv, b.sgv)!!, lerp(a.lower, b.lower), lerp(a.upper, b.upper))
}

/** Exact Nightscout AR2 recurrence in log glucose, using observed five-minute CGM inputs. */
internal fun nightscoutWidgetForecast(entries: List<WidgetEntryPoint>, nowMs: Long): WidgetForecastSeries? {
  val sorted = entries.distinctBy { it.ts }.sortedBy { it.ts }
  val current = sorted.lastOrNull() ?: return null
  val previous = sorted.dropLast(1).lastOrNull() ?: return null
  if (!widgetTimestampIsFresh(current.ts, nowMs) || current.ts > nowMs || current.sgv !in 39..400 || previous.sgv !in 39..400) return null
  if (current.ts - previous.ts !in 4L * 60L * 1000L..6L * 60L * 1000L) return null
  var prev = ln(previous.sgv / 140.0)
  var curr = ln(current.sgv / 140.0)
  val points = mutableListOf(WidgetForecastPoint(current.ts, current.sgv))
  for (step in 1..6) {
    val next = -.723 * prev + 1.716 * curr
    prev = curr
    curr = next
    points.add(WidgetForecastPoint(current.ts + step * WIDGET_FORECAST_STEP_MS, (140.0 * exp(curr)).roundToInt().coerceIn(36, 400)))
  }
  return WidgetForecastSeries("nightscout", "Nightscout AR2", current.ts, points)
}

internal fun parseWidgetForecastSnapshot(raw: String?): WidgetForecastSnapshot? = runCatching {
  if (raw.isNullOrBlank() || raw.length > 250_000) return@runCatching null
  val json = JSONObject(raw)
  if (json.optInt("version") != 1) return@runCatching null
  val glucoseTs = json.optLong("glucoseTimestampMs")
  val seriesJson = json.optJSONArray("series") ?: JSONArray()
  val series = (0 until minOf(seriesJson.length(), 4)).mapNotNull { index ->
    val item = seriesJson.optJSONObject(index) ?: return@mapNotNull null
    val id = item.optString("id")
    if (id !in listOf("loop", "nightscout", "personalized", "ensemble")) return@mapNotNull null
    val calibration = item.optJSONObject("calibration")
    val sampleCount = calibration?.optInt("sampleCount", 0) ?: 0
    val coverage = calibration?.optDouble("coveragePercent", Double.NaN)?.takeIf {
      calibration.optString("status") == "calibrated" && it.isFinite() && it > 0 && it <= 100 && sampleCount >= 30
    }
    val within20 = calibration?.optDouble("within20Percent", Double.NaN)?.takeIf {
      calibration.optString("status") == "calibrated" && it.isFinite() && it in 0.0..100.0 && sampleCount >= 30
    }
    val pointsJson = item.optJSONArray("points") ?: return@mapNotNull null
    val points = (0 until minOf(pointsJson.length(), 100)).mapNotNull pointLoop@ { pointIndex ->
      val point = pointsJson.optJSONObject(pointIndex) ?: return@pointLoop null
      val ts = point.optLong("ts")
      val sgv = point.optDouble("sgv", Double.NaN)
      if (!sgv.isFinite() || sgv < 10 || sgv > 1000 || ts < glucoseTs - WIDGET_FORECAST_FRESH_MS || ts > glucoseTs + 6L * 60L * 60L * 1000L) return@pointLoop null
      val lower = point.optDouble("lower", Double.NaN)
      val upper = point.optDouble("upper", Double.NaN)
      val hasRange = lower.isFinite() && upper.isFinite() && lower <= sgv && upper >= sgv && lower >= 0 && upper <= 1000
      WidgetForecastPoint(ts, sgv.roundToInt(), if (hasRange) lower.roundToInt() else null, if (hasRange) upper.roundToInt() else null)
    }.distinctBy { it.ts }.sortedBy { it.ts }
    if (points.size < 2) return@mapNotNull null
    WidgetForecastSeries(id, widgetForecastLabel(id), item.optLong("sourceTimestampMs"), points, coverage, sampleCount, within20)
  }.distinctBy { it.id }
  val historyJson = json.optJSONArray("history") ?: JSONArray()
  val history = (0 until minOf(historyJson.length(), 300)).mapNotNull { i ->
    val point = historyJson.optJSONObject(i) ?: return@mapNotNull null
    val ts = point.optLong("ts")
    val sgv = point.optInt("sgv")
    if (ts <= 0 || ts > glucoseTs || sgv !in 20..600) null else WidgetEntryPoint(ts, sgv, null)
  }.distinctBy { it.ts }.sortedBy { it.ts }
  val loadJson = json.optJSONObject("load")
  val load = loadJson?.let {
    WidgetForecastLoad(
      it.optDouble("iob", Double.NaN).takeIf { value -> value.isFinite() },
      it.optDouble("cob", Double.NaN).takeIf { value -> value.isFinite() && value >= 0 },
      it.optLong("iobTimestampMs", 0).takeIf { ts -> ts > 0 },
      it.optLong("cobTimestampMs", 0).takeIf { ts -> ts > 0 },
    )
  }
  WidgetForecastSnapshot(json.optLong("generatedAtMs"), glucoseTs, history, series, load)
}.getOrNull()

internal fun widgetForecastSnapshotJson(snapshot: WidgetForecastSnapshot): String = JSONObject().apply {
  put("version", 1)
  put("generatedAtMs", snapshot.generatedAtMs)
  put("glucoseTimestampMs", snapshot.glucoseTimestampMs)
  put("history", JSONArray().apply { snapshot.history.forEach { put(JSONObject().put("ts", it.ts).put("sgv", it.sgv)) } })
  put("series", JSONArray().apply {
    snapshot.series.forEach { series ->
      put(JSONObject().apply {
        put("id", series.id)
        put("sourceTimestampMs", series.sourceTimestampMs)
        put("points", JSONArray().apply { series.points.forEach { put(JSONObject().put("ts", it.ts).put("sgv", it.sgv)) } })
      })
    }
  })
}.toString()

internal fun widgetForecastLabel(id: String): String = when (id) {
  "loop" -> "Loop"
  "nightscout" -> "Nightscout AR2"
  "personalized" -> "Personal"
  "ensemble" -> "Combined"
  else -> "Forecast"
}

internal fun widgetForecastAccountMatches(activeBaseUrl: String?, snapshotBaseUrl: String?): Boolean {
  val active = activeBaseUrl.orEmpty().trim().trimEnd('/')
  return active.isNotBlank() && active == snapshotBaseUrl.orEmpty().trim().trimEnd('/')
}

internal fun widgetForecastTimestamp(value: Any?): Long? {
  if (value is Number) return value.toLong().takeIf { it > 0 }
  val raw = (value as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: return null
  for (pattern in listOf("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX")) {
    val formatter = SimpleDateFormat(pattern, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }
    runCatching { formatter.parse(raw)?.time }.getOrNull()?.let { return it }
  }
  return null
}
