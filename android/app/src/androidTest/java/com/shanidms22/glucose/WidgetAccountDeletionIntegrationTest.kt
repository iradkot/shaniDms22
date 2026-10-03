package com.shanidms22.glucose

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class WidgetAccountDeletionIntegrationTest {
  private class IsolatedContext(base: Context) : ContextWrapper(base) {
    private val prefix = "deletion_qa_${UUID.randomUUID()}_"
    private val names = mutableSetOf<String>()
    override fun getApplicationContext(): Context = this
    override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
      val actual = prefix + name
      names.add(actual)
      return baseContext.getSharedPreferences(actual, mode)
    }
    fun cleanUp() { names.forEach { baseContext.deleteSharedPreferences(it) } }
  }
  private fun context() = IsolatedContext(InstrumentationRegistry.getInstrumentation().targetContext)

  @Test fun deletionClearsNativeVaultAndHealthAndRejectsAnInflightWorker() {
    val context = context()
    val executor = Executors.newSingleThreadExecutor()
    val entered = CountDownLatch(1)
    val release = CountDownLatch(1)
    val source = "a".repeat(40)
    try {
      assertTrue(GlucoseWidgetCredentialStore.writeSyncConfiguration(context, "https://synthetic.example", "synthetic-read-token", true, "A", source).effectiveEnabled)
      val health = context.getSharedPreferences("glucose_live_prefs", Context.MODE_PRIVATE)
      assertTrue(health.edit().putInt("value", 123).putString("daily_history_recorded_v2", "synthetic-history").commit())
      val worker = executor.submit<Boolean> {
        GlucoseWidgetSync.syncOnce(context) { _, _ ->
          entered.countDown()
          check(release.await(20, TimeUnit.SECONDS))
          JSONArray().put(JSONObject().put("sgv", 199).put("date", System.currentTimeMillis()))
        }
      }
      assertTrue(entered.await(10, TimeUnit.SECONDS))
      assertTrue(GlucoseWidgetCredentialStore.deleteAccount(context, "A", setOf(source)))
      release.countDown()
      assertFalse(worker.get(20, TimeUnit.SECONDS))
      assertEquals(WidgetSyncConfiguration.Disabled, GlucoseWidgetCredentialStore.readSyncConfiguration(context))
      assertTrue(health.all.isEmpty())
      val prefs = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
      assertFalse(prefs.contains(GlucoseWidgetCredentialStore.ENCRYPTED_VALUE_KEY))
      assertFalse(prefs.contains(GlucoseWidgetCredentialStore.LEGACY_PLAINTEXT_KEY))
      assertFalse(prefs.contains(GlucoseSyncWorker.KEY_BASE_URL))
      assertFalse(GlucoseWidgetCredentialStore.writeSyncConfiguration(context, "https://synthetic.example", "late-old-token", true, "A", source).effectiveEnabled)
      assertTrue(health.all.isEmpty())
    } finally { release.countDown(); executor.shutdownNow(); context.cleanUp() }
  }

  @Test fun recoveryForADoesNotEraseBOrItsCredentialEvenOnTheSameURL() {
    val context = context()
    try {
      val url = "https://shared-synthetic.example"
      val sourceB = "b".repeat(40)
      assertTrue(GlucoseWidgetCredentialStore.writeSyncConfiguration(context, url, "B-synthetic-token", true, "B", sourceB).effectiveEnabled)
      val before = GlucoseWidgetCredentialStore.readSyncConfiguration(context)
      val health = context.getSharedPreferences("glucose_live_prefs", Context.MODE_PRIVATE)
      assertTrue(health.edit().putInt("value", 144).commit())
      assertFalse(GlucoseWidgetCredentialStore.deleteAccount(context, "A", setOf("a".repeat(40))))
      assertEquals(before, GlucoseWidgetCredentialStore.readSyncConfiguration(context))
      assertEquals(144, health.getInt("value", -1))
      assertFalse(GlucoseWidgetCredentialStore.writeSyncConfiguration(context, url, "late-A-token", true, "A", "a".repeat(40)).effectiveEnabled)
      assertEquals(before, GlucoseWidgetCredentialStore.readSyncConfiguration(context))
    } finally { context.cleanUp() }
  }

  @Test fun unownedLegacyDataIsPreservedButCannotStartBackgroundNetworkReads() {
    val context = context()
    try {
      val url = "https://unattributed-synthetic.example"
      assertTrue(GlucoseWidgetCredentialStore.writeSyncConfiguration(context, url, "unknown-legacy-token", true).effectiveEnabled)
      val prefs = context.getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)
      val retainedCiphertext = prefs.getString(GlucoseWidgetCredentialStore.ENCRYPTED_VALUE_KEY, null)
      val health = context.getSharedPreferences("glucose_live_prefs", Context.MODE_PRIVATE)
      assertTrue(health.edit().putInt("value", 155).commit())
      var requests = 0
      assertFalse(GlucoseWidgetSync.syncOnce(context) { _, _ -> requests++; JSONArray() })
      assertEquals(0, requests)
      assertFalse(GlucoseWidgetCredentialStore.deleteAccount(context, "A", setOf("a".repeat(40))))
      assertEquals(retainedCiphertext, prefs.getString(GlucoseWidgetCredentialStore.ENCRYPTED_VALUE_KEY, null))
      assertEquals(155, health.getInt("value", -1))
      assertEquals(WidgetSyncConfiguration.Disabled, GlucoseWidgetCredentialStore.readSyncConfiguration(context))
    } finally { context.cleanUp() }
  }
}
