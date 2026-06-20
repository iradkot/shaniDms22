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
      val load = fetchLatestWidgetLoad(baseUrl, secret)
      val insulinStats = fetchLatestWidgetInsulinStats(baseUrl, secret)
      val (low, high) = GlucoseWidgetUpdater.getRangeThresholds(context)

      GlucoseWidgetUpdater.save(
        context,
        latest.sgv,
        latest.trend,
        latest.date,
        load?.iob,
        load?.cob,
        insulinStats?.totalBasal,
        insulinStats?.totalBolus,
        insulinStats?.basalBolusRatio,
        insulinStats?.totalInsulin,
        calculateWidgetTir(entries, LIVE_WINDOW_HOURS, low, high),
        load?.projected1,
        load?.projected2,
        load?.projected3,
        null,
        null,
        entriesToSparkline(entries),
        preserveInsulinStats = true,
      )
      GlucoseWidgetUpdater.updateWidgets(context)
      GlucoseWidgetUpdater.updateNotification(context)
    }

    private fun fetchRecentEntries(baseUrl: String, secret: String?): JSONArray? {
      val url = "${baseUrl.trimEnd('/')}/api/v1/entries.json?count=36"
      return fetchWidgetJsonArray(url, secret)
    }

    private fun latestFromEntries(arr: JSONArray?) = latestWidgetBgFromEntries(arr)

    private fun entriesToSparkline(arr: JSONArray?) = widgetEntriesToSparkline(arr, LIVE_WINDOW_HOURS)

    private const val LIVE_WINDOW_HOURS = 3
  }
}
