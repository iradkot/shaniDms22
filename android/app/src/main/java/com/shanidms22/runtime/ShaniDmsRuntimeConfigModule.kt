package com.shanidms22.runtime

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.shanidms22.BuildConfig

class ShaniDmsRuntimeConfigModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ShaniDmsRuntimeConfig"

  override fun getConstants(): MutableMap<String, Any> =
    hashMapOf(
      "backendBaseUrl" to BuildConfig.SHANI_BACKEND_BASE_URL,
      "firestoreRulesSchemaVersion" to BuildConfig.FIRESTORE_RULES_SCHEMA_VERSION,
    )
}
