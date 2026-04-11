package com.shanidms22.glucose

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
    projected1: Double,
    projected2: Double,
    projected3: Double,
    low: Double,
    high: Double,
  ) {
    val ts = timestampMs.toLong()
    val iobSafe = iob.takeIf { it.isFinite() && it >= 0 }
    val cobSafe = cob.takeIf { it.isFinite() && it >= 0 }
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
}
