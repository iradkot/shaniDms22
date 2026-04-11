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
  private const val KEY_PROJECTED1 = "projected1"
  private const val KEY_PROJECTED2 = "projected2"
  private const val KEY_PROJECTED3 = "projected3"
  private const val KEY_LOW = "low"
  private const val KEY_HIGH = "high"
  private const val KEY_SPARKLINE = "sparkline_csv"
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
    if (projected1 != null) e.putInt(KEY_PROJECTED1, projected1) else e.remove(KEY_PROJECTED1)
    if (projected2 != null) e.putInt(KEY_PROJECTED2, projected2) else e.remove(KEY_PROJECTED2)
    if (projected3 != null) e.putInt(KEY_PROJECTED3, projected3) else e.remove(KEY_PROJECTED3)
    if (low != null) e.putInt(KEY_LOW, low) else e.remove(KEY_LOW)
    if (high != null) e.putInt(KEY_HIGH, high) else e.remove(KEY_HIGH)
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

  private data class WidgetState(
    val value: Int?,
    val trend: String,
    val ts: Long?,
    val iob: String,
    val cob: String,
    val projected1: Int?,
    val projected2: Int?,
    val projected3: Int?,
    val low: Int?,
    val high: Int?,
    val sparkline: List<Int>,
  )

  private fun read(context: Context): WidgetState {
    val p = prefs(context)
    val has = p.contains(KEY_VALUE)
    val value = if (has) p.getInt(KEY_VALUE, 0) else null
    val trend = p.getString(KEY_TREND, "") ?: ""
    val ts = if (p.contains(KEY_TIMESTAMP)) p.getLong(KEY_TIMESTAMP, 0L) else null
    val iob = p.getString(KEY_IOB, "--") ?: "--"
    val cob = p.getString(KEY_COB, "--") ?: "--"
    val projected1 = if (p.contains(KEY_PROJECTED1)) p.getInt(KEY_PROJECTED1, 0) else null
    val projected2 = if (p.contains(KEY_PROJECTED2)) p.getInt(KEY_PROJECTED2, 0) else null
    val projected3 = if (p.contains(KEY_PROJECTED3)) p.getInt(KEY_PROJECTED3, 0) else null
    val low = if (p.contains(KEY_LOW)) p.getInt(KEY_LOW, 70) else null
    val high = if (p.contains(KEY_HIGH)) p.getInt(KEY_HIGH, 180) else null
    val sparkline = (p.getString(KEY_SPARKLINE, "") ?: "")
      .split(',')
      .mapNotNull { it.trim().toIntOrNull() }
      .takeLast(48)

    return WidgetState(value, trend, ts, iob, cob, projected1, projected2, projected3, low, high, sparkline)
  }

  fun updateWidgets(context: Context) {
    val state = read(context)
    val value = state.value
    val trend = state.trend
    val ts = state.ts
    val manager = AppWidgetManager.getInstance(context)
    val widgetComponent = ComponentName(context, GlucoseWidgetProvider::class.java)
    val appWidgetIds = manager.getAppWidgetIds(widgetComponent)
    appWidgetIds.forEach { widgetId ->
      try {
        val views = RemoteViews(context.packageName, R.layout.glucose_widget)
        views.setTextViewText(R.id.glucose_value, value?.toString() ?: "--")
        views.setTextViewText(R.id.glucose_trend, trend.ifBlank { "•" })
        views.setTextViewText(
          R.id.glucose_updated,
          if (ts != null && ts > 0) android.text.format.DateUtils.getRelativeTimeSpanString(ts).toString() else "No data"
        )
        views.setTextViewText(R.id.glucose_iob, "IOB ${state.iob}U")
        views.setTextViewText(R.id.glucose_cob, "COB ${state.cob}g")
        val p1 = state.projected1?.toString() ?: "--"
        val p2 = state.projected2?.toString() ?: "--"
        val p3 = state.projected3?.toString() ?: "--"
        views.setTextViewText(R.id.glucose_projected, "Next → ${p1} → ${p2} → ${p3}")
        val projectedColor = when {
          state.projected1 == null -> Color.parseColor("#B3FFFFFF")
          state.low != null && state.projected1 < state.low -> Color.parseColor("#FF6B6B")
          state.high != null && state.projected1 > state.high -> Color.parseColor("#FFB74D")
          else -> Color.parseColor("#66BB6A")
        }
        views.setTextColor(R.id.glucose_projected, projectedColor)

        val sparkBitmap = drawSparklineBitmap(state.sparkline, state.low, state.high)
        if (sparkBitmap != null) {
          views.setImageViewBitmap(R.id.glucose_sparkline, sparkBitmap)
        }

        val launchIntent = Intent(context, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
          context,
          0,
          launchIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        views.setOnClickPendingIntent(R.id.glucose_widget_root, pendingIntent)
        manager.updateAppWidget(widgetId, views)
      } catch (_: Throwable) {
        // Prevent widget rendering issues from crashing app process.
      }
    }
  }

  private fun drawSparklineBitmap(values: List<Int>, low: Int?, high: Int?): Bitmap? {
    if (values.size < 2) return null

    val width = 360
    val height = 74
    val padX = 4f
    val padY = 6f

    val minV = values.minOrNull() ?: return null
    val maxV = values.maxOrNull() ?: return null
    val spread = max(12, maxV - minV)

    fun yFor(v: Int): Float {
      val ratio = (v - minV).toFloat() / spread.toFloat()
      return (height - padY) - ratio * (height - padY * 2)
    }

    val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)

    val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#33FFFFFF")
      strokeWidth = 1.4f
      style = Paint.Style.STROKE
    }

    if (low != null) canvas.drawLine(0f, yFor(low), width.toFloat(), yFor(low), gridPaint)
    if (high != null) canvas.drawLine(0f, yFor(high), width.toFloat(), yFor(high), gridPaint)

    val path = Path()
    values.forEachIndexed { i, v ->
      val x = padX + (i.toFloat() / (values.size - 1).toFloat()) * (width - padX * 2)
      val y = yFor(v)
      if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }

    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#99E3F2FD")
      strokeWidth = 3.4f
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
    }

    canvas.drawPath(path, linePaint)
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
