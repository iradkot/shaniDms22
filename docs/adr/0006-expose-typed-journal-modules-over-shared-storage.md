# Expose typed Journal Modules over shared storage

Meal and Activity remain separate Modules with typed Interfaces for their own create, edit, list, and delete behaviour. Their Implementation shares a common Journal Entry record for identity, Workspace, time, revision, deletion, and synchronisation, with kind-specific detail records and a durable outbox behind the Seam. This preserves simple callers and separate product experiences while concentrating offline-first behaviour and Firebase synchronisation in one deep Module.
