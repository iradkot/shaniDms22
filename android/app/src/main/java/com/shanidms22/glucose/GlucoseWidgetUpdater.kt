package com.shanidms22.glucose

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.Bundle
import android.os.Build
import android.os.SystemClock
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.shanidms22.MainActivity
import com.shanidms22.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

object GlucoseWidgetUpdater {
  private const val PREFS = "glucose_live_prefs"
  private const val KEY_VALUE = "value"
  private const val KEY_TREND = "trend"
  private const val KEY_TIMESTAMP = "timestamp"
  private const val KEY_IOB = "iob"
  private const val KEY_COB = "cob"
  private const val KEY_TOTAL_BASAL = "total_basal"
  private const val KEY_TOTAL_BOLUS = "total_bolus"
  private const val KEY_BASAL_BOLUS_RATIO = "basal_bolus_ratio"
  private const val KEY_TOTAL_INSULIN = "total_insulin"
  private const val KEY_TIR = "tir"
  private const val KEY_PROJECTED1 = "projected1"
  private const val KEY_PROJECTED2 = "projected2"
  private const val KEY_PROJECTED3 = "projected3"
  private const val KEY_LOW = "low"
  private const val KEY_HIGH = "high"
  private const val KEY_SPARKLINE = "sparkline_csv"
  private const val KEY_TIMED_HISTORY = "history_timed_v1"
  private const val KEY_FORECAST = "forecast_shared_v1"
  private const val KEY_NATIVE_FORECAST = "forecast_native_v1"
  private const val KEY_FORECAST_ACCOUNT = "forecast_account_v1"
  private const val KEY_IOB_TIMESTAMP = "iob_timestamp"
  private const val KEY_COB_TIMESTAMP = "cob_timestamp"
  private const val KEY_SPARKLINE_STYLE = "sparkline_style"
  private const val CHANNEL_ID = "glucose_live"
  private const val NOTIFICATION_ID = 220022

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  internal fun save(
    context: Context,
    value: Int,
    trend: String?,
    timestamp: Long,
    iob: Double?,
    cob: Double?,
    totalBasal: Double?,
    totalBolus: Double?,
    basalBolusRatio: Double?,
    totalInsulin: Double?,
    tir: Int?,
    projected1: Int?,
    projected2: Int?,
    projected3: Int?,
    low: Int?,
    high: Int?,
    sparklinePoints: IntArray? = null,
    preserveInsulinStats: Boolean = false,
    historyPoints: List<WidgetEntryPoint>? = null,
    iobTimestampMs: Long? = null,
    cobTimestampMs: Long? = null,
  ) {
    if (timestamp < prefs(context).getLong(KEY_TIMESTAMP, 0)) return
    val e = prefs(context)
      .edit()
      .putInt(KEY_VALUE, value)
      .putString(KEY_TREND, trend ?: "")
      .putLong(KEY_TIMESTAMP, timestamp)

    if (iob != null && iob.isFinite()) e.putString(KEY_IOB, String.format("%.1f", iob)) else e.remove(KEY_IOB)
    if (cob != null && cob.isFinite()) e.putString(KEY_COB, String.format("%.0f", cob)) else e.remove(KEY_COB)
    if (iobTimestampMs != null) e.putLong(KEY_IOB_TIMESTAMP, iobTimestampMs) else e.remove(KEY_IOB_TIMESTAMP)
    if (cobTimestampMs != null) e.putLong(KEY_COB_TIMESTAMP, cobTimestampMs) else e.remove(KEY_COB_TIMESTAMP)
    if (totalBasal != null && totalBasal.isFinite()) e.putString(KEY_TOTAL_BASAL, String.format("%.2f", totalBasal)) else if (!preserveInsulinStats) e.remove(KEY_TOTAL_BASAL)
    if (totalBolus != null && totalBolus.isFinite()) e.putString(KEY_TOTAL_BOLUS, String.format("%.2f", totalBolus)) else if (!preserveInsulinStats) e.remove(KEY_TOTAL_BOLUS)
    if (basalBolusRatio != null && basalBolusRatio.isFinite()) e.putString(KEY_BASAL_BOLUS_RATIO, String.format("%.0f", basalBolusRatio * 100.0)) else if (!preserveInsulinStats) e.remove(KEY_BASAL_BOLUS_RATIO)
    if (totalInsulin != null && totalInsulin.isFinite()) e.putString(KEY_TOTAL_INSULIN, String.format("%.1f", totalInsulin)) else if (!preserveInsulinStats) e.remove(KEY_TOTAL_INSULIN)
    if (tir != null && tir in 0..100) e.putString(KEY_TIR, tir.toString()) else e.remove(KEY_TIR)
    if (projected1 != null) e.putInt(KEY_PROJECTED1, projected1) else e.remove(KEY_PROJECTED1)
    if (projected2 != null) e.putInt(KEY_PROJECTED2, projected2) else e.remove(KEY_PROJECTED2)
    if (projected3 != null) e.putInt(KEY_PROJECTED3, projected3) else e.remove(KEY_PROJECTED3)
    if (low != null) e.putInt(KEY_LOW, low)
    if (high != null) e.putInt(KEY_HIGH, high)
    if (sparklinePoints != null && sparklinePoints.isNotEmpty()) {
      e.putString(KEY_SPARKLINE, sparklinePoints.takeLast(48).joinToString(","))
    }
    if (historyPoints != null) {
      e.putString(KEY_TIMED_HISTORY, historyPoints.sortedBy { it.ts }.takeLast(180).joinToString(",") { "${it.ts}:${it.sgv}" })
    }

    e.apply()
  }

  internal fun saveForecast(context: Context, accountBaseUrl: String, raw: String, native: Boolean = false) {
    GlucoseWidgetCredentialStore.withConfigurationLock {
      val syncPrefs = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
      val activeUrl = syncPrefs.getString(GlucoseSyncWorker.KEY_BASE_URL, "").orEmpty().trim().trimEnd('/')
      if (!widgetForecastAccountMatches(activeUrl, accountBaseUrl)) return@withConfigurationLock
      val snapshot = parseWidgetForecastSnapshot(raw) ?: return@withConfigurationLock
      if (!widgetTimestampIsFresh(snapshot.generatedAtMs, System.currentTimeMillis())) return@withConfigurationLock
      val p = prefs(context)
      val key = if (native) KEY_NATIVE_FORECAST else KEY_FORECAST
      val previous = parseWidgetForecastSnapshot(p.getString(key, null))
      if (previous != null && previous.generatedAtMs > snapshot.generatedAtMs) return@withConfigurationLock
      p.edit().putString(KEY_FORECAST_ACCOUNT, activeUrl).putString(key, raw).apply()
    }
  }

  fun clear(context: Context) {
    prefs(context).edit().clear().apply()
    cancelNotification(context)
    updateWidgets(context)
  }

  fun setThresholds(context: Context, low: Int?, high: Int?) {
    val e = prefs(context).edit()
    if (low != null) e.putInt(KEY_LOW, low) else e.remove(KEY_LOW)
    if (high != null) e.putInt(KEY_HIGH, high) else e.remove(KEY_HIGH)
    e.apply()
    updateWidgets(context)
  }

  fun getRangeThresholds(context: Context): Pair<Int, Int> {
    val p = prefs(context)
    val low = if (p.contains(KEY_LOW)) p.getInt(KEY_LOW, 70) else 70
    val high = if (p.contains(KEY_HIGH)) p.getInt(KEY_HIGH, 180) else 180
    return Pair(low, high)
  }

  fun setSparklineStyle(context: Context, style: String?) {
    val normalized = when ((style ?: "").trim().lowercase()) {
      "points" -> "points"
      else -> "line"
    }
    prefs(context).edit().putString(KEY_SPARKLINE_STYLE, normalized).apply()
    updateWidgets(context)
  }

  private data class WidgetState(
    val value: Int?,
    val trend: String,
    val ts: Long?,
    val iob: String,
    val cob: String,
    val totalBasal: String,
    val totalBolus: String,
    val basalBolusRatio: String,
    val totalInsulin: String,
    val tir: String,
    val projected1: Int?,
    val projected2: Int?,
    val projected3: Int?,
    val low: Int?,
    val high: Int?,
    val history: List<WidgetEntryPoint>,
    val forecast: List<WidgetForecastSeries>,
    val sparklineStyle: String,
  )

  private fun read(context: Context): WidgetState {
    val p = prefs(context)
    val has = p.contains(KEY_VALUE)
    val value = if (has) p.getInt(KEY_VALUE, 0) else null
    val trend = p.getString(KEY_TREND, "") ?: ""
    val ts = if (p.contains(KEY_TIMESTAMP)) p.getLong(KEY_TIMESTAMP, 0L) else null
    val nowMs = System.currentTimeMillis()
    var iob = if (widgetTimestampIsFresh(p.getLong(KEY_IOB_TIMESTAMP, 0), nowMs)) p.getString(KEY_IOB, "--") ?: "--" else "--"
    var cob = if (widgetTimestampIsFresh(p.getLong(KEY_COB_TIMESTAMP, 0), nowMs)) p.getString(KEY_COB, "--") ?: "--" else "--"
    val totalBasal = p.getString(KEY_TOTAL_BASAL, "--") ?: "--"
    val totalBolus = p.getString(KEY_TOTAL_BOLUS, "--") ?: "--"
    val basalBolusRatio = p.getString(KEY_BASAL_BOLUS_RATIO, "--") ?: "--"
    val totalInsulin = p.getString(KEY_TOTAL_INSULIN, "--") ?: "--"
    val tir = p.getString(KEY_TIR, "--") ?: "--"
    val projected1 = if (p.contains(KEY_PROJECTED1)) p.getInt(KEY_PROJECTED1, 0) else null
    val projected2 = if (p.contains(KEY_PROJECTED2)) p.getInt(KEY_PROJECTED2, 0) else null
    val projected3 = if (p.contains(KEY_PROJECTED3)) p.getInt(KEY_PROJECTED3, 0) else null
    val low = if (p.contains(KEY_LOW)) p.getInt(KEY_LOW, 70) else null
    val high = if (p.contains(KEY_HIGH)) p.getInt(KEY_HIGH, 180) else null
    val activeUrl = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
      .getString(GlucoseSyncWorker.KEY_BASE_URL, "").orEmpty().trim().trimEnd('/')
    val accountMatches = widgetForecastAccountMatches(activeUrl, p.getString(KEY_FORECAST_ACCOUNT, ""))
    val shared = if (accountMatches) parseWidgetForecastSnapshot(p.getString(KEY_FORECAST, null)) else null
    val native = if (accountMatches) parseWidgetForecastSnapshot(p.getString(KEY_NATIVE_FORECAST, null)) else null
    shared?.load?.let { load ->
      if (load.iob != null && widgetTimestampIsFresh(load.iobTimestampMs ?: 0, nowMs) && (load.iobTimestampMs ?: 0) >= p.getLong(KEY_IOB_TIMESTAMP, 0)) iob = String.format("%.1f", load.iob)
      if (load.cob != null && widgetTimestampIsFresh(load.cobTimestampMs ?: 0, nowMs) && (load.cobTimestampMs ?: 0) >= p.getLong(KEY_COB_TIMESTAMP, 0)) cob = String.format("%.0f", load.cob)
    }
    val forecast = (freshWidgetForecastSeries(shared, ts, nowMs) + freshWidgetForecastSeries(native, ts, nowMs))
      .groupBy { it.id }.values.mapNotNull { sources -> sources.maxByOrNull { it.sourceTimestampMs } }
    val storedHistory = p.getString(KEY_TIMED_HISTORY, "").orEmpty().split(',').mapNotNull {
      val parts = it.split(':')
      val pointTs = parts.getOrNull(0)?.toLongOrNull()
      val pointValue = parts.getOrNull(1)?.toIntOrNull()
      if (pointTs == null || pointValue == null || pointTs > nowMs + 120_000) null else WidgetEntryPoint(pointTs, pointValue, null)
    }
    val history = (storedHistory + shared?.history.orEmpty() + native?.history.orEmpty())
      .distinctBy { it.ts }.sortedBy { it.ts }.takeLast(180)
    val sparklineStyle = (p.getString(KEY_SPARKLINE_STYLE, "line") ?: "line").lowercase()

    return WidgetState(value, trend, ts, iob, cob, totalBasal, totalBolus, basalBolusRatio, totalInsulin, tir, projected1, projected2, projected3, low, high, history, forecast, sparklineStyle)
  }

  fun updateWidgets(context: Context) {
    val state = read(context)
    val manager = AppWidgetManager.getInstance(context)
    val summaryWidgetIds = manager.getAppWidgetIds(ComponentName(context, GlucoseWidgetProvider::class.java))
    val graphWidgetIds = manager.getAppWidgetIds(ComponentName(context, GlucoseGraphWidgetProvider::class.java))

    summaryWidgetIds.forEach { widgetId ->
      try {
        val views = buildSummaryViews(context, state, manager.getAppWidgetOptions(widgetId))
        manager.updateAppWidget(widgetId, views)
      } catch (_: Throwable) {
        // Prevent widget rendering issues from crashing app process.
      }
    }

    graphWidgetIds.forEach { widgetId ->
      try {
        val views = buildGraphViews(context, state, manager.getAppWidgetOptions(widgetId))
        manager.updateAppWidget(widgetId, views)
      } catch (_: Throwable) {
        // Prevent widget rendering issues from crashing app process.
      }
    }
  }

  fun hasActiveWidgets(context: Context): Boolean {
    val manager = AppWidgetManager.getInstance(context)
    val summaryWidgetIds = manager.getAppWidgetIds(ComponentName(context, GlucoseWidgetProvider::class.java))
    val graphWidgetIds = manager.getAppWidgetIds(ComponentName(context, GlucoseGraphWidgetProvider::class.java))
    return summaryWidgetIds.isNotEmpty() || graphWidgetIds.isNotEmpty()
  }

  private fun buildSummaryViews(context: Context, state: WidgetState, options: Bundle?): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.glucose_widget)
    val compact = widgetHeightDp(options) < 160
    views.setViewVisibility(R.id.glucose_widget_metrics, if (compact) View.GONE else View.VISIBLE)
    views.setViewVisibility(R.id.glucose_ratio, if (compact) View.GONE else View.VISIBLE)
    views.setTextViewText(R.id.glucose_value, state.value?.toString() ?: "--")
    views.setTextViewText(R.id.glucose_trend, state.trend.ifBlank { "•" })
    views.setTextViewText(R.id.glucose_load, buildLoadText(state))
    bindUpdatedTime(views, R.id.glucose_updated, R.id.glucose_updated_chrono, state.ts)
    views.setTextViewText(R.id.glucose_basal, "${state.totalBasal} U\nBasal")
    views.setTextViewText(R.id.glucose_bolus, "${state.totalBolus} U\nBolus")
    views.setTextViewText(R.id.glucose_ratio, "Basal/Bolus ${state.basalBolusRatio}%")
    views.setTextViewText(R.id.glucose_total_insulin, "${state.totalInsulin} U\nTotal")
    views.setTextViewText(R.id.glucose_tir, "${state.tir}%\nTIR")
    val summary = widgetForecastSummary(state.forecast, System.currentTimeMillis())
    views.setTextViewText(R.id.glucose_projected, buildForecastText(summary, compact = true))
    val projectedColor = when {
      summary == null -> Color.parseColor("#99111827")
      state.low != null && summary.point.sgv < state.low -> Color.parseColor("#7F1D1D")
      state.high != null && summary.point.sgv > state.high -> Color.parseColor("#7C2D12")
      else -> Color.parseColor("#111827")
    }
    views.setTextColor(R.id.glucose_projected, projectedColor)
    views.setOnClickPendingIntent(R.id.glucose_widget_root, buildLaunchPendingIntent(context, 0))
    return views
  }

  private fun buildGraphViews(context: Context, state: WidgetState, widgetOptions: Bundle?): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.glucose_graph_widget)
    val compact = widgetHeightDp(widgetOptions) < 155
    views.setTextViewText(R.id.glucose_graph_value, state.value?.toString() ?: "--")
    views.setTextViewText(R.id.glucose_graph_trend, state.trend.ifBlank { "•" })
    views.setTextViewText(R.id.glucose_graph_load, buildLoadText(state))
    val summary = widgetForecastSummary(state.forecast, System.currentTimeMillis())
    views.setTextViewText(R.id.glucose_graph_forecast, if (compact) buildForecastLine(summary) else buildForecastText(summary, compact = false))
    val legend = SpannableStringBuilder()
    state.forecast.forEachIndexed { index, series ->
      if (index > 0) legend.append(" · ")
      val start = legend.length
      legend.append("┄ ${series.label}")
      legend.setSpan(ForegroundColorSpan(forecastColor(series.id)), start, legend.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
    views.setTextViewText(R.id.glucose_graph_legend, legend)
    views.setViewVisibility(R.id.glucose_graph_legend, if (compact || state.forecast.isEmpty()) View.GONE else View.VISIBLE)
    bindUpdatedTime(views, R.id.glucose_graph_updated, R.id.glucose_graph_updated_chrono, state.ts)

    val syncPrefs = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
    val sparklineHours = syncPrefs.getInt(GlucoseSyncWorker.KEY_SPARKLINE_HOURS, 3).coerceIn(1, 12)
    val (sparkWidth, sparkHeight) = graphBitmapSize(context, widgetOptions)
    val sparkBitmap = drawSparklineBitmap(
      state.history,
      state.forecast,
      state.low,
      state.high,
      sparklineHours,
      state.sparklineStyle,
      sparkWidth,
      sparkHeight,
    )
    views.setImageViewBitmap(R.id.glucose_graph_sparkline, sparkBitmap)
    views.setOnClickPendingIntent(R.id.glucose_graph_widget_root, buildLaunchPendingIntent(context, 1))
    return views
  }

  private fun buildLoadText(state: WidgetState): String = "IOB ${state.iob}U · COB ${state.cob}g"

  private fun widgetHeightDp(options: Bundle?): Int = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)?.takeIf { it > 0 } ?: 180

  private fun buildForecastLine(summary: WidgetForecastSummary?): String {
    if (summary == null) return "Forecast · awaiting fresh data"
    val time = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(summary.point.ts))
    val validation = summary.series.within20Percent?.let { "past ${it.roundToInt()}% ±20" } ?: "uncalibrated"
    return "$time → ${summary.point.sgv} · $validation"
  }

  private fun buildForecastText(summary: WidgetForecastSummary?, compact: Boolean): String {
    if (summary == null) return if (compact) "Forecast\nAwaiting fresh data" else "Forecast unavailable · fresh data needed"
    val point = summary.point
    val minutes = ((point.ts - System.currentTimeMillis()) / 60_000.0).roundToInt()
    val time = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(point.ts))
    val range = if (point.lower != null && point.upper != null) "${point.lower}–${point.upper}" else null
    val coverage = summary.series.coveragePercent?.takeIf { range != null }
    val validation = when {
      summary.series.within20Percent != null -> "${summary.series.within20Percent.roundToInt()}% within ±20 · n=${summary.series.sampleCount}"
      coverage != null -> "${coverage.roundToInt()}% observed coverage · n=${summary.series.sampleCount}"
      else -> "Confidence not calibrated"
    }
    return if (compact) {
      val shortValidation = when {
        summary.series.within20Percent != null -> "Past ${summary.series.within20Percent.roundToInt()}% ±20"
        coverage != null -> "Past coverage ${coverage.roundToInt()}%"
        else -> "Not calibrated"
      }
      "+${minutes}m · $time\n${point.sgv}${range?.let { " · $it" } ?: " mg/dL"}\n$shortValidation"
    } else {
      "+${minutes}m · $time  ${point.sgv} mg/dL${range?.let { " · $it" } ?: ""}\n$validation · ${summary.series.label}"
    }
  }

  private fun forecastColor(id: String): Int = Color.parseColor(when (id) {
    "loop" -> "#B4A3FF"
    "nightscout" -> "#5AC8FA"
    "personalized" -> "#F6BB70"
    else -> "#FAFAFF"
  })

  private fun bindUpdatedTime(views: RemoteViews, textViewId: Int, chronometerId: Int, ts: Long?) {
    if (ts != null && ts > 0) {
      val ageMs = (System.currentTimeMillis() - ts).coerceAtLeast(0L)
      val chronoBase = SystemClock.elapsedRealtime() - ageMs
      views.setViewVisibility(textViewId, View.GONE)
      views.setViewVisibility(chronometerId, View.VISIBLE)
      views.setChronometer(chronometerId, chronoBase, "%s ago", true)
    } else {
      views.setViewVisibility(textViewId, View.VISIBLE)
      views.setViewVisibility(chronometerId, View.GONE)
      views.setTextViewText(textViewId, "No data")
    }
  }

  private fun buildLaunchPendingIntent(context: Context, requestCode: Int): PendingIntent {
    val launchIntent = Intent(context, MainActivity::class.java)
    return PendingIntent.getActivity(
      context,
      requestCode,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun drawSparklineBitmap(
    history: List<WidgetEntryPoint>,
    forecast: List<WidgetForecastSeries>,
    low: Int?,
    high: Int?,
    hours: Int,
    chartStyle: String,
    width: Int,
    height: Int,
  ): Bitmap? {
    val nowMs = System.currentTimeMillis()
    val startMs = nowMs - hours.coerceIn(1, 12) * 60L * 60L * 1000L
    val endMs = if (forecast.isEmpty()) nowMs else nowMs + 60L * 60L * 1000L
    val observations = history.filter { it.ts in startMs..nowMs }
    if (observations.size < 2) return null
    val values = observations.map { it.sgv }
    val futureValues = forecast.flatMap { it.points }.filter { it.ts in startMs..endMs }
      .flatMap { listOfNotNull(it.sgv, it.lower, it.upper) }
    val domainValues = values + futureValues

    val labelTextSize = 13f
    val timeTextSize = 14f
    val padLeft = 30f
    val padRight = 10f
    val padTop = 8f
    val padBottom = timeTextSize + 12f
    val plotLeft = padLeft
    val plotRight = width - padRight
    val plotTop = padTop
    val plotBottom = height - padBottom
    val plotWidth = (plotRight - plotLeft).coerceAtLeast(1f)
    val plotHeight = (plotBottom - plotTop).coerceAtLeast(1f)

    val minV = domainValues.minOrNull() ?: return null
    val maxV = domainValues.maxOrNull() ?: return null
    val rawMin = minOf(minV, low ?: minV, high ?: minV)
    val rawMax = maxOf(maxV, low ?: maxV, high ?: maxV)
    var domainMin = (rawMin - 18).coerceAtLeast(0)
    var domainMax = rawMax + 18
    if (domainMax - domainMin < 80) {
      val center = ((domainMax + domainMin) / 2f).toInt()
      domainMin = (center - 40).coerceAtLeast(0)
      domainMax = center + 40
    }
    val spread = max(1, domainMax - domainMin)

    fun yFor(v: Int): Float {
      val ratio = ((v - domainMin).toFloat() / spread.toFloat()).coerceIn(0f, 1f)
      return plotBottom - ratio * plotHeight
    }

    fun xAt(ts: Long): Float = plotLeft + ((ts - startMs).toDouble() / (endMs - startMs).toDouble()).toFloat() * plotWidth
    fun xFor(i: Int): Float = xAt(observations[i].ts)

    fun glucoseColor(v: Int): Int {
      return when {
        low != null && v < low -> Color.parseColor("#F87171")
        high != null && v > high -> Color.parseColor("#F59E0B")
        else -> Color.parseColor("#66BB6A")
      }
    }

    val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)

    val targetFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#2266BB6A")
      style = Paint.Style.FILL
    }

    val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#22FFFFFF")
      strokeWidth = 1.1f
      style = Paint.Style.STROKE
    }

    val thresholdPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#5566BB6A")
      strokeWidth = 1.4f
      style = Paint.Style.STROKE
    }

    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#AEE5E7EB")
      textSize = labelTextSize
      textAlign = Paint.Align.RIGHT
    }

    if (low != null && high != null && high > low) {
      val yHigh = yFor(high)
      val yLow = yFor(low)
      canvas.drawRoundRect(
        RectF(plotLeft, yHigh, plotRight, yLow),
        8f,
        8f,
        targetFillPaint,
      )
    }

    for (i in 1..2) {
      val y = plotTop + (plotHeight * i / 3f)
      canvas.drawLine(plotLeft, y, plotRight, y, gridPaint)
    }

    if (low != null) {
      val y = yFor(low)
      canvas.drawLine(plotLeft, y, plotRight, y, thresholdPaint)
      canvas.drawText(low.toString(), plotLeft - 5f, y + 4f, textPaint)
    }
    if (high != null) {
      val y = yFor(high)
      canvas.drawLine(plotLeft, y, plotRight, y, thresholdPaint)
      canvas.drawText(high.toString(), plotLeft - 5f, y + 4f, textPaint)
    }

    textPaint.textSize = timeTextSize
    textPaint.color = Color.parseColor("#99E5E7EB")
    val tickTimes = if (forecast.isEmpty()) listOf(startMs, (startMs + nowMs) / 2, nowMs) else listOf(startMs, nowMs, endMs)
    tickTimes.forEachIndexed { i, tickTs ->
      val x = xAt(tickTs)
      canvas.drawLine(x, plotBottom, x, plotBottom + 4f, gridPaint)
      val label = when {
        tickTs == nowMs -> "now"
        tickTs > nowMs -> "+60m"
        else -> "-${((nowMs - tickTs) / 3_600_000.0).roundToInt()}h"
      }
      textPaint.textAlign = when (i) {
        0 -> Paint.Align.LEFT
        tickTimes.lastIndex -> Paint.Align.RIGHT
        else -> Paint.Align.CENTER
      }
      canvas.drawText(label, x, height - 3f, textPaint)
    }

    if (forecast.isNotEmpty()) {
      gridPaint.pathEffect = DashPathEffect(floatArrayOf(4f, 4f), 0f)
      canvas.drawLine(xAt(nowMs), plotTop, xAt(nowMs), plotBottom, gridPaint)
      gridPaint.pathEffect = null
    }

    val path = Path()
    values.forEachIndexed { i, v ->
      val x = xFor(i)
      val y = yFor(v)
      if (i == 0 || observations[i].ts - observations[i - 1].ts > 10L * 60L * 1000L) path.moveTo(x, y) else path.lineTo(x, y)
    }

    val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#3366BB6A")
      strokeWidth = 7.5f
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
    }

    if (chartStyle != "points") {
      canvas.drawPath(path, glowPaint)
      val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        strokeWidth = 3.6f
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
      }
      values.windowed(2).forEachIndexed { i, pair ->
        if (observations[i + 1].ts - observations[i].ts > 10L * 60L * 1000L) return@forEachIndexed
        linePaint.color = glucoseColor((pair[0] + pair[1]) / 2)
        canvas.drawLine(xFor(i), yFor(pair[0]), xFor(i + 1), yFor(pair[1]), linePaint)
      }
    }

    val pointPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
    }
    val pointRingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#EEFFFFFF")
      style = Paint.Style.STROKE
      strokeWidth = 2.2f
    }
    values.forEachIndexed { i, v ->
      val x = xFor(i)
      val y = yFor(v)
      pointPaint.color = glucoseColor(v)

      if (chartStyle == "points") {
        val radius = if (i == values.lastIndex) 4.6f else 3.1f
        canvas.drawCircle(x, y, radius, pointPaint)
      } else if (i == values.lastIndex || (values.size > 12 && i % 6 == 0)) {
        val radius = if (i == values.lastIndex) 4.4f else 2.5f
        canvas.drawCircle(x, y, radius, pointPaint)
        if (i == values.lastIndex) {
          canvas.drawCircle(x, y, radius + 2.3f, pointRingPaint)
        }
      }
    }

    forecast.sortedBy { if (it.id == "ensemble") 1 else 0 }.forEach { series ->
      val points = series.points.filter { it.ts in startMs..endMs }
      if (points.size < 2) return@forEach
      val color = forecastColor(series.id)
      val bounded = points.filter { it.lower != null && it.upper != null }
      if (bounded.size >= 2 && (series.id == "ensemble" || series.id == "personalized")) {
        val band = Path()
        bounded.forEachIndexed { i, point ->
          if (i == 0) band.moveTo(xAt(point.ts), yFor(point.upper!!)) else band.lineTo(xAt(point.ts), yFor(point.upper!!))
        }
        bounded.reversed().forEach { band.lineTo(xAt(it.ts), yFor(it.lower!!)) }
        band.close()
        canvas.drawPath(band, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color; alpha = 28; style = Paint.Style.FILL })
      }
      val forecastPath = Path()
      points.forEachIndexed { i, point ->
        if (i == 0 || point.ts - points[i - 1].ts > WIDGET_FORECAST_STEP_MS + 60_000L) forecastPath.moveTo(xAt(point.ts), yFor(point.sgv))
        else forecastPath.lineTo(xAt(point.ts), yFor(point.sgv))
      }
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        style = Paint.Style.STROKE
        strokeWidth = if (series.id == "ensemble") 3.5f else 2.6f
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        pathEffect = DashPathEffect(floatArrayOf(7f, 5f), 0f)
      }
      canvas.drawPath(forecastPath, paint)
      val point = widgetForecastSummary(listOf(series), nowMs)?.point
      if (point != null && point.ts <= endMs) {
        paint.style = Paint.Style.FILL
        paint.pathEffect = null
        canvas.drawCircle(xAt(point.ts), yFor(point.sgv), 3.8f, paint)
      }
    }

    return bmp
  }

  private fun graphBitmapSize(context: Context, widgetOptions: Bundle?): Pair<Int, Int> {
    val density = context.resources.displayMetrics.density
    val optionWidthDp = widgetOptions
      ?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0)
      ?.takeIf { it > 0 }
    val optionHeightDp = widgetOptions
      ?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
      ?.takeIf { it > 0 }

    if (optionWidthDp == null || optionHeightDp == null) {
      return Pair(480, 180)
    }

    val horizontalPaddingDp = 16
    val verticalChromeDp = 115
    val widthPx = ((optionWidthDp - horizontalPaddingDp).coerceAtLeast(160) * density)
      .toInt()
      .coerceIn(360, 640)
    val imageHeightDp = (optionHeightDp - verticalChromeDp).coerceAtLeast(72)
    val heightPx = (imageHeightDp * density)
      .toInt()
      .coerceIn(140, 240)

    return Pair(widthPx, heightPx)
  }

  fun updateNotification(context: Context) {
    val state = read(context)
    val value = state.value
    val trend = state.trend
    val ts = state.ts
    if (value == null) {
      cancelNotification(context)
      return
    }

    createChannel(context)

    val intent = Intent(context, MainActivity::class.java)
    val pendingIntent = PendingIntent.getActivity(
      context,
      1,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val contentText = buildString {
      append("${value} mg/dL")
      if (trend.isNotBlank()) append("  ${trend}")
      if (ts != null && ts > 0) {
        append(" • ")
        append(android.text.format.DateUtils.getRelativeTimeSpanString(ts))
      }
    }

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(context.getString(R.string.glucose_notification_title))
      .setContentText(contentText)
      .setStyle(NotificationCompat.BigTextStyle().bigText(contentText))
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()

    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS denied; keep widget updates working.
    }
  }

  private fun cancelNotification(context: Context) {
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
  }

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      context.getString(R.string.glucose_channel_name),
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = context.getString(R.string.glucose_channel_description)
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
      setShowBadge(false)
    }
    nm.createNotificationChannel(channel)
  }
}
