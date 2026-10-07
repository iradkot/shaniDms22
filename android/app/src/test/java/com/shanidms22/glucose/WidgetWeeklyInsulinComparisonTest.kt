package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.TimeZone

class WidgetWeeklyInsulinComparisonTest {
  private val zone = TimeZone.getTimeZone("UTC")
  private val start = widgetParseTimestamp("2026-09-27T00:00:00Z")!!
  private val hour = 3_600_000L

  @Test fun `different recorded basal coverage compares known bolus instead of incomplete totals`() {
    val rows = JSONArray().put(event(start, "Correction Bolus").put("insulin", 2.0))
      .put(event(start - 24 * hour, "Correction Bolus").put("insulin", 2.0))
      .put(event(start, "Temp Basal").put("duration", 60).put("deliveredUnits", 1.0))
      .put(event(start - 24 * hour, "Temp Basal").put("duration", 120).put("deliveredUnits", 2.0))
    val comparison = calculateWidgetInsulinComparison(rows, start + 3 * hour, zone)!!
    val values = widgetInsulinValues(comparison.today, comparison.yesterday)!!
    assertEquals(WidgetInsulinBasis.BOLUS, values.basis)
    assertEquals(2.0, values.today, 0.000001)
    assertEquals(2.0, values.baseline, 0.000001)
  }

  @Test fun `unknown recorded basal coverage cannot support a subtotal comparison`() {
    val today = widgetInsulinStats(6.8, 33.8, 30.0, 0, "partial")
    val baseline = widgetInsulinStats(6.3, 33.8, 30.0, 0, "partial")
    assertEquals(WidgetInsulinBasis.BOLUS, widgetInsulinValues(today, baseline)!!.basis)
  }

  @Test fun `equal basal coverage in different spans is not a comparable insulin total`() {
    val rows = JSONArray().put(event(start, "Correction Bolus").put("insulin", 2.0))
      .put(event(start - 24 * hour, "Correction Bolus").put("insulin", 2.0))
      .put(event(start, "Temp Basal").put("duration", 60).put("deliveredUnits", 1.0))
      .put(event(start - 24 * hour + 2 * hour, "Temp Basal").put("duration", 60).put("deliveredUnits", 2.0))
    val comparison = calculateWidgetInsulinComparison(rows, start + 3 * hour, zone)!!
    assertEquals(comparison.today!!.basalCoveragePercent, comparison.yesterday!!.basalCoveragePercent, 0.0)
    val values = widgetInsulinValues(comparison.today, comparison.yesterday)!!
    assertEquals(WidgetInsulinBasis.BOLUS, values.basis)
    assertEquals(values.today, values.baseline, 0.0)
  }

  @Test fun `weekly total combines complete recorded day without profile and six estimated days`() {
    val comparison = calculateWidgetInsulinComparison(rows(), start + 3 * hour, zone,
      profilesByDayStart = profiles())!!
    val week = comparison.weekAverage!!
    assertEquals(7, comparison.weekDays)
    assertEquals("partial", week.quality)
    assertNull(week.totalInsulin)
    assertEquals(9.0 / 7, week.totalBasal!!, 0.000001)
    assertEquals(3.0, week.estimatedBasalUnits!!, 0.000001)
    assertEquals(5.0, week.estimatedTotalUnits!!, 0.000001)
    val selected = widgetInsulinValues(comparison.today, week)!!
    assertEquals(WidgetInsulinBasis.ESTIMATED, selected.basis)
    assertEquals(5.0, selected.today, 0.000001)
    assertEquals(5.0, selected.baseline, 0.000001)
    assertEquals(0.0, selected.today - selected.baseline, 0.000001)
  }

  @Test fun `all complete recorded dates retain recorded weekly priority without profiles`() {
    val comparison = calculateWidgetInsulinComparison(rows(allComplete = true), start + 3 * hour, zone)!!
    val week = comparison.weekAverage!!
    assertEquals("available", week.quality)
    assertEquals(5.0, week.totalInsulin!!, 0.000001)
    assertNull(week.estimatedBasalUnits)
    assertNull(week.estimatedTotalUnits)
    assertEquals(WidgetInsulinBasis.RECORDED, widgetInsulinValues(comparison.today, week)!!.basis)
  }

  @Test fun `partial historical date without profile prevents a full weekly estimate`() {
    val profiles = profiles().toMutableMap().apply { remove(start - 7 * 24 * hour) }
    val comparison = calculateWidgetInsulinComparison(rows(), start + 3 * hour, zone,
      profilesByDayStart = profiles)!!
    val week = comparison.weekAverage!!
    assertEquals(7, comparison.weekDays)
    assertNull(week.totalInsulin)
    assertNull(week.estimatedBasalUnits)
    assertNull(week.estimatedTotalUnits)
    assertEquals(9.0 / 7, week.totalBasal!!, 0.000001)
    assertEquals(WidgetInsulinBasis.BOLUS, widgetInsulinValues(comparison.today, week)!!.basis)
  }

  @Test fun `unknown historical date never becomes a zero or a six date average`() {
    val comparison = calculateWidgetInsulinComparison(rows(unknownDay = 7), start + 3 * hour, zone,
      profilesByDayStart = profiles())!!
    assertEquals(6, comparison.weekDays)
    assertNull(comparison.weekAverage)
    assertNull(widgetInsulinValues(comparison.today, comparison.weekAverage))
  }

  private fun rows(allComplete: Boolean = false, unknownDay: Int? = null) = JSONArray().apply {
    for (day in 0..7) {
      val at = start - day * 24 * hour
      put(event(at, "Correction Bolus").put("insulin", 2.0).apply {
        if (day == unknownDay) put("isMutable", true)
      })
      if (day != unknownDay) {
        val complete = allComplete || day == 1
        put(event(at, "Temp Basal").put("duration", if (complete) 180 else 60)
          .put("deliveredUnits", if (complete) 3.0 else 1.0))
      }
    }
  }

  private fun profiles() = (0..7).filter { it != 1 }.associate {
    start - it * 24 * hour to JSONObject().put("startDate", "2026-01-01T00:00:00Z")
      .put("defaultProfile", "Default").put("store", JSONObject().put("Default", JSONObject()
        .put("timezone", "UTC").put("basal", JSONArray().put(JSONObject().put("time", "00:00").put("value", 1.0)))))
  }

  private fun event(at: Long, type: String) = JSONObject()
    .put("created_at", widgetIsoUtc(at)).put("eventType", type)
}
