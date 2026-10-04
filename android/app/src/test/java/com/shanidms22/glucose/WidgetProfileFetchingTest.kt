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

  @Test fun `new profile upload within scope declines estimate without dropping recorded insulin or glucose`() {
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
  private fun profile(at: Long) = JSONObject().put("startDate", widgetIsoUtc(at)).put("defaultProfile", "Default")
    .put("store", JSONObject().put("Default", JSONObject().put("timezone", "UTC").put("basal", JSONArray()
      .put(JSONObject().put("time", "00:00").put("value", 1.0)))))
}
