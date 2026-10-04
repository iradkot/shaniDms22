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

  @Test fun `recorded insulin comparisons use the same cutoff and preserve known bolus without a basal schedule`() {
    val treatments = JSONArray().put(bolus(start + hour, 2.0)).put(bolus(start - 24 * hour + hour, 3.0))
      .put(bolus(start - 24 * hour + 18 * hour, 100.0))
    val result = calculateWidgetInsulinComparison(treatments, start + 12 * hour, utc)!!
    assertEquals(2.0, result.today!!.totalBolus!!, 0.00001)
    assertEquals(3.0, result.yesterday!!.totalBolus!!, 0.00001)
    assertEquals(7, result.weekDays)
    assertEquals(3.0 / 7, result.weekAverage!!.totalBolus!!, 0.00001)
    assertNull(result.today!!.totalBasal)
    assertNull(result.today!!.totalInsulin)
    assertNull(result.today!!.basalBolusRatio)
    assertNull(result.weekAverage!!.totalInsulin)
    assertEquals("partial", result.weekAverage!!.quality)
  }

  @Test fun `no treatments endpoint cannot become a known zero total`() {
    assertNull(calculateWidgetInsulinStats(null, start, start + hour))
    val empty = calculateWidgetInsulinStats(JSONArray(), start, start + hour)!!
    assertNull(empty.totalBasal)
    assertEquals(0.0, empty.totalBolus!!, 0.0)
    assertNull(empty.totalInsulin)
    assertEquals("partial", empty.quality)
  }

  @Test fun `weekly basal retains all seven partial subtotals and their mean coverage`() {
    val treatments = JSONArray()
    for (daysAgo in 1..7) {
      val dayStart = start - daysAgo * 24 * hour
      treatments.put(event(dayStart, "Temp Basal").put("enteredBy", "loop://fixture").put("duration", 30).put("amount", 0.5))
      treatments.put(bolus(dayStart + 10 * minute, 2.0))
    }
    val comparison = calculateWidgetInsulinComparison(treatments, start + hour, utc)!!
    assertEquals(0.5, comparison.yesterday!!.totalBasal!!, 0.0)
    assertEquals(50.0, comparison.yesterday!!.basalCoveragePercent, 0.0)
    assertEquals(7, comparison.weekDays)
    assertEquals(0.5, comparison.weekAverage!!.totalBasal!!, 0.0)
    assertEquals(50.0, comparison.weekAverage!!.basalCoveragePercent, 0.0)
    assertEquals("partial", comparison.weekAverage!!.quality)
    assertNull(comparison.weekAverage!!.totalInsulin)
    assertEquals(2.0, comparison.weekAverage!!.totalBolus!!, 0.0)
  }

  @Test fun `insulin schema upgrade discards rate-derived cached amounts while preserving TIR`() {
    val range = WidgetDailyRange(10, 80, 10, 100, 60)
    val insulin = WidgetInsulinComparison(widgetInsulinStats(1.0, 2.0, basalCoveredMs = hour), null, null, 0)
    val raw = JSONObject(widgetDailySummaryJson(WidgetDailySummary(start, start + hour, 70, 180, range, insulin)))
    raw.getJSONObject("insulin").remove("schemaVersion")
    val summary = parseWidgetDailySummary(raw.toString(), start + hour, utc)!!
    assertEquals(range, summary.range)
    assertNull(summary.insulin)
  }

  @Test fun `all shared recorded delivery fixtures match native background calculations`() {
    val fixture = listOf("../../__tests__/fixtures/recorded-insulin.json", "../__tests__/fixtures/recorded-insulin.json", "__tests__/fixtures/recorded-insulin.json")
      .map { java.io.File(it) }.first { it.isFile }
    val cases = JSONArray(fixture.readText())
    for (index in 0 until cases.length()) {
      val case = cases.getJSONObject(index)
      val name = case.getString("name")
      val result = calculateWidgetInsulinStats(case.getJSONArray("records"), stamp(case.getString("start")),
        stamp(case.getString("end")), stamp(case.getString("observedAt")))!!
      val expected = case.getJSONObject("expected")
      assertEquals(name, expected.getString("quality"), result.quality)
      assertEquals(name, expected.getString("basalEvidence"), result.basalEvidence)
      assertEquals(name, expected.getLong("basalCoveredMs"), result.basalCoveredMs)
      assertEquals(name, expected.getDouble("basalCoveragePercent"), result.basalCoveragePercent, 0.000001)
      if (expected.has("basalUnits")) assertEquals(name, expected.getDouble("basalUnits"), result.totalBasal!!, 0.000001) else assertNull(name, result.totalBasal)
      if (expected.has("bolusUnits")) assertEquals(name, expected.getDouble("bolusUnits"), result.totalBolus!!, 0.000001) else assertNull(name, result.totalBolus)
      if (result.quality != "available") { assertNull(name, result.totalInsulin); assertNull(name, result.basalBolusRatio) }
      assertFalse(result.basalEstimated)
    }
  }

  @Test fun `legacy scheduled insulin cache is never relabeled as recorded delivery`() {
    val raw = JSONObject(widgetDailySummaryJson(WidgetDailySummary(start, start + hour, 70, 180, null, null)))
      .put("insulin", JSONObject().put("today", JSONObject().put("basal", 1.0).put("bolus", 2.0).put("estimated", true)))
    assertNull(parseWidgetDailySummary(raw.toString(), start + hour, utc)!!.insulin?.today)
  }

  @Test fun `count expands until an unsaturated response and preserves all records`() {
    val urls = mutableListOf<String>()
    val rows = fetchCompleteWidgetPages("https://example.test/entries?x=1", null, pageSize = 2, maxPages = 3) { url, _ ->
      urls.add(url)
      if (urls.size == 1) JSONArray().put(JSONObject().put("_id", "a")).put(JSONObject().put("_id", "b"))
      else JSONArray().put(JSONObject().put("_id", "a")).put(JSONObject().put("_id", "b")).put(JSONObject().put("_id", "c"))
    }
    assertEquals(3, rows!!.length())
    assertTrue(urls.last().contains("count=4"))
    assertTrue(urls.none { it.contains("skip=") })
  }

  @Test fun `saturated caps malformed responses and network errors fail closed`() {
    val page = JSONArray().put(JSONObject().put("_id", "a"))
    assertNull(fetchCompleteWidgetPages("https://example.test/x?x=1", null, 1, 1) { _, _ -> page })
    assertNull(fetchCompleteWidgetPages("https://example.test/x?x=1", null, 2, 3) { _, _ -> JSONArray().put("invalid row") })
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
    val insulin = WidgetInsulinComparison(widgetInsulinStats(0.0, 0.0, basalCoveredMs = 12 * hour), null, widgetInsulinStats(4.0, 8.0, basalCoveredMs = 12 * hour), 7)
    val summary = WidgetDailySummary(start, now, 70, 180, null, insulin)
    assertEquals(summary, parseWidgetDailySummary(widgetDailySummaryJson(summary), now, utc))
  }

  @Test fun `ten thousand completed basal intervals retain exact sum and coverage`() {
    val count = 10_000
    val step = 5 * minute
    val end = start + count * step
    val treatments = JSONArray()
    for (index in 0 until count) {
      treatments.put(event(start + index * step, "Temp Basal").put("_id", "dose-$index")
        .put("enteredBy", "loop://fixture").put("duration", 5).put("amount", 0.125))
    }
    val summary = calculateWidgetInsulinStats(treatments, start, end, end)!!
    assertEquals("available", summary.quality)
    assertEquals(1250.0, summary.totalBasal!!, 0.0)
    assertEquals(0.0, summary.totalBolus!!, 0.0)
    assertEquals(count * step, summary.basalCoveredMs)
    assertEquals(100.0, summary.basalCoveragePercent, 0.0)
  }

  private fun point(minutes: Int, value: Int) = WidgetEntryPoint(start + minutes * minute, value, null)
  private fun stamp(value: String) = widgetParseTimestamp(value)!!
  private fun event(at: Long, type: String) = JSONObject().put("created_at", widgetIsoUtc(at)).put("eventType", type)
  private fun bolus(at: Long, amount: Double) = event(at, "Correction Bolus").put("insulin", amount)
}
