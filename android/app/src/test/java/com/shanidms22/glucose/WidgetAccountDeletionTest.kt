package com.shanidms22.glucose

import org.junit.Assert.*
import org.junit.Test

class WidgetAccountDeletionTest {
  @Test fun `one failed subsystem does not leave other cleanup unattempted`() {
    val attempted = mutableListOf<String>()
    val operations = object : WidgetAccountDeletionOperations {
      override fun blockOwner() { attempted.add("block") }
      override fun ownsActiveConfiguration() = true
      override fun invalidateConfiguration() { attempted.add("credential"); error("disk failure") }
      override fun cancelSync() { attempted.add("scheduler") }
      override fun clearHealthData() { attempted.add("health") }
    }
    assertThrows(IllegalStateException::class.java) { deleteWidgetAccount(operations) }
    assertEquals(listOf("block", "credential", "scheduler", "health"), attempted)
  }

  @Test fun `a different native owner survives even when both accounts share a source`() {
    assertFalse(widgetDeletionOwnsConfiguration("A", "B"))
    assertTrue(widgetDeletionOwnsConfiguration("A", "A"))
  }

  @Test fun `an unowned legacy configuration cannot be attributed by its shared URL`() {
    assertFalse(widgetDeletionOwnsConfiguration("A", null))
    assertFalse(widgetDeletionOwnsConfiguration("A", ""))
  }
}
