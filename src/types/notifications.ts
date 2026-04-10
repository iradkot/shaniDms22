export type TrendDirectionString =
  | 'FortyFiveDown'
  | 'FortyFiveUp'
  | 'SingleDown'
  | 'SingleUp'
  | 'DoubleDown'
  | 'DoubleUp'
  | 'Flat'
  | 'NOT COMPUTABLE'
  | 'RATE OUT OF RANGE';

export interface NotificationRequest {
  name: string;
  enabled: boolean;
  range_start: number;
  range_end: number;
  hour_from_in_minutes: number;
  hour_to_in_minutes: number;
  trend: TrendDirectionString;
}

export interface NotificationStored extends NotificationRequest {
  related_user?: string | null;
}

export interface NotificationResponse extends NotificationStored {
  id: string;
  times_called: number[];
  time_read: number;
}
