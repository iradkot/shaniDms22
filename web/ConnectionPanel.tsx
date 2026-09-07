import React, {useState} from 'react';
import {
  BrowserAiService,
  BrowserNightscoutClient,
  type AuthenticatedWebApiClient,
  type BrowserNightscoutStatus,
} from '../src/platform/web';
import {
  aiConnectionErrorMessage,
  getAiConnectionErrorCode,
  OPENAI_API_KEYS_URL,
  OPENAI_BILLING_URL,
} from '../src/product/settings/aiConnectionFeedback';

const COPY = {
  en: {
    title: 'Connections',
    close: 'Close',
    nightscout: 'Nightscout',
    nsHint:
      'The URL and API key are encrypted on the server and never returned to this browser.',
    url: 'Nightscout HTTPS URL',
    nsKey: 'Nightscout API key or secret',
    connect: 'Connect and verify',
    disconnect: 'Remove connection',
    connected: 'Connected',
    notConnected: 'Not connected',
    ai: 'AI analyst',
    aiHint:
      'The provider key is encrypted on the server. AI remains advisory only.',
    aiKey: 'OpenAI API key',
    saveAi: 'Save key',
    removeAi: 'Remove AI key',
    configured: 'Key saved · connection not tested',
    notConfigured: 'Not configured',
    saving: 'Saving…',
    testing: 'Testing…',
    testAi: 'Test saved key',
    testHint:
      'The test sends a short request to OpenAI without health data. A small API charge may apply.',
    saved: 'Key saved securely. Test the connection to confirm OpenAI access.',
    verified: 'OpenAI connection verified. AI is ready to use.',
    removed: 'AI key removed.',
    createKey: 'Open OpenAI API keys',
    billing: 'Open API billing',
    billingHint:
      'OpenAI API usage is billed separately from a ChatGPT subscription. Connect with an API key from OpenAI.',
    failed:
      'The connection could not be updated. Check your connection and try again.',
  },
  he: {
    title: 'חיבורים',
    close: 'סגירה',
    nightscout: 'Nightscout',
    nsHint: 'הכתובת והמפתח מוצפנים בשרת ולעולם אינם מוחזרים לדפדפן הזה.',
    url: 'כתובת HTTPS של Nightscout',
    nsKey: 'מפתח API או secret של Nightscout',
    connect: 'חיבור ואימות',
    disconnect: 'הסרת החיבור',
    connected: 'מחובר',
    notConnected: 'לא מחובר',
    ai: 'AI Analyst',
    aiHint: 'מפתח הספק מוצפן בשרת. ה־AI נשאר לייעוץ בלבד.',
    aiKey: 'מפתח API של OpenAI',
    saveAi: 'שמירת מפתח',
    removeAi: 'הסרת מפתח AI',
    configured: 'מפתח נשמר · החיבור טרם נבדק',
    notConfigured: 'לא מוגדר',
    saving: 'שומר…',
    testing: 'בודק…',
    testAi: 'בדיקת המפתח השמור',
    testHint:
      'הבדיקה שולחת בקשה קצרה ל־OpenAI ללא מידע רפואי. ייתכן חיוב API קטן.',
    saved:
      'המפתח נשמר בצורה מאובטחת. יש לבדוק את החיבור כדי לוודא גישה ל־OpenAI.',
    verified: 'החיבור ל־OpenAI נבדק בהצלחה. ה־AI מוכן לשימוש.',
    removed: 'מפתח ה־AI הוסר.',
    createKey: 'פתיחת מפתחות API ב־OpenAI',
    billing: 'פתיחת חיוב API',
    billingHint:
      'השימוש ב־OpenAI API מחויב בנפרד ממנוי ChatGPT. החיבור מתבצע באמצעות מפתח API מ־OpenAI.',
    failed: 'לא הצלחנו לעדכן את החיבור. יש לבדוק את חיבור האינטרנט ולנסות שוב.',
  },
} as const;

export const ConnectionPanel = (props: {
  readonly locale: 'en' | 'he';
  readonly api: AuthenticatedWebApiClient;
  readonly nightscout: BrowserNightscoutStatus;
  readonly aiConfigured: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) => {
  const copy = COPY[props.locale];
  const [nightscoutUrl, setNightscoutUrl] = useState('');
  const [nightscoutKey, setNightscoutKey] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [aiConfigured, setAiConfigured] = useState(props.aiConfigured);
  const [aiVerified, setAiVerified] = useState(false);
  const [nightscoutConfigured, setNightscoutConfigured] = useState(
    props.nightscout.configured,
  );
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [messageIsError, setMessageIsError] = useState(false);

  const run = async (operation: () => Promise<void>, ai = false) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await operation();
    } catch (error) {
      setMessageIsError(true);
      setMessage(
        ai
          ? aiConnectionErrorMessage(
              props.locale,
              getAiConnectionErrorCode(error),
            )
          : copy.failed,
      );
    } finally {
      setBusy(false);
      setTesting(false);
    }
  };

  const success = (text: string) => {
    setMessageIsError(false);
    setMessage(text);
  };

  return (
    <div className="web-modal-backdrop" role="presentation">
      <section
        aria-label={copy.title}
        aria-modal="true"
        className="web-connection-panel"
        dir={props.locale === 'he' ? 'rtl' : 'ltr'}
        role="dialog">
        <div className="web-panel-heading">
          <h2>{copy.title}</h2>
          <button disabled={busy} onClick={props.onClose} type="button">
            {copy.close}
          </button>
        </div>
        {message ? (
          <p
            className={messageIsError ? 'web-panel-error' : undefined}
            role={messageIsError ? 'alert' : 'status'}>
            {message}
          </p>
        ) : null}
        <div className="web-connection-card">
          <div className="web-card-title-row">
            <h3>{copy.nightscout}</h3>
            <span className={nightscoutConfigured ? 'connected' : undefined}>
              {nightscoutConfigured ? copy.connected : copy.notConnected}
            </span>
          </div>
          <p>{copy.nsHint}</p>
          <label>
            <span>{copy.url}</span>
            <input
              autoComplete="url"
              disabled={busy}
              inputMode="url"
              onChange={event => setNightscoutUrl(event.target.value)}
              placeholder="https://example.nightscout.site"
              type="url"
              value={nightscoutUrl}
            />
          </label>
          <label>
            <span>{copy.nsKey}</span>
            <input
              autoComplete="off"
              disabled={busy}
              onChange={event => setNightscoutKey(event.target.value)}
              type="password"
              value={nightscoutKey}
            />
          </label>
          <div className="web-panel-actions">
            <button
              disabled={busy || !nightscoutUrl.trim() || !nightscoutKey.trim()}
              onClick={() =>
                run(async () => {
                  await BrowserNightscoutClient.provision(props.api, {
                    url: nightscoutUrl,
                    apiKey: nightscoutKey,
                  });
                  setNightscoutKey('');
                  setNightscoutConfigured(true);
                  props.onChanged();
                })
              }
              type="button">
              {busy ? copy.saving : copy.connect}
            </button>
            {nightscoutConfigured ? (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await BrowserNightscoutClient.remove(props.api);
                    setNightscoutKey('');
                    setNightscoutConfigured(false);
                    props.onChanged();
                  })
                }
                type="button">
                {copy.disconnect}
              </button>
            ) : null}
          </div>
        </div>
        <div className="web-connection-card">
          <div className="web-card-title-row">
            <h3>{copy.ai}</h3>
            <span className={aiVerified ? 'connected' : undefined}>
              {aiVerified
                ? copy.connected
                : aiConfigured
                ? copy.configured
                : copy.notConfigured}
            </span>
          </div>
          <p>{copy.aiHint}</p>
          <p>{copy.billingHint}</p>
          <div className="web-panel-actions">
            <a
              href={OPENAI_API_KEYS_URL}
              target="_blank"
              rel="noopener noreferrer">
              {copy.createKey}
            </a>
            <a
              href={OPENAI_BILLING_URL}
              target="_blank"
              rel="noopener noreferrer">
              {copy.billing}
            </a>
          </div>
          <label>
            <span>{copy.aiKey}</span>
            <input
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              dir="ltr"
              disabled={busy}
              onChange={event => setAiKey(event.target.value)}
              type="password"
              value={aiKey}
            />
          </label>
          <div className="web-panel-actions">
            <button
              disabled={busy || !aiKey.trim()}
              onClick={() =>
                run(async () => {
                  await new BrowserAiService(props.api).provision(aiKey);
                  setAiKey('');
                  setAiConfigured(true);
                  setAiVerified(false);
                  success(copy.saved);
                  props.onChanged();
                }, true)
              }
              type="button">
              {busy && !testing ? copy.saving : copy.saveAi}
            </button>
            {aiConfigured ? (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    setTesting(true);
                    setAiVerified(false);
                    await new BrowserAiService(props.api).testConnection();
                    setAiVerified(true);
                    success(copy.verified);
                  }, true)
                }
                type="button">
                {testing ? copy.testing : copy.testAi}
              </button>
            ) : null}
            {aiConfigured ? (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await new BrowserAiService(props.api).remove();
                    setAiKey('');
                    setAiConfigured(false);
                    setAiVerified(false);
                    success(copy.removed);
                    props.onChanged();
                  }, true)
                }
                type="button">
                {copy.removeAi}
              </button>
            ) : null}
          </div>
          <p>{copy.testHint}</p>
        </div>
      </section>
    </div>
  );
};
