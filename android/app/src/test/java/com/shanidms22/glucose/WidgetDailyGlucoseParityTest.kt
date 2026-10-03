package com.shanidms22.glucose

import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.TimeZone

class WidgetDailyGlucoseParityTest {
  private val start = widgetParseTimestamp("2026-09-27T00:00:00Z")!!

  @Test fun `shared elapsed glucose fixtures match the daily app metric`() {
    val fixture = listOf("../../__tests__/fixtures/daily-glucose-intervals.json", "../__tests__/fixtures/daily-glucose-intervals.json", "__tests__/fixtures/daily-glucose-intervals.json")
      .map { File(it) }.first { it.isFile }
    val cases = JSONArray(fixture.readText())
    for (index in 0 until cases.length()) {
      val case = cases.getJSONObject(index)
      val name = case.getString("name")
      val samples = case.getJSONArray("samples")
      val entries = (0 until samples.length()).map { sampleIndex ->
        val sample = samples.getJSONObject(sampleIndex)
        WidgetEntryPoint(start + sample.getLong("offsetMs"), sample.getInt("valueMgDl"), null)
      }
      val result = calculateWidgetDailyRange(entries, start, start + case.getLong("durationMs"), 70, 180)
      val expected = case.getJSONObject("expected").optJSONObject("widget")
      if (expected == null) {
        assertNull(name, result)
      } else {
        assertNotNull(name, result)
        assertEquals(name, expected.getInt("lowPercent"), result!!.lowPercent)
        assertEquals(name, expected.getInt("inRangePercent"), result.inRangePercent)
        assertEquals(name, expected.getInt("highPercent"), result.highPercent)
        assertEquals(name, expected.getInt("coveragePercent"), result.coveragePercent)
        assertEquals(name, expected.getInt("observedMinutes"), result.observedMinutes)
      }
    }
  }

  @Test fun `a positive subminute observation survives the widget cache`() {
    val now = start + 30_000
    val range = calculateWidgetDailyRange(listOf(WidgetEntryPoint(start, 100, null)), start, now, 70, 180)
    assertNotNull(range)
    val summary = WidgetDailySummary(start, now, 70, 180, range, null)
    assertEquals(summary, parseWidgetDailySummary(widgetDailySummaryJson(summary), now, TimeZone.getTimeZone("UTC")))
  }
}
