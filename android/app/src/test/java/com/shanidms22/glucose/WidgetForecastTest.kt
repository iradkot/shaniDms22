package com.shanidms22.glucose

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetForecastTest {
  private val now = 1_800_000_000_000L

  @Test fun `Nightscout AR2 matches recurrence with real five minute timestamps`() {
    val curve = nightscoutWidgetForecast(listOf(WidgetEntryPoint(now - 300_000, 100, null), WidgetEntryPoint(now, 110, null)), now)!!
    assertEquals(listOf(110, 118, 124, 129, 133, 136, 138), curve.points.map { it.sgv })
    assertEquals(now, curve.points.first().ts)
    assertEquals(now + 30 * 60_000, curve.points.last().ts)
    assertNull(curve.coveragePercent)
  }

  @Test fun `AR2 refuses gaps and stale inputs`() {
    assertNull(nightscoutWidgetForecast(listOf(WidgetEntryPoint(now - 600_000, 100, null), WidgetEntryPoint(now, 110, null)), now))
    assertNull(nightscoutWidgetForecast(listOf(WidgetEntryPoint(now - 1_300_000, 100, null), WidgetEntryPoint(now - 1_000_000, 110, null)), now))
  }

  @Test fun `fifteen minute boundary is stale and AR2 never uses a future observed CGM`() {
    assertTrue(widgetTimestampIsFresh(now - WIDGET_FORECAST_FRESH_MS + 1, now))
    assertTrue(!widgetTimestampIsFresh(now - WIDGET_FORECAST_FRESH_MS, now))
    assertNull(nightscoutWidgetForecast(listOf(WidgetEntryPoint(now - 300_000 + 1, 100, null), WidgetEntryPoint(now + 1, 110, null)), now))
  }

  @Test fun `AR2 validates both observed readings against shared 39 to 400 input gates`() {
    for (invalid in listOf(38, 401)) {
      assertNull(nightscoutWidgetForecast(listOf(WidgetEntryPoint(now - 300_000, invalid, null), WidgetEntryPoint(now, 110, null)), now))
      assertNull(nightscoutWidgetForecast(listOf(WidgetEntryPoint(now - 300_000, 100, null), WidgetEntryPoint(now, invalid, null)), now))
    }
    for (edge in listOf(39, 400)) {
      assertNotNull(nightscoutWidgetForecast(listOf(WidgetEntryPoint(now - 300_000, edge, null), WidgetEntryPoint(now, edge, null)), now))
    }
  }

  @Test fun `fresh upload cannot revive an old individual source`() {
    val fresh = WidgetForecastSeries("loop", "Loop", now, listOf(WidgetForecastPoint(now, 100), WidgetForecastPoint(now + 30 * 60_000, 130)))
    val stale = fresh.copy(id = "personalized", sourceTimestampMs = now - 16 * 60_000)
    val snapshot = WidgetForecastSnapshot(now, now, emptyList(), listOf(fresh, stale))
    assertEquals(listOf("loop"), freshWidgetForecastSeries(snapshot, now, now).map { it.id })
  }

  @Test fun `new glucose cycle invalidates old predictions even before age cutoff`() {
    val curve = WidgetForecastSeries("loop", "Loop", now, listOf(WidgetForecastPoint(now, 100), WidgetForecastPoint(now + 30 * 60_000, 130)))
    val snapshot = WidgetForecastSnapshot(now, now - 10 * 60_000, emptyList(), listOf(curve))
    assertTrue(freshWidgetForecastSeries(snapshot, now, now).isEmpty())
  }

  @Test fun `future source clocks and stale glucose fail closed`() {
    assertTrue(!widgetTimestampIsFresh(now + 180_000, now))
    val curve = WidgetForecastSeries("loop", "Loop", now, listOf(WidgetForecastPoint(now, 100), WidgetForecastPoint(now + 30 * 60_000, 130)))
    val snapshot = WidgetForecastSnapshot(now, now, emptyList(), listOf(curve))
    assertTrue(freshWidgetForecastSeries(snapshot, now - 16 * 60_000, now).isEmpty())
  }

  @Test fun `summary interpolates at the requested future time without moving uploaded points`() {
    val curve = WidgetForecastSeries("loop", "Loop", now, listOf(
      WidgetForecastPoint(now + 28 * 60_000, 120, 100, 140), WidgetForecastPoint(now + 33 * 60_000, 130, 110, 150),
    ))
    val summary = widgetForecastSummary(listOf(curve), now)!!
    assertEquals(now + 30 * 60_000, summary.point.ts)
    assertEquals(124, summary.point.sgv)
    assertEquals(104, summary.point.lower)
    assertEquals(144, summary.point.upper)
  }

  @Test fun `summary labels actual endpoint and never extrapolates short forecasts`() {
    val curve = WidgetForecastSeries("nightscout", "Nightscout AR2", now, listOf(
      WidgetForecastPoint(now, 100), WidgetForecastPoint(now + 27 * 60_000, 120),
    ))
    assertEquals(now + 27 * 60_000, widgetForecastSummary(listOf(curve), now)!!.point.ts)
    assertNull(interpolateWidgetForecast(curve.points, now + 30 * 60_000))
    assertNull(widgetForecastSummary(listOf(curve.copy(points = listOf(WidgetForecastPoint(now + 10 * 60_000, 100)))), now))
  }

  @Test fun `summary prefers calibrated personal curve when no combined curve exists`() {
    val points = listOf(WidgetForecastPoint(now, 100), WidgetForecastPoint(now + 30 * 60_000, 120))
    val loop = WidgetForecastSeries("loop", "Loop", now, points)
    val personal = WidgetForecastSeries("personalized", "Personal", now, points, 82.0, 150, 71.0)
    val summary = widgetForecastSummary(listOf(loop, personal), now)
    assertNotNull(summary)
    assertEquals("personalized", summary!!.series.id)
  }
}
