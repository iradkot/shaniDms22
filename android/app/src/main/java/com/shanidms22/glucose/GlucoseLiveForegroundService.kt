package com.shanidms22.glucose

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.shanidms22.MainActivity
import com.shanidms22.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

class GlucoseLiveForegroundService : Service() {
  private val serviceJob: Job = SupervisorJob()
  private val scope = CoroutineScope(Dispatchers.IO + serviceJob)
  private var syncLoopJob: Job? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (syncLoopJob?.isActive != true) {
      syncLoopJob = scope.launch {
        while (isActive) {
          runCatching { syncOnce(applicationContext) }
          delay(60_000L)
        }
      }
    }

    return START_STICKY
  }

  override fun onDestroy() {
    scope.cancel()
    super.onDestroy()
  }

  private fun buildNotification(): Notification {
    createChannel()

    val launchIntent = Intent(this, MainActivity::class.java)
    val pendingIntent = PendingIntent.getActivity(
      this,
      91,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("ShaniDMS Live Mode")
      .setContentText("Live widget refresh is active")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(pendingIntent)
      .build()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(CHANNEL_ID, "ShaniDMS Live Mode", NotificationManager.IMPORTANCE_LOW)
    channel.description = "Keeps glucose widget refreshing in live mode"
    channel.setShowBadge(false)
    nm.createNotificationChannel(channel)
  }

  companion object {
    private const val CHANNEL_ID = "glucose_live_mode"
    private const val NOTIFICATION_ID = 220023

    fun start(context: Context): Boolean {
      return runCatching {
        val intent = Intent(context, GlucoseLiveForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      }.isSuccess
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, GlucoseLiveForegroundService::class.java))
    }

    private fun syncOnce(context: Context) {
      val prefs = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
      val enabled = prefs.getBoolean(GlucoseSyncWorker.KEY_ENABLED, false)
      val baseUrl = prefs.getString(GlucoseSyncWorker.KEY_BASE_URL, null)?.trim().orEmpty()
      if (!enabled || baseUrl.isBlank()) return

      val secret = prefs.getString(GlucoseSyncWorker.KEY_API_SECRET_SHA1, null)
      val entries = fetchRecentEntries(baseUrl, secret)
      val latest = latestFromEntries(entries) ?: return
      val load = fetchLatestLoad(baseUrl, secret)

      GlucoseWidgetUpdater.save(
        context,
        latest.sgv,
        latest.trend,
        latest.date,
        load?.iob,
        load?.cob,
        load?.projected1,
        load?.projected2,
        load?.projected3,
        null,
        null,
        entriesToSparkline(entries),
      )
      GlucoseWidgetUpdater.updateWidgets(context)
      GlucoseWidgetUpdater.updateNotification(context)
    }

    private fun fetchRecentEntries(baseUrl: String, secret: String?): JSONArray? {
      val url = "${baseUrl.trimEnd('/')}/api/v1/entries.json?count=36"
      return getJsonArray(url, secret)
    }

    private data class EntryPoint(val ts: Long, val sgv: Int, val direction: String?)
    private data class LatestBg(val sgv: Int, val date: Long, val trend: String)
    private data class LoadData(
      val iob: Double?,
      val cob: Double?,
      val projected1: Int?,
      val projected2: Int?,
      val projected3: Int?,
    )

    private fun parseValidEntries(arr: JSONArray?): List<EntryPoint> {
      if (arr == null) return emptyList()
      val out = mutableListOf<EntryPoint>()
      for (i in 0 until arr.length()) {
        val row = arr.optJSONObject(i) ?: continue
        val sgv = row.optInt("sgv", Int.MIN_VALUE)
        if (sgv == Int.MIN_VALUE || sgv <= 0) continue
        val ts = row.optLong("date", 0L)
        if (ts <= 0L) continue
        out.add(EntryPoint(ts = ts, sgv = sgv, direction = row.optString("direction", "")))
      }
      return out
    }

    private fun latestFromEntries(arr: JSONArray?): LatestBg? {
      val entries = parseValidEntries(arr)
      val latest = entries.maxByOrNull { it.ts } ?: return null
      return LatestBg(sgv = latest.sgv, date = latest.ts, trend = directionToSymbol(latest.direction))
    }

    private fun entriesToSparkline(arr: JSONArray?): IntArray? {
      val entries = parseValidEntries(arr)
      if (entries.size < 2) return null

      val latestTs = entries.maxOf { it.ts }
      val fromTs = latestTs - 3L * 60L * 60L * 1000L
      val values = entries
        .filter { it.ts >= fromTs }
        .sortedBy { it.ts }
        .map { it.sgv }

      return if (values.size >= 2) values.toIntArray() else null
    }

    private fun fetchLatestLoad(baseUrl: String, secret: String?): LoadData? {
      val url = "${baseUrl.trimEnd('/')}/api/v1/devicestatus.json?count=1"
      val arr = getJsonArray(url, secret) ?: return null
      val row = arr.optJSONObject(0) ?: return null

      val loop = row.optJSONObject("loop")
      val iob = loop?.optJSONObject("iob")?.optDouble("iob", Double.NaN)?.takeIf { it.isFinite() }
      val cob = loop?.optJSONObject("cob")?.optDouble("cob", Double.NaN)?.takeIf { it.isFinite() }
      val predictedValues = loop?.optJSONObject("predicted")?.optJSONArray("values")

      fun projectedAt(idx: Int): Int? {
        if (predictedValues == null || predictedValues.length() <= idx) return null
        val v = predictedValues.optDouble(idx, Double.NaN)
        return if (v.isFinite()) v.toInt() else null
      }

      return LoadData(
        iob = iob,
        cob = cob,
        projected1 = projectedAt(0),
        projected2 = projectedAt(1),
        projected3 = projectedAt(2),
      )
    }

    private fun getJsonArray(url: String, secret: String?): JSONArray? {
      val conn = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 7000
        readTimeout = 7000
        setRequestProperty("Content-Type", "application/json")
        if (!secret.isNullOrBlank()) setRequestProperty("api-secret", secret)
      }

      return conn.useConnection { c ->
        val code = c.responseCode
        if (code !in 200..299) return@useConnection null
        val body = c.inputStream.bufferedReader().use { it.readText() }
        JSONArray(body)
      }
    }

    private fun directionToSymbol(direction: String?): String = when (direction) {
      "DoubleUp" -> "⇈"
      "SingleUp" -> "↑"
      "FortyFiveUp" -> "↗"
      "Flat" -> "→"
      "FortyFiveDown" -> "↘"
      "SingleDown" -> "↓"
      "DoubleDown" -> "⇊"
      else -> "•"
    }
  }
}

private inline fun <T> HttpURLConnection.useConnection(block: (HttpURLConnection) -> T): T {
  try {
    return block(this)
  } finally {
    disconnect()
  }
}
