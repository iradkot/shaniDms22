package com.shanidms22.glucose

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.net.Uri
import android.os.Bundle
import android.text.SpannableString
import android.text.Spanned
import android.text.BidiFormatter
import android.text.TextDirectionHeuristics
import android.text.style.ForegroundColorSpan
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import com.shanidms22.MainActivity
import com.shanidms22.R
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import kotlin.math.abs
import kotlin.math.roundToInt

/** Compare the same recorded component on both days; a partial total is never comparable. */
internal fun widgetInsulinComparison(today: WidgetInsulinStats?, baseline: WidgetInsulinStats?): Pair<Double, Double>? {
  if (today?.totalInsulin != null && baseline?.totalInsulin != null) return today.totalInsulin to baseline.totalInsulin
  if (today?.totalBolus != null && baseline?.totalBolus != null) return today.totalBolus to baseline.totalBolus
  return null
}

/** Only launcher presentation preferences; account changes never overwrite the chosen comparison. */
internal object GlucoseSummaryWidgetPreferences {
  private fun prefs(context: Context) = context.getSharedPreferences("glucose_summary_widget_ui_v1", Context.MODE_PRIVATE)
  fun isWeek(context: Context, widgetId: Int): Boolean = prefs(context).getBoolean("week_$widgetId", false)
  fun toggle(context: Context, widgetId: Int) {
    prefs(context).edit().putBoolean("week_$widgetId", !isWeek(context, widgetId)).apply()
  }
  fun remove(context: Context, widgetIds: IntArray) {
    val editor = prefs(context).edit()
    widgetIds.forEach { editor.remove("week_$it") }
    editor.apply()
  }
  fun restore(context: Context, oldIds: IntArray, newIds: IntArray) {
    val choices = oldIds.map { isWeek(context, it) }
    val editor = prefs(context).edit()
    oldIds.forEach { editor.remove("week_$it") }
    newIds.zip(choices).forEach { (id, week) -> editor.putBoolean("week_$id", week) }
    editor.apply()
  }
}

/** Native text remains selectable by accessibility services; bitmaps contain only visual geometry. */
internal object GlucoseSummaryWidgetRenderer {
  private val teal = Color.rgb(104, 223, 199)
  private val violet = Color.rgb(190, 167, 255)
  private val lowColor = Color.rgb(255, 148, 163)
  private val highColor = Color.rgb(244, 194, 118)
  private val track = Color.rgb(48, 66, 90)
  private val muted = Color.rgb(166, 183, 204)
  private const val MISSING = "—"

  fun build(
    context: Context,
    widgetId: Int,
    options: Bundle?,
    summary: WidgetDailySummary?,
    glucose: Int?,
    trend: String,
    glucoseTimestampMs: Long?,
  ): RemoteViews {
    val height = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 250)?.takeIf { it > 0 } ?: 250
    val width = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 280)?.takeIf { it > 0 } ?: 280
    val compact = height < 240 || width < 230
    val views = RemoteViews(context.packageName, if (compact) R.layout.glucose_widget_compact else R.layout.glucose_widget)
    val range = summary?.range
    val stats = summary?.insulin?.today
    val week = GlucoseSummaryWidgetPreferences.isWeek(context, widgetId)
    val baseline = if (week) summary?.insulin?.weekAverage else summary?.insulin?.yesterday
    val now = System.currentTimeMillis()
    val freshness = freshness(context, glucoseTimestampMs, now)
    val stale = glucoseTimestampMs == null || now - glucoseTimestampMs > 15 * 60_000L
    val glucoseClock = glucoseTimestampMs?.takeIf { it > 0 }?.let {
      val pattern = if (widgetStartOfDayMs(it) == widgetStartOfDayMs(now)) "HH:mm" else "dd/MM HH:mm"
      SimpleDateFormat(pattern, context.resources.configuration.locales[0]).format(Date(it))
    }
    val visibleGlucoseTime = if (glucoseClock == null) context.getString(R.string.summary_waiting) else context.getString(
      if (stale) R.string.summary_glucose_clock_stale else R.string.summary_glucose_clock, glucoseClock,
    )
    val summaryStale = summary == null || now - summary.updatedAtMs > 20 * 60_000L
    val number = NumberFormat.getNumberInstance(context.resources.configuration.locales[0]).apply {
      minimumFractionDigits = 1
      maximumFractionDigits = 1
    }
    fun ltrToken(value: String): String = BidiFormatter.getInstance(isRtl(context)).unicodeWrap(value, TextDirectionHeuristics.LTR)
    fun amount(value: Double?): String = value?.takeIf { it.isFinite() && it >= 0 }?.let { number.format(it) } ?: MISSING
    fun unit(value: Double?): String = ltrToken(context.getString(R.string.summary_units, amount(value)))
    fun percent(value: Int?): String = ltrToken(value?.let { "$it%" } ?: MISSING)
    val todayTotal = stats?.totalInsulin
    val basalShare = stats?.totalBasal?.takeIf { todayTotal != null && todayTotal > 0 }
      ?.let { (it / todayTotal!! * 100).roundToInt().coerceIn(0, 100) }
    val bolusShare = basalShare?.let { 100 - it }
    val bolusOnly = todayTotal == null && stats?.totalBolus != null
    val comparison = widgetInsulinComparison(stats, baseline)
    val comparedToday = comparison?.first
    val comparedBaseline = comparison?.second
    val comparingBolus = comparison != null && (todayTotal == null || baseline?.totalInsulin == null)
    val rangeDescription = if (range != null && summary != null) context.getString(
      R.string.summary_range_description, percent(range.inRangePercent), percent(range.lowPercent), percent(range.highPercent),
      summary.low, summary.high, range.coveragePercent,
    ) else context.getString(R.string.summary_no_today_data)
    val insulinDescription = if (stats != null && todayTotal != null) context.getString(
      R.string.summary_insulin_description, amount(todayTotal), amount(stats.totalBasal), percent(basalShare), amount(stats.totalBolus), percent(bolusShare),
    ) else if (stats != null) context.getString(
      R.string.summary_insulin_partial_description, amount(stats.totalBolus), amount(stats.totalBasal), stats.basalCoveragePercent.roundToInt(),
    ) else context.getString(R.string.summary_waiting)
    val comparisonLabel = context.getString(if (week) R.string.summary_week_average else R.string.summary_yesterday)
    val comparisonTitle = context.getString(when {
      comparingBolus && week -> R.string.summary_compare_bolus_week
      comparingBolus -> R.string.summary_compare_bolus_yesterday
      week -> R.string.summary_compare_week
      else -> R.string.summary_compare_yesterday
    })
    val delta = if (comparedToday != null && comparedBaseline != null) {
      val difference = comparedToday - comparedBaseline
      val sign = if (abs(difference) < 0.05) "" else if (difference > 0) "+" else "−"
      ltrToken(context.getString(R.string.summary_units, sign + number.format(abs(difference))))
    } else MISSING

    views.setTextViewText(R.id.summary_glucose, "${glucose ?: MISSING} ${trend.ifBlank { "•" }}")
    views.setTextColor(R.id.summary_glucose, if (stale) muted else Color.rgb(243, 247, 255))
    views.setContentDescription(R.id.summary_glucose, context.getString(
      R.string.summary_glucose_description, glucose?.toString() ?: MISSING, trendDescription(context, trend), freshness,
    ))
    views.setTextViewText(R.id.summary_tir, percent(range?.inRangePercent))
    views.setTextColor(R.id.summary_tir, if (range == null) muted else teal)
    views.setContentDescription(R.id.summary_range_panel, rangeDescription)
    views.setImageViewBitmap(R.id.summary_range_ring, if (compact) rangeBar(range, isRtl(context)) else rangeRing(range))
    val summaryTime = summary?.updatedAtMs?.let { SimpleDateFormat("HH:mm", context.resources.configuration.locales[0]).format(Date(it)) } ?: MISSING
    val summaryWindow = ltrToken("00:00–$summaryTime")
    val coverage = if (range == null) context.getString(R.string.summary_no_today_data) else context.getString(
      when { summaryStale -> R.string.summary_coverage_stale; compact -> R.string.summary_coverage_short; else -> R.string.summary_coverage },
      range.coveragePercent, summaryTime,
    )
    views.setTextViewText(R.id.summary_coverage, coverage)
    views.setContentDescription(R.id.summary_coverage, "$coverage. ${freshness(context, summary?.updatedAtMs, now)}")
    views.setTextColor(R.id.summary_coverage, if (range != null && (range.coveragePercent < 70 || summaryStale)) highColor else muted)
    views.setImageViewBitmap(R.id.summary_insulin_split, insulinBar(stats, isRtl(context)))
    views.setContentDescription(R.id.summary_insulin_split, insulinDescription)
    val headline = unit(if (bolusOnly) stats?.totalBolus else todayTotal)
    views.setTextViewText(R.id.summary_insulin_total, if (compact && bolusOnly) context.getString(R.string.summary_bolus_compact, headline) else headline)
    views.setContentDescription(R.id.summary_insulin_total, insulinDescription)
    views.setTextViewText(R.id.summary_comparison_title, if (compact) context.getString(R.string.summary_compare_compact, comparisonTitle, delta) else comparisonTitle)
    views.setContentDescription(R.id.summary_comparison_button, context.getString(
      R.string.summary_comparison_description, amount(comparedToday), comparisonLabel, amount(comparedBaseline), delta,
    ))

    if (compact) {
      // Keep the distribution bar visible in legacy 110dp widgets with enlarged system text.
      if (height <= 120 && context.resources.configuration.fontScale > 1.15f) {
        views.setTextViewTextSize(R.id.summary_tir, TypedValue.COMPLEX_UNIT_SP, 22f)
      }
      val splitText = if (todayTotal == null) context.getString(R.string.summary_basal_incomplete)
        else context.getString(R.string.summary_split_compact, percent(basalShare), percent(bolusShare))
      val split = splitText.indexOf('·')
      val legend = SpannableString(splitText)
      if (split >= 0) {
        legend.setSpan(ForegroundColorSpan(teal), 0, split, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        legend.setSpan(ForegroundColorSpan(violet), split + 1, legend.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      }
      views.setTextViewText(R.id.summary_compact_split_legend, legend)
      views.setTextViewText(R.id.summary_day, if (glucoseClock == null || stale) visibleGlucoseTime else context.getString(R.string.summary_compact_clock, glucoseClock))
      views.setTextViewTextSize(R.id.summary_compact_split_legend, TypedValue.COMPLEX_UNIT_SP, if (width < 210) 8f else 10f)
    } else {
      views.setTextViewText(R.id.summary_comparison_delta, delta)
      views.setTextViewText(R.id.summary_freshness, visibleGlucoseTime)
      views.setTextColor(R.id.summary_freshness, if (stale) highColor else muted)
      val thresholds = if (summary == null) GlucoseWidgetUpdater.getRangeThresholds(context) else Pair(summary.low, summary.high)
      views.setTextViewText(R.id.summary_thresholds, context.getString(R.string.summary_thresholds, thresholds.first, thresholds.second))
      views.setTextViewText(R.id.summary_low, context.getString(R.string.summary_low, percent(range?.lowPercent)))
      views.setTextViewText(R.id.summary_in_range, context.getString(R.string.summary_in_range, percent(range?.inRangePercent)))
      views.setTextViewText(R.id.summary_high, context.getString(R.string.summary_high, percent(range?.highPercent)))
      views.setTextViewText(R.id.summary_insulin_title, context.getString(
        if (bolusOnly) R.string.summary_bolus_until else R.string.summary_insulin_until, summaryWindow,
      ))
      views.setTextViewText(R.id.summary_basal, if (todayTotal == null) context.getString(R.string.summary_basal_incomplete)
        else context.getString(R.string.summary_basal, unit(stats?.totalBasal), percent(basalShare)))
      views.setTextViewText(R.id.summary_bolus, if (bolusShare == null) context.getString(R.string.summary_bolus_compact, unit(stats?.totalBolus))
        else context.getString(R.string.summary_bolus, unit(stats?.totalBolus), percent(bolusShare)))
      views.setTextViewText(R.id.summary_comparison_hint, when {
        comparison == null -> context.getString(R.string.summary_compare_unavailable)
        else -> context.getString(R.string.summary_compare_until, summaryWindow)
      })
      views.setViewVisibility(R.id.summary_comparison_bars, if (height >= 300) View.VISIBLE else View.GONE)
      views.setTextViewText(R.id.summary_today_value, unit(comparedToday))
      views.setTextViewText(R.id.summary_baseline_label, comparisonLabel)
      views.setTextViewText(R.id.summary_baseline_value, unit(comparedBaseline))
      val maximum = maxOf(comparedToday ?: 0.0, comparedBaseline ?: 0.0)
      views.setImageViewBitmap(R.id.summary_today_bar, comparisonBar(comparedToday, maximum, Color.rgb(210, 225, 248), isRtl(context)))
      views.setImageViewBitmap(R.id.summary_baseline_bar, comparisonBar(comparedBaseline, maximum, Color.rgb(128, 151, 184), isRtl(context)))
    }
    val launch = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    views.setOnClickPendingIntent(R.id.glucose_widget_root, PendingIntent.getActivity(context, widgetId, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    val toggle = Intent(context, GlucoseWidgetProvider::class.java)
      .setAction(GlucoseWidgetProvider.ACTION_CYCLE_COMPARISON)
      .setData(Uri.parse("shanidms22://summary-widget/$widgetId/comparison"))
      .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
    views.setOnClickPendingIntent(R.id.summary_comparison_button, PendingIntent.getBroadcast(context, widgetId, toggle, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    return views
  }

  private fun isRtl(context: Context) = context.resources.configuration.layoutDirection == View.LAYOUT_DIRECTION_RTL

  private fun freshness(context: Context, timestamp: Long?, now: Long): String {
    if (timestamp == null || timestamp <= 0) return context.getString(R.string.summary_waiting)
    val minutes = ((now - timestamp).coerceAtLeast(0) / 60_000).toInt()
    val age = when {
      minutes < 1 -> context.getString(R.string.summary_live)
      minutes < 60 -> context.getString(R.string.summary_minutes_ago, minutes)
      else -> context.getString(R.string.summary_hours_ago, minutes / 60)
    }
    return context.getString(if (minutes > 15) R.string.summary_stale else R.string.summary_fresh, age)
  }

  private fun trendDescription(context: Context, trend: String): String = context.getString(when (trend) {
    "⇈" -> R.string.summary_trend_double_up
    "↑" -> R.string.summary_trend_up
    "↗" -> R.string.summary_trend_slight_up
    "→" -> R.string.summary_trend_flat
    "↘" -> R.string.summary_trend_slight_down
    "↓" -> R.string.summary_trend_down
    "⇊" -> R.string.summary_trend_double_down
    else -> R.string.summary_trend_unknown
  })

  private fun rangeRing(range: WidgetDailyRange?): Bitmap {
    val bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val bounds = RectF(18f, 18f, 238f, 238f)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 20f; color = track }
    canvas.drawOval(bounds, paint)
    if (range == null) return bitmap
    var angle = -90f
    listOf(range.lowPercent to lowColor, range.inRangePercent to teal, range.highPercent to highColor).forEach { (value, color) ->
      val sweep = value.coerceIn(0, 100) * 3.6f
      if (sweep > 0) {
        paint.color = color
        val gap = if (value == 100) 0f else minOf(2.4f, sweep * 0.18f)
        canvas.drawArc(bounds, angle + gap / 2, sweep - gap, false, paint)
      }
      angle += sweep
    }
    return bitmap
  }

  private fun rangeBar(range: WidgetDailyRange?, rtl: Boolean): Bitmap = segmentedBar(
    if (range == null) emptyList() else listOf(range.lowPercent.toDouble() to lowColor, range.inRangePercent.toDouble() to teal, range.highPercent.toDouble() to highColor),
    100.0, rtl,
  )

  private fun insulinBar(stats: WidgetInsulinStats?, rtl: Boolean): Bitmap = segmentedBar(
    if (stats?.totalInsulin == null) emptyList() else listOfNotNull(
      stats.totalBasal?.let { it to teal }, stats.totalBolus?.let { it to violet },
    ), stats?.totalInsulin ?: 0.0, rtl,
  )

  private fun comparisonBar(value: Double?, maximum: Double, color: Int, rtl: Boolean): Bitmap =
    segmentedBar(if (value == null) emptyList() else listOf(value to color), maximum, rtl)

  private fun segmentedBar(segments: List<Pair<Double, Int>>, maximum: Double, rtl: Boolean): Bitmap {
    val bitmap = Bitmap.createBitmap(600, 20, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = track }
    val bounds = RectF(0f, 0f, 600f, 20f)
    canvas.drawRoundRect(bounds, 10f, 10f, paint)
    if (!maximum.isFinite() || maximum <= 0) return bitmap
    canvas.clipPath(Path().apply { addRoundRect(bounds, 10f, 10f, Path.Direction.CW) })
    var cursor = 0f
    segments.forEach { (value, color) ->
      val width = ((if (value.isFinite()) value else 0.0).coerceAtLeast(0.0) / maximum * 600).toFloat()
      if (width > 0) {
        paint.color = color
        val end = (cursor + width).coerceAtMost(600f)
        canvas.drawRect(if (rtl) 600f - end else cursor, 0f, if (rtl) 600f - cursor else end, 20f, paint)
        cursor = end
      }
    }
    return bitmap
  }
}
