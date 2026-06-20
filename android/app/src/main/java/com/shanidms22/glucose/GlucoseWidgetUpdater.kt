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
import android.graphics.Paint
import android.graphics.Path
import android.os.Build
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.shanidms22.MainActivity
import com.shanidms22.R
import kotlin.math.max

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
  private const val KEY_SPARKLINE_STYLE = "sparkline_style"
  private const val CHANNEL_ID = "glucose_live"
  private const val NOTIFICATION_ID = 220022

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(
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
  ) {
    val e = prefs(context)
      .edit()
      .putInt(KEY_VALUE, value)
      .putString(KEY_TREND, trend ?: "")
      .putLong(KEY_TIMESTAMP, timestamp)

    if (iob != null && iob.isFinite()) e.putString(KEY_IOB, String.format("%.1f", iob)) else e.remove(KEY_IOB)
    if (cob != null && cob.isFinite()) e.putString(KEY_COB, String.format("%.0f", cob)) else e.remove(KEY_COB)
    if (totalBasal != null && totalBasal.isFinite()) e.putString(KEY_TOTAL_BASAL, String.format("%.2f", totalBasal)) else e.remove(KEY_TOTAL_BASAL)
    if (totalBolus != null && totalBolus.isFinite()) e.putString(KEY_TOTAL_BOLUS, String.format("%.2f", totalBolus)) else e.remove(KEY_TOTAL_BOLUS)
    if (basalBolusRatio != null && basalBolusRatio.isFinite()) e.putString(KEY_BASAL_BOLUS_RATIO, String.format("%.0f", basalBolusRatio * 100.0)) else e.remove(KEY_BASAL_BOLUS_RATIO)
    if (totalInsulin != null && totalInsulin.isFinite()) e.putString(KEY_TOTAL_INSULIN, String.format("%.1f", totalInsulin)) else e.remove(KEY_TOTAL_INSULIN)
    if (tir != null && tir in 0..100) e.putString(KEY_TIR, tir.toString()) else e.remove(KEY_TIR)
    if (projected1 != null) e.putInt(KEY_PROJECTED1, projected1) else e.remove(KEY_PROJECTED1)
    if (projected2 != null) e.putInt(KEY_PROJECTED2, projected2) else e.remove(KEY_PROJECTED2)
    if (projected3 != null) e.putInt(KEY_PROJECTED3, projected3) else e.remove(KEY_PROJECTED3)
    if (low != null) e.putInt(KEY_LOW, low)
    if (high != null) e.putInt(KEY_HIGH, high)
    if (sparklinePoints != null && sparklinePoints.isNotEmpty()) {
      e.putString(KEY_SPARKLINE, sparklinePoints.takeLast(48).joinToString(","))
    }

    e.apply()
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
    val sparkline: List<Int>,
    val sparklineStyle: String,
  )

  private fun read(context: Context): WidgetState {
    val p = prefs(context)
    val has = p.contains(KEY_VALUE)
    val value = if (has) p.getInt(KEY_VALUE, 0) else null
    val trend = p.getString(KEY_TREND, "") ?: ""
    val ts = if (p.contains(KEY_TIMESTAMP)) p.getLong(KEY_TIMESTAMP, 0L) else null
    val iob = p.getString(KEY_IOB, "--") ?: "--"
    val cob = p.getString(KEY_COB, "--") ?: "--"
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
    val sparkline = (p.getString(KEY_SPARKLINE, "") ?: "")
      .split(',')
      .mapNotNull { it.trim().toIntOrNull() }
      .takeLast(48)
    val sparklineStyle = (p.getString(KEY_SPARKLINE_STYLE, "line") ?: "line").lowercase()

    return WidgetState(value, trend, ts, iob, cob, totalBasal, totalBolus, basalBolusRatio, totalInsulin, tir, projected1, projected2, projected3, low, high, sparkline, sparklineStyle)
  }

  fun updateWidgets(context: Context) {
    val state = read(context)
    val manager = AppWidgetManager.getInstance(context)
    val summaryWidgetIds = manager.getAppWidgetIds(ComponentName(context, GlucoseWidgetProvider::class.java))
    val graphWidgetIds = manager.getAppWidgetIds(ComponentName(context, GlucoseGraphWidgetProvider::class.java))

    summaryWidgetIds.forEach { widgetId ->
      try {
        val views = buildSummaryViews(context, state)
        manager.updateAppWidget(widgetId, views)
      } catch (_: Throwable) {
        // Prevent widget rendering issues from crashing app process.
      }
    }

    graphWidgetIds.forEach { widgetId ->
      try {
        val views = buildGraphViews(context, state)
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

  private fun buildSummaryViews(context: Context, state: WidgetState): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.glucose_widget)
    views.setTextViewText(R.id.glucose_value, state.value?.toString() ?: "--")
    views.setTextViewText(R.id.glucose_trend, state.trend.ifBlank { "•" })
    bindUpdatedTime(views, R.id.glucose_updated, R.id.glucose_updated_chrono, state.ts)
    views.setTextViewText(R.id.glucose_basal, "${state.totalBasal} U\nBasal")
    views.setTextViewText(R.id.glucose_bolus, "${state.totalBolus} U\nBolus")
    views.setTextViewText(R.id.glucose_ratio, "Basal/Bolus ${state.basalBolusRatio}%")
    views.setTextViewText(R.id.glucose_total_insulin, "${state.totalInsulin} U\nTotal")
    views.setTextViewText(R.id.glucose_tir, "${state.tir}%\nTIR")
    val p1 = state.projected1?.toString() ?: "--"
    val p2 = state.projected2?.toString() ?: "--"
    val p3 = state.projected3?.toString() ?: "--"
    views.setTextViewText(R.id.glucose_projected, "Next\n${p1}  →  ${p2}  →  ${p3}")
    val projectedColor = when {
      state.projected1 == null -> Color.parseColor("#99111827")
      state.low != null && state.projected1 < state.low -> Color.parseColor("#7F1D1D")
      state.high != null && state.projected1 > state.high -> Color.parseColor("#7C2D12")
      else -> Color.parseColor("#111827")
    }
    views.setTextColor(R.id.glucose_projected, projectedColor)
    views.setOnClickPendingIntent(R.id.glucose_widget_root, buildLaunchPendingIntent(context, 0))
    return views
  }

  private fun buildGraphViews(context: Context, state: WidgetState): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.glucose_graph_widget)
    views.setTextViewText(R.id.glucose_graph_value, state.value?.toString() ?: "--")
    views.setTextViewText(R.id.glucose_graph_trend, state.trend.ifBlank { "•" })
    bindUpdatedTime(views, R.id.glucose_graph_updated, R.id.glucose_graph_updated_chrono, state.ts)

    val syncPrefs = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
    val sparklineHours = syncPrefs.getInt(GlucoseSyncWorker.KEY_SPARKLINE_HOURS, 3).coerceIn(1, 12)
    val sparkBitmap = drawSparklineBitmap(
      state.sparkline,
      state.low,
      state.high,
      sparklineHours,
      state.sparklineStyle,
    )
    views.setImageViewBitmap(R.id.glucose_graph_sparkline, sparkBitmap)
    views.setOnClickPendingIntent(R.id.glucose_graph_widget_root, buildLaunchPendingIntent(context, 1))
    return views
  }

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
    values: List<Int>,
    low: Int?,
    high: Int?,
    hours: Int,
    chartStyle: String,
  ): Bitmap? {
    if (values.size < 2) return null

    val width = 420
    val height = 96
    val padX = 4f
    val padTop = 6f
    val axisGap = 6f
    val axisTextSize = 18f
    val padBottom = axisTextSize + axisGap + 2f

    val minV = values.minOrNull() ?: return null
    val maxV = values.maxOrNull() ?: return null
    val spread = max(12, maxV - minV)

    fun yFor(v: Int): Float {
      val ratio = (v - minV).toFloat() / spread.toFloat()
      return (height - padBottom) - ratio * ((height - padBottom) - padTop)
    }

    val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)

    val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#33FFFFFF")
      strokeWidth = 1.4f
      style = Paint.Style.STROKE
    }

    val axisPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#55FFFFFF")
      strokeWidth = 1.2f
      style = Paint.Style.STROKE
    }

    val axisTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#AAFFFFFF")
      textSize = axisTextSize
      textAlign = Paint.Align.CENTER
    }

    if (low != null) canvas.drawLine(0f, yFor(low), width.toFloat(), yFor(low), gridPaint)
    if (high != null) canvas.drawLine(0f, yFor(high), width.toFloat(), yFor(high), gridPaint)

    val axisY = height - padBottom + axisGap
    canvas.drawLine(padX, axisY, width - padX, axisY, axisPaint)

    val safeHours = hours.coerceIn(1, 12)
    val tickCount = if (safeHours <= 1) 2 else 4
    for (i in 0 until tickCount) {
      val t = i.toFloat() / (tickCount - 1).toFloat()
      val x = padX + t * (width - padX * 2)
      canvas.drawLine(x, axisY - 3f, x, axisY + 3f, axisPaint)
      val hAgo = ((1f - t) * safeHours).toInt()
      val label = if (hAgo <= 0) "now" else "-${hAgo}h"
      canvas.drawText(label, x, height - 3f, axisTextPaint)
    }

    val path = Path()
    values.forEachIndexed { i, v ->
      val x = padX + (i.toFloat() / (values.size - 1).toFloat()) * (width - padX * 2)
      val y = yFor(v)
      if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }

    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#A0E3F2FD")
      strokeWidth = 3.4f
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
    }

    if (chartStyle != "points") {
      canvas.drawPath(path, linePaint)
    }

    val pointPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
    }
    values.forEachIndexed { i, v ->
      val x = padX + (i.toFloat() / (values.size - 1).toFloat()) * (width - padX * 2)
      val y = yFor(v)
      pointPaint.color = when {
        low != null && v < low -> Color.parseColor("#FF6B6B")
        high != null && v > high -> Color.parseColor("#FFB74D")
        else -> Color.parseColor("#66BB6A")
      }

      if (chartStyle == "points") {
        val radius = if (i == values.lastIndex) 4.2f else 3.2f
        canvas.drawCircle(x, y, radius, pointPaint)
      } else if (i == values.lastIndex || i == 0 || (values.size > 12 && i % 4 == 0)) {
        val radius = if (i == values.lastIndex) 3.6f else 2.6f
        canvas.drawCircle(x, y, radius, pointPaint)
      }
    }

    return bmp
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
