import React, {useEffect, useRef, useState} from 'react';

interface GoogleCredentialResponse {
  readonly credential?: string;
}

interface GoogleIdentityApi {
  initialize(input: {
    readonly client_id: string;
    readonly callback: (response: GoogleCredentialResponse) => void;
    readonly auto_select?: boolean;
    readonly cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: Readonly<Record<string, string | number>>,
  ): void;
  disableAutoSelect(): void;
}

type GoogleWindow = Window & {
  google?: {readonly accounts?: {readonly id?: GoogleIdentityApi}};
};

let googleScript: Promise<GoogleIdentityApi> | undefined;

const loadGoogleIdentity = (): Promise<GoogleIdentityApi> => {
  const existing = (window as GoogleWindow).google?.accounts?.id;
  if (existing) {
    return Promise.resolve(existing);
  }
  if (googleScript) {
    return googleScript;
  }
  googleScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const api = (window as GoogleWindow).google?.accounts?.id;
      if (api) {
        resolve(api);
      } else {
        reject(new Error('Google Sign-In did not load.'));
      }
    };
    script.onerror = () => reject(new Error('Google Sign-In is unavailable.'));
    document.head.appendChild(script);
  });
  googleScript.catch(() => {
    googleScript = undefined;
  });
  return googleScript;
};

export const GoogleSignInButton = (props: {
  readonly clientId: string;
  readonly locale: 'en' | 'he';
  readonly onCredential: (credential: string) => Promise<void>;
  readonly onError: (message: string) => void;
}) => {
  const {clientId, locale, onCredential, onError} = props;
  const host = useRef<HTMLDivElement | null>(null);
  const credentialHandler = useRef(onCredential);
  credentialHandler.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    loadGoogleIdentity()
      .then(api => {
        if (!active || !host.current) {
          return;
        }
        api.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: response => {
            const credential = response.credential;
            if (!credential) {
              onError(
                locale === 'he'
                  ? 'Google לא החזיר אישור התחברות.'
                  : 'Google did not return a sign-in credential.',
              );
              return;
            }
            credentialHandler
              .current(credential)
              .catch(error =>
                onError(
                  error instanceof Error
                    ? error.message
                    : locale === 'he'
                    ? 'ההתחברות נכשלה.'
                    : 'Sign-in failed.',
                ),
              );
          },
        });
        host.current.replaceChildren();
        api.renderButton(host.current, {
          type: 'standard',
          theme: 'outline',
          size: 'medium',
          shape: 'pill',
          text: 'signin_with',
          locale: locale === 'he' ? 'he' : 'en',
        });
      })
      .catch(error => {
        if (!active) {
          return;
        }
        setFailed(true);
        onError(
          error instanceof Error
            ? error.message
            : 'Google Sign-In is unavailable.',
        );
      });
    return () => {
      active = false;
    };
  }, [clientId, locale, onError]);

  return failed ? (
    <span className="web-auth-error">
      {locale === 'he'
        ? 'התחברות Google לא זמינה'
        : 'Google Sign-In unavailable'}
    </span>
  ) : (
    <div className="web-google-button" ref={host} />
  );
};

export const disableGoogleAutoSelect = (): void => {
  (window as GoogleWindow).google?.accounts?.id?.disableAutoSelect();
};
