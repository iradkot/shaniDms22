import type {DestinationLocale} from '../destinations';

const MESSAGES = {
  en: {
    invalid_credential:
      'OpenAI rejected this key. Copy the full API key and try again.',
    provider_permission_denied:
      'This key lacks the required OpenAI permissions. Check its project and Responses permissions.',
    provider_model_unavailable:
      'The selected AI model is unavailable for this OpenAI project. Check model access.',
    unsupported_model:
      'The app’s AI model is not enabled on the server. The server configuration needs updating.',
    provider_quota_exceeded:
      'OpenAI API credit or quota is exhausted. Check billing and project limits in OpenAI.',
    rate_limited: 'Too many requests. Wait a moment and try again.',
    credential_missing: 'Save an OpenAI API key before testing the connection.',
    unauthenticated:
      'Your app session has expired. Sign in to the app again and retry.',
    unauthorized:
      'Your app session could not be verified. Sign in again and retry.',
    account_changed:
      'The signed-in account changed. Open AI settings again before saving.',
    backend_unconfigured:
      'The AI service is not available at the app’s server address. Its deployment or configuration needs fixing.',
    network:
      'Could not reach the server. Check your internet connection and retry.',
    timeout: 'The AI service took too long to respond. Try again.',
    upstream_timeout: 'OpenAI took too long to respond. Try again.',
    upstream_unavailable:
      'OpenAI is temporarily unavailable. Try again shortly.',
    upstream:
      'The AI service could not complete the request. Try again shortly.',
    internal_error:
      'The server could not complete secure storage. Its configuration may need attention. Try again.',
    invalid_response:
      'The AI service returned an unexpected response. Try again; if it continues, the server needs attention.',
    invalid_request:
      'The AI request is invalid. Check the input and try again.',
    request_too_large:
      'The AI request is too large. Try a shorter conversation or a smaller image.',
    upstream_rejected:
      'OpenAI could not complete this request. Check the key’s permissions and model access.',
    unknown: 'The operation could not be completed. Try again.',
  },
  he: {
    invalid_credential:
      'OpenAI דחתה את המפתח. יש להעתיק את מפתח ה־API המלא ולנסות שוב.',
    provider_permission_denied:
      'למפתח חסרות הרשאות ב־OpenAI. יש לבדוק את הפרויקט ואת הרשאת Responses.',
    provider_model_unavailable:
      'מודל ה־AI שנבחר אינו זמין לפרויקט הזה ב־OpenAI. יש לבדוק את הגישה למודל.',
    unsupported_model:
      'מודל ה־AI של האפליקציה אינו מופעל בשרת. נדרש עדכון של הגדרות השרת.',
    provider_quota_exceeded:
      'היתרה או המכסה של OpenAI API אזלה. יש לבדוק את החיוב ומגבלות הפרויקט ב־OpenAI.',
    rate_limited: 'נשלחו יותר מדי בקשות. כדאי להמתין מעט ולנסות שוב.',
    credential_missing: 'צריך לשמור מפתח API של OpenAI לפני בדיקת החיבור.',
    unauthenticated: 'ההתחברות לאפליקציה פגה. יש להתחבר שוב ולנסות מחדש.',
    unauthorized:
      'לא הצלחנו לאמת את החשבון באפליקציה. יש להתחבר שוב ולנסות מחדש.',
    account_changed:
      'החשבון המחובר השתנה. יש לפתוח שוב את הגדרות ה־AI לפני השמירה.',
    backend_unconfigured:
      'שירות ה־AI אינו זמין בכתובת השרת של האפליקציה. נדרש תיקון בפריסה או בהגדרות השרת.',
    network: 'לא הצלחנו להגיע לשרת. יש לבדוק את חיבור האינטרנט ולנסות שוב.',
    timeout: 'שירות ה־AI לא ענה בזמן. אפשר לנסות שוב.',
    upstream_timeout: 'OpenAI לא ענתה בזמן. אפשר לנסות שוב.',
    upstream_unavailable: 'OpenAI אינה זמינה כרגע. כדאי לנסות שוב בעוד מעט.',
    upstream: 'שירות ה־AI לא הצליח להשלים את הבקשה. כדאי לנסות שוב בעוד מעט.',
    internal_error:
      'השרת לא הצליח להשלים את השמירה המאובטחת. ייתכן שנדרש תיקון בהגדרותיו. אפשר לנסות שוב.',
    invalid_response:
      'התקבלה תשובה לא תקינה משירות ה־AI. אפשר לנסות שוב; אם התקלה נמשכת, נדרש טיפול בשרת.',
    invalid_request: 'בקשת ה־AI אינה תקינה. יש לבדוק את התוכן ולנסות שוב.',
    request_too_large:
      'בקשת ה־AI גדולה מדי. כדאי לנסות שיחה קצרה יותר או תמונה קטנה יותר.',
    upstream_rejected:
      'OpenAI לא הצליחה להשלים את הבקשה. יש לבדוק את הרשאות המפתח והגישה למודל.',
    unknown: 'לא הצלחנו להשלים את הפעולה. אפשר לנסות שוב.',
  },
} as const;

/** Only known codes reach the UI; raw errors may contain credentials. */
export const getAiConnectionErrorCode = (error: unknown): string => {
  if (typeof error !== 'object' || error === null) {
    return 'unknown';
  }
  const value = error as {code?: unknown; name?: unknown; status?: unknown};
  if (
    typeof value.code === 'string' &&
    Object.prototype.hasOwnProperty.call(MESSAGES.en, value.code)
  ) {
    return value.code;
  }
  if (value.status === 404) {
    return 'backend_unconfigured';
  }
  if (value.name === 'TimeoutError') {
    return 'timeout';
  }
  if (value.name === 'TypeError') {
    return 'network';
  }
  return 'unknown';
};

export const aiConnectionErrorMessage = (
  locale: DestinationLocale,
  code: string,
): string =>
  MESSAGES[locale][code as keyof typeof MESSAGES.en] ??
  MESSAGES[locale].unknown;

export const OPENAI_API_KEYS_URL = 'https://platform.openai.com/api-keys';
export const OPENAI_BILLING_URL =
  'https://platform.openai.com/settings/organization/billing/overview';
