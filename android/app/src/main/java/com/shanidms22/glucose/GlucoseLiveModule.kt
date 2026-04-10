package com.shanidms22.glucose

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class GlucoseLiveModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "GlucoseLiveModule"

  @ReactMethod
  fun updateLiveSurface(value: Int, trend: String?, timestampMs: Double) {
    val ts = timestampMs.toLong()
    GlucoseWidgetUpdater.save(reactApplicationContext, value, trend, ts)
    GlucoseWidgetUpdater.updateWidgets(reactApplicationContext)
    GlucoseWidgetUpdater.updateNotification(reactApplicationContext)
  }

  @ReactMethod
  fun clearLiveSurface() {
    GlucoseWidgetUpdater.clear(reactApplicationContext)
  }
}
