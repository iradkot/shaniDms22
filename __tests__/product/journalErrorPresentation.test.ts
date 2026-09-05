import {
  presentJournalError,
  runPresentedJournalAction,
} from '../../src/product/journal';
import type {ActivityEntryId, JournalError} from '../../src/modules/journal';

describe('Journal error presentation', () => {
  it('does not expose the raw domain message in Hebrew', () => {
    const error: JournalError = {
      code: 'journal.storage_unavailable',
      message: 'LOW_LEVEL_STORAGE_MARKER',
      retryable: true,
    };

    const presented = presentJournalError(error, 'he');
    expect(presented).toBe('לא הצלחנו לשמור את השינוי במכשיר.');
    expect(presented).not.toContain('LOW_LEVEL_STORAGE_MARKER');
  });

  it('gives ongoing Activity conflicts a clear next step', () => {
    const error: JournalError = {
      code: 'journal.ongoing_activity_exists',
      message: 'raw',
      retryable: false,
      activityId: 'activity-1' as ActivityEntryId,
    };

    expect(presentJournalError(error, 'en')).toBe(
      'Finish the current activity before starting another one.',
    );
  });

  it('turns an unexpected rejection into safe product copy', async () => {
    await expect(
      runPresentedJournalAction(async () => {
        throw new Error('PRIVATE_IMPLEMENTATION_MARKER');
      }, 'he'),
    ).resolves.toEqual({
      ok: false,
      message: 'משהו השתבש. המידע המקומי לא השתנה.',
    });
  });
});
