package com.shanidms22.glucose

import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class GlucoseLiveModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "GlucoseLiveModule"

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
  ) {
    val ts = timestampMs.toLong()
    val iobSafe = iob.takeIf { it.isFinite() && it > -900 }
    val cobSafe = cob.takeIf { it.isFinite() && it >= 0 }
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
      )
      GlucoseWidgetUpdater.updateWidgets(reactApplicationContext)
      GlucoseWidgetUpdater.updateNotification(reactApplicationContext)
    } catch (_: Throwable) {
      // Prevent native widget failures from crashing app process.
    }
  }

  @ReactMethod
  fun clearLiveSurface() {
    GlucoseWidgetUpdater.clear(reactApplicationContext)
  }

  @ReactMethod
  fun setWidgetThresholds(low: Double, high: Double) {
    val lowInt = low.takeIf { it.isFinite() && it > 0 }?.toInt()
    val highInt = high.takeIf { it.isFinite() && it > 0 }?.toInt()
    GlucoseWidgetUpdater.setThresholds(reactApplicationContext, lowInt, highInt)
  }

  @ReactMethod
  fun configureBackgroundSync(baseUrl: String?, apiSecretSha1: String?, enabled: Boolean) {
    GlucoseSyncScheduler.configure(
      context = reactApplicationContext,
      baseUrl = baseUrl,
      apiSecretSha1 = apiSecretSha1,
      enabled = enabled,
    )
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
