export const ALERT_DELIVERY_MODES = [
  'sound-and-vibrate',
  'vibrate-only',
  'silent',
] as const;

/** Device-local delivery behavior shared by all glucose alert rules. */
export type AlertDeliveryMode = (typeof ALERT_DELIVERY_MODES)[number];

export const DEFAULT_ALERT_DELIVERY_MODE: AlertDeliveryMode =
  'sound-and-vibrate';
