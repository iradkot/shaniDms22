import type {AiConversationFocus, AiLocale} from './types';

export interface AiRecommendationRequest {
  readonly kind: 'now' | 'meal' | 'weekly' | 'monthly' | 'guided';
  readonly horizon?: 'weekly' | 'monthly';
  readonly mealSize?: 'small' | 'medium' | 'large';
  readonly focus?: 'food' | 'routine' | 'care-team';
  readonly goal?: 'steadier-glucose' | 'fewer-lows' | 'easier-routine';
  readonly responseStyle?: 'brief' | 'detailed';
  readonly patientNotes?: string;
}

export interface AiRecommendationStart {
  readonly request: AiRecommendationRequest;
  readonly locale: AiLocale;
  readonly focus?: AiConversationFocus;
}

export interface AiRecommendationFeedback {
  readonly rating: 'helpful' | 'not-helpful';
  readonly reasons: readonly string[];
  readonly comment?: string;
}

export interface AiPatientMemorySnapshot {
  readonly enabled: boolean;
  readonly instructions: string;
  readonly feedbackCount: number;
  readonly questionCount: number;
}
