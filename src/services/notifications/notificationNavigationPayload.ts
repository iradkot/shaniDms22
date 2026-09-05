export type NotificationData = Record<string, string | undefined>;

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Reads navigation data from both supported notification envelopes:
 * Firebase Messaging puts it at `data`; Notifee nests it under
 * `notification.data`.
 */
export function readNotificationData(
  value: unknown,
): NotificationData | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const envelope = value as {data?: unknown; notification?: unknown};
  const nestedNotification =
    envelope.notification && typeof envelope.notification === 'object'
      ? (envelope.notification as {data?: unknown})
      : undefined;
  const candidate = nestedNotification?.data ?? envelope.data;
  if (!candidate || typeof candidate !== 'object') {
    return undefined;
  }

  const data: NotificationData = {};
  for (const [key, item] of Object.entries(candidate)) {
    if (typeof item === 'string' || item === undefined) {
      data[key] = item;
    }
  }

  return Object.keys(data).length > 0 ? data : undefined;
}
