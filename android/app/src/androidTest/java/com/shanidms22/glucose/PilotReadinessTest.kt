package com.shanidms22.glucose

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.shanidms22.BuildConfig
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/** Exercises real Android preferences/rendering with synthetic data in isolated storage. */
@RunWith(AndroidJUnit4::class)
class PilotReadinessTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()

  private class IsolatedContext(base: Context) : ContextWrapper(base) {
    private val prefix = "pilot_readiness_${UUID.randomUUID()}_"
    private val names = mutableSetOf<String>()
    override fun getApplicationContext(): Context = this
    override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
      val isolated = "$prefix$name"
      names.add(isolated)
      return baseContext.getSharedPreferences(isolated, mode)
    }
    fun cleanUp() {
      names.forEach { name ->
        check(baseContext.getSharedPreferences(name, Context.MODE_PRIVATE).edit().clear().commit())
        baseContext.deleteSharedPreferences(name)
      }
    }
  }

  @Test fun pilotCannotRestoreExperimentalForecastsAfterUpgrade() {
    // Reflection reads the installed target class, rather than constants inlined
    // into the instrumentation APK when it was compiled.
    assertEquals("pilot", BuildConfig::class.java.getField("SHANI_RELEASE_CHANNEL").get(null))
    assertFalse("This suite must run against a restricted pilot binary",
      BuildConfig::class.java.getField("SHANI_EXPERIMENTAL_FEATURES_ENABLED").getBoolean(null))
    assertFalse("Acceptance checks must use the normal app, without an E2E login bypass",
      BuildConfig::class.java.getField("E2E").getBoolean(null))
    val context = IsolatedContext(instrumentation.targetContext)
    try {
      val prefs = context.getSharedPreferences("glucose_live_prefs", Context.MODE_PRIVATE)
      val now = System.currentTimeMillis()
      val retained = widgetForecastSnapshotJson(WidgetForecastSnapshot(now, now,
        listOf(WidgetEntryPoint(now, 123, null)), emptyList()))
      check(context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
        .edit().putString(GlucoseSyncWorker.KEY_BASE_URL, "https://fixture.example").commit())
      check(prefs.edit().putString("forecast_shared_v1", retained)
        .putString("forecast_native_v1", retained)
        .putString("forecast_account_v1", "https://fixture.example")
        .putInt("projected1", 150).commit())
      GlucoseWidgetUpdater.updateWidgets(context)
      assertFalse(prefs.contains("forecast_shared_v1"))
      assertFalse(prefs.contains("forecast_native_v1"))
      assertFalse(prefs.contains("projected1"))
      assertTrue(prefs.getString("history_timed_v1", "").orEmpty().contains("$now:123"))
      GlucoseWidgetUpdater.saveForecast(context, "https://fixture.example", "{}");
      assertFalse(prefs.contains("forecast_shared_v1"))
    } finally { context.cleanUp() }
  }

  @Test fun disabledBackgroundOrOlderRefreshDoesNotReplaceLastReading() {
    val context = IsolatedContext(instrumentation.targetContext)
    try {
      val now = System.currentTimeMillis()
      fun save(value: Int, timestamp: Long) = GlucoseWidgetUpdater.save(context,
        value, "→", timestamp, null, null, null, null, null, null, null,
        null, null, null, 70, 180)
      save(123, now)
      assertFalse(GlucoseWidgetSync.syncOnce(context))
      assertEquals(123, context.getSharedPreferences("glucose_live_prefs", Context.MODE_PRIVATE).getInt("value", -1))
      save(40, now - 60_000)
      val prefs = context.getSharedPreferences("glucose_live_prefs", Context.MODE_PRIVATE)
      assertEquals(123, prefs.getInt("value", -1))
      assertEquals(now, prefs.getLong("timestamp", -1))
      assertFalse(prefs.contains("iob"))
      assertFalse(prefs.contains("cob"))
    } finally { context.cleanUp() }
  }

  @Test fun staleReadingIsExplicitInTheActualWidgetView() {
    val context = IsolatedContext(instrumentation.targetContext)
    try {
      instrumentation.runOnMainSync {
        val views = GlucoseSummaryWidgetRenderer.build(context, 90210001, null,
          null, 123, "→", System.currentTimeMillis() - 60 * 60_000L)
        val root = views.apply(context, FrameLayout(context))
        val texts = mutableListOf<String>()
        fun visit(view: View) {
          if (view is TextView) texts.add(view.text.toString())
          if (view is ViewGroup) for (index in 0 until view.childCount) visit(view.getChildAt(index))
        }
        visit(root)
        val presentation = texts.joinToString(" ")
        assertTrue("An old glucose reading must say it is old", Regex("old|stale|לא עדכני|ישן", RegexOption.IGNORE_CASE).containsMatchIn(presentation))
        assertFalse("Unknown insulin must not be presented as 0 U", Regex("(?<![0-9])0(?:\\.0)?\\s*U").containsMatchIn(presentation))
      }
    } finally { context.cleanUp() }
  }
}
