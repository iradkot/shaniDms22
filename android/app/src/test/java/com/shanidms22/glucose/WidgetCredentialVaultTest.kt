package com.shanidms22.glucose

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class WidgetCredentialVaultTest {
  @Test
  fun `configuration lock prevents torn url and credential snapshots`() {
    val executor = Executors.newFixedThreadPool(2)
    val writerPaused = CountDownLatch(1)
    val finishWriter = CountDownLatch(1)
    var baseUrl = "https://old.example"
    var credential = "old-secret"

    try {
      val writer = executor.submit {
        GlucoseWidgetCredentialStore.withConfigurationLock {
          baseUrl = "https://new.example"
          writerPaused.countDown()
          assertTrue(finishWriter.await(5, TimeUnit.SECONDS))
          credential = "new-secret"
        }
      }
      assertTrue(writerPaused.await(5, TimeUnit.SECONDS))

      val readerStarted = CountDownLatch(1)
      val reader = executor.submit<Pair<String, String>> {
        readerStarted.countDown()
        GlucoseWidgetCredentialStore.withConfigurationLock { baseUrl to credential }
      }
      assertTrue(readerStarted.await(5, TimeUnit.SECONDS))
      Thread.sleep(25)
      assertFalse(reader.isDone)

      finishWriter.countDown()
      writer.get(5, TimeUnit.SECONDS)
      assertEquals("https://new.example" to "new-secret", reader.get(5, TimeUnit.SECONDS))
    } finally {
      finishWriter.countDown()
      executor.shutdownNow()
    }
  }

  @Test
  fun `new credential is encrypted and legacy plaintext is removed`() {
    val persistence = FakePersistence(legacyPlaintext = "old-secret", legacyPresent = true)
    val cipher = FakeCipher()
    val vault = WidgetCredentialVault(persistence, cipher)

    assertTrue(vault.store("  new-secret  "))

    assertFalse(persistence.legacyPresent)
    assertNotEquals("new-secret", persistence.encrypted?.ciphertext)
    assertEquals(
      WidgetCredentialAccess.Available("new-secret"),
      vault.read(),
    )
  }

  @Test
  fun `legacy plaintext migrates before it is returned`() {
    val persistence = FakePersistence(legacyPlaintext = "legacy-secret", legacyPresent = true)
    val vault = WidgetCredentialVault(persistence, FakeCipher())

    assertEquals(
      WidgetCredentialAccess.Available("legacy-secret"),
      vault.read(),
    )
    assertTrue(persistence.encryptedPresent)
    assertFalse(persistence.legacyPresent)
    assertEquals(1, persistence.encryptedWrites)
  }

  @Test
  fun `failed legacy migration removes credential and disables background sync`() {
    val persistence = FakePersistence(
      legacyPlaintext = "legacy-secret",
      legacyPresent = true,
      encryptedWriteSucceeds = false,
    )
    val vault = WidgetCredentialVault(persistence, FakeCipher())

    assertEquals(WidgetCredentialAccess.Unavailable, vault.read())
    assertFalse(persistence.legacyPresent)
    assertFalse(persistence.encryptedPresent)
    assertFalse(persistence.backgroundSyncEnabled)
  }

  @Test
  fun `invalid encrypted material is cleared and disables background sync`() {
    val persistence = FakePersistence(
      encrypted = EncryptedWidgetCredential("not-valid", "iv"),
      encryptedPresent = true,
    )
    val vault = WidgetCredentialVault(persistence, FakeCipher())

    assertEquals(WidgetCredentialAccess.Unavailable, vault.read())
    assertFalse(persistence.encryptedPresent)
    assertFalse(persistence.backgroundSyncEnabled)
  }

  @Test
  fun `missing half of encrypted payload fails closed`() {
    val persistence = FakePersistence(encrypted = null, encryptedPresent = true)
    val vault = WidgetCredentialVault(persistence, FakeCipher())

    assertEquals(WidgetCredentialAccess.Unavailable, vault.read())
    assertFalse(persistence.backgroundSyncEnabled)
  }

  @Test
  fun `missing encrypted payload fails closed when marker says credential is required`() {
    val persistence = FakePersistence(expectsEncryptedCredential = true)
    val vault = WidgetCredentialVault(persistence, FakeCipher())

    assertEquals(WidgetCredentialAccess.Unavailable, vault.read())
    assertFalse(persistence.backgroundSyncEnabled)
  }

  @Test
  fun `explicit clear removes ciphertext plaintext and key`() {
    val persistence = FakePersistence(
      encrypted = EncryptedWidgetCredential("enc:terces", "iv"),
      encryptedPresent = true,
      legacyPlaintext = "legacy-secret",
      legacyPresent = true,
    )
    val cipher = FakeCipher()
    val vault = WidgetCredentialVault(persistence, cipher)

    assertTrue(vault.clear())
    assertFalse(persistence.encryptedPresent)
    assertFalse(persistence.legacyPresent)
    assertEquals(1, cipher.deletedKeys)
  }

  @Test
  fun `cleanup failures are retried and never expose a corrupt credential`() {
    val persistence = FakePersistence(
      encrypted = EncryptedWidgetCredential("corrupt", "iv"),
      encryptedPresent = true,
      clearFailuresRemaining = 1,
    )
    val cipher = FakeCipher(deleteFailuresRemaining = 1)
    val vault = WidgetCredentialVault(persistence, cipher)

    assertEquals(WidgetCredentialAccess.Unavailable, vault.read())
    assertEquals(2, cipher.deleteAttempts)
    assertEquals(2, persistence.clearAttempts)
    assertFalse(persistence.backgroundSyncEnabled)
  }

  @Test
  fun `clear reports failure when keystore alias cannot be removed`() {
    val persistence = FakePersistence(
      encrypted = EncryptedWidgetCredential("enc:terces", "iv"),
      encryptedPresent = true,
    )
    val vault = WidgetCredentialVault(
      persistence,
      FakeCipher(deleteFailuresRemaining = 2),
    )

    assertFalse(vault.clear())
    assertFalse(persistence.encryptedPresent)
  }

  private class FakeCipher(
    private var deleteFailuresRemaining: Int = 0,
  ) : WidgetCredentialCipher {
    var deletedKeys = 0
    var deleteAttempts = 0

    override fun encrypt(plaintext: String): EncryptedWidgetCredential =
      EncryptedWidgetCredential("enc:${plaintext.reversed()}", "iv")

    override fun decrypt(encrypted: EncryptedWidgetCredential): String {
      require(encrypted.initializationVector == "iv")
      require(encrypted.ciphertext.startsWith("enc:"))
      return encrypted.ciphertext.removePrefix("enc:").reversed()
    }

    override fun deleteKey() {
      deleteAttempts += 1
      if (deleteFailuresRemaining > 0) {
        deleteFailuresRemaining -= 1
        error("delete failed")
      }
      deletedKeys += 1
    }
  }

  private class FakePersistence(
    var encrypted: EncryptedWidgetCredential? = null,
    var encryptedPresent: Boolean = encrypted != null,
    var legacyPlaintext: String? = null,
    var legacyPresent: Boolean = legacyPlaintext != null,
    var expectsEncryptedCredential: Boolean = encrypted != null,
    private val encryptedWriteSucceeds: Boolean = true,
    private var clearFailuresRemaining: Int = 0,
  ) : WidgetCredentialPersistence {
    var backgroundSyncEnabled = true
    var encryptedWrites = 0
    var clearAttempts = 0

    override fun hasEncryptedMaterial(): Boolean = encryptedPresent

    override fun expectsEncryptedCredential(): Boolean = expectsEncryptedCredential

    override fun readEncrypted(): EncryptedWidgetCredential? = encrypted

    override fun hasLegacyPlaintext(): Boolean = legacyPresent

    override fun readLegacyPlaintext(): String? = legacyPlaintext

    override fun writeEncryptedAndRemoveLegacy(encrypted: EncryptedWidgetCredential): Boolean {
      encryptedWrites += 1
      if (!encryptedWriteSucceeds) return false
      this.encrypted = encrypted
      encryptedPresent = true
      expectsEncryptedCredential = true
      legacyPlaintext = null
      legacyPresent = false
      return true
    }

    override fun removeLegacyPlaintext(): Boolean {
      legacyPlaintext = null
      legacyPresent = false
      return true
    }

    override fun clear(disableBackgroundSync: Boolean): Boolean {
      clearAttempts += 1
      if (clearFailuresRemaining > 0) {
        clearFailuresRemaining -= 1
        return false
      }
      encrypted = null
      encryptedPresent = false
      legacyPlaintext = null
      legacyPresent = false
      if (disableBackgroundSync) backgroundSyncEnabled = false
      expectsEncryptedCredential = disableBackgroundSync
      return true
    }
  }
}
