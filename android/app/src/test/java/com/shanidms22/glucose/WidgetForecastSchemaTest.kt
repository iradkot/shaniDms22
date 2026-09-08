package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class WidgetForecastSchemaTest {
  private val now = 1_800_000_000_000L
  private fun iso(ts: Long) = Instant.ofEpochMilli(ts).toString()

  private fun deviceRow(start: Long = now - 300_000, loopTimestamp: Long = now): JSONObject = JSONObject().apply {
    put("created_at", iso(now))
    put("loop", JSONObject().apply {
      put("timestamp", iso(loopTimestamp))
      put("predicted", JSONObject().put("startDate", iso(start)).put("values", JSONArray(listOf(100, 110, 120, 130, 140, 150, 160, 170))))
      put("iob", JSONObject().put("timestamp", iso(now)).put("iob", -1.25))
      put("cob", JSONObject().put("timestamp", iso(now - 20 * 60_000)).put("cob", 50))
    })
  }

  @Test fun `Loop index zero is its own start timestamp and signed IOB stays signed`() {
    val data = parseWidgetLoad(JSONArray().put(deviceRow()), now)
    assertEquals(now - 300_000, data.loopForecast!!.points.first().ts)
    assertEquals(100, data.loopForecast!!.points.first().sgv)
    assertEquals(now, data.loopForecast!!.points[1].ts)
    assertEquals(170, widgetForecastSummary(listOf(data.loopForecast!!), now)!!.point.sgv)
    assertEquals(-1.25, data.iob!!, 0.001)
    assertNull(data.cob)
    assertNull(data.cobTimestampMs)
  }

  @Test fun `fresh device envelope cannot revive old Loop predictions or missing source timestamps`() {
    val staleStart = deviceRow(start = now - 20 * 60_000)
    val staleLoop = deviceRow(loopTimestamp = now - 20 * 60_000)
    val missingLoopTimestamp = deviceRow().apply { getJSONObject("loop").remove("timestamp") }
    assertNull(parseWidgetLoad(JSONArray().put(staleStart), now).loopForecast)
    assertNull(parseWidgetLoad(JSONArray().put(staleLoop), now).loopForecast)
    assertNull(parseWidgetLoad(JSONArray().put(missingLoopTimestamp), now).loopForecast)
  }

  @Test fun `Loop glucose effect IOB array is never an active insulin amount`() {
    val row = deviceRow().apply {
      getJSONObject("loop").remove("iob")
      getJSONObject("loop").getJSONObject("predicted").put("IOB", JSONArray(listOf(100, 110, 120)))
    }
    assertNull(parseWidgetLoad(JSONArray().put(row), now).iob)
  }

  @Test fun `Loop chooses newest own timestamp independently of envelope and startDate order`() {
    val newest = deviceRow(start = now - 300_000, loopTimestamp = now)
    val older = deviceRow(start = now, loopTimestamp = now - 60_000).apply {
      getJSONObject("loop").getJSONObject("predicted").put("values", JSONArray(listOf(222, 222, 222, 222, 222, 222, 222)))
    }
    val parsed = parseWidgetLoad(JSONArray().put(newest).put(older), now)
    assertEquals(100, parsed.loopForecast!!.points.first().sgv)
  }

  @Test fun `a negative distant Loop tail keeps the valid thirty minute projection`() {
    val row = deviceRow().apply {
      val values = getJSONObject("loop").getJSONObject("predicted").getJSONArray("values")
      repeat(20) { values.put(160) }
      values.put(-30)
      values.put(180)
    }
    val forecast = parseWidgetLoad(JSONArray().put(row), now).loopForecast!!
    assertEquals(170, widgetForecastSummary(listOf(forecast), now)!!.point.sgv)
    assertEquals(160, forecast.points.last().sgv)
    assertEquals(28, forecast.points.size)
  }

  private fun snapshot(): JSONObject = JSONObject().apply {
    put("version", 1)
    put("generatedAtMs", now)
    put("glucoseTimestampMs", now)
    put("history", JSONArray().put(JSONObject().put("ts", now).put("sgv", 100)))
    put("series", JSONArray().put(JSONObject().apply {
      put("id", "personalized")
      put("sourceTimestampMs", now)
      put("calibration", JSONObject().put("status", "calibrated").put("sampleCount", 120).put("coveragePercent", 81).put("within20Percent", 74))
      put("points", JSONArray().put(JSONObject().put("ts", now).put("sgv", 100).put("lower", 80).put("upper", 120))
        .put(JSONObject().put("ts", now + 30 * 60_000).put("sgv", 120).put("lower", 90).put("upper", 150)))
    }))
  }

  @Test fun `only validated empirical calibration permits a historical percentage`() {
    val valid = parseWidgetForecastSnapshot(snapshot().toString())!!
    assertEquals(74.0, valid.series.single().within20Percent!!, .001)
    assertEquals(120, valid.series.single().sampleCount)
    val uncalibrated = snapshot().apply { getJSONArray("series").getJSONObject(0).getJSONObject("calibration").put("status", "uncalibrated") }
    val parsed = parseWidgetForecastSnapshot(uncalibrated.toString())!!
    assertNull(parsed.series.single().coveragePercent)
    assertNull(parsed.series.single().within20Percent)
    val tooFew = snapshot().apply { getJSONArray("series").getJSONObject(0).getJSONObject("calibration").put("sampleCount", 10) }
    assertNull(parseWidgetForecastSnapshot(tooFew.toString())!!.series.single().coveragePercent)
  }

  @Test fun `unknown model ids invalid intervals and unsupported snapshot versions are rejected`() {
    val unknown = snapshot().apply { getJSONArray("series").getJSONObject(0).put("id", "loop-copy") }
    assertTrue(parseWidgetForecastSnapshot(unknown.toString())!!.series.isEmpty())
    val invalidBounds = snapshot().apply { getJSONArray("series").getJSONObject(0).getJSONArray("points").getJSONObject(0).put("lower", 130) }
    assertNull(parseWidgetForecastSnapshot(invalidBounds.toString())!!.series.single().points.first().lower)
    assertNull(parseWidgetForecastSnapshot(snapshot().put("version", 2).toString()))
  }

  @Test fun `snapshots are scoped to a complete nonempty account URL`() {
    assertTrue(widgetForecastAccountMatches(" https://a.example/ns/ ", "https://a.example/ns"))
    assertFalse(widgetForecastAccountMatches("https://a.example/ns", "https://b.example/ns"))
    assertFalse(widgetForecastAccountMatches("https://a.example/person-a", "https://a.example/person-b"))
    assertFalse(widgetForecastAccountMatches("https://a.example", "http://a.example"))
    assertFalse(widgetForecastAccountMatches(null, null))
  }

  @Test fun `even one newer CGM cycle prevents shared oldcycle predictions appearing current`() {
    val parsed = parseWidgetForecastSnapshot(snapshot().toString())!!
    assertTrue(freshWidgetForecastSeries(parsed, now + 300_000, now + 300_000).isEmpty())
  }
}
