package com.shanidms22.glucose

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
class GlucoseSyncWorker(
  appContext: Context,
  params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

  override suspend fun doWork(): Result {
    return try {
      GlucoseWidgetSync.syncOnce(applicationContext)
      Result.success()
    } catch (_: Exception) {
      Result.retry()
    }
  }

  companion object {
    const val PREFS = "glucose_sync_prefs"
    const val KEY_BASE_URL = "base_url"
    const val KEY_API_SECRET_SHA1 = "api_secret_sha1"
    const val KEY_ENABLED = "enabled"
    const val KEY_LIVE_MODE = "live_mode"
    const val KEY_SPARKLINE_HOURS = "sparkline_hours"
  }
}
