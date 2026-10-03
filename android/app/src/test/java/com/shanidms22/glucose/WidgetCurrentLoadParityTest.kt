package com.shanidms22.glucose

import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class WidgetCurrentLoadParityTest {
  @Test fun `shared current app and widget load fixtures agree`() {
    val fixture = listOf("../../__tests__/fixtures/current-load-parity.json", "../__tests__/fixtures/current-load-parity.json", "__tests__/fixtures/current-load-parity.json")
      .map { File(it) }.first { it.isFile }
    val cases = JSONArray(fixture.readText())
    for (index in 0 until cases.length()) {
      val case = cases.getJSONObject(index)
      val result = parseWidgetLoad(case.getJSONArray("records"), case.getLong("nowMs"))
      val expectedIob = if (case.isNull("iob")) null else case.getDouble("iob")
      val expectedCob = if (case.isNull("cob")) null else case.getDouble("cob")
      assertEquals(case.getString("name"), expectedIob, result.iob)
      assertEquals(case.getString("name"), expectedCob, result.cob)
    }
  }

  @Test fun `future glucose cannot hide the latest observed reading`() {
    val now = 1_800_000_000_000L
    val entries = JSONArray("""[{"date":${now + 1},"sgv":200},{"date":$now,"sgv":110}]""")
    assertEquals(110, latestWidgetBgFromEntries(entries, now)!!.sgv)
    assertEquals(now, latestWidgetBgFromEntries(entries, now)!!.date)
  }
}
