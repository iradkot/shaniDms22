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
  val projected1: Int?,
  val projected2: Int?,
  val projected3: Int?,
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
  val url = "${baseUrl.trimEnd('/')}/api/v1/devicestatus.json?count=1"
  val arr = fetchWidgetJsonArray(url, secret) ?: return null
  val row = arr.optJSONObject(0) ?: return null

  val loop = row.optJSONObject("loop")
  val openaps = row.optJSONObject("openaps")
  val iob = loop?.optJSONObject("iob")?.optDouble("iob", Double.NaN)?.takeIf { it.isFinite() }
    ?: openaps?.optJSONObject("iob")?.optDouble("iob", Double.NaN)?.takeIf { it.isFinite() }
  val cob = loop?.optJSONObject("cob")?.optDouble("cob", Double.NaN)?.takeIf { it.isFinite() }
    ?: openaps?.optJSONObject("meal")?.optDouble("cob", Double.NaN)?.takeIf { it.isFinite() }
  val predictedValues = loop?.optJSONObject("predicted")?.optJSONArray("values")

  fun projectedAt(idx: Int): Int? {
    if (predictedValues == null || predictedValues.length() <= idx) return null
    val v = predictedValues.optDouble(idx, Double.NaN)
    return if (v.isFinite()) v.toInt() else null
  }

  return WidgetLoadData(
    iob = iob,
    cob = cob,
    projected1 = projectedAt(0),
    projected2 = projectedAt(1),
    projected3 = projectedAt(2),
  )
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
