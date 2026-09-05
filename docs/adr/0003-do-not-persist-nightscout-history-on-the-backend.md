# Do not persist Nightscout history on the ShaniDms backend

Nightscout remains the source of truth for glucose and treatment history. ShaniDms may keep a replaceable, source-isolated cache on each client, but its backend does not persist a copy of the raw Nightscout history; this reduces backend data ownership at the cost of each client having to synchronise independently.
