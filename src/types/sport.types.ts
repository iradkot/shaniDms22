import {CommonFormattedEvent} from 'app/types/commonEvent.types';

enum activityIntensity {
  VERY_LOW = 1,
  LOW = 2,
  MEDIUM = 3,
  HIGH = 4,
  VERY_HIGH = 5,
}

export interface SportItemDTO {
  name: string;
  durationMinutes: number; // duration in minutes of the sport activity
  intensity: activityIntensity; // intensity of the sport activity
  timestamp: number; // timestamp in milliseconds
}

export interface formattedSportItemDTO
  extends SportItemDTO,
    CommonFormattedEvent {}
