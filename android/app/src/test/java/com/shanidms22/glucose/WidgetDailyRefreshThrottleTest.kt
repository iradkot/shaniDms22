package com.shanidms22.glucose

import org.junit.Assert.*
import org.junit.Test

class WidgetDailyRefreshThrottleTest {
  private val source = WidgetSyncConfiguration.Ready("https://example.invalid", "synthetic-read-token", false, "synthetic-owner", "a".repeat(40))

  @Test fun `repeated foreground snapshots retry missing data once per minute`() {
    val gate = WidgetDailyRefreshThrottle()
    assertTrue(gate.claim(source, 70 to 200, 0))
    assertFalse(gate.claim(source, 70 to 200, 1))
    assertFalse(gate.claim(source, 70 to 200, 59_999))
    assertTrue(gate.claim(source, 70 to 200, 60_000))
  }

  @Test fun `changed range or source can recover immediately`() {
    val gate = WidgetDailyRefreshThrottle()
    assertTrue(gate.claim(source, 70 to 180, 0))
    assertTrue(gate.claim(source, 70 to 200, 1))
    assertTrue(gate.claim(source.copy(baseUrl = "https://other.invalid"), 70 to 200, 2))
    assertTrue(gate.claim(source.copy(apiSecretSha1 = "replacement"), 70 to 200, 3))
  }
}
