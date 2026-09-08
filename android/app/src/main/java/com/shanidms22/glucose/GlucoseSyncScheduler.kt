package com.shanidms22.glucose

import android.content.Context
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object GlucoseSyncScheduler {
  const val SYNC_WORK_NAME = "nightscout-widget-sync-periodic"
  const val IMMEDIATE_SYNC_WORK_NAME = "nightscout-widget-sync-immediate"
  const val REFRESH_ALARM_ACTION = "com.shanidms22.glucose.REFRESH_WIDGET"
  private const val REFRESH_ALARM_REQUEST_CODE = 220024
  private const val REFRESH_ALARM_INTERVAL_MS = 5L * 60L * 1000L

  private fun constraints(): Constraints = Constraints.Builder()
    .setRequiredNetworkType(NetworkType.CONNECTED)
    .build()

  fun configure(context: Context, baseUrl: String?, apiSecretSha1: String?, enabled: Boolean) {
    GlucoseWidgetCredentialStore.withConfigurationLock {
      val previous = GlucoseWidgetCredentialStore.readSyncConfiguration(context)
      val result = GlucoseWidgetCredentialStore.writeSyncConfiguration(
        context = context,
        baseUrl = baseUrl,
        apiSecretSha1 = apiSecretSha1,
        enabled = enabled,
      )
      val next = GlucoseWidgetCredentialStore.readSyncConfiguration(context)
      if (previous != next || !result.effectiveEnabled) {
        // Clearing also invalidates model snapshots when credentials change on the same URL.
        GlucoseWidgetUpdater.clear(context)
      }
      applyModeFromPrefs(context)
      if (result.effectiveEnabled && !result.baseUrl.isNullOrBlank()) {
        requestImmediateRefresh(context)
      } else {
        cancelRefreshAlarm(context)
      }
    }
  }

  fun setLiveModeEnabled(context: Context, enabled: Boolean) {
    GlucoseWidgetCredentialStore.withConfigurationLock {
      context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(GlucoseSyncWorker.KEY_LIVE_MODE, enabled)
        .commit()

      applyModeFromPrefs(context)
      if (enabled) requestImmediateRefresh(context)
    }
  }

  fun scheduleFromPrefs(context: Context) {
    GlucoseWidgetCredentialStore.withConfigurationLock {
      applyModeFromPrefs(context)
    }
  }

  private fun applyModeFromPrefs(context: Context) {
    val configuration = GlucoseWidgetCredentialStore.readSyncConfiguration(context)
    if (configuration !is WidgetSyncConfiguration.Ready) {
      cancel(context)
      return
    }

    scheduleRefreshAlarm(context)

    if (configuration.liveMode) {
      cancelWork(context)
      val started = GlucoseLiveForegroundService.start(context)
      if (!started) {
        // Fallback when foreground service can't be started on this device/state.
        schedulePeriodic(context)
      }
    } else {
      GlucoseLiveForegroundService.stop(context)
      schedulePeriodic(context)
    }
  }

  fun schedulePeriodic(context: Context) {
    val wm = WorkManager.getInstance(context)
    val periodic = PeriodicWorkRequestBuilder<GlucoseSyncWorker>(15, TimeUnit.MINUTES)
      .setConstraints(constraints())
      .build()

    wm.enqueueUniquePeriodicWork(
      SYNC_WORK_NAME,
      ExistingPeriodicWorkPolicy.UPDATE,
      periodic,
    )
  }

  fun enqueueImmediate(context: Context) {
    val wm = WorkManager.getInstance(context)
    val immediate = OneTimeWorkRequestBuilder<GlucoseSyncWorker>()
      .setConstraints(constraints())
      .build()

    wm.enqueueUniqueWork(
      IMMEDIATE_SYNC_WORK_NAME,
      ExistingWorkPolicy.REPLACE,
      immediate,
    )
  }

  fun requestImmediateRefresh(context: Context) {
    enqueueImmediate(context)
    GlucoseWidgetSync.syncAsync(context)
  }

  fun cancelIfConfigurationUnavailable(context: Context) {
    GlucoseWidgetCredentialStore.withConfigurationLock {
      if (GlucoseWidgetCredentialStore.readSyncConfiguration(context) !is WidgetSyncConfiguration.Ready) {
        cancel(context)
      }
    }
  }

  fun cancel(context: Context) {
    cancelWork(context)
    cancelRefreshAlarm(context)
    GlucoseLiveForegroundService.stop(context)
  }

  private fun cancelWork(context: Context) {
    val wm = WorkManager.getInstance(context)
    wm.cancelUniqueWork(SYNC_WORK_NAME)
    wm.cancelUniqueWork(IMMEDIATE_SYNC_WORK_NAME)
  }

  fun scheduleRefreshAlarm(context: Context) {
    val prefs = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
    val enabled = prefs.getBoolean(GlucoseSyncWorker.KEY_ENABLED, false)
    val baseUrl = prefs.getString(GlucoseSyncWorker.KEY_BASE_URL, null)?.trim().orEmpty()
    if (!enabled || baseUrl.isBlank()) {
      cancelRefreshAlarm(context)
      return
    }

    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val triggerAt = SystemClock.elapsedRealtime() + REFRESH_ALARM_INTERVAL_MS
    val pendingIntent = refreshAlarmPendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT) ?: return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent)
    } else {
      alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent)
    }
  }

  private fun cancelRefreshAlarm(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    refreshAlarmPendingIntent(context, PendingIntent.FLAG_NO_CREATE)?.let { alarmManager.cancel(it) }
  }

  private fun refreshAlarmPendingIntent(context: Context, flag: Int): PendingIntent? {
    val intent = Intent(context, GlucoseRefreshReceiver::class.java).apply {
      action = REFRESH_ALARM_ACTION
    }
    return PendingIntent.getBroadcast(
      context,
      REFRESH_ALARM_REQUEST_CODE,
      intent,
      flag or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
