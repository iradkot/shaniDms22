import {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';
import DocumentReference = FirebaseFirestoreTypes.DocumentReference;

export type Trend =
  | 'FortyFiveDown'
  | 'FortyFiveUp'
  | 'SingleDown'
  | 'SingleUp'
  | 'DoubleDown'
  | 'DoubleUp'
  | 'Flat';

export interface NotificationRequest {
  name: string;
  enabled: boolean;
  range_start: number;
  range_end: number;
  hour_from_in_minutes: number;
  hour_to_in_minutes: number;
  trend: Trend;
  related_user: DocumentReference;
}
export interface NotificationResponse extends NotificationRequest {
  id: string;
  times_called: number[];
  time_read: number;
}
