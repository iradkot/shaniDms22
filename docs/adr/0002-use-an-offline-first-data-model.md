# Use an offline-first data model

ShaniDms reads available local data immediately and synchronises remote changes in the background. App-Owned Data is accepted locally before Firebase is available, pending writes survive restarts, and network failure must be represented as offline or stale rather than as an empty result. Each active Workspace keeps a normalised 14-day hot cache; older requested data may remain under a replaceable 25 MB per-Workspace budget, excluding images. New AI responses still require a network connection, while existing AI history remains readable offline.
