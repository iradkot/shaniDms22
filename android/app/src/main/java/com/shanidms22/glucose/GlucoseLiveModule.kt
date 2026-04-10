package com.shanidms22.glucose

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.TimeUnit

class GlucoseLiveModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val SYNC_WORK_NAME = "nightscout-widget-sync-periodic"
    private const val IMMEDIATE_SYNC_WORK_NAME = "nightscout-widget-sync-immediate"
  }

  override fun getName(): String = "GlucoseLiveModule"

  @ReactMethod
  fun updateLiveSurface(
    value: Int,
    trend: String?,
    timestampMs: Double,
    iob: Double?,
    cob: Double?,
    projected: Double?,
    low: Double?,
    high: Double?,
  ) {
    val ts = timestampMs.toLong()
    val projectedInt = if (projected != null && projected.isFinite()) projected.toInt() else null
    val lowInt = if (low != null && low.isFinite()) low.toInt() else null
    val highInt = if (high != null && high.isFinite()) high.toInt() else null
    GlucoseWidgetUpdater.save(reactApplicationContext, value, trend, ts, iob, cob, projectedInt, lowInt, highInt)
    GlucoseWidgetUpdater.updateWidgets(reactApplicationContext)
    GlucoseWidgetUpdater.updateNotification(reactApplicationContext)
  }

  @ReactMethod
  fun clearLiveSurface() {
    GlucoseWidgetUpdater.clear(reactApplicationContext)
  }

  @ReactMethod
  fun setWidgetThresholds(low: Double?, high: Double?) {
    val lowInt = if (low != null && low.isFinite()) low.toInt() else null
    val highInt = if (high != null && high.isFinite()) high.toInt() else null
    GlucoseWidgetUpdater.setThresholds(reactApplicationContext, lowInt, highInt)
  }

  @ReactMethod
  fun configureBackgroundSync(baseUrl: String?, apiSecretSha1: String?, enabled: Boolean) {
    val prefs = reactApplicationContext.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
    prefs.edit()
      .putString(GlucoseSyncWorker.KEY_BASE_URL, baseUrl?.trim())
      .putString(GlucoseSyncWorker.KEY_API_SECRET_SHA1, apiSecretSha1?.trim())
      .apply()

    val wm = WorkManager.getInstance(reactApplicationContext)

    if (!enabled || baseUrl.isNullOrBlank()) {
      wm.cancelUniqueWork(SYNC_WORK_NAME)
      wm.cancelUniqueWork(IMMEDIATE_SYNC_WORK_NAME)
      return
    }

    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()

    val periodic = PeriodicWorkRequestBuilder<GlucoseSyncWorker>(15, TimeUnit.MINUTES)
      .setConstraints(constraints)
      .build()

    wm.enqueueUniquePeriodicWork(
      SYNC_WORK_NAME,
      ExistingPeriodicWorkPolicy.UPDATE,
      periodic,
    )

    val immediate = OneTimeWorkRequestBuilder<GlucoseSyncWorker>()
      .setConstraints(constraints)
      .build()

    wm.enqueueUniqueWork(
      IMMEDIATE_SYNC_WORK_NAME,
      ExistingWorkPolicy.REPLACE,
      immediate,
    )
  }
}
