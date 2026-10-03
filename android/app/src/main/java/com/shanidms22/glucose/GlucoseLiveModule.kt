package com.shanidms22.glucose

import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray

class GlucoseLiveModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "GlucoseLiveModule"
  private var configurationRevision: Double? = null

  @ReactMethod
  fun updateLiveSurface(
    value: Int,
    trend: String?,
    timestampMs: Double,
    iob: Double,
    cob: Double,
    totalBasal: Double,
    totalBolus: Double,
    basalBolusRatio: Double,
    totalInsulin: Double,
    tir: Double,
    projected1: Double,
    projected2: Double,
    projected3: Double,
    low: Double,
    high: Double,
    iobTimestampMs: Double,
    cobTimestampMs: Double,
    sourceBaseUrl: String,
    sourceRevision: Double,
  ) {
    GlucoseWidgetCredentialStore.withConfigurationLock {
      val active = GlucoseWidgetCredentialStore.readSyncConfiguration(reactApplicationContext)
      if (sourceRevision != configurationRevision || active !is WidgetSyncConfiguration.Ready ||
        !widgetForecastAccountMatches(active.baseUrl, sourceBaseUrl)) return@withConfigurationLock
      val nowMs = System.currentTimeMillis()
      val ts = timestampMs.toLong()
      if (ts <= 0L || ts > nowMs || value <= 0) return@withConfigurationLock
      val iobTime = iobTimestampMs.toLong().takeIf { widgetTimestampIsFresh(it, nowMs) }
      val cobTime = cobTimestampMs.toLong().takeIf { widgetTimestampIsFresh(it, nowMs) }
      val iobSafe = iob.takeIf { it.isFinite() && kotlin.math.abs(it) <= 100 && iobTime != null }
      val cobSafe = cob.takeIf { it.isFinite() && it in 0.0..1000.0 && cobTime != null }
      val totalBasalSafe = totalBasal.takeIf { it.isFinite() && it >= 0 }
      val totalBolusSafe = totalBolus.takeIf { it.isFinite() && it >= 0 }
      val basalBolusRatioSafe = basalBolusRatio.takeIf { it.isFinite() && it >= 0 }
      val totalInsulinSafe = totalInsulin.takeIf { it.isFinite() && it >= 0 }
      val tirInt = tir.takeIf { it.isFinite() && it >= 0 && it <= 100 }?.toInt()
      val projected1Int = projected1.takeIf { it.isFinite() && it > 0 }?.toInt()
      val projected2Int = projected2.takeIf { it.isFinite() && it > 0 }?.toInt()
      val projected3Int = projected3.takeIf { it.isFinite() && it > 0 }?.toInt()
      val lowInt = low.takeIf { it.isFinite() && it > 0 }?.toInt()
      val highInt = high.takeIf { it.isFinite() && it > 0 }?.toInt()
      try {
        GlucoseWidgetUpdater.save(
          reactApplicationContext,
          value,
          trend,
          ts,
          iobSafe,
          cobSafe,
          totalBasalSafe,
          totalBolusSafe,
          basalBolusRatioSafe,
          totalInsulinSafe,
          tirInt,
          projected1Int,
          projected2Int,
          projected3Int,
          lowInt,
          highInt,
          iobTimestampMs = iobTime.takeIf { iobSafe != null },
          cobTimestampMs = cobTime.takeIf { cobSafe != null },
        )
        GlucoseWidgetUpdater.updateWidgets(reactApplicationContext)
        GlucoseWidgetUpdater.updateNotification(reactApplicationContext)
        GlucoseWidgetSync.refreshDailyIfNeeded(reactApplicationContext)
      } catch (_: Throwable) {
        // Prevent native widget failures from crashing app process.
      }
    }
  }

  @ReactMethod
  fun clearLiveSurface() {
    GlucoseWidgetUpdater.clear(reactApplicationContext)
  }

  @ReactMethod
  fun updateForecastSnapshot(accountBaseUrl: String, snapshotJson: String) {
    runCatching {
      GlucoseWidgetUpdater.saveForecast(reactApplicationContext, accountBaseUrl, snapshotJson)
      GlucoseWidgetUpdater.updateWidgets(reactApplicationContext)
    }
  }

  @ReactMethod
  fun setWidgetThresholds(low: Double, high: Double) {
    val lowInt = low.takeIf { it.isFinite() && it > 0 }?.toInt()
    val highInt = high.takeIf { it.isFinite() && it > 0 }?.toInt()
    GlucoseWidgetUpdater.setThresholds(reactApplicationContext, lowInt, highInt)
    GlucoseWidgetSync.refreshDailyIfNeeded(reactApplicationContext)
  }

  @ReactMethod
  fun configureBackgroundSync(baseUrl: String?, apiSecretSha1: String?, enabled: Boolean, sourceRevision: Double, ownerUserId: String?, sourceIdentity: String?) {
    GlucoseWidgetCredentialStore.withConfigurationLock {
      if (GlucoseWidgetCredentialStore.isOwnerDeleted(reactApplicationContext, ownerUserId)) return@withConfigurationLock
      if (!sourceRevision.isFinite() || sourceRevision < 0 ||
        configurationRevision?.let { sourceRevision < it } == true) return@withConfigurationLock
      configurationRevision = sourceRevision
      GlucoseSyncScheduler.configure(
        context = reactApplicationContext,
        baseUrl = baseUrl,
        apiSecretSha1 = apiSecretSha1,
        enabled = enabled,
        ownerUserId = ownerUserId,
        sourceIdentity = sourceIdentity,
      )
    }
  }

  @ReactMethod
  fun deleteAccountData(ownerUserId: String, sourceIdentities: ReadableArray, promise: Promise) {
    val sources = (0 until sourceIdentities.size()).mapNotNull { sourceIdentities.getString(it) }.toSet()
    Thread {
      try {
        GlucoseWidgetCredentialStore.withConfigurationLock {
          if (GlucoseWidgetCredentialStore.deleteAccount(reactApplicationContext, ownerUserId, sources)) {
            configurationRevision = null
          }
        }
        promise.resolve(null)
      } catch (error: Throwable) {
        promise.reject("native_account_cleanup_failed", "Native account cleanup must be retried.", error)
      }
    }.start()
  }

  @ReactMethod
  fun setLiveModeEnabled(enabled: Boolean) {
    GlucoseSyncScheduler.setLiveModeEnabled(reactApplicationContext, enabled)
  }

  @ReactMethod
  fun setWidgetRangeHours(hours: Double) {
    val intHours = hours.toInt().coerceIn(1, 12)
    val prefs = reactApplicationContext.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
    prefs.edit().putInt(GlucoseSyncWorker.KEY_SPARKLINE_HOURS, intHours).apply()
    try {
      GlucoseSyncScheduler.requestImmediateRefresh(reactApplicationContext)
    } catch (_: Throwable) {
      // Best effort.
    }
  }

  @ReactMethod
  fun setWidgetChartStyle(style: String?) {
    GlucoseWidgetUpdater.setSparklineStyle(reactApplicationContext, style)
  }
}
