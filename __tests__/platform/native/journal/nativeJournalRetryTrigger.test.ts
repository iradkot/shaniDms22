import {createNativeJournalForegroundRetryTrigger} from 'app/platform/native/journal';

describe('native Journal foreground retry trigger', () => {
  it('emits only when the app becomes active and removes its subscription', () => {
    let onChange: ((state: string) => void) | undefined;
    const remove = jest.fn();
    const source = {
      addEventListener: jest.fn(
        (_event: 'change', listener: (state: string) => void) => {
          onChange = listener;
          return {remove};
        },
      ),
    };
    const listener = jest.fn();
    const unsubscribe =
      createNativeJournalForegroundRetryTrigger(source).subscribe(listener);

    onChange?.('background');
    onChange?.('inactive');
    expect(listener).not.toHaveBeenCalled();

    onChange?.('active');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
