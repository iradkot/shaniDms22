package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.net.URI
import java.net.URLDecoder
import java.util.TimeZone

class WidgetProfileFetchingTest {
  private val zone = TimeZone.getTimeZone("UTC")
  private val start = widgetParseTimestamp("2026-09-27T00:00:00Z")!!
  private val hour = 3_600_000L

  @Test fun `identical carry in profiles are resolved with and without an intraday update`() {
    for (intraday in listOf(false, true)) {
      val requests = mutableListOf<Map<String, String>>()
      val rows = carryInDuplicates(conflicting = false, intraday = intraday)
      val loaded = fetchWidgetBasalProfile("https://example.test", "secret", start, zone,
        fetch = { url, _ -> query(url).let { parameters ->
          requests.add(parameters)
          profileResponse(rows, parameters)
        } }, throughMs = start + 3 * hour)
      assertNotNull("Identical carry-in rows remain usable, intraday=$intraday", loaded)
      val recorded = calculateWidgetInsulinStats(JSONArray(), start, start + 3 * hour)!!
      val estimated = withWidgetBasalEstimate(recorded, JSONArray(), loaded, start, start + 3 * hour, start + 3 * hour, zone)!!
      assertEquals(3.0, estimated.estimatedBasalUnits!!, 0.000001)
      assertTrue("Carry-in ties require a complete equality-range read", requests.any {
        it["find[startDate][\$gte]"] == widgetIsoUtc(start - hour) &&
          it["find[startDate][\$lte]"] == widgetIsoUtc(start - hour)
      })
    }
  }

  @Test fun `conflicting carry in profiles disable estimates with and without an intraday update`() {
    for (intraday in listOf(false, true)) {
      val rows = carryInDuplicates(conflicting = true, intraday = intraday)
      val loaded = fetchWidgetBasalProfile("https://example.test", "secret", start, zone,
        fetch = { url, _ -> profileResponse(rows, query(url)) }, throughMs = start + 3 * hour)
      assertNull("A first-row choice cannot resolve conflicting carry-in schedules, intraday=$intraday", loaded)
    }
  }

  @Test fun `saturated carry in equality range disables estimates`() {
    val rows = carryInDuplicates(conflicting = false)
    val loaded = fetchWidgetBasalProfile("https://example.test", "secret", start, zone,
      fetch = { url, _ -> query(url).let { parameters ->
        if (parameters.containsKey("find[startDate][\$gte]")) JSONArray().apply {
          repeat(parameters.getValue("count").toInt()) { index -> put(profile(start - hour).put("_id", "same-time-$index")) }
        } else profileResponse(rows, parameters)
      } }, throughMs = start + 3 * hour)
    assertNull("A saturated prefix cannot establish an unambiguous carry-in schedule", loaded)
  }

  @Test fun `failed carry in equality range disables estimates`() {
    val rows = carryInDuplicates(conflicting = false)
    val loaded = fetchWidgetBasalProfile("https://example.test", "secret", start, zone,
      fetch = { url, _ -> query(url).let { parameters ->
        if (parameters.containsKey("find[startDate][\$gte]")) null else profileResponse(rows, parameters)
      } }, throughMs = start + 3 * hour)
    assertNull(loaded)
  }

  @Test fun `cached long doses do not become completed when their original observation ages`() {
    for (type in listOf("Basal", "Extended Bolus")) {
      val dose = event(start - 2 * 24 * hour, type).put("_id", "long-dose")
        .put("endDate", widgetIsoUtc(start + 4 * hour)).put("deliveredUnits", 48.0)
      val requests = mutableListOf<String>()
      fun fetch(url: String, secret: String?) = snapshotResponse(url, dose, null).also { requests.add(url) }
      val first = fetchWidgetDailySummary("https://example.test", "secret", 70, 180, start + 3 * hour, zone, fetch = ::fetch)
      val initial = first.summary.insulin!!.yesterday!!
      val initialAmount = if (type == "Basal") initial.totalBasal else initial.totalBolus
      assertNull("The dose was unfinished when the historical snapshot was read", initialAmount)
      requests.clear()
      val refreshed = fetchWidgetDailySummary("https://example.test", "secret", 70, 180, start + 5 * hour, zone,
        cachedHistory = first.historyCache, lastHistoryAttemptMs = first.historyAttemptMs ?: 0, fetch = ::fetch)
      val current = refreshed.summary.insulin!!.yesterday!!
      assertNull("Waiting cannot establish recorded $type delivery", if (type == "Basal") current.totalBasal else current.totalBolus)
      assertNull("Unknown recorded delivery is not a complete total", current.totalInsulin)
      assertNull("An unfinished amount alone cannot establish an estimate", current.estimatedTotalUnits)
      assertEquals(first.historyCache!!.fetchedAtMs, refreshed.historyCache!!.fetchedAtMs)
      assertFalse("No historical dose was refetched", requests.any { url ->
        URI(url).path.contains("treatments") && query(url)["find[created_at][\$lte]"] == widgetIsoUtc(start - 1)
      })
    }
  }

  @Test fun `a freshly observed revision can establish completion of a cached long dose`() {
    for (type in listOf("Basal", "Extended Bolus")) {
      val dose = event(start - 24 * hour + hour / 2, type).put("_id", "long-dose")
        .put("endDate", widgetIsoUtc(start + 4 * hour)).put("deliveredUnits", 48.0)
      var freshDose = dose
      fun fetch(url: String, secret: String?) = snapshotResponse(url, dose, freshDose)
      val first = fetchWidgetDailySummary("https://example.test", "secret", 70, 180, start + 3 * hour, zone, fetch = ::fetch)
      val initial = first.summary.insulin!!.yesterday!!
      assertNull(if (type == "Basal") initial.totalBasal else initial.totalBolus)
      freshDose = JSONObject(dose.toString()).put("srvModified", widgetIsoUtc(start + 5 * hour))
      val refreshed = fetchWidgetDailySummary("https://example.test", "secret", 70, 180, start + 5 * hour, zone,
        cachedHistory = first.historyCache, lastHistoryAttemptMs = first.historyAttemptMs ?: 0, fetch = ::fetch)
      val current = refreshed.summary.insulin!!.yesterday!!
      val amount = if (type == "Basal") current.totalBasal else current.totalBolus
      assertNotNull("Fresh evidence can establish completed $type delivery", amount)
      assertTrue(amount!! > 0)
      assertNotNull("The newly observed amount supports the total estimate", current.estimatedTotalUnits)
      assertNull("Recorded basal coverage is still incomplete", current.totalInsulin)
      assertEquals(first.historyCache!!.fetchedAtMs, refreshed.historyCache!!.fetchedAtMs)
    }
  }

  @Test fun `profile history reconstructs an unchanged intraday upload and later schedule change`() {
    val through = start + 3 * hour
    val history = listOf(profile(start - 24 * hour), profile(start + hour), profile(start + 2 * hour).apply {
      getJSONObject("store").getJSONObject("Default").getJSONArray("basal").getJSONObject(0).put("value", 2.0)
    })
    val result = fetchWidgetDailySummary("https://example.test", "secret", 70, 180, through, zone,
      fetch = { url, _ ->
        val uri = URI(url)
        when {
          uri.path.contains("entries") -> JSONArray().put(JSONObject().put("date", start).put("sgv", 100))
          uri.path.contains("treatments") -> JSONArray().put(event(start, "Correction Bolus").put("insulin", 2.0))
          else -> {
            val query = uri.rawQuery.split('&').associate { pair ->
              val parts = pair.split('=', limit = 2)
              URLDecoder.decode(parts[0], "UTF-8") to URLDecoder.decode(parts[1], "UTF-8")
            }
            val before = query["find[startDate][\$lte]"]?.let { widgetParseTimestamp(it) } ?: Long.MAX_VALUE
            val after = query["find[startDate][\$gte]"]?.let { widgetParseTimestamp(it) } ?: Long.MIN_VALUE
            JSONArray().apply { history.filter { widgetParseTimestamp(it.opt("startDate"))!! in after..before }
              .sortedByDescending { widgetParseTimestamp(it.opt("startDate"))!! }
              .take(query.getValue("count").toInt()).forEach { put(it) } }
          }
        }
      })
    val stats = result.summary.insulin!!.today!!
    assertEquals("partial", stats.quality)
    assertNull(stats.totalInsulin)
    assertNull(stats.totalBasal)
    assertEquals(4.0, stats.estimatedBasalUnits!!, 0.000001)
    assertEquals(6.0, stats.estimatedTotalUnits!!, 0.000001)
  }

  @Test fun `missing carry in for intraday upload declines estimate without dropping recorded insulin or glucose`() {
    val through = start + 3 * hour
    var queryCutoff: Long? = null
    val result = fetchWidgetDailySummary("https://example.test", "secret", 70, 180, through, zone,
      fetch = { url, suppliedSecret ->
        assertEquals("secret", suppliedSecret)
        val uri = URI(url)
        when {
          uri.path.contains("entries") -> JSONArray().put(JSONObject().put("date", start).put("sgv", 100))
          uri.path.contains("treatments") -> JSONArray().put(event(start, "Correction Bolus").put("insulin", 2.0))
            .put(event(start, "Temp Basal").put("duration", 60).put("deliveredUnits", 1.8))
          else -> {
            val query = uri.rawQuery.split('&').associate { pair ->
              val parts = pair.split('=', limit = 2)
              URLDecoder.decode(parts[0], "UTF-8") to URLDecoder.decode(parts[1], "UTF-8")
            }
            val cutoff = widgetParseTimestamp(query.getValue("find[startDate][\$lte]"))!!
            if (cutoff == through) queryCutoff = cutoff
            val day = widgetStartOfDayMs(cutoff, zone)
            JSONArray().put(profile(day + hour))
          }
        }
      })
    assertEquals(through, queryCutoff)
    assertNotNull(result.summary.range)
    assertEquals(2.0, result.summary.insulin!!.today!!.totalBolus!!, 0.0)
    assertEquals(1.8, result.summary.insulin!!.today!!.totalBasal!!, 0.0)
    assertNull(result.summary.insulin!!.today!!.estimatedTotalUnits)
    assertNull(result.summary.insulin!!.weekAverage!!.estimatedTotalUnits)
    assertEquals(WidgetInsulinBasis.PARTIAL, widgetInsulinAmount(result.summary.insulin!!.today)!!.basis)
  }

  @Test fun `profile failures retain recorded comparison and do not retry seven historical profiles on each refresh`() {
    val requests = mutableListOf<String>()
    fun fetch(url: String, secret: String?): JSONArray? {
      assertEquals("secret", secret)
      requests.add(url)
      return when {
        URI(url).path.contains("entries") -> JSONArray().put(JSONObject().put("date", start).put("sgv", 100))
        URI(url).path.contains("treatments") -> JSONArray().put(event(start, "Correction Bolus").put("insulin", 2.0))
        else -> null
      }
    }
    val first = fetchWidgetDailySummary("https://example.test", "secret", 70, 180, start + 3 * hour, zone, fetch = ::fetch)
    assertEquals(8, requests.count { it.contains("profiles") })
    assertNotNull(first.summary.range)
    assertEquals(2.0, first.summary.insulin!!.today!!.totalBolus!!, 0.0)
    requests.clear()
    val next = fetchWidgetDailySummary("https://example.test", "secret", 70, 180, start + 3 * hour + 5 * 60_000, zone,
      cachedHistory = first.historyCache, lastHistoryAttemptMs = first.historyAttemptMs ?: 0, fetch = ::fetch)
    assertEquals(1, requests.count { it.contains("profiles") })
    assertNotNull(next.summary.range)
    assertEquals(2.0, next.summary.insulin!!.today!!.totalBolus!!, 0.0)
    requests.clear()
    fetchWidgetDailySummary("https://example.test", "secret", 70, 180, start + 3 * hour + 30 * 60_000, zone,
      cachedHistory = next.historyCache, lastHistoryAttemptMs = next.historyAttemptMs ?: first.historyAttemptMs ?: 0, fetch = ::fetch)
    assertEquals(8, requests.count { it.contains("profiles") })
  }

  private fun event(at: Long, type: String) = JSONObject().put("created_at", widgetIsoUtc(at)).put("eventType", type)
  private fun snapshotResponse(url: String, historicalDose: JSONObject, freshDose: JSONObject?): JSONArray {
    val uri = URI(url)
    return when {
      uri.path.contains("entries") -> JSONArray().put(JSONObject().put("date", start).put("sgv", 100))
      uri.path.contains("treatments") -> {
        val historical = query(url)["find[created_at][\$lte]"] == widgetIsoUtc(start - 1)
        if (historical) JSONArray().put(historicalDose)
        else JSONArray().put(event(start, "Correction Bolus").put("insulin", 2.0)).apply { freshDose?.let { put(it) } }
      }
      else -> JSONArray().put(profile(start - 8 * 24 * hour))
    }
  }

  private fun carryInDuplicates(conflicting: Boolean, intraday: Boolean = false): List<JSONObject> = listOf(
    profile(start - hour).put("_id", "carry-one"),
    profile(start - hour).put("_id", "carry-two").apply {
      if (conflicting) getJSONObject("store").getJSONObject("Default").getJSONArray("basal").getJSONObject(0).put("value", 2.0)
    },
  ) + if (intraday) listOf(profile(start + hour).put("_id", "intraday")) else emptyList()

  private fun query(url: String): Map<String, String> = URI(url).rawQuery.split('&').associate { pair ->
    val parts = pair.split('=', limit = 2)
    URLDecoder.decode(parts[0], "UTF-8") to URLDecoder.decode(parts[1], "UTF-8")
  }

  private fun profileResponse(rows: List<JSONObject>, parameters: Map<String, String>): JSONArray {
    val before = parameters["find[startDate][\$lte]"]?.let { widgetParseTimestamp(it) } ?: Long.MAX_VALUE
    val after = parameters["find[startDate][\$gte]"]?.let { widgetParseTimestamp(it) } ?: Long.MIN_VALUE
    return JSONArray().apply { rows.filter { widgetParseTimestamp(it.opt("startDate"))!! in after..before }
      .sortedByDescending { widgetParseTimestamp(it.opt("startDate"))!! }
      .take(parameters.getValue("count").toInt()).forEach { put(it) } }
  }

  private fun profile(at: Long) = JSONObject().put("startDate", widgetIsoUtc(at)).put("defaultProfile", "Default")
    .put("store", JSONObject().put("Default", JSONObject().put("timezone", "UTC").put("basal", JSONArray()
      .put(JSONObject().put("time", "00:00").put("value", 1.0)))))
}
