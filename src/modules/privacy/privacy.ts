/** Increment when recipients, purposes, or data handling change. */
export const PRIVACY_POLICY_VERSION = '2026-10-03.1' as const;
export const PRIVACY_SUPPORT_EMAIL = 'irad16@gmail.com';

export interface PrivacyConsent {
  readonly policyVersion: string;
  readonly cloudSync: boolean;
  readonly aiProcessing: boolean;
  readonly updatedAtMs: number;
}

export const decodePrivacyConsent = (value: unknown): PrivacyConsent | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const input = value as Record<string, unknown>;
  if (
    input.policyVersion !== PRIVACY_POLICY_VERSION ||
    typeof input.cloudSync !== 'boolean' ||
    typeof input.aiProcessing !== 'boolean' ||
    (input.aiProcessing && !input.cloudSync) ||
    typeof input.updatedAtMs !== 'number' ||
    !Number.isSafeInteger(input.updatedAtMs) ||
    input.updatedAtMs < 0
  ) {
    return null;
  }
  return {
    policyVersion: input.policyVersion,
    cloudSync: input.cloudSync,
    aiProcessing: input.aiProcessing,
    updatedAtMs: input.updatedAtMs,
  };
};

export interface PrivacyRuntime {
  readonly consent: PrivacyConsent | null;
  readonly saveConsent: (
    cloudSync: boolean,
    aiProcessing: boolean,
  ) => Promise<void>;
  readonly deleteAccount: () => Promise<void>;
  readonly onClose?: () => void;
  readonly reauthenticate?: () => Promise<void>;
}

export const PRIVACY_POLICY = {
  en: [
    'ShaniDms pilot privacy policy. Operator: Irad. Contact: irad16@gmail.com. Version 2026-10-03.1.',
    'Purpose: display and review diabetes information. ShaniDms does not replace your sensor, pump, treatment plan, or medical team.',
    'On this device: glucose and treatment caches, Nightscout connection settings, meals, activity, images, preferences, AI conversations, and remembered context may be stored. Credentials use protected device storage on mobile. Browser data is stored in this browser and can be accessible to anyone using its profile.',
    'Optional cloud sync: Google Firebase stores account identity, app-owned meals and activities, images, alerts, preferences, and encrypted connection credentials. The ShaniDms server can decrypt credentials to contact Nightscout and OpenAI. Nightscout data used by the web app passes through this server. Cloud and provider processing may take place outside your country.',
    'Optional AI: OpenAI is the currently supported AI provider. The server forwards selected glucose, insulin and carbohydrate history, therapy context, relevant meals and activity, questions, conversation context, and remembered facts needed for the request. Image analysis sends the selected image only when you request it. Do not include another person’s information without their permission.',
    'Cloud sync and AI require separate affirmative choices. AI is off until you agree. You can withdraw either choice in Settings > Privacy. Withdrawal stops new transmissions from this app. It does not erase previously stored information; use Delete account and data for that.',
    'Retention: app-owned cloud data and encrypted credentials remain until you delete them or your account. Journal trash is normally recoverable for 30 days. Local caches and AI history can remain on a device until removed. Account deletion removes the active ShaniDms Firebase records, images, encrypted credentials, and Firebase login. It also clears ShaniDms local data on this device. Other offline devices may still hold local copies until you clear them. Nightscout, your Google account, and your original sensor or pump records are not deleted.',
    'Older app versions may have created device files or caches with no reliable owner. Account deletion preserves those unknown files to avoid erasing another account’s data. To erase every local ShaniDms copy, clear app storage in device settings or clear the site’s browser storage; this also removes local data for other accounts on that device.',
    'Google and OpenAI may retain service logs, backups, and data already processed under their own policies. ShaniDms cannot promise immediate removal from those systems. We do not intentionally sell your health data or use it for advertising. Contact the operator for privacy requests or questions.',
    'This policy describes the pilot implementation. Read Google’s privacy policy (https://policies.google.com/privacy) and OpenAI’s API data controls (https://developers.openai.com/api/docs/guides/your-data) before enabling those services.',
  ],
  he: [
    'מדיניות פרטיות לפיילוט ShaniDms. מפעיל: עירד. יצירת קשר: irad16@gmail.com. גרסה 2026-10-03.1.',
    'המטרה: הצגה ובדיקה של מידע על סוכרת. האפליקציה אינה מחליפה חיישן, משאבה, תוכנית טיפול או צוות רפואי.',
    'במכשיר הזה עשויים להישמר נתוני סוכר וטיפול במטמון, הגדרות חיבור ל־Nightscout, ארוחות, פעילות, תמונות, העדפות, שיחות AI ומידע שנזכר מהן. מפתחות גישה בנייד נשמרים באחסון המוגן של המכשיר. מידע בדפדפן נשמר בדפדפן הזה ועשוי להיות נגיש למי שמשתמש באותו פרופיל.',
    'סנכרון ענן לבחירה: Google Firebase שומרת את זהות החשבון, הארוחות והפעילויות שיצרת, תמונות, התראות, העדפות ומפתחות חיבור מוצפנים. שרת ShaniDms יכול לפענח את המפתחות כדי לפנות ל־Nightscout ול־OpenAI. נתוני Nightscout שמוצגים באפליקציית הדפדפן עוברים דרך השרת הזה. עיבוד בענן ואצל הספקים עשוי להתבצע מחוץ למדינה שלך.',
    'AI לבחירה: ספק ה־AI הנתמך כעת הוא OpenAI. השרת מעביר את נתוני הסוכר, האינסולין והפחמימות שנבחרו, הקשר טיפולי, ארוחות ופעילות רלוונטיות, שאלות, הקשר משיחה ועובדות שנזכרו לצורך הבקשה. ניתוח תמונה שולח את התמונה שבחרת רק בעקבות בקשה שלך. אין לכלול מידע של אדם אחר בלי רשותו.',
    'סנכרון ענן ו־AI דורשים בחירות מפורשות ונפרדות. AI כבוי עד להסכמתך. ניתן לבטל כל הסכמה בהגדרות > פרטיות. הביטול עוצר העברות חדשות מהאפליקציה. הוא אינו מוחק מידע שכבר נשמר; לכך יש לבחור מחיקת חשבון ונתונים.',
    'שמירה: המידע שנוצר באפליקציה בענן ומפתחות החיבור המוצפנים נשמרים עד למחיקתם או למחיקת החשבון. מידע בסל היומן ניתן בדרך כלל לשחזור במשך 30 ימים. מטמון ושיחות AI עשויים להישאר במכשיר עד למחיקה. מחיקת חשבון מסירה את הרשומות הפעילות ב־Firebase, התמונות, המפתחות המוצפנים והכניסה לחשבון ShaniDms. היא מנקה גם את מידע ShaniDms המקומי במכשיר הזה. מכשירים אחרים שאינם מחוברים עשויים להחזיק עותקים עד לניקוי שלהם. Nightscout, חשבון Google והמידע המקורי בחיישן או במשאבה אינם נמחקים.',
    'גרסאות ישנות עשויות ליצור קבצים או מטמון ללא שיוך אמין לחשבון. מחיקת חשבון משאירה מידע לא משויך כדי לא למחוק מידע של חשבון אחר. להסרת כל עותקי ShaniDms המקומיים ניתן לנקות את אחסון האפליקציה בהגדרות המכשיר או את אחסון האתר בדפדפן; פעולה זו מסירה גם מידע מקומי של חשבונות אחרים באותו מכשיר.',
    'Google ו־OpenAI עשויות לשמור יומני שירות, גיבויים ומידע שכבר עובד בהתאם למדיניות שלהן. ShaniDms אינה יכולה להבטיח מחיקה מיידית במערכות האלה. אין לנו כוונה למכור מידע רפואי או להשתמש בו לפרסום. בקשות ושאלות על פרטיות אפשר להפנות למפעיל.',
    'המדיניות מתארת את מימוש הפיילוט. לפני הפעלת השירותים יש לקרוא את מדיניות Google בכתובת https://policies.google.com/privacy ואת בקרות נתוני ה־API של OpenAI בכתובת https://developers.openai.com/api/docs/guides/your-data.',
  ],
} as const;
