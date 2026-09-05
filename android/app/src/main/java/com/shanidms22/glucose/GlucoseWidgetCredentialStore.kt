package com.shanidms22.glucose

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The encrypted form that may safely be persisted in ordinary app preferences. */
internal data class EncryptedWidgetCredential(
  val ciphertext: String,
  val initializationVector: String,
)

internal sealed class WidgetCredentialAccess {
  data class Available(val apiSecretSha1: String) : WidgetCredentialAccess()
  data object NotConfigured : WidgetCredentialAccess()
  data object Unavailable : WidgetCredentialAccess()
}

internal sealed class WidgetSyncConfiguration {
  data class Ready(
    val baseUrl: String,
    val apiSecretSha1: String?,
    val liveMode: Boolean,
  ) : WidgetSyncConfiguration()

  data object Disabled : WidgetSyncConfiguration()
  data object CredentialUnavailable : WidgetSyncConfiguration()
}

internal data class WidgetSyncConfigurationWriteResult(
  val effectiveEnabled: Boolean,
  val baseUrl: String?,
)

/** Small interfaces keep the migration/failure policy testable without Android Keystore. */
internal interface WidgetCredentialCipher {
  fun encrypt(plaintext: String): EncryptedWidgetCredential
  fun decrypt(encrypted: EncryptedWidgetCredential): String
  fun deleteKey()
}

internal interface WidgetCredentialPersistence {
  fun hasEncryptedMaterial(): Boolean
  fun expectsEncryptedCredential(): Boolean
  fun readEncrypted(): EncryptedWidgetCredential?
  fun hasLegacyPlaintext(): Boolean
  fun readLegacyPlaintext(): String?
  fun writeEncryptedAndRemoveLegacy(encrypted: EncryptedWidgetCredential): Boolean
  fun removeLegacyPlaintext(): Boolean
  fun clear(disableBackgroundSync: Boolean): Boolean
}

/**
 * Owns credential migration and fail-closed behavior.
 *
 * A legacy plaintext credential is returned only after its encrypted replacement has been
 * committed and the plaintext entry has been removed in that same preference transaction.
 */
internal class WidgetCredentialVault(
  private val persistence: WidgetCredentialPersistence,
  private val cipher: WidgetCredentialCipher,
) {
  fun store(apiSecretSha1: String?): Boolean {
    val normalized = apiSecretSha1?.trim().orEmpty()
    if (normalized.isEmpty()) return clear()

    return try {
      val encrypted = encryptWithKeyRecovery(normalized) ?: return failClosedAndReturnFalse()
      if (persistence.writeEncryptedAndRemoveLegacy(encrypted)) {
        true
      } else {
        failClosedAndReturnFalse()
      }
    } catch (_: Throwable) {
      failClosedAndReturnFalse()
    }
  }

  fun read(): WidgetCredentialAccess {
    return try {
      readInternal()
    } catch (_: Throwable) {
      failClosed()
    }
  }

  fun clear(): Boolean {
    // Deleting the key first makes any leftover ciphertext unusable even if the preference
    // commit subsequently fails.
    val keyDeleted = deleteKeyWithRetry()
    val preferencesCleared = clearPersistenceWithRetry(disableBackgroundSync = false)
    return keyDeleted && preferencesCleared
  }

  private fun readInternal(): WidgetCredentialAccess {
    if (persistence.hasEncryptedMaterial()) {
      val encrypted = persistence.readEncrypted() ?: return failClosed()
      val plaintext = cipher.decrypt(encrypted).trim()
      if (plaintext.isEmpty()) return failClosed()

      if (persistence.hasLegacyPlaintext() && !persistence.removeLegacyPlaintext()) {
        return failClosed()
      }
      return WidgetCredentialAccess.Available(plaintext)
    }

    if (!persistence.hasLegacyPlaintext()) {
      return if (persistence.expectsEncryptedCredential()) {
        failClosed()
      } else {
        WidgetCredentialAccess.NotConfigured
      }
    }

    val legacyPlaintext = persistence.readLegacyPlaintext()?.trim().orEmpty()
    if (legacyPlaintext.isEmpty()) {
      return if (persistence.removeLegacyPlaintext()) {
        WidgetCredentialAccess.NotConfigured
      } else {
        failClosed()
      }
    }

    val encrypted = encryptWithKeyRecovery(legacyPlaintext) ?: return failClosed()
    if (!persistence.writeEncryptedAndRemoveLegacy(encrypted)) return failClosed()
    return WidgetCredentialAccess.Available(legacyPlaintext)
  }

  private fun encryptWithKeyRecovery(plaintext: String): EncryptedWidgetCredential? {
    return runCatching { cipher.encrypt(plaintext) }.getOrElse {
      // A restored app can have ciphertext metadata but no matching, device-bound key.
      // Removing a stale alias allows a fresh user-supplied or legacy value to be re-keyed.
      runCatching { cipher.deleteKey() }
      runCatching { cipher.encrypt(plaintext) }.getOrNull()
    }
  }

  private fun failClosedAndReturnFalse(): Boolean {
    failClosed()
    return false
  }

  private fun failClosed(): WidgetCredentialAccess {
    deleteKeyWithRetry()
    clearPersistenceWithRetry(disableBackgroundSync = true)
    return WidgetCredentialAccess.Unavailable
  }

  private fun deleteKeyWithRetry(): Boolean {
    repeat(CLEANUP_ATTEMPTS) {
      if (runCatching { cipher.deleteKey() }.isSuccess) return true
    }
    return false
  }

  private fun clearPersistenceWithRetry(disableBackgroundSync: Boolean): Boolean {
    repeat(CLEANUP_ATTEMPTS) {
      val cleared = runCatching { persistence.clear(disableBackgroundSync) }
        .getOrDefault(false)
      if (cleared) return true
    }
    return false
  }

  private companion object {
    const val CLEANUP_ATTEMPTS = 2
  }
}

/** Process-wide entry point used by React configuration, WorkManager, and the live service. */
internal object GlucoseWidgetCredentialStore {
  private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
  private const val KEY_ALIAS = "com.shanidms22.glucose.widget.nightscout.v1"
  private const val CIPHER_TRANSFORMATION = "AES/GCM/NoPadding"
  private const val GCM_TAG_LENGTH_BITS = 128

  internal const val LEGACY_PLAINTEXT_KEY = "api_secret_sha1"
  internal const val ENCRYPTED_VALUE_KEY = "api_secret_sha1_ciphertext_v1"
  internal const val ENCRYPTED_IV_KEY = "api_secret_sha1_iv_v1"
  internal const val EXPECTS_ENCRYPTED_CREDENTIAL_KEY = "api_secret_sha1_expected_v1"

  private val lock = Any()

  /** Serializes URL + credential changes with worker/service configuration snapshots. */
  fun <T> withConfigurationLock(block: () -> T): T = synchronized(lock) {
    block()
  }

  fun writeSyncConfiguration(
    context: Context,
    baseUrl: String?,
    apiSecretSha1: String?,
    enabled: Boolean,
  ): WidgetSyncConfigurationWriteResult = synchronized(lock) {
    val prefs = preferences(context)
    val credentialVault = vault(prefs)
    val normalizedBaseUrl = baseUrl?.trim()
    val hasLiveModePreference = prefs.contains(GlucoseSyncWorker.KEY_LIVE_MODE)

    // Fail closed before rotating configuration. If the process dies between commits, the old
    // URL can no longer run with a newly rotated credential (or vice versa).
    if (!prefs.edit().putBoolean(GlucoseSyncWorker.KEY_ENABLED, false).commit()) {
      credentialVault.clear()
      return@synchronized WidgetSyncConfigurationWriteResult(false, normalizedBaseUrl)
    }

    val credentialStored = if (enabled) {
      credentialVault.store(apiSecretSha1)
    } else {
      // Account removal and explicit disable must not leave a usable background credential.
      credentialVault.clear()
    }
    var effectiveEnabled = enabled && credentialStored

    val editor = prefs.edit()
      .putString(GlucoseSyncWorker.KEY_BASE_URL, normalizedBaseUrl)
      .putBoolean(GlucoseSyncWorker.KEY_ENABLED, effectiveEnabled)
    if (!hasLiveModePreference) editor.putBoolean(GlucoseSyncWorker.KEY_LIVE_MODE, true)

    if (!editor.commit()) {
      effectiveEnabled = false
      credentialVault.clear()
      prefs.edit().putBoolean(GlucoseSyncWorker.KEY_ENABLED, false).commit()
    }

    WidgetSyncConfigurationWriteResult(effectiveEnabled, normalizedBaseUrl)
  }

  fun readSyncConfiguration(context: Context): WidgetSyncConfiguration = synchronized(lock) {
    val prefs = preferences(context)
    val enabled = prefs.getBoolean(GlucoseSyncWorker.KEY_ENABLED, false)
    val baseUrl = prefs.getString(GlucoseSyncWorker.KEY_BASE_URL, null)?.trim().orEmpty()
    if (!enabled || baseUrl.isBlank()) return@synchronized WidgetSyncConfiguration.Disabled

    when (val credential = vault(prefs).read()) {
      is WidgetCredentialAccess.Available -> WidgetSyncConfiguration.Ready(
        baseUrl = baseUrl,
        apiSecretSha1 = credential.apiSecretSha1,
        liveMode = prefs.getBoolean(GlucoseSyncWorker.KEY_LIVE_MODE, true),
      )
      WidgetCredentialAccess.NotConfigured -> WidgetSyncConfiguration.Ready(
        baseUrl = baseUrl,
        apiSecretSha1 = null,
        liveMode = prefs.getBoolean(GlucoseSyncWorker.KEY_LIVE_MODE, true),
      )
      WidgetCredentialAccess.Unavailable -> WidgetSyncConfiguration.CredentialUnavailable
    }
  }

  private fun preferences(context: Context): SharedPreferences =
    (context.applicationContext ?: context)
      .getSharedPreferences(GlucoseSyncWorker.PREFS, Context.MODE_PRIVATE)

  private fun vault(prefs: SharedPreferences): WidgetCredentialVault {
    return WidgetCredentialVault(
      persistence = SharedPreferencesWidgetCredentialPersistence(prefs),
      cipher = AndroidKeystoreWidgetCredentialCipher(),
    )
  }

  private class SharedPreferencesWidgetCredentialPersistence(
    private val prefs: SharedPreferences,
  ) : WidgetCredentialPersistence {
    override fun hasEncryptedMaterial(): Boolean =
      prefs.contains(ENCRYPTED_VALUE_KEY) || prefs.contains(ENCRYPTED_IV_KEY)

    override fun expectsEncryptedCredential(): Boolean =
      prefs.getBoolean(EXPECTS_ENCRYPTED_CREDENTIAL_KEY, false)

    override fun readEncrypted(): EncryptedWidgetCredential? {
      val ciphertext = prefs.getString(ENCRYPTED_VALUE_KEY, null)?.takeIf { it.isNotBlank() }
        ?: return null
      val iv = prefs.getString(ENCRYPTED_IV_KEY, null)?.takeIf { it.isNotBlank() }
        ?: return null
      return EncryptedWidgetCredential(ciphertext, iv)
    }

    override fun hasLegacyPlaintext(): Boolean = prefs.contains(LEGACY_PLAINTEXT_KEY)

    override fun readLegacyPlaintext(): String? = prefs.getString(LEGACY_PLAINTEXT_KEY, null)

    override fun writeEncryptedAndRemoveLegacy(encrypted: EncryptedWidgetCredential): Boolean =
      prefs.edit()
        .putString(ENCRYPTED_VALUE_KEY, encrypted.ciphertext)
        .putString(ENCRYPTED_IV_KEY, encrypted.initializationVector)
        .putBoolean(EXPECTS_ENCRYPTED_CREDENTIAL_KEY, true)
        .remove(LEGACY_PLAINTEXT_KEY)
        .commit()

    override fun removeLegacyPlaintext(): Boolean =
      prefs.edit().remove(LEGACY_PLAINTEXT_KEY).commit()

    override fun clear(disableBackgroundSync: Boolean): Boolean {
      val editor = prefs.edit()
        .remove(ENCRYPTED_VALUE_KEY)
        .remove(ENCRYPTED_IV_KEY)
        .remove(LEGACY_PLAINTEXT_KEY)
      if (disableBackgroundSync) {
        editor
          .putBoolean(EXPECTS_ENCRYPTED_CREDENTIAL_KEY, true)
          .putBoolean(GlucoseSyncWorker.KEY_ENABLED, false)
      } else {
        editor.putBoolean(EXPECTS_ENCRYPTED_CREDENTIAL_KEY, false)
      }
      return editor.commit()
    }
  }

  private class AndroidKeystoreWidgetCredentialCipher : WidgetCredentialCipher {
    override fun encrypt(plaintext: String): EncryptedWidgetCredential {
      val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
      cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
      val ciphertext = cipher.doFinal(plaintext.toByteArray(StandardCharsets.UTF_8))
      return EncryptedWidgetCredential(
        ciphertext = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
        initializationVector = Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
      )
    }

    override fun decrypt(encrypted: EncryptedWidgetCredential): String {
      val key = existingKey() ?: throw IllegalStateException("Widget credential key is missing")
      val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
      val iv = Base64.decode(encrypted.initializationVector, Base64.NO_WRAP)
      cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
      val plaintext = cipher.doFinal(Base64.decode(encrypted.ciphertext, Base64.NO_WRAP))
      return String(plaintext, StandardCharsets.UTF_8)
    }

    override fun deleteKey() {
      val keyStore = loadKeyStore()
      if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS)
    }

    private fun existingKey(): SecretKey? =
      loadKeyStore().getKey(KEY_ALIAS, null) as? SecretKey

    private fun getOrCreateKey(): SecretKey = synchronized(lock) {
      existingKey()?.let { return@synchronized it }

      val keyGenerator = KeyGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_AES,
        KEYSTORE_PROVIDER,
      )
      val keySpec = KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .setUserAuthenticationRequired(false)
        .build()
      keyGenerator.init(keySpec)
      keyGenerator.generateKey()
    }

    private fun loadKeyStore(): KeyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
      load(null)
    }
  }
}
