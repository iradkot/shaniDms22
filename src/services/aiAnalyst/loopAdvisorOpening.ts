import type {AppLanguage} from 'app/contexts/AppLanguageContext';

/** A safe local opening; analysis starts only after evidence is available. */
export const buildLoopAdvisorOpening = (language: AppLanguage): string =>
  language === 'he'
    ? 'היי — מה מפריע לך לאחרונה, או מה היית רוצה לשפר בחוויית השימוש שלך ב־Loop?'
    : 'Hi — what has been bothering you lately, or what would you like to improve about your Loop experience?';
