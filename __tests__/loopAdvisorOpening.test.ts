import {buildLoopAdvisorOpening} from 'app/services/aiAnalyst/loopAdvisorOpening';

describe('Loop Advisor opening', () => {
  it('opens with a deterministic question instead of an unverified recommendation', () => {
    expect(buildLoopAdvisorOpening('en')).toBe(
      'Hi — what has been bothering you lately, or what would you like to improve about your Loop experience?',
    );
    expect(buildLoopAdvisorOpening('he')).toBe(
      'היי — מה מפריע לך לאחרונה, או מה היית רוצה לשפר בחוויית השימוש שלך ב־Loop?',
    );
  });
});
