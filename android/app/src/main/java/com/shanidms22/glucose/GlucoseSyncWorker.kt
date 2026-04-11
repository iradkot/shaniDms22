package com.shanidms22.glucose

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

class GlucoseSyncWorker(
  appContext: Context,
  params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

  override suspend fun doWork(): Result {
    val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val baseUrl = prefs.getString(KEY_BASE_URL, null)?.trim().orEmpty()
    if (baseUrl.isBlank()) return Result.success()

    return try {
      val secret = prefs.getString(KEY_API_SECRET_SHA1, null)
      val entries = fetchRecentEntries(baseUrl, secret)
      val latest = latestFromEntries(entries)

      if (latest != null) {
        val load = fetchLatestLoad(baseUrl, secret)
        GlucoseWidgetUpdater.save(
          applicationContext,
          latest.sgv,
          latest.trend,
          latest.date,
          load?.iob,
          load?.cob,
          load?.projected1,
          load?.projected2,
          load?.projected3,
          null,
          null,
          entriesToSparkline(entries),
        )
        GlucoseWidgetUpdater.updateWidgets(applicationContext)
        GlucoseWidgetUpdater.updateNotification(applicationContext)
      }

      Result.success()
    } catch (_: Exception) {
      Result.retry()
    }
  }

  private fun fetchRecentEntries(baseUrl: String, secret: String?): JSONArray? {
    val url = "${baseUrl.trimEnd('/')}/api/v1/entries.json?count=36"
    return getJsonArray(url, secret)
  }

  private data class EntryPoint(val ts: Long, val sgv: Int, val direction: String?)

  private fun parseValidEntries(arr: JSONArray?): List<EntryPoint> {
    if (arr == null) return emptyList()
    val out = mutableListOf<EntryPoint>()
    for (i in 0 until arr.length()) {
      val row = arr.optJSONObject(i) ?: continue
      val sgv = row.optInt("sgv", Int.MIN_VALUE)
      if (sgv == Int.MIN_VALUE || sgv <= 0) continue
      val ts = row.optLong("date", 0L)
      if (ts <= 0L) continue
      out.add(EntryPoint(ts = ts, sgv = sgv, direction = row.optString("direction", "")))
    }
    return out
  }

  private fun latestFromEntries(arr: JSONArray?): LatestBg? {
    val entries = parseValidEntries(arr)
    val latest = entries.maxByOrNull { it.ts } ?: return null
    return LatestBg(sgv = latest.sgv, date = latest.ts, trend = directionToSymbol(latest.direction))
  }

  private fun entriesToSparkline(arr: JSONArray?): IntArray? {
    val entries = parseValidEntries(arr)
    if (entries.size < 2) return null

    val latestTs = entries.maxOf { it.ts }
    val fromTs = latestTs - 3L * 60L * 60L * 1000L

    val values = entries
      .filter { it.ts >= fromTs }
      .sortedBy { it.ts }
      .map { it.sgv }

    return if (values.size >= 2) values.toIntArray() else null
  }

  private fun fetchLatestLoad(baseUrl: String, secret: String?): LoadData? {
    val url = "${baseUrl.trimEnd('/')}/api/v1/devicestatus.json?count=1"
    val arr = getJsonArray(url, secret) ?: return null
    val row = arr.optJSONObject(0) ?: return null

    val loop = row.optJSONObject("loop")
    val iob = loop?.optJSONObject("iob")?.optDouble("iob", Double.NaN)
      ?.takeIf { it.isFinite() }
    val cob = loop?.optJSONObject("cob")?.optDouble("cob", Double.NaN)
      ?.takeIf { it.isFinite() }

    val predictedValues = loop
      ?.optJSONObject("predicted")
      ?.optJSONArray("values")
    fun projectedAt(idx: Int): Int? {
      if (predictedValues == null || predictedValues.length() <= idx) return null
      val v = predictedValues.optDouble(idx, Double.NaN)
      return if (v.isFinite()) v.toInt() else null
    }

    return LoadData(
      iob = iob,
      cob = cob,
      projected1 = projectedAt(0),
      projected2 = projectedAt(1),
      projected3 = projectedAt(2),
    )
  }

  private fun getJsonArray(url: String, secret: String?): JSONArray? {
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

  private fun directionToSymbol(direction: String?): String {
    return when (direction) {
      "DoubleUp" -> "⇈"
      "SingleUp" -> "↑"
      "FortyFiveUp" -> "↗"
      "Flat" -> "→"
      "FortyFiveDown" -> "↘"
      "SingleDown" -> "↓"
      "DoubleDown" -> "⇊"
      else -> "•"
    }
  }

  private data class LatestBg(val sgv: Int, val date: Long, val trend: String)
  private data class LoadData(
    val iob: Double?,
    val cob: Double?,
    val projected1: Int?,
    val projected2: Int?,
    val projected3: Int?,
  )

  companion object {
    const val PREFS = "glucose_sync_prefs"
    const val KEY_BASE_URL = "base_url"
    const val KEY_API_SECRET_SHA1 = "api_secret_sha1"
  }
}

private inline fun <T> HttpURLConnection.useConnection(block: (HttpURLConnection) -> T): T {
  try {
    return block(this)
  } finally {
    disconnect()
  }
}
