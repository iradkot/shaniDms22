package com.shanidms22.glucose

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.os.Bundle
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.shanidms22.R
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.IOException
import java.util.UUID

/** Exercises the actual background-sync -> preference-store -> launcher path. No real account data. */
@RunWith(AndroidJUnit4::class)
class WidgetDailySyncIntegrationTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()

  @Test fun emptyFreshSummaryStillRequestsForegroundRecovery() = withSource { context ->
    val now = System.currentTimeMillis()
    val source = GlucoseWidgetCredentialStore.readSyncConfiguration(context) as WidgetSyncConfiguration.Ready
    WidgetDailySummaryStore.save(context, source, WidgetDailySyncResult(
      WidgetDailySummary(widgetStartOfDayMs(now), now, 70, 200, null, null), null, null))
    var refreshes = 0
    GlucoseWidgetSync.refreshDailyIfNeeded(context) { refreshes++ }
    assertEquals("A completed but empty fetch must not suppress recovery for five minutes", 1, refreshes)
    GlucoseWidgetSync.refreshDailyIfNeeded(context) { refreshes++ }
    assertEquals("Repeated renders must respect the one-minute retry throttle", 1, refreshes)
  }

  @Test fun dailyRangeReachesLauncherBeforeOptionalInsulinRequests() = withSource { context ->
    val now = System.currentTimeMillis()
    val entries = readings(now)
    var checkedEarlyRange = false
    var earlyRangeWasReady = true
    assertTrue(GlucoseWidgetSync.syncOnce(context) { url, _ ->
      when {
        url.contains("entries.json") -> entries
        url.contains("devicestatus") -> JSONArray()
        else -> {
          checkedEarlyRange = true
          val early = WidgetDailySummaryStore.read(context)
          earlyRangeWasReady = earlyRangeWasReady && early?.range?.inRangePercent == 100
          throw IOException("Simulated optional endpoint outage")
        }
      }
    })
    assertTrue(checkedEarlyRange)
    assertTrue("Today's CGM must be stored before requesting optional insulin history", earlyRangeWasReady)
    val summary = WidgetDailySummaryStore.read(context)
    assertEquals(100, summary?.range?.inRangePercent)
    assertNull(summary?.insulin?.today)
    instrumentation.runOnMainSync {
      val views = GlucoseSummaryWidgetRenderer.build(context, 90328001, Bundle(), summary, 100, "→", now)
      val root = views.apply(context, FrameLayout(context)) as ViewGroup
      assertEquals("100%", root.findViewById<TextView>(R.id.summary_tir).text.toString())
      assertFalse(root.findViewById<TextView>(R.id.summary_coverage).text.toString().contains("No readings"))
    }
  }

  @Test fun optionalHistoryFailureKeepsTodayInsulinAndRange() = withSource { context ->
    val now = System.currentTimeMillis()
    val start = widgetStartOfDayMs(now)
    var treatmentRequest = 0
    assertTrue(GlucoseWidgetSync.syncOnce(context) { url, _ ->
      when {
        url.contains("entries.json") -> readings(now)
        url.contains("devicestatus") -> JSONArray()
        url.contains("treatments") -> {
          treatmentRequest++
          if (treatmentRequest > 1) throw IOException("Simulated historical outage")
          JSONArray()
        }
        url.contains("profiles") -> profile(start)
        else -> error("Unexpected endpoint")
      }
    })
    val summary = WidgetDailySummaryStore.read(context)!!
    assertEquals(100, summary.range!!.inRangePercent)
    assertNotNull(summary.insulin?.today)
    assertTrue(summary.insulin!!.today!!.totalBasal > 0)
    assertNull(summary.insulin!!.weekAverage)
  }

  @Test fun accountReplacementWhileHistoryLoadsCannotRepublishPreviousSummary() = withSource { context ->
    val now = System.currentTimeMillis()
    var switched = false
    GlucoseWidgetSync.syncOnce(context) { url, _ ->
      when {
        url.contains("entries.json") -> readings(now)
        url.contains("devicestatus") -> JSONArray()
        else -> {
          if (!switched) {
            switched = true
            context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE).edit()
              .putString(GlucoseSyncWorker.KEY_BASE_URL, "https://replacement.invalid").commit()
            GlucoseWidgetUpdater.clear(context)
          }
          JSONArray()
        }
      }
    }
    assertTrue(switched)
    assertNull(WidgetDailySummaryStore.read(context))
  }

  private fun readings(now: Long): JSONArray {
    val result = JSONArray()
    var ts = widgetStartOfDayMs(now) - 5 * 60_000L
    while (ts <= now) {
      result.put(JSONObject().put("_id", ts.toString()).put("date", ts).put("sgv", 100).put("direction", "Flat"))
      ts += 5 * 60_000L
    }
    return result
  }

  private fun profile(start: Long) = JSONArray().put(JSONObject()
    .put("_id", "schedule").put("startDate", widgetIsoUtc(start - 10 * 86_400_000L))
    .put("defaultProfile", "Default").put("store", JSONObject().put("Default", JSONObject()
      .put("timezone", "UTC").put("basal", JSONArray().put(JSONObject().put("time", "00:00").put("value", 1))))))

  private fun withSource(block: (Context) -> Unit) {
    val context = IsolatedContext(instrumentation.targetContext)
    try {
      context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE).edit()
        .putBoolean(GlucoseSyncWorker.KEY_ENABLED, true)
        .putString(GlucoseSyncWorker.KEY_BASE_URL, "https://widget-test.invalid").commit()
      GlucoseWidgetUpdater.setThresholds(context, 70, 200)
      block(context)
    } finally { context.cleanUp() }
  }

  private class IsolatedContext(base: Context) : ContextWrapper(base) {
    private val prefix = "daily_sync_test_${UUID.randomUUID()}_"
    private val files = mutableSetOf<String>()
    override fun getApplicationContext(): Context = this
    override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
      val isolated = prefix + name
      files.add(isolated)
      return baseContext.getSharedPreferences(isolated, mode)
    }
    fun cleanUp() = files.forEach {
      baseContext.getSharedPreferences(it, Context.MODE_PRIVATE).edit().clear().commit()
      baseContext.deleteSharedPreferences(it)
    }
  }
}
