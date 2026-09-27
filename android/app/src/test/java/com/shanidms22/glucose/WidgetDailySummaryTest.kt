package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class WidgetDailySummaryTest {
  private val utc = TimeZone.getTimeZone("UTC")
  private val start = stamp("2026-09-27T00:00:00Z")
  private val minute = 60_000L
  private val hour = 60 * minute

  @Test fun `daily range uses midnight instead of latest three hours and includes threshold edges`() {
    val readings = listOf(point(0, 69), point(5, 70), point(10, 180), point(15, 181))
    val result = calculateWidgetDailyRange(readings, start, start + 20 * minute, 70, 180)!!
    assertEquals(25, result.lowPercent)
    assertEquals(50, result.inRangePercent)
    assertEquals(25, result.highPercent)
    assertEquals(100, result.coveragePercent)
    assertEquals(20, result.observedMinutes)
  }

  @Test fun `range weights duration and leaves sensor gaps uncovered`() {
    val result = calculateWidgetDailyRange(listOf(point(0, 60), point(1, 120), point(15, 200)), start, start + 20 * minute, 70, 180)!!
    assertEquals(11, result.observedMinutes)
    assertEquals(55, result.coveragePercent)
    assertEquals(9, result.lowPercent)
    assertEquals(100, result.lowPercent + result.inRangePercent + result.highPercent)
  }

  @Test fun `range clips carryover at midnight and ignores duplicate future and invalid samples`() {
    val result = calculateWidgetDailyRange(listOf(point(-2, 100), point(-2, 100), point(3, 200), point(9, 0), point(100, 100)), start, start + 10 * minute, 70, 180)!!
    assertEquals(8, result.observedMinutes)
    assertEquals(80, result.coveragePercent)
    assertNull(calculateWidgetDailyRange(listOf(point(-10, 100)), start, start + 10 * minute, 70, 180))
    assertNull(calculateWidgetDailyRange(listOf(point(0, 100)), start, start, 70, 180))
    assertNull(calculateWidgetDailyRange(listOf(point(0, 100)), start, start + minute, 180, 70))
  }

  @Test fun `comparison cutoffs use the same local time across spring DST`() {
    val zone = TimeZone.getTimeZone("America/New_York")
    val windows = widgetComparisonWindows(stamp("2026-03-08T16:30:00Z"), zone)
    assertEquals(8, windows.size)
    assertEquals(11.5 * hour, (windows[0].endMs - windows[0].startMs).toDouble(), 0.0)
    assertEquals(12.5 * hour, (windows[1].endMs - windows[1].startMs).toDouble(), 0.0)
    windows.forEach { window ->
      val local = Calendar.getInstance(zone).apply { timeInMillis = window.endMs }
      assertEquals(12, local.get(Calendar.HOUR_OF_DAY))
      assertEquals(30, local.get(Calendar.MINUTE))
    }
  }

  @Test fun `timestamps preserve offset minutes and reject suffix garbage`() {
    assertEquals(start, stamp("2026-09-27T05:30:00+05:30"))
    assertEquals(start, stamp("2026-09-27T05:30:00+0530"))
    assertNull(widgetParseTimestamp("2026-09-27T00:00:00Zgarbage"))
    assertNull(widgetParseTimestamp("2026-02-31T00:00:00Z"))
  }

  @Test fun `comparison cutoffs use the same local time across fall DST`() {
    val zone = TimeZone.getTimeZone("America/New_York")
    val windows = widgetComparisonWindows(stamp("2026-11-01T17:30:00Z"), zone)
    assertEquals(13.5 * hour, (windows[0].endMs - windows[0].startMs).toDouble(), 0.0)
    assertEquals(12.5 * hour, (windows[1].endMs - windows[1].startMs).toDouble(), 0.0)
  }

  @Test fun `insulin comparison never compares a partial today with an entire yesterday`() {
    val treatments = JSONArray().put(bolus(start + hour, 2.0)).put(bolus(start - 24 * hour + hour, 3.0))
      .put(bolus(start - 24 * hour + 18 * hour, 100.0))
    val result = calculateWidgetInsulinComparison(treatments, profiles(start - 10 * 24 * hour, 1.0), start + 12 * hour, utc)!!
    assertEquals(14.0, result.today!!.totalInsulin, 0.00001)
    assertEquals(15.0, result.yesterday!!.totalInsulin, 0.00001)
    assertEquals(7, result.weekDays)
    assertEquals(12.0 + 3.0 / 7, result.weekAverage!!.totalInsulin, 0.00001)
  }

  @Test fun `missing past profile cannot be replaced by newest profile`() {
    val result = calculateWidgetInsulinComparison(JSONArray(), profiles(start, 1.0), start + 12 * hour, utc)!!
    assertNotNull(result.today)
    assertNull(result.yesterday)
    assertNull(result.weekAverage)
    assertEquals(0, result.weekDays)
    assertNull(calculateWidgetInsulinStats(null, profiles(start, 1.0), start, start + hour, utc))
    assertNull(calculateWidgetInsulinStats(JSONArray(), JSONArray(), start, start + hour, utc))
  }

  @Test fun `basal follows effective profile changes within a day`() {
    val history = profiles(start - 24 * hour, 1.0).put(profile(start + 6 * hour, 2.0))
    val result = calculateWidgetInsulinStats(JSONArray(), history, start, start + 12 * hour, utc)!!
    assertEquals(18.0, result.totalBasal, 0.00001)
    assertTrue(result.basalEstimated)
  }

  @Test fun `temporary basals clip at midnight overlap and cancel correctly`() {
    val treatments = JSONArray()
      .put(temp(start - 30 * minute, 120.0, 2.0))
      .put(temp(start + 30 * minute, 30.0, 0.0))
      .put(temp(start + 45 * minute, 0.0, null))
    val result = calculateWidgetInsulinStats(treatments, profiles(start - 24 * hour, 1.0), start, start + hour, utc)!!
    assertEquals(1.25, result.totalBasal, 0.00001)
  }

  @Test fun `suspends end on pump resume and a real zero remains zero`() {
    val treatments = JSONArray().put(event(start, "Suspend Pump")).put(event(start + 30 * minute, "Resume Pump"))
    assertEquals(0.5, calculateWidgetInsulinStats(treatments, profiles(start, 1.0), start, start + hour, utc)!!.totalBasal, 0.00001)
    val zero = calculateWidgetInsulinStats(JSONArray(), profiles(start, 0.0), start, start + hour, utc)!!
    assertEquals(0.0, zero.totalInsulin, 0.0)
    assertEquals(0.0, zero.basalBolusRatio, 0.0)
  }

  @Test fun `unknown percentage basal and unrecorded profile switch suppress misleading totals`() {
    val percent = temp(start, 60.0, null).put("percent", 150).put("temp", "percent")
    assertNull(calculateWidgetInsulinStats(JSONArray().put(percent), profiles(start, 1.0), start, start + hour, utc))
    val switched = JSONArray().put(event(start + 30 * minute, "Profile Switch").put("profile", "Exercise"))
    assertNull(calculateWidgetInsulinStats(switched, profiles(start, 1.0), start, start + hour, utc))
  }

  @Test fun `schedule integration handles repeated hour and profile timezone`() {
    val fallStart = stamp("2026-11-01T04:00:00Z")
    val p = profile(fallStart - 24 * hour, 1.0, "America/New_York")
    p.getJSONObject("store").getJSONObject("Default").getJSONArray("basal")
      .put(JSONObject().put("timeAsSeconds", 3600).put("value", 2.0))
      .put(JSONObject().put("timeAsSeconds", 7200).put("value", 1.0))
    val stats = calculateWidgetInsulinStats(JSONArray(), JSONArray().put(p), fallStart, fallStart + 4 * hour, utc)!!
    assertEquals(6.0, stats.totalBasal, 0.00001)
  }

  @Test fun `duplicate treatment IDs never double count insulin`() {
    val treatment = bolus(start + minute, 2.0).put("_id", "b1")
    val stats = calculateWidgetInsulinStats(JSONArray().put(treatment).put(treatment), profiles(start, 1.0), start, start + hour, utc)!!
    assertEquals(2.0, stats.totalBolus, 0.0)
  }

  @Test fun `unsupported extended bolus crossing midnight suppresses today total`() {
    val extended = event(start - 30 * minute, "Combo Bolus").put("duration", 120).put("insulin", 4.0)
    assertNull(calculateWidgetInsulinStats(JSONArray().put(extended), profiles(start - 24 * hour, 1.0), start, start + hour, utc))
    extended.put("duration", 15)
    assertEquals(1.0, calculateWidgetInsulinStats(JSONArray().put(extended), profiles(start - 24 * hour, 1.0), start, start + hour, utc)!!.totalInsulin, 0.00001)
  }

  @Test fun `pagination continues until an unsaturated page and preserves all records`() {
    val urls = mutableListOf<String>()
    val rows = fetchCompleteWidgetPages("https://example.test/entries?x=1", null, pageSize = 2, maxPages = 3) { url, _ ->
      urls.add(url)
      if (urls.size == 1) JSONArray().put(JSONObject().put("_id", "a")).put(JSONObject().put("_id", "b"))
      else JSONArray().put(JSONObject().put("_id", "c"))
    }
    assertEquals(3, rows!!.length())
    assertTrue(urls.last().contains("skip=2"))
  }

  @Test fun `saturated caps ignored pagination and network errors fail closed`() {
    val page = JSONArray().put(JSONObject().put("_id", "a"))
    assertNull(fetchCompleteWidgetPages("https://example.test/x?x=1", null, 1, 1) { _, _ -> page })
    assertNull(fetchCompleteWidgetPages("https://example.test/x?x=1", null, 1, 3) { _, _ -> page })
    assertNull(fetchCompleteWidgetPages("https://example.test/x?x=1", null) { _, _ -> error("offline") })
  }

  @Test fun `summary cache rejects yesterday stale future and malformed snapshots`() {
    val now = start + 12 * hour
    val summary = WidgetDailySummary(start, now, 70, 180, WidgetDailyRange(10, 80, 10, 50, 360), null)
    assertEquals(summary, parseWidgetDailySummary(widgetDailySummaryJson(summary), now, utc))
    assertNull(parseWidgetDailySummary(widgetDailySummaryJson(summary), now + hour, utc))
    assertNull(parseWidgetDailySummary(widgetDailySummaryJson(summary), start + 24 * hour, utc))
    assertNull(parseWidgetDailySummary(widgetDailySummaryJson(summary.copy(updatedAtMs = now + 2 * minute)), now, utc))
    assertNull(parseWidgetDailySummary(widgetDailySummaryJson(summary.copy(range = summary.range!!.copy(inRangePercent = 81))), now, utc))
    assertNull(parseWidgetDailySummary("{}", now, utc))
  }

  @Test fun `summary round trip retains insulin and distinguishes missing from zero`() {
    val now = start + 12 * hour
    val insulin = WidgetInsulinComparison(widgetInsulinStats(0.0, 0.0), null, widgetInsulinStats(4.0, 8.0), 7)
    val summary = WidgetDailySummary(start, now, 70, 180, null, insulin)
    assertEquals(summary, parseWidgetDailySummary(widgetDailySummaryJson(summary), now, utc))
  }

  private fun point(minutes: Int, value: Int) = WidgetEntryPoint(start + minutes * minute, value, null)
  private fun stamp(value: String) = widgetParseTimestamp(value)!!
  private fun profiles(at: Long, rate: Double) = JSONArray().put(profile(at, rate))
  private fun profile(at: Long, rate: Double, zone: String = "UTC") = JSONObject()
    .put("startDate", widgetIsoUtc(at)).put("defaultProfile", "Default")
    .put("store", JSONObject().put("Default", JSONObject().put("timezone", zone)
      .put("basal", JSONArray().put(JSONObject().put("timeAsSeconds", 0).put("value", rate)))))
  private fun event(at: Long, type: String) = JSONObject().put("created_at", widgetIsoUtc(at)).put("eventType", type)
  private fun bolus(at: Long, amount: Double) = event(at, "Correction Bolus").put("insulin", amount)
  private fun temp(at: Long, duration: Double, rate: Double?) = event(at, "Temp Basal").put("duration", duration).apply { if (rate != null) put("absolute", rate) }
}
