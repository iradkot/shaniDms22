export type Trend =
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
  times_called: number[];
  time_read: number;
  trend: Trend;
}
export interface NotificationResponse extends NotificationRequest {
  id: string;
}
