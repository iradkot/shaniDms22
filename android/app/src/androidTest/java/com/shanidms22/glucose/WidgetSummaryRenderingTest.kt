package com.shanidms22.glucose

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.RemoteViews
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.shanidms22.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.Locale
import java.util.UUID
import kotlin.math.roundToInt

/** Applies the real launcher RemoteViews on Android and exports reviewable native screenshots. */
@RunWith(AndroidJUnit4::class)
class WidgetSummaryRenderingTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val widgetId = 90327001

  private data class Size(val widthDp: Int, val heightDp: Int)

  @Test fun fullWidgetShowsRangeAndInsulinVisually() = render("full-en", Size(340, 300),
    build = { context, options -> views(context, options, fixture()) },
    verify = { root ->
      assertReadable(root, "82", "Basal", "Bolus")
      assertTrue("Range and insulin must include graphical summaries", images(root).count { it.drawable != null } >= 2)
    })

  @Test fun compactWidgetKeepsRangeAndInsulinVisible() = render("compact-en", Size(240, 180),
    build = { context, options -> views(context, options, fixture()) },
    verify = { root -> assertReadable(root, "82", "26") })

  @Test fun minimumWidgetSizeKeepsRangeAndInsulinVisible() = render("minimum-en", Size(180, 110),
    build = { context, options -> views(context, options, fixture()) },
    verify = { root -> assertReadable(root, "82", "26") })

  @Test fun minimumHebrewWidgetKeepsRangeAndInsulinVisible() = render("minimum-he", Size(180, 110), language = "he",
    build = { context, options -> views(context, options, fixture()) },
    verify = { root ->
      assertReadable(root, "82", "26")
      assertEquals(View.LAYOUT_DIRECTION_RTL, root.layoutDirection)
      assertTrue("Hebrew labels must be visible at minimum size", textViews(root).any {
        it.text.any { letter -> letter in '\u0590'..'\u05FF' }
      })
    })

  @Test fun minimumWidgetAtLargerFontKeepsPrimaryMetricsVisible() = render("minimum-large-font-en", Size(180, 110), fontScale = 1.3f,
    build = { context, options -> views(context, options, fixture()) },
    verify = { root -> assertReadable(root, "82", "26") })

  @Test fun defaultWidgetSizeKeepsRangeAndInsulinVisible() = render("default-en", Size(250, 250),
    build = { context, options -> views(context, options, fixture()) },
    verify = { root -> assertReadable(root, "82", "26") })

  @Test fun mediumHeightKeepsRangeAndInsulinVisible() = render("medium-en", Size(250, 220),
    build = { context, options -> views(context, options, fixture()) },
    verify = { root -> assertReadable(root, "82", "26") })

  @Test fun hebrewWidgetRendersRightToLeft() = render("full-he", Size(340, 300), language = "he",
    build = { context, options -> views(context, options, fixture()) },
    verify = { root ->
      assertReadable(root, "82", "26")
      assertEquals(View.LAYOUT_DIRECTION_RTL, root.layoutDirection)
      assertTrue("Hebrew labels must be visible", textViews(root).any { it.text.any { letter -> letter in '\u0590'..'\u05FF' } })
    })

  @Test fun missingDataDoesNotBecomeZeroPercentOrZeroInsulin() = render("missing-en", Size(340, 300),
    build = { context, options -> views(context, options, null) },
    verify = { root ->
      assertReadable(root)
      val visibleText = textViews(root).joinToString("\n") { it.text.toString() }
      assertFalse("Missing range is not 0%", Regex("(?<![0-9])0%").containsMatchIn(visibleText))
      assertFalse("Missing insulin is not zero", Regex("(?<![0-9])0(?:\\.0)?\\s*U").containsMatchIn(visibleText))
    })

  @Test fun enlargedFontKeepsPrimaryMetricsVisible() = render("large-font-en", Size(340, 360), fontScale = 1.3f,
    build = { context, options -> views(context, options, fixture()) },
    verify = { root -> assertReadable(root, "82", "26") })

  @Test fun partialBasalShowsRecordedBolusAndComparesBolusOnly() = render("partial-recorded-en", Size(340, 300),
    build = { context, options ->
      val partial = WidgetInsulinComparison(
        widgetInsulinStats(2.0, 8.0, 20.0, 60_000, "partial"),
        widgetInsulinStats(3.0, 6.0, 30.0, 90_000, "partial"), null, 0)
      views(context, options, fixture().copy(insulin = partial))
    },
    verify = { root ->
      assertReadable(root, "82", "8.0")
      assertTrue(root.findViewById<TextView>(R.id.summary_insulin_title).text.contains("Bolus today"))
      assertTrue(root.findViewById<TextView>(R.id.summary_basal).text.contains("incomplete"))
      assertTrue(root.findViewById<TextView>(R.id.summary_comparison_title).text.contains("Bolus"))
      assertTrue(root.findViewById<TextView>(R.id.summary_comparison_delta).text.contains("+2.0"))
      assertFalse(textViews(root).any { it.text.contains("estimated") || it.text.contains("≈") })
    })

  @Test fun weeklyComparisonSelectionRendersDistinctPeriod() = render("week-en", Size(340, 300),
    build = { context, options ->
      assertFalse(GlucoseSummaryWidgetPreferences.isWeek(context, widgetId))
      GlucoseSummaryWidgetPreferences.toggle(context, widgetId)
      assertTrue(GlucoseSummaryWidgetPreferences.isWeek(context, widgetId))
      views(context, options, fixture())
    },
    verify = { root ->
      assertReadable(root, "82")
      assertTrue("Weekly comparison label must be explicit", textViews(root).any {
        it.text.toString().contains("week", ignoreCase = true) || it.text.toString().contains("7")
      })
    })

  @Test fun comparisonPreferenceBelongsToEachWidget() {
    val context = RenderingContext(instrumentation.targetContext, "preferences")
    try {
      assertFalse(GlucoseSummaryWidgetPreferences.isWeek(context, widgetId))
      GlucoseSummaryWidgetPreferences.toggle(context, widgetId)
      assertTrue(GlucoseSummaryWidgetPreferences.isWeek(context, widgetId))
      assertFalse(GlucoseSummaryWidgetPreferences.isWeek(context, widgetId + 1))
      GlucoseSummaryWidgetPreferences.toggle(context, widgetId)
      assertFalse(GlucoseSummaryWidgetPreferences.isWeek(context, widgetId))
      GlucoseSummaryWidgetPreferences.toggle(context, widgetId)
      GlucoseSummaryWidgetPreferences.toggle(context, widgetId + 1)
      GlucoseSummaryWidgetPreferences.remove(context, intArrayOf(widgetId))
      assertFalse(GlucoseSummaryWidgetPreferences.isWeek(context, widgetId))
      assertTrue(GlucoseSummaryWidgetPreferences.isWeek(context, widgetId + 1))
    } finally { context.cleanUp() }
  }

  private fun fixture(): WidgetDailySummary {
    val now = System.currentTimeMillis()
    return WidgetDailySummary(widgetStartOfDayMs(now), now, 70, 180,
      WidgetDailyRange(4, 82, 14, 96, 650),
      WidgetInsulinComparison(
        WidgetInsulinStats(18.0, 8.0, 18.0 / 26.0, 26.0),
        WidgetInsulinStats(16.0, 7.0, 16.0 / 23.0, 23.0),
        WidgetInsulinStats(19.0, 9.0, 19.0 / 28.0, 28.0), 7))
  }

  private fun views(context: Context, options: Bundle, summary: WidgetDailySummary?): RemoteViews =
    GlucoseSummaryWidgetRenderer.build(context, widgetId, options, summary,
      if (summary == null) null else 124, "→", summary?.updatedAtMs)

  /** Renderer preferences are isolated from the installed app, even on a reused test device. */
  private class RenderingContext(base: Context, prefix: String) : ContextWrapper(base) {
    private val scopePrefix = "${prefix}_${UUID.randomUUID()}"
    private val files = mutableSetOf<String>()
    override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
      val isolated = "widget_summary_qa_${scopePrefix}_$name"
      files.add(isolated)
      return baseContext.getSharedPreferences(isolated, mode)
    }
    fun cleanUp() {
      files.forEach { name ->
        // commit waits for queued apply writes; deleting first can let a queued write recreate the file.
        check(baseContext.getSharedPreferences(name, Context.MODE_PRIVATE).edit().clear().commit())
        baseContext.deleteSharedPreferences(name)
      }
    }
  }

  private fun render(
    name: String,
    size: Size,
    language: String = "en",
    fontScale: Float = 1f,
    build: (Context, Bundle) -> RemoteViews,
    verify: (View) -> Unit,
  ) {
    var failure: Throwable? = null
    instrumentation.runOnMainSync {
      try {
        val configuration = Configuration(instrumentation.targetContext.resources.configuration).apply {
          setLocale(Locale.forLanguageTag(language))
          setLayoutDirection(Locale.forLanguageTag(language))
          this.fontScale = fontScale
        }
        val context = RenderingContext(instrumentation.targetContext.createConfigurationContext(configuration), name)
        try {
          val options = Bundle().apply {
            putInt(android.appwidget.AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, size.widthDp)
            putInt(android.appwidget.AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, size.widthDp)
            putInt(android.appwidget.AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, size.heightDp)
            putInt(android.appwidget.AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, size.heightDp)
          }
          val host = FrameLayout(context).apply { layoutDirection = configuration.layoutDirection }
          val content = build(context, options).apply(context, host)
          host.addView(content)
          val density = context.resources.displayMetrics.density
          val width = (size.widthDp * density).roundToInt()
          val height = (size.heightDp * density).roundToInt()
          host.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
          host.layout(0, 0, width, height)
          val output = File(instrumentation.targetContext.getExternalFilesDir(null), "widget-summary-qa")
          assertTrue("Cannot create screenshot directory", output.isDirectory || output.mkdirs())
          val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          host.draw(Canvas(bitmap))
          File(output, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
          bitmap.recycle()
          assertEquals(width, content.width)
          assertEquals(height, content.height)
          assertGraphicsFit(content)
          assertPrimaryMetricsFit(content)
          assertSupportingTextFitsVertically(content)
          verify(content)
        } finally { context.cleanUp() }
      } catch (error: Throwable) {
        failure = error
      }
    }
    failure?.let { throw it }
  }

  private fun textViews(view: View): List<TextView> = when (view) {
    is TextView -> if (view.visibility == View.VISIBLE) listOf(view) else emptyList()
    is ViewGroup -> if (view.visibility == View.VISIBLE) (0 until view.childCount).flatMap {
      textViews(view.getChildAt(it))
    } else emptyList()
    else -> emptyList()
  }

  private fun images(view: View): List<ImageView> = when (view) {
    is ImageView -> if (view.visibility == View.VISIBLE) listOf(view) else emptyList()
    is ViewGroup -> if (view.visibility == View.VISIBLE) (0 until view.childCount).flatMap {
      images(view.getChildAt(it))
    } else emptyList()
    else -> emptyList()
  }

  private fun assertGraphicsFit(root: View) {
    val parent = root as ViewGroup
    images(root).filter { it.drawable != null }.forEach { image ->
      val bounds = Rect(0, 0, image.width, image.height)
      parent.offsetDescendantRectToMyCoords(image, bounds)
      assertTrue("Graphic has no visible space: $bounds", image.width > 0 && image.height > 0)
      assertTrue("Graphic clipped by widget: $bounds inside ${root.width}x${root.height}",
        bounds.left >= 0 && bounds.top >= 0 && bounds.right <= root.width && bounds.bottom <= root.height)
      var ancestor = image.parent as? ViewGroup
      while (ancestor != null) {
        val localBounds = Rect(0, 0, image.width, image.height)
        ancestor.offsetDescendantRectToMyCoords(image, localBounds)
        if (ancestor.clipChildren) assertTrue("Graphic clipped by its panel: $localBounds inside ${ancestor.width}x${ancestor.height}",
          localBounds.left >= 0 && localBounds.top >= 0 && localBounds.right <= ancestor.width && localBounds.bottom <= ancestor.height)
        if (ancestor == root) break
        ancestor = ancestor.parent as? ViewGroup
      }
    }
  }

  private fun assertPrimaryMetricsFit(root: View) {
    val parent = root as ViewGroup
    listOf(R.id.summary_tir, R.id.summary_insulin_total).forEach { id ->
      val metric = root.findViewById<TextView>(id)
      val name = root.resources.getResourceEntryName(id)
      val bounds = Rect(0, 0, metric.width, metric.height)
      parent.offsetDescendantRectToMyCoords(metric, bounds)
      assertTrue("$name extends outside widget: $bounds", bounds.left >= 0 && bounds.top >= 0 &&
        bounds.right <= root.width && bounds.bottom <= root.height)
      val layout = metric.layout
      assertTrue("$name has no text layout", layout != null && layout.lineCount > 0)
      assertTrue("$name is vertically clipped", layout.getLineBottom(layout.lineCount - 1) <=
        metric.height - metric.compoundPaddingTop - metric.compoundPaddingBottom)
      for (line in 0 until layout.lineCount) {
        assertEquals("$name is ellipsized", 0, layout.getEllipsisCount(line))
        assertTrue("$name is horizontally clipped", layout.getLineWidth(line) <=
          metric.width - metric.compoundPaddingLeft - metric.compoundPaddingRight + 1)
      }
    }
  }

  private fun assertSupportingTextFitsVertically(root: View) {
    val parent = root as ViewGroup
    listOf(R.id.summary_freshness, R.id.summary_coverage, R.id.summary_basal, R.id.summary_bolus,
      R.id.summary_comparison_title, R.id.summary_glucose).forEach { id ->
      val text = root.findViewById<TextView>(id) ?: return@forEach
      if (text.visibility != View.VISIBLE || text.text.isBlank()) return@forEach
      val name = root.resources.getResourceEntryName(id)
      val bounds = Rect(0, 0, text.width, text.height)
      parent.offsetDescendantRectToMyCoords(text, bounds)
      assertTrue("$name extends vertically outside widget: $bounds", bounds.top >= 0 && bounds.bottom <= root.height)
      val layout = text.layout
      assertTrue("$name has no text layout", layout != null && layout.lineCount > 0)
      assertTrue("$name is vertically clipped", layout.getLineBottom(layout.lineCount - 1) <=
        text.height - text.compoundPaddingTop - text.compoundPaddingBottom)
    }
  }

  private fun assertReadable(root: View, vararg expectedText: String) {
    val visible = textViews(root)
    val allText = visible.joinToString("\n") { it.text.toString() }
    expectedText.forEach { assertTrue("Missing '$it' in $allText", allText.contains(it)) }
    assertFalse("Non-finite metric displayed: $allText", allText.contains("NaN") || allText.contains("Infinity"))
    visible.filter { it.text.isNotBlank() }.forEach { view ->
      val name = if (view.id == View.NO_ID) view.javaClass.simpleName else root.resources.getResourceEntryName(view.id)
      assertTrue("$name has no available width", view.width > 0)
      assertTrue("$name has no available height", view.height > 0)
    }
    expectedText.forEach { expected ->
      assertTrue("Primary metric '$expected' is clipped", visible.filter { it.text.contains(expected) }.any { view ->
        val layout = view.layout
        layout != null && layout.lineCount > 0 && (0 until layout.lineCount).all { layout.getEllipsisCount(it) == 0 } &&
          layout.getLineBottom(layout.lineCount - 1) <= view.height - view.compoundPaddingTop - view.compoundPaddingBottom
      })
    }
  }
}
