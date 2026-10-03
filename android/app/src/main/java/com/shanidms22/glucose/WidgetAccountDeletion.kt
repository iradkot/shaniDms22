package com.shanidms22.glucose

/** Deletion must attempt every independent cleanup even when one subsystem fails. */
internal interface WidgetAccountDeletionOperations {
  fun blockOwner()
  fun ownsActiveConfiguration(): Boolean
  fun invalidateConfiguration()
  fun cancelSync()
  fun clearHealthData()
}

internal fun deleteWidgetAccount(operations: WidgetAccountDeletionOperations) {
  val failures = mutableListOf<Throwable>()
  fun attempt(action: () -> Unit) {
    try { action() } catch (error: Throwable) { failures.add(error) }
  }
  attempt(operations::blockOwner)
  if (operations.ownsActiveConfiguration()) {
    attempt(operations::invalidateConfiguration)
    attempt(operations::cancelSync)
    attempt(operations::clearHealthData)
  }
  if (failures.isNotEmpty()) {
    throw IllegalStateException("Native account cleanup must be retried.", failures.first())
  }
}

/** An explicit native owner always wins over a URL shared by two accounts. */
internal fun widgetDeletionOwnsConfiguration(
  expectedOwner: String,
  activeOwner: String?,
): Boolean = !activeOwner.isNullOrBlank() && activeOwner == expectedOwner
