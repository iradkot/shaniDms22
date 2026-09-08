package com.shanidms22.glucose

import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.roundToInt

internal data class WidgetEntryPoint(val ts: Long, val sgv: Int, val direction: String?)

internal data class WidgetLatestBg(val sgv: Int, val date: Long, val trend: String)

internal data class WidgetLoadData(
  val iob: Double?,
  val cob: Double?,
  val iobTimestampMs: Long?,
  val cobTimestampMs: Long?,
  val loopForecast: WidgetForecastSeries?,
)

internal fun fetchWidgetJsonArray(url: String, secret: String?): JSONArray? {
  val conn = (URL(url).openConnection() as HttpURLConnection).apply {
    requestMethod = "GET"
    connectTimeout = 7000
    readTimeout = 7000
    setRequestProperty("Content-Type", "application/json")
    if (!secret.isNullOrBlank()) {
      setRequestProperty("api-secret", secret)
    }
  }

  return conn.useConnection { c ->
    val code = c.responseCode
    if (code !in 200..299) return@useConnection null
    val body = c.inputStream.bufferedReader().use { it.readText() }
    JSONArray(body)
  }
}

internal fun parseValidWidgetEntries(arr: JSONArray?): List<WidgetEntryPoint> {
  if (arr == null) return emptyList()
  val out = mutableListOf<WidgetEntryPoint>()
  for (i in 0 until arr.length()) {
    val row = arr.optJSONObject(i) ?: continue
    val sgv = row.optInt("sgv", Int.MIN_VALUE)
    if (sgv == Int.MIN_VALUE || sgv <= 0) continue
    val ts = row.optLong("date", 0L)
    if (ts <= 0L) continue
    out.add(WidgetEntryPoint(ts = ts, sgv = sgv, direction = row.optString("direction", "")))
  }
  return out
}

internal fun latestWidgetBgFromEntries(arr: JSONArray?): WidgetLatestBg? {
  val latest = parseValidWidgetEntries(arr).maxByOrNull { it.ts } ?: return null
  return WidgetLatestBg(sgv = latest.sgv, date = latest.ts, trend = widgetDirectionToSymbol(latest.direction))
}

internal fun widgetEntriesToSparkline(arr: JSONArray?, hours: Int): IntArray? {
  val entries = parseValidWidgetEntries(arr)
  if (entries.size < 2) return null

  val values = entries
    .filter { it.ts >= widgetWindowStartMs(entries, hours) }
    .sortedBy { it.ts }
    .map { it.sgv }

  return if (values.size >= 2) values.toIntArray() else null
}

internal fun calculateWidgetTir(arr: JSONArray?, hours: Int, low: Int, high: Int): Int? {
  val entries = parseValidWidgetEntries(arr)
  if (entries.isEmpty()) return null

  val values = entries
    .filter { it.ts >= widgetWindowStartMs(entries, hours) }
    .map { it.sgv }
  if (values.isEmpty()) return null

  val inRange = values.count { it >= low && it <= high }
  return ((inRange.toDouble() / values.size.toDouble()) * 100.0).roundToInt()
}

internal fun fetchLatestWidgetLoad(baseUrl: String, secret: String?): WidgetLoadData? {
  val url = "${baseUrl.trimEnd('/')}/api/v1/devicestatus.json?count=12"
  val arr = fetchWidgetJsonArray(url, secret) ?: return null
  return parseWidgetLoad(arr, System.currentTimeMillis())
}

internal fun parseWidgetLoad(arr: JSONArray, nowMs: Long): WidgetLoadData {
  var iob: Pair<Long, Double>? = null
  var cob: Pair<Long, Double>? = null
  var forecast: WidgetForecastSeries? = null
  var forecastLoopTimestamp = 0L
  for (index in 0 until arr.length()) {
    val row = arr.optJSONObject(index) ?: continue
    val loop = row.optJSONObject("loop")
    val openaps = row.optJSONObject("openaps")
    fun readLoad(kind: String): Pair<Long, Double>? {
      val payload = loop?.optJSONObject(kind) ?: openaps?.optJSONObject(if (kind == "cob") "meal" else kind) ?: return null
      val ts = widgetForecastTimestamp(payload.opt("timestamp")) ?: return null
      val value = payload.optDouble(kind, Double.NaN)
      if (!widgetTimestampIsFresh(ts, nowMs) || !value.isFinite() || (kind == "cob" && value < 0)) return null
      return Pair(ts, value)
    }
    readLoad("iob")?.let { if (it.first > (iob?.first ?: 0L)) iob = it }
    readLoad("cob")?.let { if (it.first > (cob?.first ?: 0L)) cob = it }
    val loopTs = widgetForecastTimestamp(loop?.opt("timestamp")) ?: continue
    val predicted = loop?.optJSONObject("predicted") ?: continue
    val startMs = widgetForecastTimestamp(predicted.opt("startDate")) ?: continue
    if (!widgetTimestampIsFresh(loopTs, nowMs) || !widgetTimestampIsFresh(startMs, nowMs)) continue
    val values = predicted.optJSONArray("values") ?: continue
    val rawValues = (0 until minOf(values.length(), 73)).map { values.optDouble(it, Double.NaN) }
    if (rawValues.any { !it.isFinite() || it < -1000 || it > 1000 }) continue
    // A distant, nonphysical Loop tail must not discard useful near-term predictions.
    // Stop before that tail; never bridge an impossible glucose value with interpolation.
    val points = rawValues.takeWhile { it >= 10 }.mapIndexed { pointIndex, value ->
      WidgetForecastPoint(startMs + pointIndex * WIDGET_FORECAST_STEP_MS, value.roundToInt())
    }
    if (points.size < 2 || points.none { it.ts > nowMs }) continue
    if (loopTs > forecastLoopTimestamp) {
      // Loop uploads mg/dL values; values[0] belongs to startDate (not the next reading).
      forecast = WidgetForecastSeries("loop", "Loop", minOf(loopTs, startMs), points)
      forecastLoopTimestamp = loopTs
    }
  }
  return WidgetLoadData(iob?.second, cob?.second, iob?.first, cob?.first, forecast)
}

private fun widgetWindowStartMs(entries: List<WidgetEntryPoint>, hours: Int): Long {
  val latestTs = entries.maxOf { it.ts }
  val safeHours = hours.coerceIn(1, 12)
  return latestTs - safeHours.toLong() * 60L * 60L * 1000L
}

private fun widgetDirectionToSymbol(direction: String?): String = when (direction) {
  "DoubleUp" -> "⇈"
  "SingleUp" -> "↑"
  "FortyFiveUp" -> "↗"
  "Flat" -> "→"
  "FortyFiveDown" -> "↘"
  "SingleDown" -> "↓"
  "DoubleDown" -> "⇊"
  else -> "•"
}

private inline fun <T> HttpURLConnection.useConnection(block: (HttpURLConnection) -> T): T {
  try {
    return block(this)
  } finally {
    disconnect()
  }
}
