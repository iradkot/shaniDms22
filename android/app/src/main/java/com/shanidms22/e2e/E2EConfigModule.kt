package com.shanidms22.e2e

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.shanidms22.BuildConfig

class E2EConfigModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "E2EConfig"

  override fun getConstants(): MutableMap<String, Any> {
    return hashMapOf(
      "isE2E" to BuildConfig.E2E,
    )
  }
}
