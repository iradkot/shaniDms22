package com.shanidms22.glucose

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.net.URI
import java.net.URLDecoder
import java.util.TimeZone

class WidgetBasalEstimateTest {
  private val utc = TimeZone.getTimeZone("UTC")
  private val start = widgetParseTimestamp("2026-09-27T00:00:00Z")!!
  private val hour = 3_600_000L

  @Test fun `all shared estimated basal fixtures match TypeScript calculations`() {
    val file = listOf("../../__tests__/fixtures/estimated-basal.json", "../__tests__/fixtures/estimated-basal.json", "__tests__/fixtures/estimated-basal.json")
      .map { java.io.File(it) }.first { it.isFile }
    val fixture = JSONObject(file.readText())
    val cases = fixture.getJSONArray("cases")
    for (index in 0 until cases.length()) {
      val case = cases.getJSONObject(index)
      val name = case.getString("name")
      fun instant(field: String) = widgetParseTimestamp(case.optString(field, fixture.getString(field)))!!
      val from = instant("start"); val until = instant("end"); val observed = instant("observedAt")
      val rows = JSONArray(fixture.getJSONArray("records").toString())
      val extraRows = case.getJSONArray("records")
      for (row in 0 until extraRows.length()) rows.put(extraRows.getJSONObject(row))
      val settings = case.optJSONObject("profile") ?: fixture.getJSONObject("profile")
      val basalProfile = JSONObject().put("startDate", "2026-01-01T00:00:00Z")
        .put("defaultProfile", "Default").put("store", JSONObject().put("Default", JSONObject()
          .put("timezone", settings.getString("timeZone")).put("basal", settings.getJSONArray("entries"))))
      val recorded = calculateWidgetInsulinStats(rows, from, until, observed)!!
      val result = withWidgetBasalEstimate(recorded, rows, basalProfile, from, until, observed, utc)!!
      assertEquals(name, 2.0, result.totalBolus!!, 0.000001)
      if (case.isNull("expectedBasalUnits")) {
        assertNull(name, result.estimatedBasalUnits)
        assertNull(name, result.estimatedTotalUnits)
      } else {
        val expected = case.getDouble("expectedBasalUnits")
        assertEquals(name, expected, result.estimatedBasalUnits!!, 0.000001)
        assertEquals(name, expected + 2.0, result.estimatedTotalUnits!!, 0.000001)
      }
      if (case.has("expectedRecordedBasalUnits"))
        assertEquals(name, case.getDouble("expectedRecordedBasalUnits"), result.totalBasal!!, 0.000001)
    }
  }

  @Test fun `same bolus with different temp basal changes both estimated total and recorded subtotal`() {
    val previous = start - 24 * hour
    val treatments = JSONArray().put(temp(start + hour, 60, 2.0).put("enteredBy", "loop://test").put("amount", 1.8))
      .put(temp(previous + hour, 60, 1.0).put("deliveredUnits", 1.0))
      .put(bolus(start, 2.0)).put(bolus(previous, 2.0))
    val actual = calculateWidgetInsulinComparison(treatments, start + 3 * hour, utc)!!
    val subtotal = widgetInsulinValues(actual.today, actual.yesterday)!!
    assertEquals(WidgetInsulinBasis.PARTIAL, subtotal.basis)
    assertEquals(3.8, subtotal.today, 0.000001)
    assertEquals(3.0, subtotal.baseline, 0.000001)
    assertEquals(0.8, subtotal.today - subtotal.baseline, 0.000001)
    val estimated = calculateWidgetInsulinComparison(treatments, start + 3 * hour, utc,
      profilesByDayStart = mapOf(start to profile(1.0), previous to profile(1.0)))!!
    assertEquals(1.8, estimated.today!!.totalBasal!!, 0.000001)
    assertEquals("partial", estimated.today!!.quality)
    assertEquals(100.0 / 3, estimated.today!!.basalCoveragePercent, 0.000001)
    assertNull(estimated.today!!.totalInsulin)
    assertEquals(3.8, estimated.today!!.estimatedBasalUnits!!, 0.000001)
    assertEquals(5.8, estimated.today!!.estimatedTotalUnits!!, 0.000001)
    val comparison = widgetInsulinValues(estimated.today, estimated.yesterday)!!
    assertEquals(WidgetInsulinBasis.ESTIMATED, comparison.basis)
    assertEquals(0.8, comparison.today - comparison.baseline, 0.000001)
    assertEquals(WidgetInsulinBasis.ESTIMATED, widgetInsulinAmount(estimated.today)!!.basis)
  }

  @Test fun `completed actual span takes precedence over later resume cancellation and rate commands`() {
    val actual = temp(start + hour, 60, 2.0).put("deliveredUnits", 1.8)
    val resumed = JSONArray().put(actual).put(event(start + hour + hour / 2, "Resume Pump"))
    assertEquals(3.8, estimate(resumed).estimatedBasalUnits!!, 0.000001)
    val cancelled = JSONArray().put(actual).put(temp(start + hour + hour / 2, 0, 0.0))
    assertEquals(3.8, estimate(cancelled).estimatedBasalUnits!!, 0.000001)
    val replaced = JSONArray().put(actual).put(temp(start + hour + hour / 2, 30, 0.0))
    assertEquals(3.8, estimate(replaced).estimatedBasalUnits!!, 0.000001)
  }

  @Test fun `invalid completed actual span cannot be hidden by a cancellation before window start`() {
    val invalid = temp(start - hour / 2, 90, 2.0).put("deliveredUnits", "invalid")
    val treatments = JSONArray().put(invalid).put(temp(start - hour / 4, 0, 0.0))
    assertNull(estimate(treatments).estimatedBasalUnits)
    assertEquals(0.0, estimate(treatments).totalBolus!!, 0.0)
  }

  @Test fun `different overlapping carry in facts cannot deduplicate after clipping at midnight`() {
    val rows = JSONArray().put(temp(start - hour, 120, 1.0).put("deliveredUnits", 2.0))
      .put(temp(start - 2 * hour, 180, 1.0).put("deliveredUnits", 3.0))
    val result = estimate(rows)
    assertNull(result.totalBasal)
    assertNull(result.estimatedBasalUnits)
  }

  @Test fun `malformed explicit suspension lifetime cannot become open zero delivery`() {
    val negative = JSONArray().put(event(start, "Suspend Pump").put("duration", -1))
    assertNull(estimate(negative).estimatedBasalUnits)
    val malformedEnd = JSONArray().put(event(start, "Suspend Pump").put("endDate", "invalid"))
    assertNull(estimate(malformedEnd).estimatedBasalUnits)
    val beforeStart = JSONArray().put(event(start, "Suspend Pump").put("endTime", widgetIsoUtc(start - hour)))
    assertNull(estimate(beforeStart).estimatedBasalUnits)
  }

  @Test fun `valid alternate end time retains completed amount despite malformed endDate`() {
    val rows = JSONArray().put(temp(start + hour, 60, 2.0).put("deliveredUnits", 1.8)
      .put("endDate", "invalid").put("endTime", widgetIsoUtc(start + 2 * hour)))
    val result = estimate(rows)
    assertEquals(1.8, result.totalBasal!!, 0.000001)
    assertEquals(3.8, result.estimatedBasalUnits!!, 0.000001)
  }

  @Test fun `invalid or missing profile prevents reconstruction even when temp controls span whole window`() {
    val rows = JSONArray().put(temp(start, 180, 2.0))
    assertNull(estimate(rows, null).estimatedBasalUnits)
    val invalid = profile(1.0).apply { getJSONObject("store").getJSONObject("Default").put("basal", JSONArray()) }
    assertNull(estimate(rows, invalid).estimatedTotalUnits)
    val actual = JSONArray().put(temp(start, 180, 2.0).put("deliveredUnits", 5.0))
    val complete = estimate(actual, null)
    assertEquals(5.0, complete.totalInsulin!!, 0.0)
    assertNull(complete.estimatedTotalUnits)
  }

  @Test fun `textual schedule time must be valid and agree with numeric seconds when both are present`() {
    val inconsistent = profile(1.0).apply {
      getJSONObject("store").getJSONObject("Default").getJSONArray("basal").getJSONObject(0).put("timeAsSeconds", 60)
    }
    assertNull(estimate(JSONArray(), inconsistent).estimatedBasalUnits)
    inconsistent.getJSONObject("store").getJSONObject("Default").getJSONArray("basal").getJSONObject(0)
      .put("timeAsSeconds", 0).put("time", "bad-time")
    assertNull(estimate(JSONArray(), inconsistent).estimatedBasalUnits)
  }

  @Test fun `compact pump aliases and unknown basal controls never silently fall through to schedule`() {
    val compact = JSONArray().put(event(start, "SuspendPump")).put(event(start + hour, "PumpResume"))
    assertEquals(2.0, estimate(compact).estimatedBasalUnits!!, 0.000001)
    assertNull(estimate(JSONArray().put(event(start, "Unknown Basal Delivery"))).estimatedBasalUnits)
    val reset = JSONArray().put(event(start - hour, "Unknown Basal Delivery")).put(event(start - hour / 2, "ResumePump"))
    assertEquals(3.0, estimate(reset).estimatedBasalUnits!!, 0.000001)
    val unknownMode = JSONArray().put(event(start, "Temp Basal").put("duration", 60).put("temp", "unknown").put("rate", 2.0))
    assertNull(estimate(unknownMode).estimatedBasalUnits)
    unknownMode.getJSONObject(0).put("deliveredUnits", 1.8)
    assertEquals(3.8, estimate(unknownMode).estimatedBasalUnits!!, 0.000001)
  }

  @Test fun `zero duration cancellation resumes schedule instead of extending old temp`() {
    val treatments = JSONArray().put(temp(start, 240, 2.0)).put(temp(start + hour, 0, 0.0))
    assertEquals(4.0, estimate(treatments).estimatedBasalUnits!!, 0.000001)
  }

  @Test fun `suspension is zero until resume and midnight carry in replaces baseline once`() {
    val paused = JSONArray().put(event(start, "Suspend Pump")).put(event(start + hour, "Resume Pump"))
    assertEquals(2.0, estimate(paused).estimatedBasalUnits!!, 0.000001)
    val carried = JSONArray().put(temp(start - hour / 2, 90, 2.0))
    assertEquals(4.0, estimate(carried).estimatedBasalUnits!!, 0.000001)
  }

  @Test fun `incomplete mutable dose uses only its elapsed programmed rate`() {
    val treatments = JSONArray().put(temp(start, 60, 2.0).put("enteredBy", "loop://test").put("amount", 9.0).put("isMutable", true))
    val stats = estimate(treatments, end = start + hour / 2)
    assertNull(stats.totalBasal)
    assertEquals(1.0, stats.estimatedBasalUnits!!, 0.000001)
    assertEquals(1.0, stats.estimatedTotalUnits!!, 0.000001)
  }

  @Test fun `percent is relative to profile and explicit absolute takes precedence`() {
    val relative = JSONArray().put(event(start, "Temp Basal").put("duration", 60).put("temp", "percent").put("percent", 50))
    assertEquals(3.5, estimate(relative).estimatedBasalUnits!!, 0.000001)
    relative.getJSONObject(0).put("absolute", 0.0)
    assertEquals(2.0, estimate(relative).estimatedBasalUnits!!, 0.000001)
  }

  @Test fun `malformed profile unknown percent unknown bolus and conflicting amounts never become zero`() {
    val invalid = profile(1.0).apply { getJSONObject("store").getJSONObject("Default").put("timezone", "not/a/timezone") }
    assertNull(estimate(JSONArray(), invalid).estimatedBasalUnits)
    assertNull(estimate(JSONArray(), profile(1.0).put("startDate", widgetIsoUtc(start + hour))).estimatedBasalUnits)
    val unknown = JSONArray().put(event(start, "Temp Basal").put("duration", 60).put("temp", "percent").put("rate", 150))
    assertNull(estimate(unknown).estimatedBasalUnits)
    val conflicts = JSONArray().put(temp(start, 120, 1.0).put("deliveredUnits", 2.0))
      .put(temp(start + hour, 60, 2.0).put("deliveredUnits", 2.0))
    assertNull(estimate(conflicts).estimatedBasalUnits)
    val invalidActual = JSONArray().put(temp(start, 60, 2.0).put("deliveredUnits", "invalid"))
    assertNull(estimate(invalidActual).estimatedBasalUnits)
    val pendingBolus = JSONArray().put(bolus(start, 2.0).put("endDate", widgetIsoUtc(start + 4 * hour)))
    val pending = estimate(pendingBolus)
    assertEquals(3.0, pending.estimatedBasalUnits!!, 0.000001)
    assertNull(pending.totalBolus)
    assertNull(pending.estimatedTotalUnits)
  }

  @Test fun `intraday profile switch leaves estimate unavailable while retaining recorded dose`() {
    val treatments = JSONArray().put(bolus(start, 2.0)).put(event(start + hour, "Profile Switch"))
    val result = estimate(treatments)
    assertEquals(2.0, result.totalBolus!!, 0.0)
    assertNull(result.estimatedTotalUnits)
  }

  @Test fun `unresolved permanent or temporary profile switch carry in cannot use default profile`() {
    val changedAt = start - hour
    val permanent = JSONArray().put(event(changedAt, "Profile Switch").put("duration", 0).put("profile", "Other"))
    assertNull(estimate(permanent).estimatedBasalUnits)
    val temporary = JSONArray().put(event(changedAt, "Profile Change").put("duration", 180).put("percentage", 150))
    assertNull(estimate(temporary).estimatedBasalUnits)
    temporary.getJSONObject(0).put("duration", 10)
    assertEquals(3.0, estimate(temporary).estimatedBasalUnits!!, 0.000001)
  }

  @Test fun `fixed hour and half hour profile zones use their own schedule time`() {
    fun zoned(name: String) = profile(1.0, name).apply {
      getJSONObject("store").getJSONObject("Default").getJSONArray("basal")
        .put(JSONObject().put("time", "06:00").put("value", 2.0))
    }
    assertEquals(3.0, estimate(JSONArray(), zoned("GMT+3")).estimatedBasalUnits!!, 0.000001)
    assertEquals(5.5, estimate(JSONArray(), zoned("GMT+5:30")).estimatedBasalUnits!!, 0.000001)
    assertEquals(5.5, estimate(JSONArray(), zoned("+05:30")).estimatedBasalUnits!!, 0.000001)
  }

  @Test fun `schedule counts actual elapsed hours on spring and fall DST days`() {
    val zone = TimeZone.getTimeZone("America/New_York")
    val basal = profile(1.0, zone.id).apply {
      getJSONObject("store").getJSONObject("Default").getJSONArray("basal")
        .put(JSONObject().put("time", "03:00").put("value", 2.0))
      put("startDate", "2026-01-01T00:00:00Z")
    }
    for ((clock, expected) in listOf("2026-03-08T16:00:00Z" to 20.0, "2026-11-01T17:00:00Z" to 22.0)) {
      val end = widgetParseTimestamp(clock)!!
      val dayStart = widgetStartOfDayMs(end, zone)
      val recorded = calculateWidgetInsulinStats(JSONArray(), dayStart, end)!!
      val result = withWidgetBasalEstimate(recorded, JSONArray(), basal, dayStart, end, end, zone)!!
      assertEquals(clock, expected, result.estimatedBasalUnits!!, 0.000001)
    }
  }

  @Test fun `estimate cache round trip preserves recorded quality and schema two only retains todays facts`() {
    val stats = estimate(JSONArray().put(temp(start, 60, 2.0).put("deliveredUnits", 1.8)))
    val summary = WidgetDailySummary(start, start + 3 * hour, 70, 180, null, WidgetInsulinComparison(stats, stats, stats, 7))
    val raw = JSONObject(widgetDailySummaryJson(summary))
    assertEquals(3, raw.getJSONObject("insulin").getInt("schemaVersion"))
    assertEquals(summary, parseWidgetDailySummary(raw.toString(), start + 3 * hour, utc))
    raw.getJSONObject("insulin").put("schemaVersion", 2)
    val old = parseWidgetDailySummary(raw.toString(), start + 3 * hour, utc)!!.insulin!!
    assertEquals(stats.totalBasal, old.today!!.totalBasal)
    assertEquals(stats.basalCoveragePercent, old.today!!.basalCoveragePercent, 0.0)
    assertNull(old.today!!.estimatedTotalUnits)
    assertNull(old.yesterday)
    assertNull(old.weekAverage)
  }

  @Test fun `weekly estimate requires all seven profiles and partial basal mean preserves all recorded amounts`() {
    val treatments = JSONArray().put(temp(start, 60, 1.0).put("deliveredUnits", 1.0))
    val profiles = (0..7).associate { start - it * 24 * hour to profile(1.0) }.toMutableMap()
    for (day in 1..7) treatments.put(temp(start - day * 24 * hour, 60, 2.0).put("deliveredUnits", day * 0.1))
    val complete = calculateWidgetInsulinComparison(treatments, start + 3 * hour, utc, profilesByDayStart = profiles)!!
    assertEquals(0.4, complete.weekAverage!!.totalBasal!!, 0.000001)
    assertEquals(100.0 / 3, complete.weekAverage!!.basalCoveragePercent, 0.000001)
    assertEquals(2.4, complete.weekAverage!!.estimatedTotalUnits!!, 0.000001)
    profiles.remove(start - 7 * 24 * hour)
    val missing = calculateWidgetInsulinComparison(treatments, start + 3 * hour, utc, profilesByDayStart = profiles)!!
    assertNull(missing.weekAverage!!.estimatedTotalUnits)
    assertEquals(0.4, missing.weekAverage!!.totalBasal!!, 0.000001)
    assertEquals(WidgetInsulinBasis.PARTIAL, widgetInsulinValues(missing.today, missing.weekAverage)!!.basis)
    assertEquals(0.6, widgetInsulinValues(missing.today, missing.weekAverage)!!.let { it.today - it.baseline }, 0.000001)
  }

  @Test fun `production loads as of profiles after today's recorded progress and reuses historical profiles`() {
    val requests = mutableListOf<String>()
    var recordedProgress = false
    var beforeFirstProfile = false
    fun fetch(url: String, secret: String?): JSONArray {
      assertEquals("hashed-secret", secret)
      requests.add(url)
      val uri = URI(url)
      val params = uri.rawQuery.split('&').associate { part ->
        val pieces = part.split('=', limit = 2)
        URLDecoder.decode(pieces[0], "UTF-8") to URLDecoder.decode(pieces[1], "UTF-8")
      }
      return when {
        uri.path.contains("entries") -> JSONArray().put(JSONObject().put("date", start).put("sgv", 100))
        uri.path.contains("treatments") -> JSONArray().put(bolus(start, 2.0))
        else -> {
          assertEquals("/api/v1/profiles", uri.path)
          if (requests.count { it.contains("profiles") } == 1) beforeFirstProfile = recordedProgress
          assertEquals("1", params["count"])
          assertTrue(params.keys.none { it.startsWith("sort[") })
          val cutoff = widgetParseTimestamp(params.getValue("find[startDate][\$lte]"))!!
          val profileDay = widgetStartOfDayMs(cutoff, utc)
          assertTrue(profileDay <= start)
          val daysAgo = ((start - profileDay) / (24 * hour)).toInt()
          JSONArray().put(profile(1.0 + daysAgo).put("startDate", widgetIsoUtc(profileDay)))
        }
      }
    }
    val first = fetchWidgetDailySummary("https://example.test", "hashed-secret", 70, 180, start + 3 * hour, utc,
      onProgress = { if (it.summary.insulin?.today?.totalBolus == 2.0) recordedProgress = true }, fetch = ::fetch)
    assertTrue(beforeFirstProfile)
    assertEquals(8, requests.count { it.contains("profiles") })
    assertEquals(6.0, first.summary.insulin!!.yesterday!!.estimatedTotalUnits!!, 0.000001)
    assertEquals(15.0, first.summary.insulin!!.weekAverage!!.estimatedTotalUnits!!, 0.000001)
    requests.clear()
    val refreshed = fetchWidgetDailySummary("https://example.test", "hashed-secret", 70, 180, start + 3 * hour + 5 * 60_000, utc,
      cachedHistory = first.historyCache, lastHistoryAttemptMs = first.historyAttemptMs ?: 0, fetch = ::fetch)
    assertEquals(1, requests.count { it.contains("profiles") })
    assertTrue(requests.filter { it.contains("profiles") }.single().contains("2026-09-27"))
    assertEquals(7, refreshed.summary.insulin!!.weekDays)
    assertNotNull(refreshed.summary.insulin!!.weekAverage!!.estimatedTotalUnits)
    requests.clear()
    fetchWidgetDailySummary("https://other.test", "hashed-secret", 70, 180, start + 3 * hour + 5 * 60_000, utc,
      cachedHistory = first.historyCache, fetch = ::fetch)
    assertEquals(8, requests.count { it.contains("profiles") })
  }

  private fun estimate(rows: JSONArray, basal: JSONObject? = profile(1.0), end: Long = start + 3 * hour) =
    withWidgetBasalEstimate(calculateWidgetInsulinStats(rows, start, end, end), rows, basal, start, end, end, utc)!!
  private fun event(at: Long, type: String) = JSONObject().put("created_at", widgetIsoUtc(at)).put("eventType", type)
  private fun temp(at: Long, minutes: Int, rate: Double) = event(at, "Temp Basal").put("duration", minutes).put("absolute", rate)
  private fun bolus(at: Long, units: Double) = event(at, "Correction Bolus").put("insulin", units)
  private fun profile(rate: Double, zone: String = "UTC") = JSONObject().put("startDate", "2026-01-01T00:00:00Z")
    .put("defaultProfile", "Default").put("store", JSONObject().put("Default", JSONObject().put("timezone", zone)
      .put("basal", JSONArray().put(JSONObject().put("time", "00:00").put("value", rate)))))
}
