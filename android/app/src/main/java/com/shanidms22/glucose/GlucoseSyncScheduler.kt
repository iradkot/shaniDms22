package com.shanidms22.glucose

import android.content.Context
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

  private fun constraints(): Constraints = Constraints.Builder()
    .setRequiredNetworkType(NetworkType.CONNECTED)
    .build()

  fun configure(context: Context, baseUrl: String?, apiSecretSha1: String?, enabled: Boolean) {
    val prefs = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
    val hasLiveModePreference = prefs.contains(GlucoseSyncWorker.KEY_LIVE_MODE)

    val editor = prefs.edit()
      .putString(GlucoseSyncWorker.KEY_BASE_URL, baseUrl?.trim())
      .putString(GlucoseSyncWorker.KEY_API_SECRET_SHA1, apiSecretSha1?.trim())
      .putBoolean(GlucoseSyncWorker.KEY_ENABLED, enabled)

    if (!hasLiveModePreference) {
      // Default to Live Mode ON for users who explicitly asked for live refresh.
      editor.putBoolean(GlucoseSyncWorker.KEY_LIVE_MODE, true)
    }

    editor.apply()

    applyModeFromPrefs(context)
    if (enabled && !baseUrl.isNullOrBlank()) {
      enqueueImmediate(context)
    }
  }

  fun setLiveModeEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(GlucoseSyncWorker.KEY_LIVE_MODE, enabled)
      .apply()

    applyModeFromPrefs(context)
    if (enabled) enqueueImmediate(context)
  }

  fun scheduleFromPrefs(context: Context) {
    applyModeFromPrefs(context)
  }

  private fun applyModeFromPrefs(context: Context) {
    val prefs = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
    val enabled = prefs.getBoolean(GlucoseSyncWorker.KEY_ENABLED, false)
    val baseUrl = prefs.getString(GlucoseSyncWorker.KEY_BASE_URL, null)?.trim().orEmpty()
    val liveMode = prefs.getBoolean(GlucoseSyncWorker.KEY_LIVE_MODE, true)

    if (!enabled || baseUrl.isBlank()) {
      cancel(context)
      GlucoseLiveForegroundService.stop(context)
      return
    }

    if (liveMode) {
      cancel(context)
      GlucoseLiveForegroundService.start(context)
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

  fun cancel(context: Context) {
    val wm = WorkManager.getInstance(context)
    wm.cancelUniqueWork(SYNC_WORK_NAME)
    wm.cancelUniqueWork(IMMEDIATE_SYNC_WORK_NAME)
    GlucoseLiveForegroundService.stop(context)
  }
}
