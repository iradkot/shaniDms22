package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.net.URI
import java.net.URLDecoder
import java.util.TimeZone

class WidgetDailyFetchingTest {
  private val zone = TimeZone.getTimeZone("Asia/Jerusalem")
  private val start = widgetParseTimestamp("2026-09-27T21:00:00Z")!!
  private val now = start + 12 * 60 * 60_000L

  @Test fun `real v1 response contract preserves today's TIR beyond first saturated response`() {
    val server = NightscoutV1Server()
    val result = fetchWidgetDailySummary("https://nightscout.test", null, 70, 180, now, zone, fetch = server::fetch)
    val persisted = parseWidgetDailySummary(widgetDailySummaryJson(result.summary), now, zone)!!
    assertNotNull("601 valid CGM readings must not become No readings today", persisted.range)
    assertEquals(605, persisted.range!!.observedMinutes)
    assertEquals(100, persisted.range!!.inRangePercent)
    assertTrue(server.requests.any { it.contains("count=1000") })
  }

  @Test fun `real v1 response contract loads insulin history beyond five hundred treatments`() {
    val server = NightscoutV1Server(glucoseCount = 40)
    val result = fetchWidgetDailySummary("https://nightscout.test", null, 70, 180, now, zone, fetch = server::fetch)
    assertNotNull(result.summary.insulin?.today)
    assertNotNull("v1 ignores skip but still provides all seven days when count grows", result.summary.insulin?.weekAverage)
    assertEquals(7, result.summary.insulin!!.weekDays)
  }

  @Test fun `missing profile and treatment endpoints cannot discard fetched CGM`() {
    val server = NightscoutV1Server(glucoseCount = 40)
    val result = fetchWidgetDailySummary("https://nightscout.test", null, 70, 180, now, zone) { url, secret ->
      if (URI(url).path.contains("entries")) server.fetch(url, secret) else error("optional resource unavailable")
    }
    val persisted = parseWidgetDailySummary(widgetDailySummaryJson(result.summary), now, zone)!!
    assertNotNull(persisted.range)
    assertNull(persisted.insulin)
  }

  @Test fun `TIR is saved before optional insulin request even starts`() {
    val server = NightscoutV1Server(glucoseCount = 40)
    var saved: WidgetDailySummary? = null
    var hadRangeBeforeOptionalRequest = false
    fetchWidgetDailySummary("https://nightscout.test", null, 70, 180, now, zone,
      onProgress = { saved = parseWidgetDailySummary(widgetDailySummaryJson(it.summary), now, zone) },
      fetch = { url, secret ->
        if (URI(url).path.contains("entries")) server.fetch(url, secret)
        else { hadRangeBeforeOptionalRequest = saved?.range != null; null }
      })
    assertTrue("a slow or unavailable profile/history request must not leave today's TIR blank", hadRangeBeforeOptionalRequest)
  }

  @Test fun `unusable historical profile cannot erase today's independently valid insulin`() {
    val server = NightscoutV1Server(glucoseCount = 40, treatmentCount = 40, malformedOldProfile = true)
    val result = fetchWidgetDailySummary("https://nightscout.test", null, 70, 180, now, zone, fetch = server::fetch)
    assertNotNull(result.summary.range)
    assertNotNull("today's profile is valid even when last week's is unsupported", result.summary.insulin?.today)
    assertNull(result.summary.insulin?.weekAverage)
  }

  /** Mirrors Nightscout 15 lib/server/{entries,treatments,profile}.js: count, find, sort; no skip. */
  private inner class NightscoutV1Server(glucoseCount: Int = 601, treatmentCount: Int = 620, malformedOldProfile: Boolean = false) {
    val requests = mutableListOf<String>()
    private val entries = (0 until glucoseCount).map { index ->
      JSONObject().put("_id", "g$index").put("date", start + index * 60_000L).put("sgv", 81).put("type", "sgv")
    }
    private val treatments = (0 until treatmentCount).map { index ->
      JSONObject().put("_id", "t$index").put("created_at", widgetIsoUtc(start - 7 * 24 * 60 * 60_000L + index * 15 * 60_000L))
        .put("eventType", "Temp Basal").put("absolute", 1.0).put("duration", 15)
    }
    private val baselineProfile = JSONObject().put("_id", "p1").put("startDate", "2026-01-01T00:00:00Z")
      .put("defaultProfile", "Default").put("store", JSONObject().put("Default", JSONObject()
        .put("timezone", zone.id).put("basal", JSONArray().put(JSONObject().put("timeAsSeconds", 0).put("value", 1.0)))))
    private val profiles = if (!malformedOldProfile) listOf(baselineProfile) else listOf(
      baselineProfile,
      JSONObject(baselineProfile.toString()).put("_id", "old-profile").put("startDate", widgetIsoUtc(start - 5 * 24 * 60 * 60_000L)).apply {
        getJSONObject("store").getJSONObject("Default").put("timezone", "unsupported-zone")
      },
      JSONObject(baselineProfile.toString()).put("_id", "current-profile").put("startDate", widgetIsoUtc(start - 24 * 60 * 60_000L)),
    )

    fun fetch(url: String, @Suppress("UNUSED_PARAMETER") secret: String?): JSONArray {
      requests.add(url)
      val uri = URI(url)
      val parameters = uri.rawQuery.split('&').associate { pair ->
        val pieces = pair.split('=', limit = 2)
        URLDecoder.decode(pieces[0], "UTF-8") to URLDecoder.decode(pieces.getOrElse(1) { "" }, "UTF-8")
      }
      val (source, field) = when {
        uri.path.contains("entries") -> entries to "date"
        uri.path.contains("treatments") -> treatments to "created_at"
        uri.path.contains("profiles") -> profiles to "startDate"
        else -> error("Unexpected endpoint")
      }
      fun timestamp(value: Any?): Long = widgetParseTimestamp(value)!!
      val lower = parameters["find[$field][\$gte]"]?.let(::timestamp) ?: Long.MIN_VALUE
      val upper = parameters["find[$field][\$lte]"]?.let(::timestamp) ?: Long.MAX_VALUE
      val rows = source.filter { timestamp(it.get(field)) in lower..upper }.sortedBy { timestamp(it.get(field)) }
      val sorted = if (parameters["sort[$field]"] == "1") rows else rows.reversed()
      return JSONArray().apply { sorted.take(parameters.getValue("count").toInt()).forEach { put(it) } }
    }
  }
}
