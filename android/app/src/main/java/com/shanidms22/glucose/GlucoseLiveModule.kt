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
    iob: Double?,
    cob: Double?,
    projected: Double?,
  ) {
    val ts = timestampMs.toLong()
    val projectedInt = if (projected != null && projected.isFinite()) projected.toInt() else null
    GlucoseWidgetUpdater.save(reactApplicationContext, value, trend, ts, iob, cob, projectedInt)
    GlucoseWidgetUpdater.updateWidgets(reactApplicationContext)
    GlucoseWidgetUpdater.updateNotification(reactApplicationContext)
  }

  @ReactMethod
  fun clearLiveSurface() {
    GlucoseWidgetUpdater.clear(reactApplicationContext)
  }
}
