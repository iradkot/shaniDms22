import React, {useState} from 'react';
import {
  BrowserAiService,
  BrowserNightscoutClient,
  type AuthenticatedWebApiClient,
  type BrowserNightscoutStatus,
} from '../src/platform/web';

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
    saveAi: 'Save and verify key',
    removeAi: 'Remove AI key',
    configured: 'Configured',
    notConfigured: 'Not configured',
    saving: 'Saving…',
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
    saveAi: 'שמירה ואימות המפתח',
    removeAi: 'הסרת מפתח AI',
    configured: 'מוגדר',
    notConfigured: 'לא מוגדר',
    saving: 'שומר…',
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await operation();
      setNightscoutKey('');
      setAiKey('');
      props.onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
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
          <button onClick={props.onClose} type="button">
            {copy.close}
          </button>
        </div>
        {message ? (
          <p className="web-panel-error" role="alert">
            {message}
          </p>
        ) : null}
        <div className="web-connection-card">
          <div className="web-card-title-row">
            <h3>{copy.nightscout}</h3>
            <span
              className={props.nightscout.configured ? 'connected' : undefined}>
              {props.nightscout.configured ? copy.connected : copy.notConnected}
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
                })
              }
              type="button">
              {busy ? copy.saving : copy.connect}
            </button>
            {props.nightscout.configured ? (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(() => BrowserNightscoutClient.remove(props.api))
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
            <span className={props.aiConfigured ? 'connected' : undefined}>
              {props.aiConfigured ? copy.configured : copy.notConfigured}
            </span>
          </div>
          <p>{copy.aiHint}</p>
          <label>
            <span>{copy.aiKey}</span>
            <input
              autoComplete="off"
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
                run(() => new BrowserAiService(props.api).provision(aiKey))
              }
              type="button">
              {busy ? copy.saving : copy.saveAi}
            </button>
            {props.aiConfigured ? (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(() => new BrowserAiService(props.api).remove())
                }
                type="button">
                {copy.removeAi}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
};
