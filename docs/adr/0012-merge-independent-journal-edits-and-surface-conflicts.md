# Merge independent Journal edits and surface conflicts

Offline devices may edit the same Journal Entry concurrently, so ShaniDms merges changes to independent fields but surfaces a Journal Conflict when the same field has incompatible values or one revision deletes an entry that another edits. A short revision history preserves both variants until resolution instead of applying document-level last-write-wins, accepting additional synchronisation complexity to prevent silent loss of health context.
